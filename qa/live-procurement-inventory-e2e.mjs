import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
}));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !service) throw new Error('Missing Supabase live QA environment');
const headers = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const parse = async response => { const text = await response.text(); try { return JSON.parse(text); } catch { return text; } };
const rest = async (path, method = 'GET', body) => { const response = await fetch(`${base}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); return { ok: response.ok, status: response.status, body: await parse(response) }; };
const rpc = (name, body) => rest(`rpc/${name}`, 'POST', body);
const checks = [];
const must = (name, condition, detail = {}) => { checks.push({ name, pass: Boolean(condition) }); console.log(condition ? 'PASS' : 'FAIL', name); if (!condition) throw new Error(`${name}: ${JSON.stringify(detail)}`); };
const tag = `QA-CLEAN-${Date.now().toString(36).toUpperCase()}`;

try {
  const removed = await rest('purchase_items?select=id&limit=1');
  must('legacy purchase_items is unavailable', !removed.ok, { status: removed.status });

  const supplierResult = await rest('suppliers', 'POST', { code: tag.slice(-20), name: tag, created_by: 'Live QA' });
  must('create supplier', supplierResult.ok && supplierResult.body.length === 1, supplierResult);
  const supplier = supplierResult.body[0];
  const createKey = randomUUID();
  const laptops = [
    { name: `${tag}-L1 R9 / 16GB / 1TB`, category: '1', serial: `${tag}-S1`, tracking_code_cn: `${tag}-T1`, purchase_price_rmb: 4000, shipping_rmb: 20 },
    { name: `${tag}-L2 R9 / 32GB / 1TB`, category: '2', tracking_code_cn: `${tag}-T2`, purchase_price_rmb: 4500, shipping_rmb: 25 },
    { name: `${tag}-L3 i9 / 32GB / 1TB`, category: '3', tracking_code_cn: `${tag}-T3`, purchase_price_rmb: 5000, shipping_rmb: 30 },
  ];
  const payload = { p_batch: { supplier_id: supplier.id, purchase_date: '2026-09-15', purchase_exchange_rate: 3550, notes: tag }, p_laptops: laptops, p_actor: 'Live QA', p_idempotency_key: createKey };
  const createdPair = await Promise.all([rpc('create_purchase_batch', payload), rpc('create_purchase_batch', payload)]);
  must('batch create is idempotent', createdPair.every(result => result.ok) && new Set(createdPair.map(result => result.body.batch.id)).size === 1, createdPair);
  const created = createdPair[0].body;
  must('one expected laptop row per purchased machine', created.laptops.length === 3 && created.laptops.every(row => row.status === 'in_transit'), created);
  const ids = created.laptops.map(row => Number(row.id));

  const cohortBefore = await rest(`unified_inventory?batch_code=eq.${created.batch.batch_code}&select=laptop_id,display_status,month_key`);
  must('September cohort initially has three in-transit laptops', cohortBefore.ok && cohortBefore.body.length === 3 && cohortBefore.body.every(row => row.display_status === 'in_transit' && row.month_key === '09/2026'), cohortBefore);

  const receiveKey = randomUUID();
  const receivePayload = { p_items: [{ laptop_id: ids[1], serial: `${tag}-S2` }], p_notes: tag, p_actor: 'Live QA', p_idempotency_key: receiveKey };
  const receivedPair = await Promise.all([rpc('receive_purchase_laptops', receivePayload), rpc('receive_purchase_laptops', receivePayload)]);
  must('receive replay keeps the same laptop ID', receivedPair.every(result => result.ok) && receivedPair.every(result => Number(result.body.laptops[0].id) === ids[1]), receivedPair);
  const receivedRow = await rest(`laptops?id=eq.${ids[1]}&select=id,status,received_at,month_key`);
  must('receive transitions IN_TRANSIT to WAITING_QC without moving cohort', receivedRow.ok && receivedRow.body[0].status === 'waiting_qc' && receivedRow.body[0].received_at && receivedRow.body[0].month_key === '09/2026', receivedRow);

  const unknownResult = await rpc('receive_unknown_laptop', { p_data: { name: `${tag}-UNKNOWN`, serial: `${tag}-U1`, tracking_code_cn: `${tag}-UNKNOWN-T` }, p_actor: 'Live QA', p_idempotency_key: randomUUID() });
  must('unknown physical machine is a direct waiting-QC laptop', unknownResult.ok && unknownResult.body.source_type === 'UNKNOWN' && unknownResult.body.status === 'waiting_qc', unknownResult);
  const canonicalId = Number(unknownResult.body.id);
  const reconciled = await rpc('reconcile_unknown_laptop', { p_unknown_laptop_id: canonicalId, p_expected_laptop_id: ids[2], p_actor: 'Live QA', p_idempotency_key: randomUUID() });
  must('unknown reconciliation preserves physical canonical ID', reconciled.ok && Number(reconciled.body.id) === canonicalId && reconciled.body.source_type === 'SUPPLIER_PURCHASE', reconciled);
  const removedExpected = await rest(`laptops?id=eq.${ids[2]}&select=id`);
  must('reconciliation removes pristine expected placeholder', removedExpected.ok && removedExpected.body.length === 0, removedExpected);

  const summary = await rest(`purchase_batch_summaries?id=eq.${created.batch.id}&select=item_count,received_count,pending_count,total_rmb,shipping_total_rmb,debt_rmb`);
  const batch = summary.body?.[0];
  must('batch progress and supplier payable are derived from laptops', summary.ok && Number(batch.item_count) === 3 && Number(batch.received_count) === 2 && Number(batch.pending_count) === 1 && Number(batch.total_rmb) === 13500 && Number(batch.shipping_total_rmb) === 75 && Number(batch.debt_rmb) === 13500, summary);
  const cost = await rest(`laptop_landed_costs?laptop_id=eq.${canonicalId}&select=purchase_cost_vnd,cn_shipping_vnd,landed_cost_vnd,cost_status`);
  must('purchase and shipping enter landed cost exactly once', cost.ok && Number(cost.body[0].landed_cost_vnd) === (5000 + 30) * 3550 && cost.body[0].cost_status === 'COMPLETE', cost);

  console.log(`LIVE PROCUREMENT / INVENTORY: PASS ${checks.filter(check => check.pass).length}/${checks.length}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
