import { getSupabaseClient } from '../supabaseClient';
import { getSupabaseAdminClient } from '../supabaseAdmin';

// ─── Auth guard ───
export const hasActiveSession = async () => {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data: { session } } = await client.auth.getSession();
  return !!session;
};

// ─── Date Helpers ───
const toIsoDate = (vnDateStr) => {
  if (!vnDateStr) return null;
  const value = String(vnDateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value.includes('-')) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  const parts = String(vnDateStr).split('/');
  if (parts.length >= 3) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    const dateObj = new Date(`${y}-${m}-${d}T00:00:00Z`);
    return isNaN(dateObj.getTime()) ? null : dateObj.toISOString().split('T')[0];
  }
  return null;
};

const toVnDate = (isoStr) => {
  if (!isoStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(isoStr))) {
    const [year, month, day] = String(isoStr).split('-');
    return `${day}/${month}/${year}`;
  }
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const isValidDBId = (id) => (typeof id === 'number' && Number.isInteger(id) && id > 0)
  || (typeof id === 'string' && /^\d+$/.test(id) && Number(id) > 0);
const isPresent = (value) => value !== undefined && value !== null && value !== '';
const assertNonNegative = (row, fields) => {
  fields.forEach(field => {
    if (isPresent(row[field]) && (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0)) {
      throw new Error(`${field} phải là số không âm`);
    }
  });
};
const assertIntegerId = (row, field) => {
  if (isPresent(row[field]) && !isValidDBId(row[field])) throw new Error(`${field} không hợp lệ`);
};
const assertReferenceExists = async (client, table, row, field) => {
  if (!isPresent(row[field])) return;
  assertIntegerId(row, field);
  const { data, error } = await client.from(table).select('id').eq('id', Number(row[field])).maybeSingle();
  if (error) throw new Error(`Không thể kiểm tra liên kết ${field}`);
  if (!data) throw new Error(`${field} không tồn tại`);
};

const getMonthRange = (monthKey) => {
  if (!monthKey || monthKey === 'ALL') return null;
  const [month, year] = String(monthKey).split('/').map(Number);
  if (!month || !year || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  return {
    start: start.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10)
  };
};

// ─── AUTO-MAPPER (Snake <-> Camel) ───
const VN_DATE_FIELDS = ['importDate', 'warehouseDate', 'createdDate', 'shipDate', 'receivedDate', 'resolvedDate', 'cancelledAt', 'paymentDate', 'occurredOn'];

const toCamel = (s) => s.replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''));
const toSnake = (s) => s.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const isObject = (o) => o === Object(o) && !Array.isArray(o) && typeof o !== 'function' && o !== null;
const LAPTOP_PRICE_FIELDS = ['wholesale_price_vnd', 'retail_price_vnd'];

export const keysToCamel = (o) => {
  if (isObject(o)) {
    const n = {};
    Object.keys(o).forEach((k) => {
      const camelKey = toCamel(k);
      // Cycle count was removed from the product model; hide legacy DB columns while migrations roll out.
      if (camelKey === 'cycleCount') return;
      let val = keysToCamel(o[k]);
      if (VN_DATE_FIELDS.includes(camelKey)) val = toVnDate(val);
      n[camelKey] = val;
    });
    return n;
  } else if (Array.isArray(o)) {
    return o.map((i) => keysToCamel(i));
  }
  return o;
};

export const keysToSnake = (o) => {
  if (isObject(o)) {
    const n = {};
    Object.keys(o).forEach((k) => {
      const snakeKey = toSnake(k);
      let val = keysToSnake(o[k]);
      
      // Convert empty strings to null to prevent "invalid input syntax for type numeric"
      if (val === '') val = null;

      // Special Rules
      if (k === 'id' && !isValidDBId(val)) return; // Skip invalid IDs so Supabase can auto-generate
      if (VN_DATE_FIELDS.includes(k)) val = toIsoDate(val);
      
      // Auto mapping ID fixes (if UI sends something that doesn't match the standard)
      if (k === 'movementType') n['movement_type'] = val; // ensure backward compat if needed
      
      n[snakeKey] = val;
    });
    return n;
  } else if (Array.isArray(o)) {
    return o.map((i) => keysToSnake(i));
  }
  return o;
};

// ─── API Methods ───
// Laptops
export const fetchLaptopsFromCloud = async (opts = {}) => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    let query = client.from('laptops').select('*');
    if (opts.monthKey && !opts.all) {
      query = query.eq('month_key', opts.monthKey);
    }
    const res = await query.eq('is_active', true);
    if (res.error || !res.data) return null;
    return keysToCamel(res.data);
  } catch (err) { return null; }
};

