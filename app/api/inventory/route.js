import { NextResponse } from 'next/server';
import { parseListScope } from '../../../lib/listScope';
import { filterSensitiveFields, sanitizePayload, validateLaptopPayload, LAPTOP_PAYLOAD_KEYS, SENSITIVE_LAPTOP_KEYS } from '../../../lib/apiAuth';
import { createTiming, timeAsync, markTiming, withServerTiming } from '../../../lib/apiTiming';
import { keysToCamel, keysToSnake, routeContext, writeAudit } from '../../../lib/cloudflare/route-helpers.mjs';

const LAPTOP_AUDIT_FIELDS = [
  'sku', 'serial', 'name', 'category', 'importDate', 'warehouseDate', 'location',
  'chargerStatus', 'status', 'priceRmb', 'shippingRmb', 'exchangeRate',
  'importPriceVnd', 'wholesalePriceVnd', 'retailPriceVnd', 'trackingCode',
  'warrantySupplier', 'conditionNote', 'seller', 'batteryHealth',
  'screenStatus', 'cameraMicStatus', 'mainboardStatus', 'partsHistory', 'qcDetails'
];
const pickAuditFields = (value, fields) => Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
const diffObject = (before, after, fields) => Object.fromEntries(fields.filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
  .map(key => [key, { before: before?.[key] ?? null, after: after?.[key] ?? null }]));

