import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { logActivity, pickAuditFields } from '@/lib/services/logger';

const idOf = value => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? Number(value) : null;
const validateBatch = body => {
  const batch = body.batch || {};
  const items = body.items;
  if (!/^[0-9a-f-]{36}$/i.test(String(batch.supplier_id || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(batch.purchase_date || ''))) throw new Error('Nhà cung cấp hoặc ngày mua không hợp lệ');
  if (!Number.isFinite(Number(batch.exchange_rate)) || Number(batch.exchange_rate) <= 0) throw new Error('Tỷ giá phải lớn hơn 0');
  for (const key of ['domestic_shipping_rmb','other_cost_rmb']) if (!Number.isFinite(Number(batch[key] || 0)) || Number(batch[key] || 0) < 0) throw new Error('Chi phí không hợp lệ');
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new Error('Lô mua phải có từ 1 đến 200 sản phẩm');
  items.forEach((item, index) => {
    if (!String(item.model || '').trim() || !Number.isFinite(Number(item.purchase_price_rmb)) || Number(item.purchase_price_rmb) < 0) throw new Error(`Sản phẩm ${index + 1} thiếu model hoặc giá mua không hợp lệ`);
    if (String(item.model).trim().length > 240 || String(item.serial || '').trim().length > 100 || String(item.notes || '').length > 3000) throw new Error(`Sản phẩm ${index + 1} có dữ liệu quá dài`);
  });
  if (String(batch.notes || '').length > 3000) throw new Error('Ghi chú lô mua quá dài');
};

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const id = idOf(new URL(request.url).searchParams.get('id'));
  if (id) {
    const [batch, items, payments] = await Promise.all([
      db.from('purchase_batch_summaries').select('*').eq('id', id).maybeSingle(),
      db.from('purchase_items').select('*').eq('purchase_batch_id', id).order('id'),
      db.from('supplier_payments').select('*').eq('purchase_batch_id', id).order('payment_date', { ascending: false }).order('id', { ascending: false })
    ]);
    if (batch.error || items.error || payments.error) return NextResponse.json({ error: 'Không thể tải chi tiết lô mua' }, { status: 503 });
    if (!batch.data) return NextResponse.json({ error: 'Không tìm thấy lô mua' }, { status: 404 });
    return NextResponse.json({ batch: batch.data, items: items.data, payments: payments.data });
  }
  const { data, error } = await db.from('purchase_batch_summaries').select('*').order('purchase_date', { ascending: false }).order('id', { ascending: false });
  if (error) return NextResponse.json({ error: 'Chưa tải được lô mua. Hãy áp dụng migration Procurement Phase 1.' }, { status: 503 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const db = getSupabaseAdminClient();
    let rpc; let action;
    if (body.action === 'create' || body.action === 'update') {
      validateBatch(body);
      action = body.action === 'create' ? 'CREATE' : 'UPDATE';
      const previousItems = body.action === 'update' ? await db.from('purchase_items').select('id,model,serial,purchase_price_rmb').eq('purchase_batch_id', idOf(body.id)).order('id') : { data: [] };
      rpc = await db.rpc(body.action === 'create' ? 'create_purchase_batch' : 'update_purchase_draft', body.action === 'create'
        ? { p_batch: body.batch, p_items: body.items, p_actor: auth.profile.name, p_idempotency_key: String(body.idempotencyKey || '') }
        : { p_batch_id: idOf(body.id), p_batch: body.batch, p_items: body.items, p_actor: auth.profile.name });
      if (body.action === 'update') rpc.previousItems = previousItems.data || [];
    } else if (body.action === 'confirm' || body.action === 'cancel') {
      const id = idOf(body.id); if (!id) throw new Error('Mã lô mua không hợp lệ');
      action = body.action === 'confirm' ? 'CONFIRM' : 'CANCEL';
      rpc = await db.rpc('transition_purchase_batch', { p_batch_id: id, p_target: body.action === 'confirm' ? 'CONFIRMED' : 'CANCELLED', p_actor: auth.profile.name });
    } else throw new Error('Thao tác không hợp lệ');
    if (rpc.error) throw new Error(rpc.error.message);
    await logActivity('PURCHASE_BATCH', rpc.data.id, action === 'CREATE' ? 'CREATE' : 'UPDATE', {
      operation: action,
      ...pickAuditFields(rpc.data, ['batch_code','supplier_id','purchase_date','subtotal_rmb','status'])
    }, auth.profile.name);
    if (action === 'CREATE') {
      const { data: createdItems } = await db.from('purchase_items').select('id,model,serial,purchase_price_rmb').eq('purchase_batch_id', rpc.data.id).order('id');
      for (const item of createdItems || []) await logActivity('PURCHASE_ITEM', item.id, 'CREATE', pickAuditFields(item, ['model','serial','purchase_price_rmb']), auth.profile.name);
    } else if (action === 'UPDATE') {
      for (const item of rpc.previousItems || []) await logActivity('PURCHASE_ITEM', item.id, 'DELETE', pickAuditFields(item, ['model','serial','purchase_price_rmb']), auth.profile.name);
      const { data: replacementItems } = await db.from('purchase_items').select('id,model,serial,purchase_price_rmb').eq('purchase_batch_id', rpc.data.id).order('id');
      for (const item of replacementItems || []) await logActivity('PURCHASE_ITEM', item.id, 'CREATE', pickAuditFields(item, ['model','serial','purchase_price_rmb']), auth.profile.name);
    }
    return NextResponse.json(rpc.data, { status: action === 'CREATE' ? 201 : 200 });
  } catch (error) { return NextResponse.json({ error: error.message || 'Không thể lưu lô mua' }, { status: 400 }); }
}
