import { orderCreationHash } from '@/lib/cloudflare/remaining.mjs';
import { NextResponse } from 'next/server';
import { parseListScope, businessMonthKey } from '../../../lib/listScope';
import { keysToCamel } from '../../../lib/cloudflare/route-helpers.mjs';
import { filterSensitiveFields, sanitizePayload, validateOrderPayload, ORDER_PAYLOAD_KEYS, SENSITIVE_ORDER_KEYS, SENSITIVE_LAPTOP_KEYS } from '../../../lib/apiAuth';
import { createTiming, timeAsync, markTiming, withServerTiming } from '../../../lib/apiTiming';
import { getCloudflareBindings } from '../../../lib/cloudflare/bindings';
import { createDatabase } from '../../../lib/cloudflare/database.mjs';
import { requireSession } from '../../../lib/cloudflare/session.mjs';
import { remainingOrderAmount } from '../../../lib/orderPaymentAmounts.mjs';
import { SALES_ROLES } from '../../../lib/roles.mjs';

const snakeKey = key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const keysToSnake = value => {
  if (Array.isArray(value)) return value.map(keysToSnake);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [snakeKey(key), keysToSnake(item)]));
};

const normalizeGiftAccessoryIds = value => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
};

const normalizeOrderJsonFields = order => {
  if (!order || typeof order !== 'object') return order;
  if (!Object.hasOwn(order, 'giftAccessoryIds')) return { ...order };
  return { ...order, giftAccessoryIds: normalizeGiftAccessoryIds(order.giftAccessoryIds) };
};

async function context(request, roles) {
  const { DB } = getCloudflareBindings();
  return { DB, db: createDatabase(DB), profile: await requireSession(DB, request, roles) };
}

async function saveOrder(db, order, actor, persisted, creationKey, requestHash) {
  const normalizedOrder = normalizeOrderJsonFields(order);
  for (const key of ['saleOnline', 'saleOffline']) {
    if (Object.hasOwn(normalizedOrder, key)) normalizedOrder[key] = normalizedOrder[key]?.trim() || null;
  }
  for (const key of ['laptopId', 'requestedLaptopId', 'tradeInLaptopId', 'customerId', 'branchId']) {
    if (normalizedOrder[key] === '') normalizedOrder[key] = null;
  }
  const dbRow = keysToSnake(normalizedOrder);
  if (!persisted) {
    delete dbRow.id;
    if (!dbRow.month_key) dbRow.month_key = businessMonthKey();
  }
  const operation = persisted ? 'update_order_with_inventory' : 'create_order_with_inventory';
  const { data, error } = await db.rpc(operation, { p_order: dbRow, p_recorded_by: actor, p_idempotency_key: creationKey, p_request_hash: requestHash });
  if (error) throw Object.assign(new Error(error.message), { status: error.status || 400 });
  const saved = keysToCamel(data);
  if (saved?.order) return { ...saved, order: normalizeOrderJsonFields(saved.order) };
  return normalizeOrderJsonFields(saved);
}

