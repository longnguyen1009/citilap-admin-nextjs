import { NextResponse } from 'next/server';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const financeError = error => NextResponse.json({ error: error.message }, { status: error.status || 400 });
async function financeAdmin(request, roles = ['ADMIN']) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, roles);
    return { auth: { profile }, db: createDatabase(DB) };
  } catch (error) { return { response: financeError(error) }; }
}

export async function GET(request) {
  const context = await financeAdmin(request, ['ADMIN', 'SALES', 'SALES_TECH']);
  if (context.response) return context.response;
  const { auth, db } = context;
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

