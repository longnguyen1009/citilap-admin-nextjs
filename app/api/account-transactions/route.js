import { NextResponse } from 'next/server';
import { clean, financeAdmin, financeError, idempotency, positive, UUID } from '@/lib/financeApi';

export async function GET(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get('page')) || 1), limit = Math.min(100, Math.max(10, Number(params.get('limit')) || 30));
  let query = context.db.from('account_transactions').select('*,cash_accounts(code,name)', { count: 'exact' }).order('occurred_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (UUID.test(params.get('account') || '')) query = query.eq('account_id', params.get('account'));
  if (params.get('direction')) query = query.eq('direction', params.get('direction'));
  if (params.get('type')) query = query.eq('transaction_type', params.get('type'));
  if (params.get('from')) query = query.gte('occurred_at', params.get('from'));
  if (params.get('to')) query = query.lte('occurred_at', params.get('to'));
  if (params.get('reference')) query = query.ilike('reference_id', `%${clean(params.get('reference'), 100)}%`);
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ data, page, limit, total: count });
}

export async function POST(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  try {
    const body = await request.json(); let call;
    if (body.action === 'manual') {
      if (!UUID.test(String(body.accountId || '')) || !['IN', 'OUT'].includes(body.direction)) throw new Error('Thông tin giao dịch không hợp lệ');
      call = context.db.rpc('post_manual_account_transaction', { p_account_id: body.accountId, p_direction: body.direction, p_amount: positive(body.amount), p_description: clean(body.description), p_occurred_at: body.occurredAt, p_actor: context.auth.profile.name, p_idempotency_key: idempotency(body.idempotencyKey) });
    } else if (body.action === 'transfer') {
      if (!UUID.test(String(body.sourceAccountId || '')) || !UUID.test(String(body.destinationAccountId || ''))) throw new Error('Tài khoản chuyển tiền không hợp lệ');
      call = context.db.rpc('transfer_cash_accounts', { p_source: body.sourceAccountId, p_destination: body.destinationAccountId, p_amount: positive(body.amount), p_occurred_at: body.occurredAt, p_description: clean(body.description), p_actor: context.auth.profile.name, p_idempotency_key: idempotency(body.idempotencyKey) });
    } else throw new Error('Thao tác không hợp lệ');
    const { data, error } = await call; if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return financeError(error); }
}

