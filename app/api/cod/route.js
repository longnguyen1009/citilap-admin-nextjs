import { NextResponse } from 'next/server';
import { clean, financeAdmin, financeError, idempotency, positive, UUID } from '@/lib/financeApi';

export async function GET(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  const params = new URL(request.url).searchParams, page = Math.max(1, Number(params.get('page')) || 1), limit = Math.min(100, Math.max(10, Number(params.get('limit')) || 30));
  let query = context.db.from('cod_receivable_summaries').select('*,orders(customer_info,tracking_code)', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (params.get('status')) query = query.eq('status', params.get('status'));
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ data, page, limit, total: count });
}

export async function POST(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  try {
    const body = await request.json(); let call;
    if (body.action === 'create') {
      const orderId = /^\d+$/.test(String(body.orderId || '')) ? Number(body.orderId) : null; if (!orderId) throw new Error('Đơn hàng không hợp lệ');
      call = context.db.rpc('create_cod_receivable', { p_order_id: orderId, p_carrier: clean(body.carrier, 160), p_tracking: clean(body.trackingNumber, 200), p_expected_settlement_at: body.expectedSettlementAt || null, p_notes: clean(body.notes, 2000), p_actor: context.auth.profile.name, p_idempotency_key: idempotency(body.idempotencyKey) });
    } else if (body.action === 'transition') {
      if (!UUID.test(String(body.id || '')) || !['DELIVERED', 'WAITING_SETTLEMENT', 'DISPUTED', 'RETURNED', 'CANCELLED'].includes(body.target)) throw new Error('Chuyển trạng thái không hợp lệ');
      call = context.db.rpc('transition_cod_receivable', { p_id: body.id, p_target: body.target, p_expected_settlement_at: body.expectedSettlementAt || null, p_notes: clean(body.notes, 2000), p_actor: context.auth.profile.name });
    } else if (body.action === 'settle') {
      if (!UUID.test(String(body.id || '')) || !UUID.test(String(body.accountId || ''))) throw new Error('COD hoặc tài khoản không hợp lệ');
      call = context.db.rpc('record_cod_settlement', { p_cod_id: body.id, p_amount_vnd: positive(body.amountVnd), p_account_id: body.accountId, p_reference: clean(body.reference, 300), p_settled_at: body.settledAt || new Date().toISOString(), p_actor: context.auth.profile.name, p_idempotency_key: idempotency(body.idempotencyKey) });
    } else throw new Error('Thao tác COD không hợp lệ');
    const { data, error } = await call; if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: body.action === 'create' ? 201 : 200 });
  } catch (error) { return financeError(error); }
}

