import { NextResponse } from 'next/server';
import { fetchLaptopsFromCloud, saveLaptopToCloud, keysToCamel } from '../../../lib/services/dbService';
import { logActivity, diffObject, pickAuditFields } from '../../../lib/services/logger';
import { requireUser, filterSensitiveFields, sanitizePayload, validateLaptopPayload, LAPTOP_PAYLOAD_KEYS, SENSITIVE_LAPTOP_KEYS } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';

const LAPTOP_AUDIT_FIELDS = [
  'serial', 'name', 'category', 'importDate', 'warehouseDate', 'location',
  'chargerStatus', 'status', 'priceRmb', 'shippingRmb', 'exchangeRate',
  'importPriceVnd', 'wholesalePriceVnd', 'retailPriceVnd', 'trackingCode',
  'warrantySupplier', 'conditionNote', 'seller', 'batteryHealth', 'isLocked',
  'screenStatus', 'cameraMicStatus', 'mainboardStatus', 'partsHistory'
];

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

    // Validate price ranges to prevent extreme values
    const MAX_PRICE_RMB = 100000;
    const MAX_SHIPPING_RMB = 50000;
    if (body.priceRmb !== undefined && Number(body.priceRmb) > MAX_PRICE_RMB) {
      return NextResponse.json({ error: `Giá tệ không hợp lệ: ${body.priceRmb}. Tối đa ${MAX_PRICE_RMB} RMB.` }, { status: 400 });
    }
    if (body.shippingRmb !== undefined && Number(body.shippingRmb) > MAX_SHIPPING_RMB) {
      return NextResponse.json({ error: `Phí vận chuyển không hợp lệ: ${body.shippingRmb}. Tối đa ${MAX_SHIPPING_RMB} RMB.` }, { status: 400 });
    }

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

        // FIX: Chống sửa đổi trường tài chính trên laptop đã bị khóa/bán
        const isSoldOrLocked = oldData.is_locked || oldData.status === 'sold';
        if (isSoldOrLocked && isAdmin) {
          const LOCKED_PROTECTED_FIELDS = ['priceRmb', 'shippingRmb', 'exchangeRate', 'importPriceVnd', 'wholesalePriceVnd', 'retailPriceVnd'];
          const changedProtected = LOCKED_PROTECTED_FIELDS.filter(k => {
            if (body[k] === undefined) return false;
            const incoming = Number(body[k]);
            const existing = Number(oldData[k]);
            return Number.isFinite(incoming) && Number.isFinite(existing)
              ? incoming !== existing
              : String(body[k]) !== String(oldData[k]);
          });
          if (changedProtected.length > 0) {
            return NextResponse.json({
              error: `Không thể thay đổi giá trên laptop đã khóa (${oldData.status}). Chỉ có thể sửa số serial và tên.`
            }, { status: 400 });
          }
        }
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
      changes = diffObject(oldCamel, data, LAPTOP_AUDIT_FIELDS);
    } else {
      changes = pickAuditFields(data, LAPTOP_AUDIT_FIELDS);
    }

    await logActivity('LAPTOP', data.id, action, changes, profile.name);

    const responseData = isAdmin ? data : filterSensitiveFields([data], SENSITIVE_LAPTOP_KEYS)[0];
    return NextResponse.json(responseData);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}
