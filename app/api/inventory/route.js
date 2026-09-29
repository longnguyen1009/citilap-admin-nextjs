import { NextResponse } from 'next/server';
import { parseListScope } from '../../../lib/listScope';
import { fetchLaptopsFromCloud, saveLaptopToCloud, keysToCamel } from '../../../lib/services/dbService';
import { logActivity, diffObject, pickAuditFields } from '../../../lib/services/logger';
import { requireUser, filterSensitiveFields, sanitizePayload, validateLaptopPayload, LAPTOP_PAYLOAD_KEYS, SENSITIVE_LAPTOP_KEYS } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';
import { createTiming, timeAsync, markTiming, withServerTiming } from '../../../lib/apiTiming';

const LAPTOP_AUDIT_FIELDS = [
  'sku', 'serial', 'name', 'category', 'importDate', 'warehouseDate', 'location',
  'chargerStatus', 'status', 'priceRmb', 'shippingRmb', 'exchangeRate',
  'importPriceVnd', 'wholesalePriceVnd', 'retailPriceVnd', 'trackingCode',
  'warrantySupplier', 'conditionNote', 'seller', 'batteryHealth',
  'screenStatus', 'cameraMicStatus', 'mainboardStatus', 'partsHistory', 'qcDetails'
];

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  const timing = createTiming();
  const { profile } = auth;
  const isAdmin = profile.role === 'ADMIN';

  const { searchParams } = new URL(request.url);
  let scope;
  try { scope = parseListScope(searchParams); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const status = searchParams.get('status');
  if (status !== null && !['in_transit', 'waiting_qc', 'available', 'reserved', 'sold', 'repair', 'supplier_return', 'ignored'].includes(status)) {
    return NextResponse.json({ error: 'Trạng thái máy không hợp lệ' }, { status: 400 });
  }
  const requestedLimit = Number(searchParams.get('limit'));
  const requestedOffset = Number(searchParams.get('offset'));
  const query = {
    ...scope,
    ...(status ? { status } : {}),
    ...(Number.isInteger(requestedLimit) && requestedLimit > 0 ? { limit: requestedLimit, offset: requestedOffset } : {})
  };
  const result = await timeAsync(timing, 'query', () => fetchLaptopsFromCloud(query));
  const paginated = result && !Array.isArray(result);
  const data = paginated ? result.data : result;

  if (!data) return NextResponse.json({ error: 'Failed to fetch laptops' }, { status: 500 });

  const db = getSupabaseAdminClient();
  const laptopIds = data.map(item => Number(item.id)).filter(Number.isFinite);
  const [{ data: reservations }, { data: tradeIns }] = laptopIds.length ? await Promise.all([
    db.from('reservations').select('id,reservation_code,laptop_id,customer_id,reserved_by,expires_at,status').in('laptop_id', laptopIds).eq('status', 'ACTIVE').gt('expires_at', new Date().toISOString()),
    db.from('trade_ins').select('trade_in_code,inventory_laptop_id').in('inventory_laptop_id', laptopIds)
  ]) : [{ data: [] }, { data: [] }];
  const customerIds = [...new Set((reservations || []).map(item => item.customer_id).filter(Boolean))];
  const userIds = [...new Set((reservations || []).map(item => item.reserved_by).filter(Boolean))];
  const [{ data: customers }, { data: users }] = await Promise.all([
    customerIds.length ? db.from('customers').select('id,name,phone').in('id', customerIds) : Promise.resolve({ data: [] }),
    userIds.length ? db.from('user_profiles').select('id,name').in('id', userIds) : Promise.resolve({ data: [] })
  ]);
  const customerById = new Map((customers || []).map(item => [String(item.id), item]));
  const userById = new Map((users || []).map(item => [String(item.id), item]));
  const reservationByLaptop = new Map((reservations || []).map(item => [String(item.laptop_id), item]));
  const tradeInByLaptop = new Map((tradeIns || []).map(item => [String(item.inventory_laptop_id), item.trade_in_code]));
  const canSeeCustomer = ['ADMIN', 'SALES'].includes(profile.role);
  const enriched = data.map(item => {
    const reservation = reservationByLaptop.get(String(item.id));
    return {
      ...item,
      activeReservation: reservation ? {
        id: reservation.id,
        code: reservation.reservation_code,
        expiresAt: reservation.expires_at,
        reservedBy: userById.get(String(reservation.reserved_by))?.name || null,
        ...(canSeeCustomer ? { customer: customerById.get(String(reservation.customer_id)) || null } : {})
      } : null,
      tradeInSourceCode: isAdmin ? tradeInByLaptop.get(String(item.id)) || null : undefined
    };
  });
  markTiming(timing, 'total', timing.startedAt);
  const responseData = isAdmin ? enriched : filterSensitiveFields(enriched, SENSITIVE_LAPTOP_KEYS);
  const payload = paginated ? { data: responseData, total: result.total, offset: result.offset, limit: result.limit, hasMore: result.hasMore } : responseData;
  return withServerTiming(NextResponse.json(payload, { headers: {
    'X-Data-Month': scope.all ? 'ALL' : scope.monthKey,
    'X-Data-Count': String(responseData.length),
    'Cache-Control': 'private, no-store',
  } }), timing);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  const isAdmin = profile.role === 'ADMIN';

  try {
    const rawPayload = await request.json();
    if (rawPayload.qcDetails !== undefined && !['ADMIN', 'TECH', 'TECHNICAL'].includes(profile.role)) {
      return NextResponse.json({ error: 'Chỉ kỹ thuật hoặc admin được sửa chi tiết QC' }, { status: 403 });
    }
    const body = sanitizePayload(rawPayload, LAPTOP_PAYLOAD_KEYS, SENSITIVE_LAPTOP_KEYS, isAdmin);

    // P0.4: Trả lỗi nếu non-admin gửi field nhạy cảm
    if (!isAdmin && SENSITIVE_LAPTOP_KEYS.some(k => rawPayload?.[k] !== undefined && rawPayload[k] !== null && rawPayload[k] !== '')) {
      return NextResponse.json({ error: 'Bạn không có quyền thay đổi các trường tài chính nhạy cảm.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const isCreateRequest = searchParams.get('mode') === 'create';
    validateLaptopPayload(body, { partial: !isCreateRequest });

    // Validate price ranges to prevent extreme values
    const MAX_PRICE_RMB = 100000;
    const MAX_SHIPPING_RMB = 50000;
    if (body.priceRmb !== undefined && Number(body.priceRmb) > MAX_PRICE_RMB) {
      return NextResponse.json({ error: `Giá tệ không hợp lệ: ${body.priceRmb}. Tối đa ${MAX_PRICE_RMB} RMB.` }, { status: 400 });
    }
    if (body.shippingRmb !== undefined && Number(body.shippingRmb) > MAX_SHIPPING_RMB) {
      return NextResponse.json({ error: `Phí vận chuyển không hợp lệ: ${body.shippingRmb}. Tối đa ${MAX_SHIPPING_RMB} RMB.` }, { status: 400 });
    }

    if (isCreateRequest) {
      return NextResponse.json({ error: 'Hãy tạo máy qua Lô mua, Nhận máy chưa rõ nguồn hoặc Thu cũ đổi mới.' }, { status: 400 });
    }

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

        if (!isAdmin && ['SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT'].includes(oldData.source_type)) {
          const oldLaptop = keysToCamel(oldData);
          const procurementFields = ['name', 'serial', 'trackingCode', 'priceRmb', 'shippingRmb', 'exchangeRate', 'importPriceVnd'];
          const changedProcurement = procurementFields.filter(key => {
            if (rawPayload?.[key] === undefined) return false;
            return String(rawPayload[key] ?? '').trim() !== String(oldLaptop[key] ?? '').trim();
          });
          if (changedProcurement.length > 0) {
            return NextResponse.json({
              error: 'Chỉ ADMIN được sửa thông tin mua hàng của laptop từ nhà cung cấp.'
            }, { status: 403 });
          }
        }

        // FIX: Chống sửa đổi trường tài chính trên laptop đã bị khóa/bán
        const procurementEditableStatuses = new Set(['in_transit', 'waiting_qc', 'repair', 'available', 'reserved']);
        if (body.status !== undefined && body.status !== oldData.status) {
          return NextResponse.json({ error: 'Trạng thái máy chỉ được thay đổi qua quy trình nghiệp vụ tương ứng.' }, { status: 400 });
        }
        if (oldData.status === 'sold') {
          const changedIdentity = ['name', 'serial'].filter(k => (
            body[k] !== undefined && String(body[k] ?? '').trim() !== String(oldData[k] ?? '').trim()
          ));
          if (changedIdentity.length > 0) {
            return NextResponse.json({ error: 'Laptop đã bán không thể thay đổi tên máy hoặc số serial.' }, { status: 400 });
          }
        }
        if (!procurementEditableStatuses.has(oldData.status) && isAdmin) {
          const oldLaptop = keysToCamel(oldData);
          const LOCKED_PROTECTED_FIELDS = ['priceRmb', 'shippingRmb', 'exchangeRate', 'importPriceVnd', 'wholesalePriceVnd', 'retailPriceVnd'];
          const changedProtected = LOCKED_PROTECTED_FIELDS.filter(k => {
            if (body[k] === undefined) return false;
            const incoming = Number(body[k]);
            const existing = Number(oldLaptop[k]);
            return Number.isFinite(incoming) && Number.isFinite(existing)
              ? incoming !== existing
              : String(body[k]) !== String(oldLaptop[k]);
          });
          if (changedProtected.length > 0) {
            return NextResponse.json({
              error: `Không thể thay đổi giá trên laptop đã khóa (${oldData.status}).`
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
