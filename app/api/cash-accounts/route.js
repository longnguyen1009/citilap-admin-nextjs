import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { clean, financeAdmin, financeError, UUID } from '@/lib/financeApi';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const currency = new URL(request.url).searchParams.get('currency');
  let query = db.from('cash_account_balances').select(auth.profile.role === 'ADMIN' ? '*' : 'id,code,name,account_type,currency,is_active').eq('is_active', true).order('currency').order('code');
  if (currency && ['VND', 'CNY'].includes(currency)) query = query.eq('currency', currency);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  try {
    const body = await request.json();
    const { data, error } = await context.db.rpc('create_cash_account', { p_data: { code: clean(body.code, 40), name: clean(body.name, 160), account_type: body.accountType, currency: body.currency, opening_balance: Number(body.openingBalance || 0), opening_balance_at: body.openingBalanceAt }, p_actor: context.auth.profile.name });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return financeError(error); }
}

export async function PATCH(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  try {
    const body = await request.json(); if (!UUID.test(String(body.id || ''))) throw new Error('Tài khoản không hợp lệ');
    const { data, error } = await context.db.rpc('update_cash_account', { p_id: body.id, p_name: clean(body.name, 160), p_is_active: body.isActive !== false, p_actor: context.auth.profile.name });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) { return financeError(error); }
}