export const saveLaptopToCloud = async (laptop, options = {}) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(laptop);
    if (options.create) {
      delete dbRow.id;
      // Tự set month_key = tháng hiện tại khi tạo mới
      if (!dbRow.month_key) {
        const now = new Date();
        dbRow.month_key = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      }
    }
    LAPTOP_PRICE_FIELDS.forEach(field => {
      if (isPresent(dbRow[field])) dbRow[field] = Number(dbRow[field]);
    });
    assertNonNegative(dbRow, ['price_rmb', 'shipping_rmb', 'exchange_rate', 'import_price_vnd', ...LAPTOP_PRICE_FIELDS, 'battery_health']);
    if (isPresent(dbRow.battery_health) && Number(dbRow.battery_health) > 100) throw new Error('battery_health phải từ 0 đến 100');
    if (isPresent(dbRow.serial) && String(dbRow.serial).length > 100) throw new Error('serial quá dài');
    delete dbRow.import_price_manually_edited;
    delete dbRow.profit_vnd; // computed property on frontend
    const laptopId = dbRow.id;
    let data;
    let error;
    if (!options.create && isValidDBId(laptopId)) {
      const updates = { ...dbRow };
      delete updates.id;
      if (Object.keys(updates).length === 0) {
        ({ data, error } = await client
          .from('laptops')
          .select()
          .eq('id', Number(laptopId))
          .single());
      } else {
        ({ data, error } = await client
          .from('laptops')
          .update(updates)
          .eq('id', Number(laptopId))
          .select()
          .single());
      }
    } else {
      ({ data, error } = await client.from('laptops').insert(dbRow).select().single());
    }
    if (error || !data) throw new Error(error?.message || 'Bị chặn bởi RLS');
    return keysToCamel(data);
  } catch (err) {
    console.error('Lỗi kết nối Supabase:', err);
    throw err;
  }
};

// Orders
export const fetchOrdersFromCloud = async (opts = {}) => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    let query = client.from('orders').select('*');
    if (opts.monthKey && !opts.all) {
      query = query.eq('month_key', opts.monthKey);
    }
    const res = await query.eq('is_active', true);
    if (res.error || !res.data) return null;
    return keysToCamel(res.data);
  } catch (err) { return null; }
};

const PAYMENT_STATUS_KEYS = new Set(['unpaid', 'deposited', 'cod', 'paid', 'refunded']);

// Inventory RPCs persist the physical allocation (laptop_id). Keep the
// requested deposit reference in a separate column so multiple deposits can
// point at the same requested machine.
const persistRequestedLaptopReference = async (client, rpcData, dbRow) => {
  if (!Object.prototype.hasOwnProperty.call(dbRow, 'requested_laptop_id')) return rpcData;
  const returnedOrder = rpcData?.order || rpcData;
  if (!returnedOrder?.id) return rpcData;
  const { data: updatedOrder, error } = await client
    .from('orders')
    .update({ requested_laptop_id: dbRow.requested_laptop_id ?? null, updated_at: new Date().toISOString() })
    .eq('id', Number(returnedOrder.id))
    .select('*')
    .single();
  if (error || !updatedOrder) throw new Error(error?.message || 'Khong the luu may duoc dat coc');
  const requestedId = dbRow.requested_laptop_id;
  if (!requestedId) return { ...rpcData, order: updatedOrder };
  const { data: refreshedLaptop, error: refreshError } = await client.rpc('refresh_laptop_inventory', {
    p_laptop_id: Number(requestedId)
  });
  if (refreshError) throw new Error(refreshError.message || 'Khong the dong bo trang thai laptop');
  const result = { ...rpcData, order: updatedOrder };
  if (result.previous_laptop && String(result.previous_laptop.id) === String(requestedId)) {
    result.previous_laptop = refreshedLaptop;
  } else if (refreshedLaptop) {
    result.laptop = refreshedLaptop;
  }
  return result;
};