export async function GET(request) {
  try {
    const { db, profile } = await context(request, SALES_ROLES);
    const timing = createTiming();
    const isAdmin = profile.role === 'ADMIN';

  const { searchParams } = new URL(request.url);
  let scope;
  try { scope = parseListScope(searchParams); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const requestedLimit = Number(searchParams.get('limit'));
  const requestedOffset = Number(searchParams.get('offset'));
  const query = {
    ...scope,
    ...(Number.isInteger(requestedLimit) && requestedLimit > 0 ? { limit: requestedLimit, offset: requestedOffset } : {})
  };
  const result = await timeAsync(timing, 'query', async () => {
    const paginated = Number.isInteger(query.limit) && query.limit > 0;
    const limit = paginated ? Math.min(query.limit, 500) : null;
    const offset = paginated ? Math.max(Number.isInteger(Number(query.offset)) ? Number(query.offset) : 0, 0) : 0;
    let requestQuery = db.from('orders').select('*', paginated ? { count: 'exact' } : undefined);
    if (query.monthKey && !query.all) requestQuery = requestQuery.eq('month_key', query.monthKey);
    requestQuery = requestQuery.eq('is_active', true).order('id');
    if (paginated) requestQuery = requestQuery.range(offset, offset + limit - 1);
    const response = await requestQuery;
    if (response.error) throw new Error(response.error.message);
    const rows = keysToCamel(response.data).map(normalizeOrderJsonFields).map(order => ({ ...order, codAmount: remainingOrderAmount(order) }));
    const customerIds = [...new Set(rows.map(order => order.customerId).filter(Boolean))];
    if (customerIds.length) {
      const customerResult = await db.from('customers').select('id,name,phone,address').in('id', customerIds);
      if (customerResult.error) throw new Error(customerResult.error.message);
      const customersById = new Map(customerResult.data.map(customer => [String(customer.id), customer]));
      for (const order of rows) {
        const customer = customersById.get(String(order.customerId));
        if (customer) {
          order.customerInfo = [customer.name, customer.phone].filter(Boolean).join('\n');
          order.customerAddress = customer.address || '';
        }
      }
    }
    return paginated
      ? { data: rows, total: response.count || 0, offset, limit, hasMore: offset + rows.length < (response.count || 0) }
      : rows;
  });
  const paginated = result && !Array.isArray(result);
  const data = paginated ? result.data : result;

  if (!data) return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });

  const orderIds = data.map(item => Number(item.id)).filter(Number.isFinite);
  const enrichment = orderIds.length ? await Promise.all([
    db.from('reservations').select('reservation_code,order_id,status,reserved_at,expires_at,converted_at').in('order_id', orderIds).eq('status', 'ACTIVE').gt('expires_at', new Date().toISOString()).order('reserved_at').order('id'),
    db.from('trade_ins').select('trade_in_code,order_id,status,agreed_value_vnd').in('order_id', orderIds),
    isAdmin ? db.from('order_sales_operations_summary').select('*').in('order_id', orderIds) : Promise.resolve({ data: [] }),
    isAdmin ? db.from('commissions').select('order_id,beneficiary_type,beneficiary_name,commission_type,amount_vnd,status').in('order_id', orderIds).neq('status', 'CANCELLED') : Promise.resolve({ data: [] }),
    db.from('invoices').select('id,order_id').in('order_id', orderIds)
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  if (enrichment.some(result => result.error)) {
    return NextResponse.json({ error: 'Không thể tải đầy đủ trạng thái giữ máy và chứng từ. Vui lòng thử lại.' }, { status: 503 });
  }
  const [{ data: reservations }, { data: tradeIns }, summaryResult, commissionsResult, { data: invoices }] = enrichment;
  const byOrder = rows => new Map((rows || []).map(item => [String(item.order_id), keysToCamel(item)]));
  const reservationByOrder = byOrder(reservations);
  const tradeInByOrder = byOrder(tradeIns);
  const summaryByOrder = byOrder(summaryResult.data);
  const invoiceByOrder = new Map((invoices || []).map(item => [String(item.order_id), item.id]));
  const commissionsByOrder = new Map();
  for (const item of commissionsResult.data || []) {
    const key = String(item.order_id);
    commissionsByOrder.set(key, [...(commissionsByOrder.get(key) || []), keysToCamel(item)]);
  }
  const base = isAdmin ? data : filterSensitiveFields(data, SENSITIVE_ORDER_KEYS);
  const responseData = base.map(item => ({
    ...item,
    reservation: reservationByOrder.get(String(item.id)) || null,
    tradeIn: tradeInByOrder.get(String(item.id)) || null,
    invoiceId: invoiceByOrder.get(String(item.id)) || null,
    ...(isAdmin ? {
      salesOperationsSummary: summaryByOrder.get(String(item.id)) || null,
      commissions: commissionsByOrder.get(String(item.id)) || []
    } : {})
  }));
  markTiming(timing, 'total', timing.startedAt);
  const payload = paginated
    ? { data: responseData, total: result.total, offset: result.offset, limit: result.limit, hasMore: result.hasMore }
    : responseData;
  return withServerTiming(NextResponse.json(payload, { headers: {
    'X-Data-Month': scope.all ? 'ALL' : scope.monthKey,
    'X-Data-Count': String(responseData.length),
    'Cache-Control': 'private, no-store',
  } }), timing);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const { db, profile } = await context(request, SALES_ROLES);
    const isAdmin = profile.role === 'ADMIN';
    const rawPayload = await request.json();
    const protectedCostFields = ['costSnapshotVnd', 'grossProfitSnapshotVnd', 'directCostSnapshotVnd', 'netContributionSnapshotVnd', 'costSnapshotStatus', 'costSnapshotReasons', 'costSnapshottedAt', 'tradeInCreditVnd'];
    const isNewOrder = !(rawPayload?.id && /^\d+$/.test(String(rawPayload.id)) && Number(rawPayload.id) > 0);
    if (isNewOrder && protectedCostFields.some((key) => rawPayload?.[key] !== undefined && rawPayload?.[key] !== null && rawPayload?.[key] !== '')) {
      return NextResponse.json({ error: 'Snapshot giá vốn chỉ được hệ thống tạo khi chốt bán.' }, { status: 400 });
    }
    for (const key of protectedCostFields) delete rawPayload[key];
    const body = sanitizePayload(rawPayload, ORDER_PAYLOAD_KEYS, SENSITIVE_ORDER_KEYS, isAdmin);
    const creationKey = request.headers.get('Idempotency-Key') || rawPayload.idempotencyKey;
    const requestHash = orderCreationHash(keysToSnake(body));
    if(isNewOrder){
      if(typeof creationKey!=='string'||creationKey.length<8||creationKey.length>100) return NextResponse.json({error:'Thi?u m? ch?ng g?i tr?ng. T?i l?i form t?o ??n.'},{status:400});
      const replay=await db.from('orders').select('*').eq('creation_key',creationKey).maybeSingle();
      if(replay.error)throw new Error(replay.error.message);
      if(replay.data){
        if(replay.data.creation_hash!==requestHash)return NextResponse.json({error:'M? y?u c?u ?? d?ng cho n?i dung kh?c.'},{status:409});
        const order=normalizeOrderJsonFields(keysToCamel(replay.data));
        return NextResponse.json({order:isAdmin?order:filterSensitiveFields([order],SENSITIVE_ORDER_KEYS)[0],laptop:null,previousLaptop:null});
      }
    }
    if (body.giftAccessoryIds !== undefined) {
      body.giftAccessoryIds = normalizeGiftAccessoryIds(body.giftAccessoryIds);
    }
    delete body.createdAt;
    delete body.updatedAt;
    delete body.laptopLocked;
    delete body.cancelledAt;
    delete body.returnedAt;
    if (body.isActive === false) {
      return NextResponse.json({ error: 'Hãy dùng quy trình hủy hoặc trả đơn hàng.' }, { status: 403 });
    }
    delete body.isActive;
    const isLegacyTradeInType = value => {
      const normalized = String(value || '').trim().toLowerCase();
      return normalized === 'trade_in' || normalized.includes('trade-in') || normalized.includes('thu cũ');
    };

    if (isNewOrder) {
      if (isLegacyTradeInType(body.orderType) || body.tradeInLaptopId) {
        return NextResponse.json({
          error: 'Hãy tạo hồ sơ tại mục Thu cũ để thực hiện kiểm tra, báo giá và QC đúng quy trình.'
        }, { status: 400 });
      }
      const openingCash = Math.max(Number(body.amountPaid || 0), Number(body.depositAmount || 0));
      const requestedPaymentStatus = String(body.paymentStatus || 'unpaid').toLowerCase();
      if (!(Number(body.salePrice) > 0)) {
        return NextResponse.json({ error: 'Giá bán phải lớn hơn 0.' }, { status: 400 });
      }
      if (String(body.orderStatus || '').toLowerCase() === 'deposited') {
        return NextResponse.json({
          error: 'Không đặt trạng thái Đã cọc khi tạo đơn. Hãy lưu đơn rồi ghi nhận tiền tại mục Thu tiền.'
        }, { status: 400 });
      }
      if (openingCash > 0 || ['paid', 'deposited', 'refunded'].includes(requestedPaymentStatus)) {
        return NextResponse.json({
          error: 'Hãy tạo đơn trước, sau đó ghi nhận tiền cọc hoặc thanh toán tại mục Thu tiền để chọn đúng tài khoản nhận.'
        }, { status: 400 });
      }
      body.amountPaid = 0;
      body.depositAmount = 0;
      body.debtAmount = Number(body.salePrice || 0);
      body.codAmount = body.debtAmount;
      body.paymentStatus = 'unpaid';
    }

    const persistedId = body.id && /^\d+$/.test(String(body.id)) && Number(body.id) > 0;
    let oldData = null;
    if (persistedId) {
      const { data } = await db.from('orders').select('*').eq('id', body.id).single();
      if (data) {
        oldData = data;
        if (!isAdmin) {
          if (body.monthKey !== undefined && body.monthKey !== oldData.month_key) {
            return NextResponse.json({ error: 'Chỉ admin được đổi tháng dữ liệu.' }, { status: 403 });
          }
          const currentMonth = businessMonthKey();
          if (oldData.month_key && oldData.month_key !== currentMonth) {
            return NextResponse.json({ error: 'Bạn chỉ được sửa đơn hàng trong tháng hiện tại.' }, { status: 403 });
          }
        }
      }
    }
    // This value can only originate from the accepted trade-in workflow.
    if (body.orderStatus === 'cancelled' && oldData?.order_status !== 'cancelled') body.cancelledAt = new Date().toISOString();
    if (body.orderStatus === 'returned' && oldData?.order_status !== 'returned') body.returnedAt = new Date().toISOString();
    body.tradeInCreditVnd = Number(oldData?.trade_in_credit_vnd || 0);
    // Once an order exists, payment status is derived from the payment ledger,
    // refunds, COD workflow, and trade-in credit. Editing ordinary order fields
    // must never rewrite that financial state.
    if (persistedId && oldData) {
      if (isLegacyTradeInType(body.orderType) && !isLegacyTradeInType(oldData.order_type)) {
        return NextResponse.json({ error: 'Không thể chuyển đơn thường sang loại thu cũ. Hãy dùng mục Thu cũ.' }, { status: 400 });
      }
      if (isLegacyTradeInType(oldData.order_type)) body.orderType = oldData.order_type;
      body.tradeInLaptopId = oldData.trade_in_laptop_id || null;
      body.amountPaid = Number(oldData.amount_paid || 0);
      body.depositAmount = Number(oldData.deposit_amount || 0);
      const salePrice = Number(body.salePrice ?? oldData.sale_price ?? 0);
      body.salePrice = salePrice;
      const tradeInCredit = Number(body.tradeInCreditVnd || 0) / 1000000;
      if (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice < body.amountPaid + tradeInCredit) {
        return NextResponse.json({ error: 'Giá bán phải lớn hơn 0 và không thấp hơn tổng tiền đã thu + giá trị thu cũ. Hãy xử lý giao dịch trước.' }, { status: 400 });
      }
      body.debtAmount = Math.max(0, salePrice - body.amountPaid - tradeInCredit);
      body.codAmount = body.debtAmount;

      if (oldData.payment_status === 'refunded') {
        body.paymentStatus = 'refunded';
      } else if (body.debtAmount <= 0.000001 && (body.amountPaid > 0 || tradeInCredit >= salePrice)) {
        body.paymentStatus = 'paid';
      } else if (oldData.payment_status === 'cod' && body.debtAmount > 0) {
        body.paymentStatus = 'cod';
      } else if (body.amountPaid > 0) {
        body.paymentStatus = 'deposited';
      } else {
        body.paymentStatus = 'unpaid';
      }

      const storedGiftAccessoryIds = normalizeGiftAccessoryIds(oldData.gift_accessory_ids);
      if (Array.isArray(body.giftAccessoryIds)
        && Array.isArray(storedGiftAccessoryIds)
        && JSON.stringify(body.giftAccessoryIds) === JSON.stringify(storedGiftAccessoryIds)) {
        delete body.giftAccessoryIds;
      }

    }

    // P0.4: Trả lỗi nếu non-admin gửi profitVnd
    if (!isAdmin && rawPayload?.profitVnd !== undefined && rawPayload.profitVnd !== null && rawPayload.profitVnd !== '') {
      return NextResponse.json({ error: 'Bạn không có quyền thay đổi lợi nhuận.' }, { status: 403 });
    }

    const effectiveCustomerId = body.customerId !== undefined ? body.customerId : oldData?.customer_id;
    if (effectiveCustomerId) {
      const customerResult = await db.from('customers').select('id,name,phone,address').eq('id', effectiveCustomerId).maybeSingle();
      if (customerResult.error) throw new Error(customerResult.error.message);
      if (!customerResult.data) return NextResponse.json({ error: 'Khách hàng không tồn tại.' }, { status: 400 });
      body.customerInfo = [customerResult.data.name, customerResult.data.phone].filter(Boolean).join('\n');
      body.customerAddress = customerResult.data.address || '';
    }
    validateOrderPayload(body);

    // Tính profit_vnd server-side từ laptop import price
    delete body.profitVnd;
    if (body.laptopId && /^\d+$/.test(String(body.laptopId)) && Number(body.salePrice) > 0) {
      const { data: laptop } = await db
        .from('laptops').select('import_price_vnd').eq('id', Number(body.laptopId)).maybeSingle();
      if (laptop && laptop.import_price_vnd > 0) {
        body.profitVnd = parseFloat((body.salePrice - laptop.import_price_vnd).toFixed(2));
      }
    } else if (!body.laptopId || Number(body.salePrice) <= 0) {
      body.profitVnd = 0;
    }

    // FIX: Kiểm tra laptop có đang bị đơn hàng khác giữ/bán không
    // Ngay cả khi đơn mới chỉ là "pending", laptop đã bị dùng bởi đơn active khác thì không được gán

    if (body.laptopId && /^\d+$/.test(String(body.laptopId))) {
      const laptopId = Number(body.laptopId);
      const laptopChanged = Number(oldData?.laptop_id || 0) !== laptopId;
      if (laptopChanged) {
        const { data: selectedLaptop, error: laptopError } = await db
          .from('laptops').select('id, status, is_active').eq('id', laptopId).maybeSingle();
        if (laptopError || !selectedLaptop || selectedLaptop.is_active !== true) {
          return NextResponse.json({ error: 'Laptop không tồn tại hoặc đã ngừng sử dụng.' }, { status: 400 });
        }
        if (!['available', 'reserved'].includes(selectedLaptop.status)) {
          return NextResponse.json({ error: `Laptop chưa sẵn sàng để bán (trạng thái: ${selectedLaptop.status || 'không xác định'}).` }, { status: 409 });
        }
      }
      const { data: conflictOrder } = await db
        .from('orders')
        .select('id, order_status, payment_status')
        .eq('laptop_id', laptopId)
        .eq('is_active', true)
        .neq('order_status', 'cancelled')
        .neq('order_status', 'returned')
        .not('payment_status', 'eq', 'refunded')
        .maybeSingle();
      if (conflictOrder && (!persistedId || conflictOrder.id !== body.id)) {
        return NextResponse.json({ error: `Laptop đang được giữ/bán bởi đơn hàng #${conflictOrder.id}. Vui lòng chọn laptop khác.` }, { status: 409 });
      }
    }

    if (!body.laptopId && body.requestedLaptopId && /^\d+$/.test(String(body.requestedLaptopId))) {
      const requestedId = Number(body.requestedLaptopId);
      const requestedChanged = Number(oldData?.requested_laptop_id || 0) !== requestedId;
      if (requestedChanged) {
        const { data: requestedLaptop } = await db.from('laptops').select('status, is_active').eq('id', requestedId).maybeSingle();
        if (!requestedLaptop || requestedLaptop.is_active !== true) {
          return NextResponse.json({ error: `Laptop chưa sẵn sàng để giữ/bán (trạng thái: ${requestedLaptop?.status || 'không xác định'}).` }, { status: 409 });
        }
      }
    }

    const reservationLaptopId = /^\d+$/.test(String(body.laptopId)) ? Number(body.laptopId) : null;
    if (reservationLaptopId) {
      const { data: activeReservations, error: reservationError } = await db
        .from('reservations')
        .select('reservation_code,order_id,laptop_id')
        .eq('laptop_id', reservationLaptopId)
        .eq('status', 'ACTIVE')
        .gt('expires_at', new Date().toISOString());
      if (reservationError) throw new Error(reservationError.message);
      const conflict = activeReservations?.find(item => String(item.order_id || '') !== String(body.id || ''));
      if (conflict) {
        return NextResponse.json({ error: `Laptop đang được giữ bởi ${conflict.reservation_code}.` }, { status: 409 });
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
        ? await saveOrder(db, body, profile.name, true)
        : await saveOrder(db, body, profile.name, false, creationKey, requestHash);
    } catch (error) {
      if (/already reserved by another active order|duplicate key|unique constraint/i.test(error.message || '')) {
        return NextResponse.json({ error: 'Máy đã được giữ/bán bởi một đơn hàng khác.' }, { status: 409 });
      }
      throw error;
    }
    if (data === null || data === false) {
      return NextResponse.json({ error: 'Failed to save order' }, { status: 500 });
    }

    // P0.5: Audit dùng data đã chuẩn hóa từ server
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