export async function GET(request) {
  try {
  const { db, profile } = await routeContext(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'SALES_TECH', 'STAFF']);
  const timing = createTiming();
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
  const result = await timeAsync(timing, 'query', async () => {
    const paginated = Number.isInteger(query.limit) && query.limit > 0;
    const limit = paginated ? Math.min(query.limit, 500) : null;
    const offset = paginated ? Math.max(Number(query.offset) || 0, 0) : 0;
    let q = db.from('laptops').select('*', paginated ? { count: 'exact' } : undefined);
    if (query.monthKey && !query.all) q = q.eq('month_key', query.monthKey);
    if (query.status) q = q.eq('status', query.status);
    q = q.eq('is_active', true).order('id');
    if (paginated) q = q.range(offset, offset + limit - 1);
    const response = await q;
    if (response.error) throw new Error(response.error.message);
    const rows = keysToCamel(response.data);
    return paginated ? { data: rows, total: response.count || 0, offset, limit, hasMore: offset + rows.length < (response.count || 0) } : rows;
  });
  const paginated = result && !Array.isArray(result);
  const data = paginated ? result.data : result;

  if (!data) return NextResponse.json({ error: 'Failed to fetch laptops' }, { status: 500 });

  const laptopIds = data.map(item => Number(item.id)).filter(Number.isFinite);
  const enrichment = laptopIds.length ? await Promise.all([
    db.from('reservations').select('id,reservation_code,laptop_id,customer_id,reserved_by,expires_at,status').in('laptop_id', laptopIds).eq('status', 'ACTIVE').gt('expires_at', new Date().toISOString()),
    db.from('trade_ins').select('trade_in_code,inventory_laptop_id').in('inventory_laptop_id', laptopIds)
  ]) : [{ data: [] }, { data: [] }];
  if (enrichment.some(result => result.error)) {
    return NextResponse.json({ error: 'Không thể tải đầy đủ trạng thái giữ máy. Vui lòng thử lại.' }, { status: 503 });
  }
  const [{ data: reservations }, { data: tradeIns }] = enrichment;
  const customerIds = [...new Set((reservations || []).map(item => item.customer_id).filter(Boolean))];
  const userIds = [...new Set((reservations || []).map(item => item.reserved_by).filter(Boolean))];
  const people = await Promise.all([
    customerIds.length ? db.from('customers').select('id,name,phone').in('id', customerIds) : Promise.resolve({ data: [] }),
    userIds.length ? db.from('user_profiles').select('id,name').in('id', userIds) : Promise.resolve({ data: [] })
  ]);
  if (people.some(result => result.error)) {
    return NextResponse.json({ error: 'Không thể tải thông tin người giữ máy. Vui lòng thử lại.' }, { status: 503 });
  }
  const [{ data: customers }, { data: users }] = people;
  const purchaseBatchIds = [...new Set(data.map(item => Number(item.purchaseBatchId)).filter(Number.isSafeInteger))];
  const batchResult = purchaseBatchIds.length
    ? await db.from('purchase_batches').select('id,batch_code,supplier_id').in('id', purchaseBatchIds)
    : { data: [], error: null };
  if (batchResult.error) {
    return NextResponse.json({ error: 'Không thể tải nguồn nhập của laptop. Vui lòng thử lại.' }, { status: 503 });
  }
  const supplierIds = [...new Set((batchResult.data || []).map(batch => batch.supplier_id).filter(Boolean))];
  const supplierResult = supplierIds.length
    ? await db.from('suppliers').select('id,name,display_name').in('id', supplierIds)
    : { data: [], error: null };
  if (supplierResult.error) {
    return NextResponse.json({ error: 'Không thể tải nhà cung cấp của laptop. Vui lòng thử lại.' }, { status: 503 });
  }
  const batchById = new Map((batchResult.data || []).map(batch => [String(batch.id), batch]));
  const supplierById = new Map((supplierResult.data || []).map(supplier => [String(supplier.id), supplier]));
  const customerById = new Map((customers || []).map(item => [String(item.id), item]));
  const userById = new Map((users || []).map(item => [String(item.id), item]));
  const reservationByLaptop = new Map((reservations || []).map(item => [String(item.laptop_id), item]));
  const tradeInByLaptop = new Map((tradeIns || []).map(item => [String(item.inventory_laptop_id), item.trade_in_code]));
  const canSeeCustomer = ['ADMIN', 'SALES', 'SALES_TECH'].includes(profile.role);
  const enriched = data.map(item => {
    const reservation = reservationByLaptop.get(String(item.id));
    const batch = batchById.get(String(item.purchaseBatchId));
    const supplier = batch ? supplierById.get(String(batch.supplier_id)) : null;
    return {
      ...item,
      supplierName: supplier ? (supplier.display_name || supplier.name) : (item.seller || null),
      domesticSourceName: ['1', '2'].includes(String(item.sourceReferenceId)) ? (item.seller || null) : undefined,
      batchCode: batch?.batch_code || null,
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
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
}

export async function POST(request) {
  try {
    const { DB, db, profile } = await routeContext(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'SALES_TECH', 'STAFF']);
    const isAdmin = profile.role === 'ADMIN';
    const rawPayload = await request.json();
    const { searchParams } = new URL(request.url);
    const isCreateRequest = searchParams.get('mode') === 'create';
    const canCreateDomestic = ['SALES', 'TECH', 'TECHNICAL', 'SALES_TECH'].includes(profile.role);
    if (isCreateRequest && isAdmin) {
      return NextResponse.json({ error: 'ADMIN tạo laptop mới qua màn hình Lô mua hàng.' }, { status: 400 });
    }
    if (isCreateRequest && !canCreateDomestic) {
      return NextResponse.json({ error: 'Bạn không có quyền tạo laptop mới.' }, { status: 403 });
    }
    if (rawPayload.qcDetails !== undefined && !['ADMIN', 'TECH', 'TECHNICAL', 'SALES_TECH'].includes(profile.role)) {
      return NextResponse.json({ error: 'Chỉ kỹ thuật hoặc admin được sửa chi tiết QC' }, { status: 403 });
    }
    // The browser includes its exchange-rate default and supplier warranty text.
    // Domestic intake ignores the exchange rate because RMB and shipping are fixed at 0.
    const directCreateAllowedSensitiveKeys = new Set(['importPriceVnd', 'warrantySupplier', 'exchangeRate']);
    const directSensitiveKeys = SENSITIVE_LAPTOP_KEYS.filter(key => !directCreateAllowedSensitiveKeys.has(key));
    const payloadForSanitize = isCreateRequest ? { ...rawPayload } : rawPayload;
    if (isCreateRequest) directSensitiveKeys.forEach(key => { delete payloadForSanitize[key]; });
    const body = sanitizePayload(payloadForSanitize, LAPTOP_PAYLOAD_KEYS,
      isCreateRequest ? directSensitiveKeys : SENSITIVE_LAPTOP_KEYS, isAdmin);
    if (body.qcDetails !== undefined && !['ADMIN', 'TECH', 'TECHNICAL', 'SALES_TECH'].includes(profile.role)) {
      return NextResponse.json({ error: 'Chỉ kỹ thuật hoặc admin được sửa chi tiết QC' }, { status: 403 });
    }
    delete body.createdAt;
    delete body.updatedAt;

    // P0.4: Trả lỗi nếu non-admin gửi field nhạy cảm
    const forbiddenSensitiveKeys = isCreateRequest ? directSensitiveKeys : SENSITIVE_LAPTOP_KEYS;
    if (!isAdmin && forbiddenSensitiveKeys.some(k => rawPayload?.[k] !== undefined && rawPayload[k] !== null
      && rawPayload[k] !== '' && Number(rawPayload[k]) !== 0)) {
      return NextResponse.json({ error: 'Bạn không có quyền thay đổi các trường tài chính nhạy cảm.' }, { status: 403 });
    }

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
      const supplierId = String(body.sourceReferenceId || '');
      if (!['1', '2'].includes(supplierId)) {
        return NextResponse.json({ error: 'Nguồn nhập nội địa không hợp lệ.' }, { status: 400 });
      }
      if (body.importPriceVnd === undefined || body.importPriceVnd === '' || Number(body.importPriceVnd) <= 0) {
        return NextResponse.json({ error: 'Vui lòng nhập giá vốn VNĐ lớn hơn 0.' }, { status: 400 });
      }
      const supplier = await db.from('suppliers').select('id,name,display_name').eq('id', supplierId).eq('active', 1).maybeSingle();
      if (supplier.error || !supplier.data) {
        return NextResponse.json({ error: 'Nguồn nhập nội địa chưa được khởi tạo.' }, { status: 400 });
      }
      const row = keysToSnake({
        ...body,
        id: undefined,
        seller: supplier.data.display_name || supplier.data.name,
        sourceReferenceId: supplierId,
        priceRmb: 0,
        shippingRmb: 0,
        status: 'available',
        isActive: true,
        createdBy: profile.name,
      });
      delete row.id;
      delete row.exchange_rate;
      const result = await db.from('laptops').insert(row).select().single();
      if (result.error) throw new Error(result.error.message);
      const created = keysToCamel(result.data);
      created.domesticSourceName = supplier.data.display_name || supplier.data.name;
      await writeAudit(DB, 'LAPTOP', created.id, 'CREATE', pickAuditFields(created, LAPTOP_AUDIT_FIELDS), profile.name);
      return NextResponse.json(filterSensitiveFields([created], SENSITIVE_LAPTOP_KEYS)[0], { status: 201 });
    }

    if (!Number.isSafeInteger(Number(body.id)) || Number(body.id) <= 0) {
      return NextResponse.json({ error: 'Cần ID laptop hợp lệ để chỉnh sửa.' }, { status: 400 });
    }

    // Lấy dữ liệu cũ để diff
    let oldData = null;
    let action = 'CREATE';
    if (!isCreateRequest && body.id) {
      const { data, error } = await db.from('laptops').select('*').eq('id', Number(body.id)).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Không tìm thấy laptop.' }, { status: 404 });
      if (data) {
        oldData = data;
        action = 'UPDATE';
        if (body.isActive !== undefined && body.isActive !== oldData.is_active) {
          return NextResponse.json({ error: 'Không thể đổi trạng thái hoạt động qua chỉnh sửa máy.' }, { status: 403 });
        }
        if (!isAdmin && body.monthKey !== undefined && body.monthKey !== oldData.month_key) {
          return NextResponse.json({ error: 'Chỉ admin được đổi tháng dữ liệu.' }, { status: 403 });
        }
        delete body.isActive;

        // Supplier lineage is derived from purchase_batch_id. Do not copy a display
        // name from the Inventory form back into the laptop row.
        if (['SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT'].includes(oldData.source_type)) {
          delete body.seller;
        }

        if (!isAdmin && ['SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT'].includes(oldData.source_type)) {
          const oldLaptop = keysToCamel(oldData);
          const procurementFields = ['name', 'serial', 'trackingCode', 'priceRmb', 'shippingRmb', 'exchangeRate', 'importPriceVnd'];
          const changedProcurement = procurementFields.filter(key => {
            if (body[key] === undefined) return false;
            return String(body[key] ?? '').trim() !== String(oldLaptop[key] ?? '').trim();
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
      const row = keysToSnake(body);
      const id = Number(row.id);
      delete row.id;
      const result = await db.from('laptops').update(row).eq('id', id).select().single();
      if (result.error) throw new Error(result.error.message);
      data = keysToCamel(result.data);
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

    await writeAudit(DB, 'LAPTOP', data.id, action, changes, profile.name);

    const responseData = isAdmin ? data : filterSensitiveFields([data], SENSITIVE_LAPTOP_KEYS)[0];
    return NextResponse.json(responseData);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}