// Keep the app compatible with databases that have not run the latest
// migration yet: repair only a valid user-selected status after the RPC.
const preserveExplicitPaymentStatus = async (client, rpcData, requestedStatus) => {
  const status = String(requestedStatus || '').trim().toLowerCase();
  if (!PAYMENT_STATUS_KEYS.has(status)) return rpcData;
  const returnedOrder = rpcData?.order || rpcData;
  if (!returnedOrder?.id || returnedOrder.payment_status === status) return rpcData;

  const { data: correctedOrder, error } = await client
    .from('orders')
    .update({ payment_status: status, updated_at: new Date().toISOString() })
    .eq('id', Number(returnedOrder.id))
    .select('*')
    .single();
  if (error || !correctedOrder) throw new Error(error?.message || 'Khong the luu trang thai thanh toan');

  let correctedLaptop = rpcData?.laptop;
  if (correctedOrder.laptop_id) {
    const { data: laptop } = await client.rpc('refresh_laptop_inventory', {
      p_laptop_id: Number(correctedOrder.laptop_id)
    });
    if (laptop) correctedLaptop = laptop;
  }
  return { ...rpcData, order: correctedOrder, laptop: correctedLaptop };
};

export const saveOrderToCloud = async (order, recordedBy = null) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(order);
    if (!isValidDBId(dbRow.id)) throw new Error('id đơn hàng không hợp lệ');
    assertNonNegative(dbRow, ['sale_price', 'deposit_amount', 'cod_amount', 'amount_paid', 'debt_amount', 'credit_card_fee']);
    await assertReferenceExists(client, 'laptops', dbRow, 'laptop_id');
    await assertReferenceExists(client, 'laptops', dbRow, 'requested_laptop_id');
    await assertReferenceExists(client, 'laptops', dbRow, 'trade_in_laptop_id');
    await assertReferenceExists(client, 'customers', dbRow, 'customer_id');
    let { data, error } = await client.rpc('update_order_with_inventory', {
      p_order: dbRow,
      p_recorded_by: recordedBy || null
    });
    if (error || !data) throw new Error(error?.message || 'Không thể cập nhật đơn và tồn kho');
    data = await persistRequestedLaptopReference(client, data, dbRow);
    data = await preserveExplicitPaymentStatus(client, data, dbRow.payment_status);
    return keysToCamel(data);
  } catch (err) { throw err; }
};

export const createOrderWithInventoryToCloud = async (order, recordedBy) => {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Server configuration error');
  const dbRow = keysToSnake(order);
  delete dbRow.id;
  // Tự set month_key = tháng hiện tại khi tạo mới
  if (!dbRow.month_key) {
    const now = new Date();
    dbRow.month_key = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }
  assertNonNegative(dbRow, ['sale_price', 'deposit_amount', 'cod_amount', 'amount_paid', 'debt_amount', 'credit_card_fee']);
  if (isPresent(dbRow.laptop_id)) {
    assertIntegerId(dbRow, 'laptop_id');
    await assertReferenceExists(client, 'laptops', dbRow, 'laptop_id');
  }
  if (isPresent(dbRow.requested_laptop_id)) {
    assertIntegerId(dbRow, 'requested_laptop_id');
    await assertReferenceExists(client, 'laptops', dbRow, 'requested_laptop_id');
  }
  if (isPresent(dbRow.customer_id)) {
    assertIntegerId(dbRow, 'customer_id');
    await assertReferenceExists(client, 'customers', dbRow, 'customer_id');
  }
  if (isPresent(dbRow.trade_in_laptop_id)) {
    assertIntegerId(dbRow, 'trade_in_laptop_id');
    await assertReferenceExists(client, 'laptops', dbRow, 'trade_in_laptop_id');
  }
  let { data, error } = await client.rpc('create_order_with_inventory', {
    p_order: dbRow,
    p_recorded_by: recordedBy || null
  });
  if (error || !data) throw new Error(error?.message || 'Không thể tạo đơn và cập nhật tồn kho');
  data = await persistRequestedLaptopReference(client, data, dbRow);
  data = await preserveExplicitPaymentStatus(client, data, dbRow.payment_status);
  return keysToCamel(data);
};

// Warranty Cases
export const fetchWarrantyCasesFromCloud = async () => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('warranty_cases').select('*').order('created_at', { ascending: false });
    if (error) return null;
    return keysToCamel(data);
  } catch (err) { return null; }
};

export const saveWarrantyCaseToCloud = async (warrantyCase) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(warrantyCase);
    assertNonNegative(dbRow, ['repair_cost']);
    await assertReferenceExists(client, 'orders', dbRow, 'order_id');
    await assertReferenceExists(client, 'laptops', dbRow, 'laptop_id');
    const { data, error } = await client.from('warranty_cases').upsert(dbRow).select().single();
    if (error || !data) throw new Error(error?.message || 'Không thể lưu bảo hành');
    return keysToCamel(data);
  } catch (err) { throw err; }
};

