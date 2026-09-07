import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { fetchFinancialRecordsFromCloud, saveFinancialRecordToCloud } from '@/lib/services/dbService';
import { pickAuditFields, logActivity } from '@/lib/services/logger';

const RECORD_TYPES = new Set(['income', 'expense', 'refund', 'adjustment']);
const parseId = (value) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0) return Number(value);
  return null;
};
const validDate = (value) => !value || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()));

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const data = await fetchFinancialRecordsFromCloud({ from: params.get('from'), to: params.get('to') });
  if (!data) return NextResponse.json({ error: 'Không thể tải sổ tài chính' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const recordType = String(body?.recordType || '');
    const category = String(body?.category || '').trim();
    const amount = Number(body?.amount);
    const occurredOn = body?.occurredOn || new Date().toISOString().slice(0, 10);
    const orderId = body?.orderId ? parseId(body.orderId) : null;
    const laptopId = body?.laptopId ? parseId(body.laptopId) : null;

    if (!RECORD_TYPES.has(recordType) || !category || category.length > 100 || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Loại, danh mục hoặc số tiền không hợp lệ' }, { status: 400 });
    }
    if ((body?.orderId && !orderId) || (body?.laptopId && !laptopId) || !validDate(occurredOn)) {
      return NextResponse.json({ error: 'Liên kết hoặc ngày phát sinh không hợp lệ' }, { status: 400 });
    }
    if (body.note !== undefined && String(body.note).length > 1000) {
      return NextResponse.json({ error: 'Ghi chú quá dài' }, { status: 400 });
    }

    const data = await saveFinancialRecordToCloud({
      recordType,
      category,
      amount,
      orderId,
      laptopId,
      occurredOn,
      paymentMethod: body.paymentMethod ? String(body.paymentMethod).trim().slice(0, 100) : null,
      note: body.note ? String(body.note).trim() : null,
      recordedBy: auth.profile.name
    });
    await logActivity(
      'FINANCIAL_RECORD',
      data.id,
      'CREATE',
      pickAuditFields(data, ['recordType', 'category', 'amount', 'orderId', 'paymentId', 'laptopId', 'occurredOn', 'paymentMethod', 'note', 'recordedBy']),
      auth.profile.name
    );
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể lưu sổ tài chính' }, { status: 400 });
  }
}
