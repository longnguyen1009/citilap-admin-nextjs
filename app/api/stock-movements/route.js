import { NextResponse } from 'next/server';
import { fetchStockMovementsFromCloud, saveStockMovementToCloud } from '../../../lib/services/dbService';
import { requireUser, sanitizePayload, STOCK_MOVEMENT_PAYLOAD_KEYS } from '../../../lib/apiAuth';
import { logActivity, pickAuditFields } from '../../../lib/services/logger';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';

const INVENTORY_EVENTS = new Set(['NHẬP KHO', 'CẬP NHẬT KHO', 'DEACTIVATED']);
const isWarrantyEvent = value => value === 'TIẾP NHẬN BẢO HÀNH' || value.startsWith('BẢO HÀNH:');

async function validateMovement(body, profile) {
  const movementType = String(body.movementType || body.type || '').trim().toUpperCase();
  if (!movementType || movementType.length > 80) throw new Error('Loại lịch sử kho không hợp lệ');
  if (INVENTORY_EVENTS.has(movementType)) {
    if (profile.role !== 'ADMIN') throw Object.assign(new Error('Chỉ quản trị viên được ghi sự kiện kho thủ công'), { status: 403 });
    if (body.orderId || body.warrantyCaseId) throw new Error('Sự kiện kho không được gắn đơn hoặc phiếu bảo hành');
    return;
  }
  if (!isWarrantyEvent(movementType)) throw new Error('Loại lịch sử kho không được phép ghi trực tiếp');
  if (!['ADMIN', 'TECH', 'TECHNICAL'].includes(profile.role)) throw Object.assign(new Error('Bạn không có quyền ghi lịch sử bảo hành'), { status: 403 });
  if (!body.warrantyCaseId || !body.laptopId) throw new Error('Lịch sử bảo hành phải gắn đúng phiếu và laptop');
  const { data, error } = await getSupabaseAdminClient().from('warranty_cases').select('laptop_id,order_id').eq('id', body.warrantyCaseId).maybeSingle();
  if (error || !data || Number(data.laptop_id) !== Number(body.laptopId) || (body.orderId && Number(data.order_id) !== Number(body.orderId))) {
    throw new Error('Phiếu bảo hành không khớp laptop hoặc đơn hàng');
  }
}

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  const data = await fetchStockMovementsFromCloud();
  if (!data) return NextResponse.json({ error: 'Failed to fetch stock movements' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  try {
    const body = sanitizePayload(await request.json(), STOCK_MOVEMENT_PAYLOAD_KEYS);
    await validateMovement(body, auth.profile);
    // Server-set audit fields
    delete body.createdAt;
    const data = await saveStockMovementToCloud({ ...body, performedBy: auth.profile.name });
    if (!data) return NextResponse.json({ error: 'Failed to save stock movement' }, { status: 500 });
    await logActivity('STOCK_MOVEMENT', data.id, 'CREATE', pickAuditFields(data, ['laptopId', 'movementType', 'type', 'fromLocation', 'toLocation', 'orderId', 'warrantyCaseId', 'note', 'performedBy']), auth.profile.name);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}