// Stock Movements
export const fetchStockMovementsFromCloud = async () => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('stock_movements').select('*').order('created_at', { ascending: false });
    if (error) return null;
    return keysToCamel(data);
  } catch (err) { return null; }
};

export const saveStockMovementToCloud = async (movement) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(movement);
    await assertReferenceExists(client, 'laptops', dbRow, 'laptop_id');
    await assertReferenceExists(client, 'orders', dbRow, 'order_id');
    await assertReferenceExists(client, 'warranty_cases', dbRow, 'warranty_case_id');
    delete dbRow.type;
    if (movement.type) dbRow.movement_type = movement.type; // Backward compatibility for UI
    const { data, error } = await client.from('stock_movements').insert(dbRow).select().single();
    if (error || !data) throw new Error(error?.message || 'Không thể lưu lịch sử kho');
    return keysToCamel(data);
  } catch (err) { throw err; }
};

// Payments and financial records
export const fetchPaymentsFromCloud = async (opts = {}) => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    let query = client.from('payments').select('*').order('payment_date', { ascending: false }).order('id', { ascending: false });
    if (opts.orderId !== undefined && opts.orderId !== null && opts.orderId !== '') {
      if (!isValidDBId(opts.orderId)) return null;
      query = query.eq('order_id', Number(opts.orderId));
    }
    const { data, error } = await query;
    if (error || !data) return null;
    return keysToCamel(data);
  } catch (err) { return null; }
};

export const savePaymentToCloud = async (payment) => {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Server configuration error');
  const orderId = payment.orderId;
  if (!isValidDBId(orderId)) throw new Error('orderId không hợp lệ');
  if (!Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) {
    throw new Error('amount phải là số dương');
  }

  const rpcName = payment.accountId && payment.idempotencyKey ? 'record_order_payment_with_account' : 'record_order_payment';
  const params = {
    p_order_id: Number(orderId),
    p_amount: Number(payment.amount),
    p_payment_type: payment.paymentType,
    p_payment_method: payment.paymentMethod || 'transfer_cash',
    p_payment_date: payment.paymentDate || null,
    p_reference_code: payment.referenceCode || null,
    p_note: payment.note || null,
    p_recorded_by: payment.recordedBy || null
  };
  if (rpcName === 'record_order_payment_with_account') {
    params.p_account_id = payment.accountId;
    params.p_idempotency_key = payment.idempotencyKey;
  }
  const { data, error } = await client.rpc(rpcName, params);
  if (error || !data) throw new Error(error?.message || 'Không thể ghi nhận thanh toán');
  return keysToCamel(data);
};

export const fetchFinancialRecordsFromCloud = async (opts = {}) => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    let query = client.from('financial_records').select('*').order('occurred_on', { ascending: false }).order('id', { ascending: false });
    if (opts.from) query = query.gte('occurred_on', opts.from);
    if (opts.to) query = query.lte('occurred_on', opts.to);
    const { data, error } = await query;
    if (error || !data) return null;
    return keysToCamel(data);
  } catch (err) { return null; }
};

export const saveFinancialRecordToCloud = async (record) => {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Server configuration error');
  const dbRow = keysToSnake(record);
  assertNonNegative(dbRow, ['amount']);
  await assertReferenceExists(client, 'orders', dbRow, 'order_id');
  await assertReferenceExists(client, 'laptops', dbRow, 'laptop_id');
  const { data, error } = await client.from('financial_records').insert(dbRow).select().single();
  if (error || !data) throw new Error(error?.message || 'Không thể lưu sổ tài chính');
  return keysToCamel(data);
};

// Customers
export const fetchCustomersFromCloud = async () => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('customers').select('*').order('created_at', { ascending: false });
    if (error) return null;
    return keysToCamel(data);
  } catch (err) { return null; }
};

export const saveCustomerToCloud = async (customer) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(customer);
    const { data, error } = await client.from('customers').upsert(dbRow, { onConflict: 'id' }).select();
    if (error || !data || data.length === 0) return false;
    return keysToCamel(data[0]);
  } catch (err) { return false; }
};

// App Settings
export const fetchAllSettings = async () => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('app_settings').select('*');
    if (error || !data) return null;
    const settings = {};
    data.forEach(row => { settings[row.key] = row.value; });
    return settings;
  } catch (err) { return null; }
};

export const fetchSetting = async (key) => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('app_settings').select('value').eq('key', key).single();
    if (error || !data) return null;
    return data.value;
  } catch (err) { return null; }
};

export const saveSetting = async (key, value) => {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Server configuration error');
  const { error } = await client.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(error.message || 'Không thể lưu setting');
  return true;
};

