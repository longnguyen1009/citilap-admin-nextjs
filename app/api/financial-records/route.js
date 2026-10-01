import { NextResponse } from 'next/server';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { createFinancialRecord } from '@/lib/cloudflare/financial.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';

const RECORD_TYPES = new Set(['income', 'expense', 'refund', 'adjustment']);
const parseId = value => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? Number(value) : null;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const camelKey = key => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const toCamel = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [camelKey(key), value]));

async function context(request) {
  const { DB } = getCloudflareBindings();
  const profile = await requireSession(DB, request, ['ADMIN']);
  return { DB, db: createDatabase(DB), profile };
}

export async function GET(request) {
  try {
    const { db } = await context(request);
    const params = new URL(request.url).searchParams;
    let query = db.from('financial_records').select('*').order('occurred_on', { ascending: false }).order('id', { ascending: false });
    if (params.get('from')) {
      if (!validDate(params.get('from'))) return NextResponse.json({ error: 'Ngày bắt đầu không hợp lệ' }, { status: 400 });
      query = query.gte('occurred_on', params.get('from'));
    }
    if (params.get('to')) {
      if (!validDate(params.get('to'))) return NextResponse.json({ error: 'Ngày kết thúc không hợp lệ' }, { status: 400 });
      query = query.lte('occurred_on', params.get('to'));
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data.map(toCamel), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể tải sổ tài chính' }, { status: error.status || 503 });
  }
}

export async function POST(request) {
  try {
    const { DB, profile } = await context(request);
    const body = await request.json();
    const recordType = String(body?.recordType || '');
    const category = String(body?.category || '').trim();
    const amount = Number(body?.amount);
    const occurredOn = body?.occurredOn || new Date().toISOString().slice(0, 10);
    const orderId = body?.orderId ? parseId(body.orderId) : null;
    const laptopId = body?.laptopId ? parseId(body.laptopId) : null;
    if (!RECORD_TYPES.has(recordType) || !category || category.length > 100 || !Number.isFinite(amount) || amount <= 0
      || (body?.orderId && !orderId) || (body?.laptopId && !laptopId) || !validDate(occurredOn)) {
      return NextResponse.json({ error: 'Thông tin sổ tài chính không hợp lệ' }, { status: 400 });
    }
    if (body.note !== undefined && String(body.note).length > 1000) {
      return NextResponse.json({ error: 'Ghi chú quá dài' }, { status: 400 });
    }
    const data = await createFinancialRecord(DB, {
      recordType, category, amount, orderId, laptopId, occurredOn,
      paymentMethod: body.paymentMethod ? String(body.paymentMethod).trim().slice(0, 100) : null,
      note: body.note ? String(body.note).trim() : null,
    }, profile.name);
    return NextResponse.json(toCamel(data), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể lưu sổ tài chính' }, { status: error.status || 400 });
  }
}
