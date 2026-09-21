import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { logActivity, pickAuditFields } from '@/lib/services/logger';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']); if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const batchId = new URL(request.url).searchParams.get('batchId');
  // Hardening adds a composite batch/supplier FK, so PostgREST sees two paths
  // to purchase_batches. Pin the original single-column relationship.
  let query = db.from('supplier_payments').select('*, suppliers(code,name), purchase_batches!supplier_payments_purchase_batch_id_fkey(batch_code)').order('payment_date', { ascending: false }).order('id', { ascending: false });
  if (batchId && /^\d+$/.test(batchId)) query = query.eq('purchase_batch_id', Number(batchId));
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Không thể tải lịch sử thanh toán nhà cung cấp' }, { status: 503 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']); if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const batchId = /^\d+$/.test(String(body.purchaseBatchId || '')) ? Number(body.purchaseBatchId) : null;
    const amount = Number(body.amountRmb); const rate = Number(body.exchangeRate);
    const method = String(body.paymentMethod || ''); const date = String(body.paymentDate || '');
    if (!batchId || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0 || !['WECHAT','ALIPAY','BANK_TRANSFER','CASH','OTHER'].includes(method) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Thông tin thanh toán không hợp lệ');
    const idempotencyKey = String(body.idempotencyKey || randomUUID());
    const accountId = String(body.accountId || '');
    if (idempotencyKey.length < 8 || idempotencyKey.length > 90 || !/^[0-9a-f-]{36}$/i.test(accountId)) throw new Error('Idempotency key hoặc tài khoản không hợp lệ');
    const db = getSupabaseAdminClient();
    const { data, error } = await db.rpc('record_supplier_payment_with_account', { p_batch_id: batchId, p_amount_rmb: amount, p_exchange_rate: rate, p_method: method, p_reference: String(body.reference || '').trim().slice(0, 200), p_date: date, p_notes: String(body.notes || '').trim().slice(0, 2000), p_actor: auth.profile.name, p_account_id: accountId, p_idempotency_key: idempotencyKey });
    if (error) throw new Error(error.message);
    await logActivity('SUPPLIER_PAYMENT', data.id, 'CREATE', pickAuditFields(data, ['supplier_id','purchase_batch_id','amount_rmb','amount_vnd','exchange_rate','payment_method','reference','payment_date']), auth.profile.name);
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error.message || 'Không thể ghi nhận thanh toán' }, { status: 400 }); }
}
