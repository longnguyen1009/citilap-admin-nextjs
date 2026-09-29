import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value, max = 3000) => String(value ?? '').trim().slice(0, max);
const positive = value => { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new Error('Số tiền phải lớn hơn 0'); return number; };

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: 'Mã phiếu trả không hợp lệ' }, { status: 400 });
    const [record, items, refunds, events] = await Promise.all([
      db.from('supplier_returns').select('*,suppliers(id,code,name)').eq('id', id).maybeSingle(),
      db.from('supplier_return_items').select('*,laptops!supplier_return_items_laptop_id_fkey(id,name,serial,status),replacement_laptop:laptops!supplier_return_items_replacement_laptop_id_fkey(id,name,serial,status,tracking_code_cn,source_type),repair_jobs(id,repair_code,outcome,recommended_action),qc_inspections(id,inspection_code,result)').eq('supplier_return_id', id).order('id'),
      db.from('supplier_refunds').select('*').eq('supplier_return_id', id).order('received_at'),
      db.from('supplier_return_events').select('*').eq('supplier_return_id', id).order('created_at')
    ]);
    const failed = [record, items, refunds, events].find(result => result.error);
    if (failed) return NextResponse.json({ error: failed.error.message }, { status: 503 });
    if (!record.data) return NextResponse.json({ error: 'Không tìm thấy phiếu trả' }, { status: 404 });
    const replacementIds = items.data.map(item => item.replacement_laptop_id).filter(Boolean);
    const qcs = replacementIds.length ? await db.from('qc_inspections').select('laptop_id,inspection_code,status,result,completed_at').in('laptop_id', replacementIds).order('started_at', { ascending: false }) : { data: [], error: null };
    const qcByLaptop = new Map();
    for (const qc of qcs.data || []) if (!qcByLaptop.has(String(qc.laptop_id))) qcByLaptop.set(String(qc.laptop_id), qc);
    return NextResponse.json({
      record: record.data,
      items: items.data.map(item => ({ ...item, replacement_qc: qcByLaptop.get(String(item.replacement_laptop_id)) || null })),
      refunds: refunds.data,
      events: events.data
    });
  }

  const [returns, suppliers, laptops, batches, repairs, inspections] = await Promise.all([
    db.from('supplier_returns').select('*,suppliers(id,code,name),supplier_return_items(id,laptop_id,status,expected_refund_rmb,agreed_refund_rmb,replacement_laptop_id)').order('created_at', { ascending: false }),
    db.from('suppliers').select('id,code,name').eq('active', true).order('name'),
    db.from('laptops').select('id,name,serial,status,purchase_batch_id,source_type,tracking_code_cn').eq('is_active', true).in('status', ['waiting_qc','in_transit']),
    db.from('purchase_batches').select('id,supplier_id,batch_code'),
    db.from('repair_jobs').select('id,repair_code,laptop_id,outcome,recommended_action,status').eq('status', 'COMPLETED').eq('recommended_action', 'SUPPLIER_RETURN'),
    db.from('qc_inspections').select('id,inspection_code,laptop_id,result').eq('status', 'COMPLETED').eq('result', 'FAIL')
  ]);
  const failed = [returns, suppliers, laptops, batches, repairs, inspections].find(result => result.error);
  if (failed) return NextResponse.json({ error: failed.error.message || 'Không tải được dữ liệu trả NCC' }, { status: 503 });
  const batchById = new Map(batches.data.map(batch => [String(batch.id), batch]));
  const repairByLaptop = new Map(repairs.data.map(job => [String(job.laptop_id), job]));
  const qcByLaptop = new Map(inspections.data.map(qc => [String(qc.laptop_id), qc]));
  const eligible = laptops.data.filter(laptop => laptop.status === 'waiting_qc' && laptop.purchase_batch_id && laptop.source_type !== 'SUPPLIER_REPLACEMENT').map(laptop => ({
    ...laptop, supplier_id: batchById.get(String(laptop.purchase_batch_id))?.supplier_id || null,
    batch_code: batchById.get(String(laptop.purchase_batch_id))?.batch_code || '',
    repair: repairByLaptop.get(String(laptop.id)) || null, qc: qcByLaptop.get(String(laptop.id)) || null
  })).filter(row => row.supplier_id && (row.repair || row.qc));
  const usedReplacementIds = new Set(returns.data.flatMap(row => row.supplier_return_items || []).map(item => String(item.replacement_laptop_id || '')).filter(Boolean));
  const replacementCandidates = laptops.data.filter(laptop => laptop.source_type === 'SUPPLIER_REPLACEMENT' && !usedReplacementIds.has(String(laptop.id))).map(laptop => ({
    ...laptop, supplier_id: batchById.get(String(laptop.purchase_batch_id))?.supplier_id || null,
    batch_code: batchById.get(String(laptop.purchase_batch_id))?.batch_code || ''
  })).filter(row => row.supplier_id);
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
      if (!Array.isArray(body.items) || !body.items.length) throw new Error('Danh sách máy trả không hợp lệ');
      result = await db.rpc('create_supplier_return', {
        p_data: { reason: body.reason, reason_notes: clean(body.reasonNotes), notes: clean(body.notes) },
        p_items: body.items.map(item => ({ laptop_id: Number(item.laptopId), repair_job_id: item.repairJobId || null, qc_inspection_id: item.qcInspectionId || null, reason: item.reason || body.reason, condition_notes: clean(item.conditionNotes), expected_refund_rmb: item.expectedRefundRmb === '' ? null : Number(item.expectedRefundRmb), agreed_refund_rmb: item.agreedRefundRmb === '' ? null : Number(item.agreedRefundRmb) })),
        p_actor: auth.profile.name, p_idempotency_key: clean(body.idempotencyKey, 100)
      });
    } else if (body.action === 'transition') {
      if (!UUID.test(String(body.id || ''))) throw new Error('Mã phiếu trả không hợp lệ');
      result = await db.rpc('transition_supplier_return', { p_id: body.id, p_target: body.target, p_data: { carrier: clean(body.carrier, 160), tracking_number: clean(body.trackingNumber, 200), resolution_type: body.resolutionType || null }, p_actor: auth.profile.name });
    } else if (body.action === 'refund') {
      if (!UUID.test(String(body.id || '')) || !UUID.test(String(body.accountId || ''))) throw new Error('Phiếu trả hoặc tài khoản không hợp lệ');
      const rate = body.exchangeRate === '' || body.exchangeRate == null ? null : positive(body.exchangeRate);
      result = await db.rpc('record_supplier_refund_with_account', { p_return_id: body.id, p_amount_rmb: positive(body.amountRmb), p_exchange_rate: rate, p_method: body.method, p_reference: clean(body.reference, 300), p_received_at: body.receivedAt || new Date().toISOString(), p_actor: auth.profile.name, p_account_id: body.accountId, p_idempotency_key: clean(body.idempotencyKey, 90) });
    } else if (body.action === 'replacement') {
      result = await db.rpc('link_supplier_replacement', { p_item_id: Number(body.itemId), p_replacement_laptop_id: Number(body.replacementLaptopId), p_actor: auth.profile.name });
    } else throw new Error('Thao tác Supplier Return không hợp lệ');
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json(result.data, { status: body.action === 'create' ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể xử lý Supplier Return' }, { status: 400 });
  }
}
