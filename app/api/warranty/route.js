import { NextResponse } from 'next/server';
import { sanitizePayload, validateWarrantyPayload, WARRANTY_PAYLOAD_KEYS } from '../../../lib/apiAuth';
import { keysToCamel, keysToSnake, routeContext, writeAudit } from '../../../lib/cloudflare/route-helpers.mjs';

const OPEN_STATUSES = ['received', 'checking', 'wait_parts', 'repairing'];
const RESOLVED_STATUSES = ['done', 'swap_device', 'refunded'];
const WARRANTY_STATUSES = [...OPEN_STATUSES, ...RESOLVED_STATUSES];

export async function GET(request) {
  try {
    const { db } = await routeContext(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'SALES_TECH', 'STAFF']);
    const { data, error } = await db.from('warranty_cases').select('*').order('id', { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    return NextResponse.json(keysToCamel(data));
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
}

export async function POST(request) {
  try {
    const { DB, db, profile } = await routeContext(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'SALES_TECH', 'STAFF']);
    const body = sanitizePayload(await request.json(), WARRANTY_PAYLOAD_KEYS);
    // Server-set audit fields: ignore client-sent timestamps and actor
    delete body.createdAt;
    delete body.updatedAt;
    body.handledBy = profile.name;
    validateWarrantyPayload(body);
    let previous = null;
    if (body.id && /^\d+$/.test(String(body.id))) {
      const { data: oldData, error: oldError } = await db.from('warranty_cases').select('*').eq('id', Number(body.id)).maybeSingle();
      if (oldError) return NextResponse.json({ error: oldError.message }, { status: 500 });
      previous = oldData ? keysToCamel(oldData) : null;
    }
    if (previous && String(body.laptopId) !== String(previous.laptopId)) {
      return NextResponse.json({ error: 'Không thể đổi máy gốc của phiếu bảo hành đã tiếp nhận.' }, { status: 400 });
    }
    if (!WARRANTY_STATUSES.includes(String(body.status))) {
      return NextResponse.json({ error: 'Trạng thái bảo hành không hợp lệ.' }, { status: 400 });
    }
    if (body.orderId) {
      const { data: linkedOrder, error: orderError } = await db.from('orders')
        .select('id,laptop_id,requested_laptop_id,customer_info')
        .eq('id', Number(body.orderId)).maybeSingle();
      if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
      if (!linkedOrder || ![linkedOrder.laptop_id, linkedOrder.requested_laptop_id].some(id => String(id) === String(body.laptopId))) {
        return NextResponse.json({ error: 'Đơn gốc không thuộc máy đang tiếp nhận bảo hành.' }, { status: 400 });
      }
    }
    if (!previous && OPEN_STATUSES.includes(String(body.status))) {
      const { data: openCase, error: openCaseError } = await db.from('warranty_cases')
        .select('id').eq('laptop_id', Number(body.laptopId)).in('status', OPEN_STATUSES).limit(1).maybeSingle();
      if (openCaseError) return NextResponse.json({ error: openCaseError.message }, { status: 500 });
      if (openCase) return NextResponse.json({ error: `Máy đang có phiếu bảo hành #${openCase.id} chưa hoàn tất.` }, { status: 409 });
    }
    body.resolvedDate = RESOLVED_STATUSES.includes(String(body.status))
      ? (body.resolvedDate || new Date().toLocaleDateString('vi-VN'))
      : '';
    const row = keysToSnake(body);
    const id = Number(row.id);
    delete row.id;
    const mutation = id ? db.from('warranty_cases').update(row).eq('id', id) : db.from('warranty_cases').insert(row);
    const { data, error } = await mutation.select().single();
    if (error) throw new Error(error.message);
    const result = keysToCamel(data);
    await writeAudit(DB, 'WARRANTY', data.id, previous ? 'UPDATE' : 'CREATE', { before: previous, after: result }, profile.name);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
