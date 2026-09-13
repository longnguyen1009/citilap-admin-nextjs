import { NextResponse } from 'next/server';
import { fetchLaptopsFromCloud, saveLaptopToCloud, keysToCamel } from '../../../lib/services/dbService';
import { logActivity, diffObject, pickAuditFields } from '../../../lib/services/logger';
import { requireUser, filterSensitiveFields, sanitizePayload, validateLaptopPayload, LAPTOP_PAYLOAD_KEYS, SENSITIVE_LAPTOP_KEYS } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  const isAdmin = profile.role === 'ADMIN';

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get('monthKey');
  const all = searchParams.get('all') === 'true';
  const data = await fetchLaptopsFromCloud({ monthKey, all });

  if (!data) return NextResponse.json({ error: 'Failed to fetch laptops' }, { status: 500 });

  const filteredData = isAdmin ? data : filterSensitiveFields(data, SENSITIVE_LAPTOP_KEYS);
  return NextResponse.json(filteredData);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  const isAdmin = profile.role === 'ADMIN';

  try {
    const rawPayload = await request.json();
    const body = sanitizePayload(rawPayload, LAPTOP_PAYLOAD_KEYS, SENSITIVE_LAPTOP_KEYS, isAdmin);

    // P0.4: Trả lỗi nếu non-admin gửi field nhạy cảm
    if (!isAdmin && SENSITIVE_LAPTOP_KEYS.some(k => rawPayload?.[k] !== undefined && rawPayload[k] !== null && rawPayload[k] !== '')) {
      return NextResponse.json({ error: 'Bạn không có quyền thay đổi các trường tài chính nhạy cảm.' }, { status: 403 });
    }

    validateLaptopPayload(body);
    const { searchParams } = new URL(request.url);
    const isCreateRequest = searchParams.get('mode') === 'create';

    // P0.1: Khi tạo mới, luôn bỏ ID để database tự sinh
    if (isCreateRequest) {
      delete body.id;
    }

    // Lấy dữ liệu cũ để diff
    let oldData = null;
    let action = 'CREATE';
    if (!isCreateRequest && body.id) {
      const adminClient = getSupabaseAdminClient();
      const { data, error } = await adminClient.from('laptops').select('*').eq('id', Number(body.id)).maybeSingle();
      if (error) throw error;
      if (data) {
        oldData = data;
        action = 'UPDATE';
      }
    }

    let data;
    try {
      data = await saveLaptopToCloud(body, { create: isCreateRequest });
    } catch (error) {
      if (/duplicate key|unique constraint|already reserved/i.test(error.message || '')) {
        return NextResponse.json({ error: 'Serial hoặc trạng thái máy bị trùng — kiểm tra lại dữ liệu.' }, { status: 409 });
      }
      throw error;
    }
    if (!data) return NextResponse.json({ error: 'Failed to save laptop' }, { status: 500 });

    // P0.5: Audit dùng data đã được chuẩn hóa từ server
    let changes = {};
    if (action === 'UPDATE' && oldData) {
      const oldCamel = keysToCamel(oldData);
      changes = diffObject(oldCamel, data);
      delete changes.id;
      delete changes.updatedAt;
    } else {
      changes = pickAuditFields(data, LAPTOP_PAYLOAD_KEYS.filter(k => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt'));
    }

    await logActivity('LAPTOP', data.id, action, changes, profile.name);

    const responseData = isAdmin ? data : filterSensitiveFields([data], SENSITIVE_LAPTOP_KEYS)[0];
    return NextResponse.json(responseData);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}
