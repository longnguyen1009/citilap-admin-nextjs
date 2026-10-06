import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { filterSensitiveFields, SENSITIVE_LAPTOP_KEYS, SENSITIVE_ORDER_KEYS } from '@/lib/apiAuth';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';
import { isCalendarDate } from '@/lib/listScope';
import { correctPayment } from '@/lib/cloudflare/payment-correction.mjs';
import { SALES_ROLES } from '@/lib/roles.mjs';

export async function PATCH(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, ['ADMIN']);
    const body = await request.json();
    const result = toCamel(await correctPayment(DB, profile, body));
    result.order.isActive = Boolean(result.order.isActive);
    result.order.laptopLocked = Boolean(result.order.laptopLocked);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}

const PAYMENT_TYPES = new Set(['deposit', 'balance', 'cod', 'refund', 'other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const parseId = value => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? Number(value) : null;
const camelKey = key => key.replace(/[-_]([a-z])/gi, (_, letter) => letter.toUpperCase());
const toCamel = value => Array.isArray(value)
  ? value.map(toCamel)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [camelKey(key), toCamel(item)]))
    : value;

async function context(request) {
  const { DB } = getCloudflareBindings();
  const profile = await requireSession(DB, request, SALES_ROLES);
  return { db: createDatabase(DB), profile };
}

export async function GET(request) {
  try {
    const { db } = await context(request);
    const rawOrderId = new URL(request.url).searchParams.get('orderId');
    let query = db.from('payments').select('*').order('payment_date', { ascending: false }).order('id', { ascending: false });
    if (rawOrderId) {
      const orderId = parseId(rawOrderId);
      if (!orderId) return NextResponse.json({ error: 'Mã đơn hàng không hợp lệ' }, { status: 400 });
      query = query.eq('order_id', orderId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(toCamel(data), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể tải lịch sử thanh toán' }, { status: error.status || 503 });
  }
}

export async function POST(request) {
  try {
    const { db, profile } = await context(request);
    const body = await request.json();
    const orderId = parseId(body?.orderId);
    const amount = Number(body?.amount);
    const paymentType = String(body?.paymentType || '');
    const paymentMethod = String(body?.paymentMethod || 'transfer_cash').trim();
    const paymentDate = String(body?.paymentDate || new Date().toISOString().slice(0, 10));
    const accountId = String(body?.accountId || '');
    const idempotencyKey = String(body?.idempotencyKey || randomUUID());
    if (!orderId || !Number.isFinite(amount) || amount <= 0 || !PAYMENT_TYPES.has(paymentType)) {
      return NextResponse.json({ error: 'Đơn hàng, loại thanh toán và số tiền không hợp lệ' }, { status: 400 });
    }
    if (!paymentMethod || paymentMethod.length > 100 || !isCalendarDate(paymentDate)) {
      return NextResponse.json({ error: 'Phương thức hoặc ngày thanh toán không hợp lệ' }, { status: 400 });
    }
    if (body.referenceCode !== undefined && String(body.referenceCode).length > 160) {
      return NextResponse.json({ error: 'Mã tham chiếu quá dài' }, { status: 400 });
    }
    if (body.note !== undefined && String(body.note).length > 1000) {
      return NextResponse.json({ error: 'Ghi chú quá dài' }, { status: 400 });
    }
    if (!UUID.test(accountId) || idempotencyKey.length < 8 || idempotencyKey.length > 90) {
      return NextResponse.json({ error: 'Tài khoản nhận tiền hoặc idempotency key không hợp lệ' }, { status: 400 });
    }
    const { data, error } = await db.rpc('record_order_payment_with_account', {
      p_order_id: orderId,
      p_amount: amount,
      p_payment_type: paymentType,
      p_payment_method: paymentMethod,
      p_payment_date: paymentDate,
      p_reference_code: body.referenceCode ? String(body.referenceCode).trim() : null,
      p_note: body.note ? String(body.note).trim() : null,
      p_recorded_by: profile.name,
      p_account_id: accountId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;

    const [orderResult, laptopResult] = await Promise.all([
      db.from('orders').select('*').eq('id', orderId).single(),
      data.laptop?.id ? db.from('laptops').select('*').eq('id', data.laptop.id).single() : Promise.resolve({ data: null }),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (laptopResult.error) throw laptopResult.error;
    const result = toCamel({ ...data, order: orderResult.data, laptop: laptopResult.data });
    if (profile.role !== 'ADMIN') {
      result.order = filterSensitiveFields([result.order], SENSITIVE_ORDER_KEYS)[0];
      if (result.laptop) result.laptop = filterSensitiveFields([result.laptop], SENSITIVE_LAPTOP_KEYS)[0];
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể ghi nhận thanh toán' }, { status: error.status || 400 });
  }
}
