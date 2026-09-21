import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value, max = 3000) => String(value ?? '').trim().slice(0, max);
const positive = value => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error('Số tiền phải lớn hơn 0');
  return number;
};

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: 'Mã phiếu trả không hợp lệ' }, { status: 400 });
    const [record, items, refunds, events] = await Promise.all([
      db.from('supplier_returns').select('*, suppliers(id,code,name)').eq('id', id).maybeSingle(),
      db.from('supplier_return_items').select('*, laptops!supplier_return_items_laptop_id_fkey(id,name,serial,status), repair_jobs(id,repair_code,outcome,recommended_action), qc_inspections(id,inspection_code,result)').eq('supplier_return_id', id).order('id'),
      db.from('supplier_refunds').select('*').eq('supplier_return_id', id).order('received_at'),
      db.from('supplier_return_events').select('*').eq('supplier_return_id', id).order('created_at'),
    ]);
    const failed = [record, items, refunds, events].find(result => result.error);
    if (failed) return NextResponse.json({ error: failed.error.message }, { status: 503 });
    if (!record.data) return NextResponse.json({ error: 'Không tìm thấy phiếu trả' }, { status: 404 });
    const replacementIds = items.data.map(item => item.replacement_purchase_item_id).filter(Boolean);
    const replacements = replacementIds.length ? await db.from('purchase_items').select('*').in('id', replacementIds) : { data: [], error: null };
    if (replacements.error) return NextResponse.json({ error: replacements.error.message }, { status: 503 });
    const shipmentRows = replacementIds.length ? await db.from('shipment_items').select('purchase_item_id,status,received_at,shipments(id,shipment_code,status,carrier,tracking_number)').in('purchase_item_id', replacementIds).neq('status', 'CANCELLED') : { data: [], error: null };
    const replacementLaptopIds = items.data.map(item => item.replacement_laptop_id).filter(Boolean);
    const qcs = replacementLaptopIds.length ? await db.from('qc_inspections').select('laptop_id,inspection_code,status,result,completed_at').in('laptop_id', replacementLaptopIds).order('started_at', { ascending: false }) : { data: [], error: null };
    const replacementById = new Map((replacements.data || []).map(row => [String(row.id), row]));
    const shipmentByItem = new Map((shipmentRows.data || []).map(row => [String(row.purchase_item_id), row]));
    const qcByLaptop = new Map(); for (const qc of qcs.data || []) if (!qcByLaptop.has(String(qc.laptop_id))) qcByLaptop.set(String(qc.laptop_id), qc);
    const enrichedItems = items.data.map(item => ({ ...item, replacement_purchase_item: replacementById.get(String(item.replacement_purchase_item_id)) || null, replacement_shipment: shipmentByItem.get(String(item.replacement_purchase_item_id)) || null, replacement_qc: qcByLaptop.get(String(item.replacement_laptop_id)) || null }));
    return NextResponse.json({ record: record.data, items: enrichedItems, refunds: refunds.data, events: events.data });
  }

  const [returns, suppliers, laptops, purchaseItems, batches, repairs, inspections] = await Promise.all([
    db.from('supplier_returns').select('*, suppliers(id,code,name), supplier_return_items(id,laptop_id,status,expected_refund_rmb,agreed_refund_rmb,replacement_purchase_item_id,replacement_laptop_id)').order('created_at', { ascending: false }),
    db.from('suppliers').select('id,code,name').eq('active', true).order('name'),
    db.from('laptops').select('id,name,serial,status,purchase_item_id').eq('is_active', true).eq('status', 'qc_failed').not('purchase_item_id', 'is', null),
    db.from('purchase_items').select('id,purchase_batch_id,model,purchase_price_rmb,laptop_id'),
    db.from('purchase_batches').select('id,supplier_id'),
    db.from('repair_jobs').select('id,repair_code,laptop_id,outcome,recommended_action,status').eq('status', 'COMPLETED').eq('recommended_action', 'SUPPLIER_RETURN'),
    db.from('qc_inspections').select('id,inspection_code,laptop_id,result').eq('status', 'COMPLETED').eq('result', 'FAIL'),
  ]);
  const failed = [returns, suppliers, laptops, purchaseItems, batches, repairs, inspections].find(result => result.error);
  if (failed) return NextResponse.json({ error: 'Chưa tải được Supplier Returns. Hãy áp dụng migration Phase 5.' }, { status: 503 });
  const itemById = new Map((purchaseItems.data || []).map(item => [String(item.id), item]));
  const batchById = new Map((batches.data || []).map(batch => [String(batch.id), batch]));
  const repairByLaptop = new Map((repairs.data || []).map(job => [String(job.laptop_id), job]));
  const qcByLaptop = new Map((inspections.data || []).map(qc => [String(qc.laptop_id), qc]));
  const eligible = (laptops.data || []).map(laptop => {
    const item = itemById.get(String(laptop.purchase_item_id));
    const batch = item && batchById.get(String(item.purchase_batch_id));
    return { ...laptop, purchase_item: item, supplier_id: batch?.supplier_id || null, repair: repairByLaptop.get(String(laptop.id)) || null, qc: qcByLaptop.get(String(laptop.id)) || null };
  }).filter(row => row.supplier_id);
  const usedReplacementIds = new Set((returns.data || []).flatMap(row => row.supplier_return_items || []).map(item => String(item.replacement_purchase_item_id || '')).filter(Boolean));
  const shipmentRows = await db.from('shipment_items').select('purchase_item_id,status,received_at,shipments(id,shipment_code,status,carrier,tracking_number)').neq('status', 'CANCELLED');
  const shipmentByItem = new Map((shipmentRows.data || []).map(row => [String(row.purchase_item_id), row]));
  const replacementCandidates = (purchaseItems.data || []).filter(item => Number(item.purchase_price_rmb) === 0 && !usedReplacementIds.has(String(item.id))).map(item => {
    const batch = batchById.get(String(item.purchase_batch_id));
    return { ...item, supplier_id: batch?.supplier_id || null, shipment: shipmentByItem.get(String(item.id)) || null };
  }).filter(item => item.supplier_id);
  return NextResponse.json({ returns: returns.data, suppliers: suppliers.data, eligible, replacementCandidates });
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const db = getSupabaseAdminClient();
    let result;
    if (body.action === 'create') {
      if (!UUID.test(String(body.supplierId || '')) || !Array.isArray(body.items) || !body.items.length) throw new Error('Nhà cung cấp hoặc danh sách máy không hợp lệ');
      const key = clean(body.idempotencyKey, 100);
      if (key.length < 8) throw new Error('Idempotency key không hợp lệ');
      result = await db.rpc('create_supplier_return', {
        p_data: { supplier_id: body.supplierId, reason: body.reason, reason_notes: clean(body.reasonNotes), notes: clean(body.notes) },
        p_items: body.items.map(item => ({ laptop_id: Number(item.laptopId), repair_job_id: item.repairJobId || null, qc_inspection_id: item.qcInspectionId || null, reason: item.reason || body.reason, condition_notes: clean(item.conditionNotes), expected_refund_rmb: item.expectedRefundRmb === '' ? null : Number(item.expectedRefundRmb), agreed_refund_rmb: item.agreedRefundRmb === '' ? null : Number(item.agreedRefundRmb) })),
        p_actor: auth.profile.name, p_idempotency_key: key,
      });
    } else if (body.action === 'transition') {
      if (!UUID.test(String(body.id || ''))) throw new Error('Mã phiếu trả không hợp lệ');
      result = await db.rpc('transition_supplier_return', { p_id: body.id, p_target: body.target, p_data: { carrier: clean(body.carrier, 160), tracking_number: clean(body.trackingNumber, 200), resolution_type: body.resolutionType || null }, p_actor: auth.profile.name });
    } else if (body.action === 'refund') {
      if (!UUID.test(String(body.id || ''))) throw new Error('Mã phiếu trả không hợp lệ');
      const rate = body.exchangeRate === '' || body.exchangeRate == null ? null : positive(body.exchangeRate);
      result = await db.rpc('record_supplier_refund', { p_return_id: body.id, p_amount_rmb: positive(body.amountRmb), p_exchange_rate: rate, p_method: body.method, p_reference: clean(body.reference, 300), p_received_at: body.receivedAt || new Date().toISOString(), p_actor: auth.profile.name, p_idempotency_key: clean(body.idempotencyKey, 100) });
    } else if (body.action === 'replacement') {
      result = await db.rpc('link_supplier_replacement', { p_item_id: Number(body.itemId), p_replacement_purchase_item_id: Number(body.replacementPurchaseItemId), p_replacement_laptop_id: body.replacementLaptopId ? Number(body.replacementLaptopId) : null, p_actor: auth.profile.name });
    } else throw new Error('Thao tác Supplier Return không hợp lệ');
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json(result.data, { status: body.action === 'create' ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể xử lý Supplier Return' }, { status: 400 });
  }
}
