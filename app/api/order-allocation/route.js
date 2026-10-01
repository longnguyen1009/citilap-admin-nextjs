import { NextResponse } from 'next/server';
import { filterSensitiveFields, SENSITIVE_ORDER_KEYS, SENSITIVE_LAPTOP_KEYS } from '@/lib/apiAuth';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';

async function context(request) {
  const { DB } = getCloudflareBindings();
  const profile = await requireSession(DB, request, ['ADMIN', 'SALES']);
  return { db: createDatabase(DB), profile };
}

const toCamel = value => {
  if (Array.isArray(value)) return value.map(toCamel);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    toCamel(item),
  ]));
};

export async function GET(request) {
  let db;
  try { ({ db } = await context(request)); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
  if (new URL(request.url).searchParams.has('demand')) {
    const { data, error } = await db.from('orders')
      .select('id,requested_configuration,requested_category,requested_laptop_id,customer_info,amount_paid')
      .eq('is_active', true).is('laptop_id', null).gt('amount_paid', 0)
      .not('order_status', 'in', '(cancelled,returned)').neq('payment_status', 'refunded');
    if (error) return NextResponse.json({ error: 'Không thể tải đơn chờ phân máy' }, { status: 503 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const [machines, orders] = await Promise.all([
    db.from('laptops').select('id,name,serial,status').eq('is_active', true).in('status', ['available', 'reserved']),
    db.from('orders').select('id,laptop_id,customer_info,order_status,payment_status').eq('is_active', true).not('laptop_id', 'is', null).not('order_status', 'in', '(cancelled,returned)').neq('payment_status', 'refunded'),
  ]);
  if (machines.error || orders.error) return NextResponse.json({ error: 'Không thể tải danh sách phân máy' }, { status: 503 });
  return NextResponse.json({ machines: machines.data, orders: orders.data }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request) {
  let db, profile;
  try { ({ db, profile } = await context(request)); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Dữ liệu phân máy không hợp lệ' }, { status: 400 });
  }
  const validId = value => Number.isSafeInteger(value) && value > 0;
  if (!validId(body.orderId) || (body.laptopId !== null && !validId(body.laptopId)) || (body.expectedOwner !== null && !validId(body.expectedOwner))) {
    return NextResponse.json({ error: 'Mã đơn hoặc máy không hợp lệ' }, { status: 400 });
  }
  const { data: currentOrder, error: currentError } = await db.from('orders')
    .select('id,laptop_id').eq('id', body.orderId).maybeSingle();
  if (currentError || !currentOrder) return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });

  const { data, error } = await db.rpc('allocate_order_laptop', {
    p_order_id: body.orderId, p_laptop_id: body.laptopId,
    p_expected_owner: body.expectedOwner, p_actor: profile.name,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  const orderIds = [...new Set([body.orderId, body.expectedOwner].filter(Boolean))];
  const laptopIds = [...new Set([currentOrder.laptop_id, body.laptopId].filter(Boolean))];
  const [orders, laptops] = await Promise.all([
    db.from('orders').select('*').in('id', orderIds),
    laptopIds.length
      ? db.from('laptops').select('*').in('id', laptopIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (orders.error || laptops.error) {
    return NextResponse.json({ error: 'Đã phân máy nhưng không thể tải dữ liệu cập nhật' }, { status: 503 });
  }
  const result = toCamel({ allocation: data, orders: orders.data, laptops: laptops.data });
  if (profile.role !== 'ADMIN') {
    result.orders = filterSensitiveFields(result.orders, SENSITIVE_ORDER_KEYS);
    result.laptops = filterSensitiveFields(result.laptops, SENSITIVE_LAPTOP_KEYS);
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
}