export const saveSettings = async (settingsObj) => {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Server configuration error');
  const rows = Object.entries(settingsObj).map(([key, value]) => ({ key, value }));
  const { error } = await client.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) throw new Error(error.message || 'Không thể lưu settings');
  return true;
};

export const subscribeRealtimeChanges = (onLaptopChange, onOrderChange, onPaymentChange, onWarrantyChange, onSettingsChange) => {
  const client = getSupabaseAdminClient();
  if (!client) return () => {};

  const channel = client
    .channel('citilap-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'laptops' }, payload => {
      if (onLaptopChange) onLaptopChange(keysToCamel(payload));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      if (onOrderChange) onOrderChange(keysToCamel(payload));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, payload => {
      if (onPaymentChange) onPaymentChange(keysToCamel(payload));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_cases' }, payload => {
      if (onWarrantyChange) onWarrantyChange(keysToCamel(payload));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, payload => {
      if (onSettingsChange) onSettingsChange(payload);
    })
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
};

// ─── CHUYỂN SANG THÁNG MỚI ───
// Chỉ cập nhật month_key cho các item CHƯA HOÀN THÀNH của các tháng trước
// sang tháng mới (newMonthKey). Item đã xong giữ nguyên tháng cũ để tra lịch sử.
export const rollForwardMonth = async (newMonthKey) => {
  const client = getSupabaseAdminClient();
  if (!client) return { ok: false, error: 'Server configuration error' };
  try {
    // Status laptop chưa xong
    const OPEN_LAPTOP_STATUS = ['available', 'deposited', 'repairing', 'not_imported', 'returned_cn', 'skipped'];
    // Chỉ các đơn chưa bắt đầu giao mới được chuyển tháng. Đơn đang giao và
    // hoàn thành giữ nguyên ở tháng phát sinh để bảo toàn lịch sử vận hành.
    const OPEN_ORDER_STATUS = ['new', 'deposited', 'prepared'];

    const parseMonthKey = (monthKey) => {
      const match = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(String(monthKey || '').trim());
      return match ? Number(match[2]) * 100 + Number(match[1]) : null;
    };
    const targetMonth = parseMonthKey(newMonthKey);
    if (targetMonth === null) throw new Error('Tháng lưu phải có định dạng MM/YYYY.');

    const isOlderMonth = row => {
      const month = parseMonthKey(row.month_key);
      return month !== null && month < targetMonth;
    };

    // Xác định order cần chuyển trước để laptop đã bị đánh dấu sold bởi đơn
    // prepared/shipping vẫn được chuyển cùng order, thay vì bị bỏ lại tháng cũ.
    const { data: openOrders, error: orderFetchError } = await client
      .from('orders')
      .select('id, laptop_id, month_key, order_status')
      .in('order_status', OPEN_ORDER_STATUS)
      .eq('is_active', true);
    if (orderFetchError) throw orderFetchError;

    const ordersToMove = (openOrders || []).filter(isOlderMonth);
    const orderIds = ordersToMove.map(order => order.id);
    const linkedLaptopIds = new Set(
      ordersToMove
        .map(order => Number(order.laptop_id))
        .filter(id => Number.isFinite(id) && id > 0)
    );

    const { data: activeLaptops, error: laptopFetchError } = await client
      .from('laptops')
      .select('id, month_key, status')
      .eq('is_active', true);
    if (laptopFetchError) throw laptopFetchError;

    const laptopIds = (activeLaptops || [])
      .filter(laptop => isOlderMonth(laptop) && (
        OPEN_LAPTOP_STATUS.includes(laptop.status)
        || linkedLaptopIds.has(Number(laptop.id))
      ))
      .map(laptop => laptop.id);

    const updatedAt = new Date().toISOString();
    let laptopData = [];
    let orderData = [];

    if (laptopIds.length > 0) {
      const { data, error } = await client
        .from('laptops')
        .update({ month_key: newMonthKey, updated_at: updatedAt })
        .in('id', laptopIds)
        .select('id');
      if (error) throw error;
      laptopData = data || [];
    }

    if (orderIds.length > 0) {
      const { data, error } = await client
        .from('orders')
        .update({ month_key: newMonthKey, updated_at: updatedAt })
        .in('id', orderIds)
        .select('id');
      if (error) throw error;
      orderData = data || [];
    }

    return {
      ok: true,
      laptopsMoved: laptopData.length,
      ordersMoved: orderData.length,
    };
  } catch (err) {
    return { ok: false, error: err?.message || 'Lỗi khi chuyển tháng' };
  }
};
