import { NextResponse } from 'next/server';
import { requireUser, filterSensitiveFields, SENSITIVE_ORDER_KEYS, SENSITIVE_LAPTOP_KEYS } from '@/lib/apiAuth';
import { fetchPaymentsFromCloud, savePaymentToCloud } from '@/lib/services/dbService';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { diffObject, pickAuditFields, logActivity } from '@/lib/services/logger';
import { randomUUID } from 'node:crypto';

const PAYMENT_TYPES = new Set(['deposit', 'balance', 'cod', 'refund', 'other']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseId = (value) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0) return Number(value);
  return null;
};

const validDate = (value) => !value || (typeof value === 'string' && DATE_RE.test(value)
  && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()));

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;

  const orderId = new URL(request.url).searchParams.get('orderId');
  const data = await fetchPaymentsFromCloud({ orderId });
  if (!data) return NextResponse.json({ error: 'Không thể tải lịch sử thanh toán' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const orderId = parseId(body?.orderId);
    const amount = Number(body?.amount);
    const paymentType = String(body?.paymentType || '');
    const paymentMethod = String(body?.paymentMethod || 'transfer_cash').trim();
    const paymentDate = body?.paymentDate || null;
    const accountId = String(body?.accountId || '');
    const idempotencyKey = String(body?.idempotencyKey || randomUUID());

    if (!orderId || !Number.isFinite(amount) || amount <= 0 || !PAYMENT_TYPES.has(paymentType)) {
      return NextResponse.json({ error: 'Đơn hàng, loại thanh toán và số tiền không hợp lệ' }, { status: 400 });
    }
    if (paymentMethod.length > 100 || !validDate(paymentDate)) {
      return NextResponse.json({ error: 'Phương thức hoặc ngày thanh toán không hợp lệ' }, { status: 400 });
    }
    if (body.referenceCode !== undefined && String(body.referenceCode).length > 160) {
      return NextResponse.json({ error: 'Mã tham chiếu quá dài' }, { status: 400 });
    }
    if (body.note !== undefined && String(body.note).length > 1000) {
      return NextResponse.json({ error: 'Ghi chú quá dài' }, { status: 400 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(accountId) || idempotencyKey.length < 8 || idempotencyKey.length > 90) {
      return NextResponse.json({ error: 'Tài khoản nhận tiền hoặc idempotency key không hợp lệ' }, { status: 400 });
    }

    let previousOrder = null;
    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      const { data: previousOrderRow } = await adminClient
        .from('orders')
        .select('id,payment_status,amount_paid,debt_amount,deposit_amount')
        .eq('id', orderId)
        .maybeSingle();
      if (previousOrderRow) {
        previousOrder = {
          id: previousOrderRow.id,
          paymentStatus: previousOrderRow.payment_status,
          amountPaid: previousOrderRow.amount_paid,
          debtAmount: previousOrderRow.debt_amount,
          depositAmount: previousOrderRow.deposit_amount
        };
      }
    }

    const data = await savePaymentToCloud({
      orderId,
      amount,
      paymentType,
      paymentMethod,
      paymentDate,
      referenceCode: body.referenceCode ? String(body.referenceCode).trim() : null,
      note: body.note ? String(body.note).trim() : null,
      recordedBy: auth.profile.name,
      accountId,
      idempotencyKey
    });
    if (data.payment) {
      await logActivity(
        'PAYMENT',
        data.payment.id,
        'CREATE',
        pickAuditFields(data.payment, ['orderId', 'paymentType', 'amount', 'paymentMethod', 'paymentDate', 'referenceCode', 'note', 'recordedBy']),
        auth.profile.name
      );
    }
    if (data.order) {
      await logActivity(
        'ORDER',
        data.order.id,
        'UPDATE',
        diffObject(previousOrder || {}, data.order, ['paymentStatus', 'amountPaid', 'debtAmount', 'depositAmount']),
        auth.profile.name
      );
    }
    if (auth.profile.role !== 'ADMIN' && data.order) {
      data.order = filterSensitiveFields([data.order], SENSITIVE_ORDER_KEYS)[0];
      if (data.laptop) data.laptop = filterSensitiveFields([data.laptop], SENSITIVE_LAPTOP_KEYS)[0];
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể ghi nhận thanh toán' }, { status: 400 });
  }
}
