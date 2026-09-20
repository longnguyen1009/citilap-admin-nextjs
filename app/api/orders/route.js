import { NextResponse } from 'next/server';
import { fetchOrdersFromCloud, saveOrderToCloud, createOrderWithInventoryToCloud, keysToCamel } from '../../../lib/services/dbService';
import { diffObject, pickAuditFields, logActivity } from '../../../lib/services/logger';
import { requireUser, filterSensitiveFields, sanitizePayload, validateOrderPayload, ORDER_PAYLOAD_KEYS, SENSITIVE_ORDER_KEYS, SENSITIVE_LAPTOP_KEYS } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';

const ORDER_AUDIT_FIELDS = [
  'createdDate', 'saleOnline', 'saleOffline', 'note', 'orderType', 'orderStatus',
  'paymentStatus', 'paymentMethod', 'deliveryStatus', 'shippingMethod', 'laptopId', 'requestedLaptopId',
  'salePrice', 'depositAmount', 'depositNote', 'codAmount', 'creditCardFee',
  'tradeInLaptopId', 'customerId', 'customerInfo', 'customerNote', 'customerAddress', 'trackingCode',
  'shipDate', 'setupNote', 'warranty', 'gifts', 'branchId', 'giftPreset', 'giftAccessoryIds', 'reservationExpiresAt'
];

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  const isAdmin = profile.role === 'ADMIN';

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get('monthKey');
  const all = searchParams.get('all') === 'true';
  const data = await fetchOrdersFromCloud({ monthKey, all });

  if (!data) return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });

  const filteredData = isAdmin ? data : filterSensitiveFields(data, SENSITIVE_ORDER_KEYS);
  return NextResponse.json(filteredData);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  const isAdmin = profile.role === 'ADMIN';

  try {
    const rawPayload = await request.json();
    const body = sanitizePayload(rawPayload, ORDER_PAYLOAD_KEYS, SENSITIVE_ORDER_KEYS, isAdmin);

    // P0.4: Trả lỗi nếu non-admin gửi profitVnd
    if (!isAdmin && rawPayload?.profitVnd !== undefined && rawPayload.profitVnd !== null && rawPayload.profitVnd !== '') {
      return NextResponse.json({ error: 'Bạn không có quyền thay đổi lợi nhuận.' }, { status: 403 });
    }

    validateOrderPayload(body);

    // Tính profit_vnd server-side từ laptop import price
    delete body.profitVnd;
    if (body.laptopId && /^\d+$/.test(String(body.laptopId)) && Number(body.salePrice) > 0) {
      const adminClient = getSupabaseAdminClient();
      if (adminClient) {
        const { data: laptop } = await adminClient
          .from('laptops').select('import_price_vnd').eq('id', Number(body.laptopId)).maybeSingle();
        if (laptop && laptop.import_price_vnd > 0) {
          body.profitVnd = parseFloat((body.salePrice - laptop.import_price_vnd).toFixed(2));
        }
      }
    } else if (!body.laptopId || Number(body.salePrice) <= 0) {
      body.profitVnd = 0;
    }

    const persistedId = body.id && /^\d+$/.test(String(body.id)) && Number(body.id) > 0;
    let oldData = null;
    let action = 'CREATE';
    if (persistedId) {
      const adminClient = getSupabaseAdminClient();
      const { data } = await adminClient.from('orders').select('*').eq('id', body.id).single();
      if (data) {
        oldData = data;
        action = 'UPDATE';
        // FIX-03: SALES chỉ được sửa order trong tháng hiện tại
        if (!isAdmin && oldData) {
          const now = new Date();
          const currentMonth = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
          if (oldData.month_key && oldData.month_key !== currentMonth) {
            return NextResponse.json({ error: 'Bạn chỉ được sửa đơn hàng trong tháng hiện tại.' }, { status: 403 });
          }
        }
      }
    }

    // FIX: Kiểm tra laptop có đang bị đơn hàng khác giữ/bán không
    // Ngay cả khi đơn mới chỉ là "pending", laptop đã bị dùng bởi đơn active khác thì không được gán
    const requestedTarget = body.requestedLaptopId !== undefined
      ? body.requestedLaptopId
      : oldData?.requested_laptop_id;
    const requestedStatus = body.orderStatus ?? oldData?.order_status;
    if (!body.laptopId && requestedTarget && ['prepared', 'shipping', 'done'].includes(requestedStatus)) {
      body.laptopId = requestedTarget;
    }

    if (body.laptopId && /^\d+$/.test(String(body.laptopId))) {
      const adminClient = getSupabaseAdminClient();
      const laptopId = Number(body.laptopId);
      const { data: conflictOrder } = await adminClient
        .from('orders')
        .select('id, order_status, payment_status')
        .eq('laptop_id', laptopId)
        .eq('is_active', true)
        .not('order_status', 'in', '(cancelled,returned)')
        .not('payment_status', 'eq', 'refunded')
        .maybeSingle();
      if (conflictOrder && (!persistedId || conflictOrder.id !== body.id)) {
        return NextResponse.json({ error: `Laptop đang được giữ/bán bởi đơn hàng #${conflictOrder.id}. Vui lòng chọn laptop khác.` }, { status: 409 });
      }
    }

    const effectiveStatus = body.orderStatus ?? oldData?.order_status;
    const effectiveLaptopId = body.laptopId !== undefined ? body.laptopId : oldData?.laptop_id;
    if (['prepared', 'shipping', 'done'].includes(effectiveStatus) && !effectiveLaptopId) {
      return NextResponse.json({ error: 'Phải gán máy trước khi chuyển sang giao hàng/hoàn thành.' }, { status: 400 });
    }

    let data;
    try {
      data = persistedId
        ? await saveOrderToCloud(body, profile.name)
        : await createOrderWithInventoryToCloud(body, profile.name);
    } catch (error) {
      if (/already reserved by another active order|duplicate key|unique constraint/i.test(error.message || '')) {
        return NextResponse.json({ error: 'Máy đã được giữ/bán bởi một đơn hàng khác.' }, { status: 409 });
      }
      throw error;
    }
    if (data === null || data === false) {
      return NextResponse.json({ error: 'Failed to save order (saveOrderToCloud returned null or false)' }, { status: 500 });
    }

    // P0.5: Audit dùng data đã chuẩn hóa từ server
    const activityOrder = data.order || data;
    let changes = {};
    if (action === 'UPDATE' && oldData) {
      const oldCamel = keysToCamel(oldData);
      changes = diffObject(oldCamel, activityOrder, ORDER_AUDIT_FIELDS);
    } else {
      changes = pickAuditFields(activityOrder, ORDER_AUDIT_FIELDS);
    }

    await logActivity('ORDER', activityOrder.id, action, changes, profile.name);

    if (isAdmin) return NextResponse.json(data);
    if (data.order) {
      return NextResponse.json({
        ...data,
        order: filterSensitiveFields([data.order], SENSITIVE_ORDER_KEYS)[0],
        laptop: data.laptop ? filterSensitiveFields([data.laptop], SENSITIVE_LAPTOP_KEYS)[0] : data.laptop,
        previousLaptop: data.previousLaptop
          ? filterSensitiveFields([data.previousLaptop], SENSITIVE_LAPTOP_KEYS)[0]
          : data.previousLaptop
      });
    }
    return NextResponse.json(filterSensitiveFields([data], SENSITIVE_ORDER_KEYS)[0]);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}
