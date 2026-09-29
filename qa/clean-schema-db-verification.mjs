import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const { PGlite } = createRequire(path.join(os.tmpdir(), 'citilap-db-validation', 'package.json'))('@electric-sql/pglite');
const db = new PGlite();
let passed = 0;
const pass = message => { passed += 1; console.log(`PASS ${passed}: ${message}`); };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rejects = async (fn, pattern) => {
  let error;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, 'Expected operation to fail');
  assert.match(`${error.message} ${error.detail || ''}`, pattern);
};

try {
  const initSql = await readFile('init_full_db.sql', 'utf8');
  assert.doesNotMatch(initSql, /ADD CONSTRAINT\s+"[^"]+_not_null"\s+NOT NULL/i);
  pass('generated init uses PostgreSQL-compatible column NOT NULL syntax');

  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
  await db.exec(initSql);

  const removed = await db.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name=ANY($1::text[])`, [[
    'purchase_items','shipments','shipment_items','receiving_sessions','receiving_items',
    'receiving_exceptions','unmatched_received_items','intake_receipts','cost_allocations','cost_allocation_items'
  ]]);
  assert.equal(removed.rows.length, 0);
  pass('obsolete procurement, shipment and receiving tables are absent');

  const requiredColumns = await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='laptops'`);
  const columns = new Set(requiredColumns.rows.map(row => row.column_name));
  for (const column of ['purchase_batch_id','tracking_code_cn','purchase_price_rmb',
    'purchase_exchange_rate','received_at','available_for_sale_at','sold_at','ignored_at']) assert(columns.has(column), column);
  assert(!columns.has('purchase_item_id'));
  assert(!columns.has('is_locked'));
  assert(!columns.has('configuration'));
  pass('laptops is the central expected and physical inventory entity');

  const supplier = await one(`INSERT INTO suppliers(code,name,created_by) VALUES('QA-SUP','QA Supplier','QA') RETURNING id`);
  const input = [{ name: 'ROG 1 R9 16GB 1TB', category: '1', serial: 'QA-001', tracking_code_cn: 'CN-SHARED', purchase_price_rmb: 6800, shipping_rmb: '', import_price_vnd: 24.54 },
    { name: 'ROG 2 R9 32GB 1TB', category: '2', tracking_code_cn: 'CN-SHARED', purchase_price_rmb: 7000, shipping_rmb: 60, import_price_vnd: 25.46 }];
  const created = (await one(`SELECT create_purchase_batch($1::jsonb,$2::jsonb,'QA','create-batch-0001') value`, [
    JSON.stringify({ supplier_id: supplier.id, purchase_date: '2026-09-24', purchase_exchange_rate: 3550, notes: 'QA batch' }), JSON.stringify(input)
  ])).value;
  assert.equal(created.laptops.length, 2);
  assert.equal(new Set(created.laptops.map(row => row.id)).size, 2);
  assert(created.laptops.every(row => row.status === 'in_transit'));
  assert.equal(Number(created.laptops[0].shipping_rmb), 0);
  assert.equal(created.laptops[0].battery_health, null);
  assert.equal(Number((await one("SELECT count(*) n FROM laptops WHERE tracking_code_cn='CN-SHARED'")).n), 2);
  const retry = (await one(`SELECT create_purchase_batch($1::jsonb,$2::jsonb,'QA','create-batch-0001') value`, [
    JSON.stringify({ supplier_id: supplier.id, purchase_date: '2026-09-24', purchase_exchange_rate: 3550 }), JSON.stringify(input)
  ])).value;
  assert.deepEqual(retry.laptops.map(row => row.id), created.laptops.map(row => row.id));
  pass('creating a batch creates stable in-transit laptop IDs and is idempotent');

  const firstId = Number(created.laptops[0].id);
  const secondId = Number(created.laptops[1].id);
  const received = (await one(`SELECT receive_purchase_laptops($1::jsonb,'arrived','QA','receive-batch-0001') value`, [
    JSON.stringify([{ laptop_id: firstId, serial: 'QA-001-A', charger_status: 'with_charger', received_at: '2026-10-02' }])
  ])).value;
  assert.equal(received.laptops[0].id, firstId);
  assert.equal(received.laptops[0].status, 'waiting_qc');
  assert.equal(new Date(received.laptops[0].warehouse_date).toISOString().slice(0, 10), '2026-10-02');
  assert.equal(received.laptops[0].name, input[0].name);
  assert.equal(received.laptops[0].category, input[0].category);
  const unifiedReceived = await one('SELECT name,category,warehouse_date,supplier_name,battery_health FROM unified_inventory WHERE laptop_id=$1', [firstId]);
  assert.equal(unifiedReceived.name, input[0].name);
  assert.equal(unifiedReceived.category, input[0].category);
  assert.equal(new Date(unifiedReceived.warehouse_date).toISOString().slice(0, 10), '2026-10-02');
  assert.equal(unifiedReceived.supplier_name, 'QA Supplier');
  assert.equal(unifiedReceived.battery_health, null);
  const receivedRetry = (await one(`SELECT receive_purchase_laptops($1::jsonb,'arrived','QA','receive-batch-0001') value`, [
    JSON.stringify([{ laptop_id: firstId }])
  ])).value;
  assert.equal(receivedRetry.laptops[0].id, firstId);
  assert.equal(received.laptops[0].month_key, '09/2026');
  assert.deepEqual(created.laptops.map(row => row.category), ['1', '2']);
  const corrected = (await one(`SELECT update_laptop_procurement($1,$2::jsonb,'QA') value`, [firstId, JSON.stringify({ category: '3', purchase_price_rmb: 6900, shipping_rmb: 55 })])).value;
  assert.equal(Number(corrected.purchase_price_rmb), 6900);
  assert.equal(corrected.category, '3');
  pass('receiving keeps purchase cohort and procurement corrections remain available before sale');

  const unknown = (await one(`SELECT receive_unknown_laptop($1::jsonb,'QA','receive-unknown-0001') value`, [
    JSON.stringify({ name: 'Unknown ROG R9', serial: 'UNKNOWN-1', tracking_code_cn: 'CN-UNKNOWN' })
  ])).value;
  const unknownId = Number(unknown.id);
  assert.equal(unknown.source_type, 'UNKNOWN');
  assert.equal(unknown.status, 'waiting_qc');
  const reconciled = (await one(`SELECT reconcile_unknown_laptop($1,$2,'QA','reconcile-unknown-0001') value`, [unknownId, secondId])).value;
  assert.equal(Number(reconciled.id), unknownId);
  assert.equal(reconciled.source_type, 'SUPPLIER_PURCHASE');
  assert.equal(Number((await one('SELECT count(*) n FROM laptops WHERE id=$1', [secondId])).n), 0);
  pass('unknown-source reconciliation preserves the physical laptop ID and removes only the pristine expected row');

  const batch = await one('SELECT * FROM purchase_batch_summaries WHERE id=$1', [created.batch.id]);
  assert.equal(Number(batch.item_count), 2);
  assert.equal(Number(batch.received_count), 2);
  assert.equal(Number(batch.total_rmb), 13900);
  assert.equal(Number(batch.shipping_total_rmb), 115);
  const cost = await one('SELECT * FROM laptop_landed_costs WHERE laptop_id=$1', [unknownId]);
  assert.equal(Number(cost.purchase_cost_vnd), 7000 * 3550);
  assert.equal(Number(cost.cn_shipping_vnd), 60 * 3550);
  assert.equal(Number(cost.landed_cost_vnd), (7000 + 60) * 3550);
  pass('batch payable excludes item shipping while landed cost includes it exactly once');

  await db.query('UPDATE laptops SET price_rmb=0,exchange_rate=3600,tracking_code=$2 WHERE id=$1', [firstId, 'CN-A-EDIT']);
  const aliases = await one('SELECT purchase_price_rmb,purchase_exchange_rate,tracking_code_cn FROM laptops WHERE id=$1', [firstId]);
  assert.equal(Number(aliases.purchase_price_rmb), 0);
  assert.equal(Number(aliases.purchase_exchange_rate), 3600);
  assert.equal(aliases.tracking_code_cn, 'CN-A-EDIT');
  await rejects(() => db.query('UPDATE laptops SET price_rmb=100,purchase_price_rmb=200 WHERE id=$1', [firstId]), /thống nhất/);
  await db.query('UPDATE laptops SET purchase_price_rmb=6900,purchase_exchange_rate=3550 WHERE id=$1', [firstId]);
  const restoredAliases = await one('SELECT price_rmb,exchange_rate FROM laptops WHERE id=$1', [firstId]);
  assert.equal(Number(restoredAliases.price_rmb), 6900);
  assert.equal(Number(restoredAliases.exchange_rate), 3550);
  pass('inventory and procurement edits synchronize price, exchange rate and tracking, including zero values');

  await db.query(`SELECT update_incoming_tracking($1,'CN-SHARED','QA')`, [firstId]);
  assert.equal(Number((await one("SELECT count(*) n FROM laptops WHERE tracking_code_cn='CN-SHARED'")).n), 2);
  pass('one shipment tracking code can belong to multiple laptops');

  const returned = (await one(`SELECT create_supplier_return($1::jsonb,$2::jsonb,'QA','return-create-0001') value`, [
    JSON.stringify({ reason: 'OTHER', reason_notes: 'QA return' }),
    JSON.stringify([{ laptop_id: firstId, reason: 'OTHER', condition_notes: 'QA' }])
  ])).value;
  assert.equal((await one('SELECT status FROM laptops WHERE id=$1', [firstId])).status, 'supplier_return');
  assert.equal((await one('SELECT supplier_id FROM supplier_returns WHERE id=$1', [returned.id])).supplier_id, supplier.id);
  await one(`SELECT transition_supplier_return($1,'CANCELLED','{}'::jsonb,'QA') value`, [returned.id]);
  assert.equal((await one('SELECT status FROM laptops WHERE id=$1', [firstId])).status, 'waiting_qc');
  pass('supplier return derives supplier and cancellation restores the prior laptop state');

  await rejects(() => db.query(`UPDATE laptops SET status='sold' WHERE id=$1`, [firstId]), /workflow/i);
  pass('direct status edits are rejected');

  assert.equal((await one("SELECT count(*)::int n FROM pg_proc JOIN pg_namespace ns ON ns.oid=pronamespace WHERE ns.nspname='public' AND proname IN ('complete_qc_inspection','save_qc_checklist','seed_qc_checklist')")).n,0);
  pass('legacy QC writers removed; quick QC is the only completion workflow');

  const exposed = await db.query(`SELECT table_name,privilege_type FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee IN('anon','authenticated')
      AND table_name IN('laptops','purchase_batches','operation_requests')`);
  assert.equal(exposed.rows.length, 0);
  pass('operational tables are not granted directly to browser roles');

  for (const [decision, target] of [['PASS','available'],['FAIL','waiting_qc'],['REPAIR','repair'],['RETURN_CN','supplier_return']]) {
    const fixture = (await one(`SELECT create_purchase_batch($1::jsonb,$2::jsonb,'QA',$3) value`, [
      JSON.stringify({supplier_id:supplier.id,purchase_date:'2026-09-24',purchase_exchange_rate:3550}),
      JSON.stringify([{name:'Quick QC '+decision,category:'1',purchase_price_rmb:4000,import_price_vnd:14.6}]),'quick-create-'+decision])).value;
    const laptopId=fixture.laptops[0].id;
    await one(`SELECT receive_purchase_laptops($1::jsonb,'','QA',$2) value`, [JSON.stringify([{laptop_id:laptopId}]),'quick-receive-'+decision]);
    const q=(await one(`SELECT start_qc_inspection($1,'QA',$2) value`,[laptopId,'quick-start-'+decision])).value;
    const params=[q.id,decision,'','quick-complete-'+decision];
    await one(`SELECT complete_quick_qc($1,$2,$3,'QA',$4) value`,params);
    await one(`SELECT complete_quick_qc($1,$2,$3,'QA',$4) value`,params);
    assert.equal((await one('SELECT status FROM laptops WHERE id=$1',[laptopId])).status,target);
    assert.equal((await one('SELECT disposition FROM qc_inspections WHERE id=$1',[q.id])).disposition,decision);
    assert.equal((await one("SELECT count(*)::int n FROM qc_check_items WHERE qc_inspection_id=$1 AND result<>'NOT_TESTED'",[q.id])).n,0);
    assert.equal((await one("SELECT count(*)::int n FROM stock_movements WHERE reference_type='QC_INSPECTION' AND reference_id=$1",[q.id])).n,1);
    if(decision==='REPAIR') assert.equal((await one('SELECT count(*)::int n FROM repair_jobs WHERE laptop_id=$1',[laptopId])).n,1);
    if(decision==='RETURN_CN') assert.equal((await one('SELECT count(*)::int n FROM supplier_return_items WHERE laptop_id=$1 AND qc_inspection_id=$2',[laptopId,q.id])).n,1);
    await rejects(()=>one(`SELECT complete_quick_qc($1,'FAIL','','QA','different-completion-key') value`,[q.id]),/kết thúc/);
    pass(`quick QC ${decision} changes product and linked workflow atomically; retry does not duplicate records`);
  }
  const unidentified=(await one(`SELECT receive_unknown_laptop('{"name":"Unknown quick QC"}'::jsonb,'QA','unknown-quick-test') value`)).value;
  const unknownQc=(await one(`SELECT start_qc_inspection($1,'QA','unknown-quick-start') value`,[unidentified.id])).value;
  await rejects(()=>one(`SELECT complete_quick_qc($1,'RETURN_CN','','QA','unknown-quick-return') value`,[unknownQc.id]),/đối chiếu/);
  assert.equal((await one('SELECT status FROM qc_inspections WHERE id=$1',[unknownQc.id])).status,'IN_PROGRESS');
  pass('unknown supplier return is rejected without completing QC or changing the product');
  const details = { batteryHealth: '87', serialNumber: 'SHARED-QC-001', screen: { result: 'PASS' }, cpu_stress: { result: 'FAIL' } };
  await one(`SELECT complete_qc_with_details($1,'PASS','Ghi chú QC dùng chung','QA','shared-details-done',$2::jsonb)`, [unknownQc.id, JSON.stringify(details)]);
  const product = await one('SELECT serial,battery_health,screen_status,qc_details,condition_note FROM laptops WHERE id=$1',[unidentified.id]);
  assert.equal(product.serial,'SHARED-QC-001'); assert.equal(product.battery_health,87); assert.equal(product.screen_status,'ok'); assert.deepEqual(product.qc_details,{screen:details.screen,cpu_stress:details.cpu_stress});
  assert.equal(product.condition_note,'Ghi chú QC dùng chung');
  await db.query(`UPDATE laptops SET qc_details=jsonb_set(qc_details,'{batteryHealth}','"75"') WHERE id=$1`,[unidentified.id]);
  assert.equal((await one('SELECT battery_health FROM laptops WHERE id=$1',[unidentified.id])).battery_health,75);
  assert.equal((await one('SELECT detail_snapshot FROM qc_inspections WHERE id=$1',[unknownQc.id])).detail_snapshot,null);
  await db.query('UPDATE laptops SET battery_health=95 WHERE id=$1',[unidentified.id]);
  await db.query('UPDATE laptops SET qc_details=qc_details WHERE id=$1',[unidentified.id]);
  assert.equal((await one('SELECT battery_health FROM laptops WHERE id=$1',[unidentified.id])).battery_health,95);
  await rejects(()=>db.query(`UPDATE laptops SET qc_details='{"batteryHealth":101}' WHERE id=$1`,[unidentified.id]),/Pin/);
  pass('QC uses canonical identity without new snapshot; direct battery edits survive later QC writes');
  console.log(`PASS clean schema verification ${passed}/${passed}`);
} catch (error) {
  console.error(error.message, error.detail || '', error.where || '');
  process.exitCode = 1;
} finally {
  await db.close();
}
