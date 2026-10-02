import { NextResponse } from 'next/server';
import { sanitizePayload, CUSTOMER_PAYLOAD_KEYS } from '@/lib/apiAuth';
import { keysToCamel, routeContext, writeAudit } from '@/lib/cloudflare/route-helpers.mjs';

export async function GET(request) {
  try {
    const { db } = await routeContext(request, ['ADMIN', 'SALES', 'SALES_TECH']);
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(params.get('limit') || '50', 10)));
    const from = (page - 1) * limit;
    const { data, error, count } = await db.from('customers').select('*', { count: 'exact' })
      .order('created_at', { ascending: false }).range(from, from + limit - 1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ data, total: count, page, limit });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const { DB, db, profile } = await routeContext(request, ['ADMIN', 'SALES', 'SALES_TECH']);
    const payload = sanitizePayload(await request.json(), CUSTOMER_PAYLOAD_KEYS);
    const name = String(payload.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Tên khách hàng là bắt buộc' }, { status: 400 });
    if (name.length > 160) return NextResponse.json({ error: 'Customer name is too long' }, { status: 400 });
    const row = { name, phone: String(payload.phone || '').trim() || null, address: String(payload.address || '').trim() || null };
    if (row.phone && row.phone.length > 40) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    if (row.address && row.address.length > 500) return NextResponse.json({ error: 'Customer address is too long' }, { status: 400 });
    const id = /^\d+$/.test(String(payload.id || '')) ? Number(payload.id) : null;
    const previous = id ? (await db.from('customers').select('*').eq('id', id).maybeSingle()).data : null;
    if (row.phone) {
      const normalized = row.phone.replace(/\D/g, '');
      if (normalized.length >= 8) {
        const { data: candidates, error } = await db.from('customers').select('id,phone').not('phone', 'is', null)
          .ilike('phone', `%${normalized.slice(-8)}%`);
        if (error) throw new Error(error.message);
        if (candidates.some(item => String(item.phone || '').replace(/\D/g, '') === normalized && Number(item.id) !== id)) {
          return NextResponse.json({ error: 'Số điện thoại khách hàng đã tồn tại.' }, { status: 409 });
        }
      }
    }
    const mutation = id ? db.from('customers').update(row).eq('id', id) : db.from('customers').insert(row);
    const { data, error } = await mutation.select().single();
    if (error) throw new Error(error.message);
    await writeAudit(DB, 'CUSTOMER', data.id, previous ? 'UPDATE' : 'CREATE', keysToCamel(data), profile.name);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
