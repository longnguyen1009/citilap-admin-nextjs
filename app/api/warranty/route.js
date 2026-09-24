import { NextResponse } from 'next/server';
import { fetchWarrantyCasesFromCloud, saveWarrantyCaseToCloud } from '../../../lib/services/dbService';
import { requireUser, sanitizePayload, validateWarrantyPayload, WARRANTY_PAYLOAD_KEYS } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { diffObject, pickAuditFields, logActivity } from '@/lib/services/logger';
import { keysToCamel } from '@/lib/services/dbService';

const OPEN_STATUSES = ['received', 'checking', 'wait_parts', 'repairing'];
const RESOLVED_STATUSES = ['done', 'swap_device', 'refunded'];
const WARRANTY_STATUSES = [...OPEN_STATUSES, ...RESOLVED_STATUSES];

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  const data = await fetchWarrantyCasesFromCloud();
  if (!data) return NextResponse.json({ error: 'Failed to fetch warranty cases' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  try {
    const body = sanitizePayload(await request.json(), WARRANTY_PAYLOAD_KEYS);
    // Server-set audit fields: ignore client-sent timestamps and actor
    delete body.createdAt;
    delete body.updatedAt;
    body.handledBy = auth.profile.name;
    validateWarrantyPayload(body);
    const adminClient = getSupabaseAdminClient();
    let previous = null;
    if (adminClient && body.id && /^\d+$/.test(String(body.id))) {
      const { data: oldData, error: oldError } = await adminClient.from('warranty_cases').select('*').eq('id', Number(body.id)).maybeSingle();
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
      const { data: linkedOrder, error: orderError } = await adminClient.from('orders')
        .select('id,laptop_id,requested_laptop_id,customer_info')
        .eq('id', Number(body.orderId)).maybeSingle();
      if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
      if (!linkedOrder || ![linkedOrder.laptop_id, linkedOrder.requested_laptop_id].some(id => String(id) === String(body.laptopId))) {
        return NextResponse.json({ error: 'Đơn gốc không thuộc máy đang tiếp nhận bảo hành.' }, { status: 400 });
      }
    }
    if (!previous && OPEN_STATUSES.includes(String(body.status))) {
      const { data: openCase, error: openCaseError } = await adminClient.from('warranty_cases')
        .select('id').eq('laptop_id', Number(body.laptopId)).in('status', OPEN_STATUSES).limit(1).maybeSingle();
      if (openCaseError) return NextResponse.json({ error: openCaseError.message }, { status: 500 });
      if (openCase) return NextResponse.json({ error: `Máy đang có phiếu bảo hành #${openCase.id} chưa hoàn tất.` }, { status: 409 });
    }
    body.resolvedDate = RESOLVED_STATUSES.includes(String(body.status))
      ? (body.resolvedDate || new Date().toLocaleDateString('vi-VN'))
      : '';
    const data = await saveWarrantyCaseToCloud(body);
    if (!data) return NextResponse.json({ error: 'Failed to save warranty case' }, { status: 500 });
    const fields = ['orderId', 'laptopId', 'reportedIssue', 'status', 'receivedDate', 'resolvedDate', 'repairCost', 'partsReplaced', 'diagnosis', 'resolution', 'resolutionNote', 'notes', 'customerInfo', 'handledBy'];
    await logActivity('WARRANTY', data.id, previous ? 'UPDATE' : 'CREATE', previous ? diffObject(previous, data, fields) : pickAuditFields(data, fields), auth.profile.name);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
