import { NextResponse } from 'next/server';
import { sanitizePayload, STOCK_MOVEMENT_PAYLOAD_KEYS } from '../../../lib/apiAuth';
import { keysToCamel, keysToSnake, routeContext, writeAudit } from '../../../lib/cloudflare/route-helpers.mjs';

const INVENTORY_EVENTS = new Set(['NHẬP KHO', 'CẬP NHẬT KHO', 'DEACTIVATED']);
const isWarrantyEvent = value => value === 'TIẾP NHẬN BẢO HÀNH' || value.startsWith('BẢO HÀNH:');

async function validateMovement(db, body, profile) {
  const normalize = value => String(value ?? '').trim().toUpperCase();
  if (body.movementType != null && body.type != null && normalize(body.movementType) !== normalize(body.type)) {
    throw new Error('Loại lịch sử kho không nhất quán');
  }
  const movementType = String(body.movementType || body.type || '').trim().toUpperCase();
  body.movementType = movementType;
  delete body.type;
  if (!movementType || movementType.length > 80) throw new Error('Loại lịch sử kho không hợp lệ');
  if (INVENTORY_EVENTS.has(movementType)) {
    if (profile.role !== 'ADMIN') throw Object.assign(new Error('Chỉ quản trị viên được ghi sự kiện kho thủ công'), { status: 403 });
    if (body.orderId || body.warrantyCaseId) throw new Error('Sự kiện kho không được gắn đơn hoặc phiếu bảo hành');
    return;
  }
  if (!isWarrantyEvent(movementType)) throw new Error('Loại lịch sử kho không được phép ghi trực tiếp');
  if (!['ADMIN', 'TECH', 'TECHNICAL', 'SALES_TECH'].includes(profile.role)) throw Object.assign(new Error('Bạn không có quyền ghi lịch sử bảo hành'), { status: 403 });
  if (!body.warrantyCaseId || !body.laptopId) throw new Error('Lịch sử bảo hành phải gắn đúng phiếu và laptop');
  const { data, error } = await db.from('warranty_cases').select('laptop_id,order_id').eq('id', body.warrantyCaseId).maybeSingle();
  if (error || !data || Number(data.laptop_id) !== Number(body.laptopId) || (body.orderId && Number(data.order_id) !== Number(body.orderId))) {
    throw new Error('Phiếu bảo hành không khớp laptop hoặc đơn hàng');
  }
}

export async function GET(request) {
  try {
    const { db } = await routeContext(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'SALES_TECH', 'STAFF']);
    const { data, error } = await db.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    return NextResponse.json(keysToCamel(data));
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
}

export async function POST(request) {
  try {
    const { DB, db, profile } = await routeContext(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'SALES_TECH', 'STAFF']);
    const body = sanitizePayload(await request.json(), STOCK_MOVEMENT_PAYLOAD_KEYS);
    await validateMovement(db, body, profile);
    // Server-set audit fields
    delete body.createdAt;
    const row = keysToSnake({ ...body, performedBy: profile.name });
    delete row.id;
    const { data, error } = await db.from('stock_movements').insert(row).select().single();
    if (error) throw new Error(error.message);
    const result = keysToCamel(data);
    await writeAudit(DB, 'STOCK_MOVEMENT', data.id, 'CREATE', result, profile.name);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}
