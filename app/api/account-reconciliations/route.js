import { NextResponse } from 'next/server';
import { clean, financeAdmin, financeError, UUID } from '@/lib/financeApi';

export async function GET(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  const account = new URL(request.url).searchParams.get('account');
  let query = context.db.from('account_reconciliations').select('*,cash_accounts(code,name,currency)').order('reconciled_at', { ascending: false }).limit(100);
  if (UUID.test(account || '')) query = query.eq('account_id', account);
  const { data, error } = await query; if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  try {
    const body = await request.json(); if (!UUID.test(String(body.accountId || '')) || !Number.isFinite(Number(body.actualBalance))) throw new Error('Thông tin đối soát không hợp lệ');
    const { data, error } = await context.db.rpc('reconcile_cash_account', { p_account_id: body.accountId, p_actual: Number(body.actualBalance), p_reconciled_at: body.reconciledAt || new Date().toISOString(), p_notes: clean(body.notes, 2000), p_actor: context.auth.profile.name });
    if (error) throw new Error(error.message); return NextResponse.json(data, { status: 201 });
  } catch (error) { return financeError(error); }
}

