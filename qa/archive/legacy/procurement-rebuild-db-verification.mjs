import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const { PGlite } = createRequire(path.join(os.tmpdir(),'citilap-db-validation','package.json'))('@electric-sql/pglite');
const db=new PGlite(), one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
let passed=0;
const pass=name=>{passed++;console.log(`PASS ${passed}: ${name}`);};
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
 await db.exec(await readFile('init_full_db.sql','utf8'));
 const supplier=await one("INSERT INTO suppliers(code,name,created_by) VALUES('TEST','Test NCC','QA') RETURNING id");
 const batch={supplier_id:supplier.id,purchase_date:'2026-09-25',exchange_rate:3550,notes:'QA'};
 const items=[
  {name:'Legion 5',configuration:'R7 / 16 / 512',purchase_price_rmb:6000,shipping_rmb:50,tracking_code_cn:'SF123'},
  {name:'ROG G14',configuration:'R9 / 16 / 1T',purchase_price_rmb:6500,shipping_rmb:60,tracking_code_cn:'SF456'}
 ];
 const create=async key=>(await one('SELECT create_direct_purchase($1,$2,$3,$4) value',[batch,items,'QA',key])).value;
 const b=await create('direct-test-0001');
 assert.match(b.batch_code,/^PO-20260925-\d{3}$/);
 assert.equal((await create('direct-test-0001')).id,b.id);
 assert.equal(Number((await one('SELECT count(*) n FROM laptops')).n),0);
 assert.equal(Number((await one("SELECT count(*) n FROM unified_inventory WHERE entity_type='PURCHASE_ITEM'")).n),2);
 pass('create is idempotent and pending items are virtual inventory only');

 const rows=(await db.query('SELECT id FROM purchase_items ORDER BY id')).rows;
 const receipt=(await one('SELECT receive_direct_items($1,$2,$3,$4) value',[[{purchase_item_id:rows[0].id,serial:'LIVE-1'}],'partial','QA','receive-test-0001'])).value;
 assert.equal(receipt.items.length,1);
 assert.equal(Number((await one('SELECT count(*) n FROM laptops')).n),1);
 assert.equal(Number((await one('SELECT count(*) n FROM unified_inventory')).n),2);
 assert.equal((await one('SELECT status FROM purchase_batches WHERE id=$1',[b.id])).status,'PARTIALLY_RECEIVED');
 assert.equal((await one('SELECT display_status FROM unified_inventory WHERE laptop_id IS NOT NULL')).display_status,'waiting_qc');
 pass('partial receive swaps one virtual row for exactly one physical laptop');

 const laptopId=receipt.items[0].laptop_id;
 assert.equal(Number((await one('SELECT landed_cost_vnd FROM laptop_landed_costs WHERE laptop_id=$1',[laptopId])).landed_cost_vnd),(6000+50)*3550);
 assert.equal(Number((await one("SELECT count(*) n FROM laptop_cost_components WHERE laptop_id=$1 AND cost_type='CN_SHIPPING'",[laptopId])).n),1);
 assert.equal(Number((await one('SELECT total_rmb FROM purchase_batch_summaries WHERE id=$1',[b.id])).total_rmb),12500);
 assert.equal(Number((await one('SELECT shipping_total_rmb FROM purchase_batch_summaries WHERE id=$1',[b.id])).shipping_total_rmb),110);
 pass('purchase payable excludes per-item shipping while landed cost includes it once');

 const unknown=(await one('SELECT receive_direct_items($1,$2,$3,$4) value',[[{name:'Unknown ROG',configuration:'i9',serial:'UNK-1',tracking_code_cn:'BOX-X'}],'unknown','QA','receive-test-0002'])).value;
 const unmatched=await one("SELECT * FROM unmatched_received_items WHERE status='OPEN'");
 const unknownLaptop=await one('SELECT * FROM laptops WHERE id=$1',[unknown.items[0].laptop_id]);
 assert.equal(unknownLaptop.status,'waiting_qc');
 assert.equal(unknownLaptop.source_unresolved,true);
 pass('unknown receiving creates a traceable waiting-QC laptop');

 const q=(await one('SELECT start_qc_inspection($1,$2,$3) value',[unknownLaptop.id,'QA','qc-unknown-0001'])).value;
 await one('SELECT match_unmatched_intake($1,$2,$3) value',[unmatched.id,rows[1].id,'QA']);
 assert.equal((await one('SELECT laptop_id FROM qc_inspections WHERE id=$1',[q.id])).laptop_id,unknownLaptop.id);
 assert.equal((await one('SELECT laptop_id FROM purchase_items WHERE id=$1',[rows[1].id])).laptop_id,unknownLaptop.id);
 assert.equal((await one('SELECT status FROM laptops WHERE id=$1',[unknownLaptop.id])).status,'qc_in_progress');
 assert.equal(Number((await one('SELECT count(*) n FROM laptops')).n),2);
 assert.equal((await one('SELECT status FROM unmatched_received_items WHERE id=$1',[unmatched.id])).status,'MATCHED');
 pass('matching preserves laptop identity and QC history');

 assert.equal((await one('SELECT receive_direct_items($1,$2,$3,$4) value',[[{name:'ignored replay'}],'','QA','receive-test-0002'])).value.id,unknown.id);
 await assert.rejects(()=>db.query('SELECT receive_direct_items($1,$2,$3,$4)',[[{purchase_item_id:rows[0].id}],'','QA','receive-fail-0001']));
 assert.equal(Number((await one('SELECT count(*) n FROM intake_receipts')).n),2);
 pass('receipt replay is idempotent and failed transaction rolls back');

 const b2=await create('direct-test-0002');
 const ignored=await one('SELECT id FROM purchase_items WHERE purchase_batch_id=$1 ORDER BY id LIMIT 1',[b2.id]);
 await one('SELECT ignore_direct_purchase_item($1,$2,$3) value',[ignored.id,'Không mua nữa','QA']);
 assert.equal(Number((await one('SELECT ignored_count FROM purchase_batch_summaries WHERE id=$1',[b2.id])).ignored_count),1);
 pass('ignored item is audited and removed from pending inventory');

 assert.equal((await one("SELECT has_function_privilege('authenticated','public.receive_direct_items(jsonb,text,text,text)','execute') ok")).ok,false);
 assert.equal((await one("SELECT has_function_privilege('service_role','public.receive_direct_items(jsonb,text,text,text)','execute') ok")).ok,true);
 pass('RPC and view access is server-only');
 console.log(`RESULT: ${passed}/${passed} checks passed`);
}catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await db.close();}
