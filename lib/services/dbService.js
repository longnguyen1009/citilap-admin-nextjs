import { D } from '../fieldOptions';
import { labelToKey, resolveLabel, readCustomConfig } from '../fieldOptionsHelpers';
import { initSupabaseClient, getSupabaseClient, getSupabaseCredentials, getSupabaseAdminClient } from '../supabaseClient';

// ─── Auth guard: kiểm tra session trước khi đọc/ghi ───
const hasActiveSession = async () => {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data: { session } } = await client.auth.getSession();
  return !!session;
};

// ─── Selective Columns: chỉ lấy cột cần thiết, giảm ~30-40% payload ───
const LAPTOP_COLS = 'id,serial,name,location_id,category_id,conditionNote,chargerStatusId,sellerId,statusId,priceRmb,shippingRmb,exchangeRate,importPriceVnd,wholesalePriceVnd,retailPriceVnd,customProfit,trackingCode,importDate,warehouseDate,isActive,batteryHealth,isLocked,screenStatusId,cameraMicStatusId,mainboardStatusId,created_at,partsHistory';
// Alias cho select trong Supabase query (snake_case)
const LAPTOP_SELECT = 'id,serial,name,location_id,category_id,condition_note,charger_status_id,seller_id,status_id,price_rmb,shipping_rmb,exchange_rate,import_price_vnd,wholesale_price_vnd,retail_price_vnd,custom_profit,tracking_code,import_date,warehouse_date,is_active,battery_health,is_locked,screen_status_id,camera_mic_status_id,mainboard_status_id,created_at,parts_history';

const ORDER_SELECT = 'id,created_date,sale_online_id,note,order_type_id,order_status_id,payment_status_id,payment_method_id,delivery_status_id,shipping_method_id,laptop_id,sale_price,deposit_amount,deposit_note,cod_amount,credit_card_fee,profit_vnd,trade_in_laptop_id,customer_id,tracking_code,ship_date,setup_note,warranty,gifts_id,laptop_locked,reservation_expires_at,cancel_reason,cancelled_at,is_active,created_at,updated_at';

const PAYMENT_SELECT = 'id,order_id,payment_type,category,amount,payment_method,payment_date,note,recorded_by,created_at';

const WARRANTY_SELECT = 'id,order_id,laptop_id,reported_issue,status,received_date,resolved_date,repair_cost,parts_replaced,diagnosis,resolution,notes,customer_info,handled_by,created_at,updated_at';

const STOCK_MOVEMENT_SELECT = 'id,laptop_id,movement_type,from_location,to_location,order_id,warranty_case_id,note,performed_by,created_at';

const toIsoDate = (vnDateStr) => {
  if (!vnDateStr) return null;
  if (String(vnDateStr).includes('-')) {
    const d = new Date(vnDateStr);
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
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// Legacy mappings have been removed. We now store UUID foreign keys to app_options directly.

// Mapper từ Supabase DB (snake_case) -> JS Object (camelCase)
export const mapLaptopFromDB = (dbRow) => ({
  id: dbRow.id,
  serial: dbRow.serial || '',
  name: dbRow.name || '',
  categoryId: dbRow.category_id,
  importDate: toVnDate(dbRow.import_date),
  warehouseDate: toVnDate(dbRow.warehouse_date),
  locationId: dbRow.location_id,
  chargerStatusId: dbRow.charger_status_id,
  statusId: dbRow.status_id,
  priceRmb: parseFloat(dbRow.price_rmb || 0),
  shippingRmb: parseFloat(dbRow.shipping_rmb || 0),
  exchangeRate: parseFloat(dbRow.exchange_rate || 3550),
  importPriceVnd: parseFloat(dbRow.import_price_vnd || 0),
  wholesalePriceVnd: parseFloat(dbRow.wholesale_price_vnd || 0),
  retailPriceVnd: parseFloat(dbRow.retail_price_vnd || 0),
  customProfit: parseFloat(dbRow.custom_profit || 0),
  trackingCode: dbRow.tracking_code || '',
  batteryHealth: parseInt(dbRow.battery_health || 100, 10),
  cycleCount: parseInt(dbRow.cycle_count || 0, 10),
  warrantySupplier: dbRow.warranty_supplier || '',
  isLocked: !!dbRow.is_locked,
  screenStatusId: dbRow.screen_status_id,
  cameraMicStatusId: dbRow.camera_mic_status_id,
  mainboardStatusId: dbRow.mainboard_status_id,
  conditionNote: dbRow.condition_note || '',
  sellerId: dbRow.seller_id,
  isActive: dbRow.is_active !== false,
  created_at: dbRow.created_at || null,
  partsHistory: dbRow.parts_history || []
});

const isValidDBId = (id) => typeof id === 'number' || (typeof id === 'string' && /^\\d+$/.test(id));

// Mapper từ JS Object (camelCase) -> Supabase DB (snake_case)
export const mapLaptopToDB = (laptop) => ({
  id: isValidDBId(laptop.id) ? laptop.id : undefined,
  serial: laptop.serial || '',
  name: laptop.name || '',
  category_id: laptop.categoryId || null,
  import_date: toIsoDate(laptop.importDate),
  warehouse_date: toIsoDate(laptop.warehouseDate),
  location_id: laptop.locationId || null,
  charger_status_id: laptop.chargerStatusId || null,
  status_id: laptop.statusId || null,
  price_rmb: parseFloat(laptop.priceRmb || 0),
  shipping_rmb: parseFloat(laptop.shippingRmb || 0),
  exchange_rate: parseFloat(laptop.exchangeRate || 3550),
  import_price_vnd: parseFloat(laptop.importPriceVnd || 0),
  wholesale_price_vnd: parseFloat(laptop.wholesalePriceVnd || 0),
  retail_price_vnd: parseFloat(laptop.retailPriceVnd || 0),
  custom_profit: parseFloat(laptop.customProfit || 0),
  tracking_code: laptop.trackingCode || '',
  battery_health: parseInt(laptop.batteryHealth || 100, 10),
  cycle_count: parseInt(laptop.cycleCount || 0, 10),
  warranty_supplier: laptop.warrantySupplier || '',
  is_locked: !!laptop.isLocked,
  screen_status_id: laptop.screenStatusId || null,
  camera_mic_status_id: laptop.cameraMicStatusId || null,
  mainboard_status_id: laptop.mainboardStatusId || null,
  condition_note: laptop.conditionNote || '',
  seller_id: laptop.sellerId || null,
  is_active: laptop.isActive !== false,
  parts_history: laptop.partsHistory || []
});

export const mapCustomerFromDB = (dbRow) => ({
  id: dbRow.id,
  name: dbRow.name || '',
  phone: dbRow.phone || '',
  address: dbRow.address || '',
  createdAt: dbRow.created_at || null,
  updatedAt: dbRow.updated_at || null
});

export const mapCustomerToDB = (customer) => ({
  id: isValidDBId(customer.id) ? customer.id : undefined, // Let Supabase handle generation if omitted
  name: customer.name || '',
  phone: customer.phone || '',
  address: customer.address || ''
});

// Mapper từ Order DB -> JS
export const mapOrderFromDB = (dbRow) => ({
  id: dbRow.id,
  createdDate: toVnDate(dbRow.created_date),
  saleOnlineId: dbRow.sale_online_id,
  note: dbRow.note || '',
  orderTypeId: dbRow.order_type_id,
  orderStatusId: dbRow.order_status_id,
  paymentStatusId: dbRow.payment_status_id,
  paymentMethodId: dbRow.payment_method_id,
  deliveryStatusId: dbRow.delivery_status_id,
  shippingMethodId: dbRow.shipping_method_id,
  laptopId: dbRow.laptop_id || '',
  salePrice: parseFloat(dbRow.sale_price || 0),
  discountAmount: parseFloat(dbRow.discount_amount || 0),
  depositAmount: parseFloat(dbRow.deposit_amount || 0),
  depositNote: dbRow.deposit_note || '',
  codAmount: dbRow.cod_amount || 0,
  creditCardFee: dbRow.credit_card_fee || 0,
  profitVnd: parseFloat(dbRow.profit_vnd || 0),
  tradeInLaptopId: dbRow.trade_in_laptop_id || '',
  custradeInLaptopId: dbRow.trade_in_laptop_id,
  customerId: dbRow.customer_id || '',
  trackingCode: dbRow.tracking_code || '',
  customerNote: dbRow.customer_note || '',
  shipDate: toVnDate(dbRow.ship_date),
  setupNote: dbRow.setup_note || '',
  warranty: dbRow.warranty || '',
  giftsId: dbRow.gifts_id,
  laptopLocked: dbRow.laptop_locked === true || dbRow.laptop_locked === 'true' ? true : false,
  reservationExpiresAt: dbRow.reservation_expires_at || null,
  cancelReason: dbRow.cancel_reason || '',
  cancelledAt: dbRow.cancelled_at || null,
  isActive: dbRow.is_active !== false,
  created_at: dbRow.created_at || null,
  updated_at: dbRow.updated_at || null
});

// Mapper từ JS -> Order DB
export const mapOrderToDB = (order) => ({
  id: isValidDBId(order.id) ? order.id : undefined,
  created_date: toIsoDate(order.createdDate),
  sale_online_id: order.saleOnlineId || null,
  note: order.note || '',
  order_type_id: order.orderTypeId || null,
  order_status_id: order.orderStatusId || null,
  payment_status_id: order.paymentStatusId || null,
  payment_method_id: order.paymentMethodId || null,
  delivery_status_id: order.deliveryStatusId || null,
  shipping_method_id: order.shippingMethodId || null,
  laptop_id: order.laptopId || null,
  sale_price: parseFloat(order.salePrice || 0),
  discount_amount: parseFloat(order.discountAmount || 0),
  deposit_amount: parseFloat(order.depositAmount || 0),
  deposit_note: order.depositNote || '',
  cod_amount: parseFloat(order.codAmount || 0),
  credit_card_fee: parseFloat(order.creditCardFee || 0),
  profit_vnd: parseFloat(order.profitVnd || 0),
  trade_in_laptop_id: order.tradeInLaptopId || null,
  custrade_in_laptop_id: order.tradeInLaptopId || null,
  customer_id: order.customerId || null,
  tracking_code: order.trackingCode || '',
  customer_note: order.customerNote || '',
  ship_date: toIsoDate(order.shipDate),
  setup_note: order.setupNote || '',
  warranty: order.warranty || '',
  gifts_id: order.giftsId || null,
  laptop_locked: order.laptopLocked || false,
  reservation_expires_at: order.reservationExpiresAt || null,
  cancel_reason: order.cancelReason || '',
  cancelled_at: order.cancelledAt || null,
  is_active: order.isActive !== false
});

// Lấy danh sách Laptops từ Supabase Cloud
// opts.monthKey: '07/2026' → fetch laptops theo tháng (server-side filter)
// opts.all: true → fetch tất cả (cho ALL view)
export const fetchLaptopsFromCloud = async (opts = {}) => {
  const client = initSupabaseClient();
  if (!client) return null;


  try {
    let query = client.from('laptops').select(LAPTOP_SELECT);

    // Filter theo tháng nếu specified
    if (opts.monthKey && opts.monthKey !== 'ALL') {
      const [mm, yyyy] = opts.monthKey.split('/');
      const monthStart = `${yyyy}-${mm.padStart(2, '0')}-01`;
      const monthEnd = `${yyyy}-${mm.padStart(2, '0')}-31`;

      // Laptops hiển thị trong tháng:
      // 1. Import trong tháng này
      // 2. Đã bán/reparing trong tháng này (dù import trước)
      // 3. Còn available/deposited/not_imported/returned_cn/skipped (luôn hiển thị)
      query = query.or(
        `import_date.gte.${monthStart},import_date.lte.${monthEnd},status.eq.repairing,status.eq.available,status.eq.deposited,status.eq.not_imported,status.eq.returned_cn,status.eq.skipped`
      );
    }

    let res = await query.eq('is_active', true);
    if (res.error) {
      // Fallback: bỏ is_active filter
      let retryQuery = client.from('laptops').select(LAPTOP_SELECT);
      if (opts.monthKey && opts.monthKey !== 'ALL') {
        const [mm, yyyy] = opts.monthKey.split('/');
        const monthStart = `${yyyy}-${mm.padStart(2, '0')}-01`;
        const monthEnd = `${yyyy}-${mm.padStart(2, '0')}-31`;
        retryQuery = retryQuery.or(
          `import_date.gte.${monthStart},import_date.lte.${monthEnd},status.eq.repairing,status.eq.available,status.eq.deposited,status.eq.not_imported,status.eq.returned_cn,status.eq.skipped`
        );
      }
      res = await retryQuery;
    }
    if (res.error || !res.data) {
      console.error('Lỗi lấy dữ liệu Laptops từ Supabase:', res.error);
      return null;
    }
    return res.data.map(mapLaptopFromDB);
  } catch (err) {
    console.error('Lỗi kết nối Supabase Cloud:', err);
    return null;
  }
};

// Lưu / Cập nhật Laptop lên Supabase Cloud
export const saveLaptopToCloud = async (laptop) => {
  const client = initSupabaseClient();
  if (!client) {
    console.warn('Supabase chưa kết nối. Dữ liệu đang được lưu vào LocalStorage.');
    return false;
  }

  try {
    const dbRow = mapLaptopToDB(laptop);
    console.log('Sending to Supabase laptops table:', dbRow);
    const { data, error } = await client.from('laptops').upsert(dbRow, { onConflict: 'id' }).select();
    
    if (error) {
      console.error('⛔ Lỗi lưu Laptop lên Supabase:', error);
      if (error.message && error.message.includes('serial')) {
        alert(`⚠️ THIẾU CỘT SERIAL TRONG SUPABASE!\n\nBạn cần vào Supabase Dashboard -> SQL Editor và chạy lệnh sau:\n\nALTER TABLE laptops ADD COLUMN serial VARCHAR(100);\n\nSau đó mới có thể lưu Serial!`);
      } else {
        alert(`⚠️ Supabase từ chối cập nhật sản phẩm [${laptop.id}]:\n${error.message}\n(Chi tiết: ${error.details || error.hint || 'Vui lòng kiểm tra quyền RLS hoặc schema bảng'})`);
      }
      return false;
    }
    
    if (!data || data.length === 0) {
      console.error('⛔ Lỗi lưu Laptop lên Supabase: Bị chặn bởi RLS');
      alert(`⚠️ Supabase từ chối cập nhật sản phẩm [${laptop.id}]:\nRow Level Security (RLS) đang chặn quyền ghi. Dữ liệu KHÔNG được lưu.\nVui lòng vào Supabase -> Authentication -> Policies để cấp quyền hoặc tắt RLS.`);
      return null;
    }

    console.log(`✅ Đã lưu thành công Laptop [${laptop.id}] lên Supabase Cloud!`);
    return mapLaptopFromDB(data[0]);
  } catch (err) {
    console.error('⛔ Lỗi kết nối Supabase:', err);
    return false;
  }
};

// Lấy danh sách Đơn Hàng từ Supabase Cloud
// opts.monthKey: '07/2026' → fetch orders theo tháng (server-side filter)
export const fetchOrdersFromCloud = async (opts = {}) => {
  const client = initSupabaseClient();
  if (!client) return null;


  try {
    let query = client.from('orders').select(ORDER_SELECT);

    // Filter theo tháng nếu specified
    if (opts.monthKey && opts.monthKey !== 'ALL') {
      const [mm, yyyy] = opts.monthKey.split('/');
      const monthStart = `${yyyy}-${mm.padStart(2, '0')}-01`;
      const monthEnd = `${yyyy}-${mm.padStart(2, '0')}-31`;
      query = query.gte('created_date', monthStart).lte('created_date', monthEnd);
    }

    let res = await query.eq('is_active', true);
    if (res.error) {
      // Fallback: bỏ is_active filter
      let retryQuery = client.from('orders').select(ORDER_SELECT);
      if (opts.monthKey && opts.monthKey !== 'ALL') {
        const [mm, yyyy] = opts.monthKey.split('/');
        const monthStart = `${yyyy}-${mm.padStart(2, '0')}-01`;
        const monthEnd = `${yyyy}-${mm.padStart(2, '0')}-31`;
        retryQuery = retryQuery.gte('created_date', monthStart).lte('created_date', monthEnd);
      }
      res = await retryQuery;
    }
    if (res.error || !res.data) {
      console.error('Lỗi lấy dữ liệu Đơn hàng từ Supabase:', res.error);
      return null;
    }
    return res.data.map(mapOrderFromDB);
  } catch (err) {
    console.error('Lỗi kết nối Supabase Cloud:', err);
    return null;
  }
};

// Lưu / Cập nhật Đơn hàng lên Supabase Cloud
export const saveOrderToCloud = async (order) => {
  const client = initSupabaseClient();
  if (!client) return false;

  try {
    const dbRow = mapOrderToDB(order);
    const { data, error } = await client.from('orders').upsert(dbRow, { onConflict: 'id' }).select();
    if (error) {
      console.error('⛔ Lỗi lưu Đơn hàng lên Supabase:', error);
      alert(`⚠️ Supabase từ chối cập nhật Đơn hàng [${order.id}]:\n${error.message}`);
      return false;
    }
    if (!data || data.length === 0) {
      console.error('⛔ Lỗi lưu Đơn hàng: Bị chặn bởi RLS');
      alert(`⚠️ Row Level Security (RLS) đang chặn quyền ghi trên bảng orders.`);
      return null;
    }
    console.log(`✅ Đã lưu thành công Đơn hàng [${order.id}] lên Supabase Cloud!`);
    return mapOrderFromDB(data[0]);
  } catch (err) {
    console.error('⛔ Lỗi kết nối Supabase:', err);
    return null;
  }
};


// Lấy Ticket Bảo Hành (Warranty Cases)
export const fetchWarrantyCasesFromCloud = async () => {
  const client = initSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('warranty_cases').select(WARRANTY_SELECT).order('created_at', { ascending: false });
    if (error) return null;
    return data.map(row => ({
      id: row.id,
      orderId: row.order_id,
      laptopId: row.laptop_id,
      issueDescription: row.reported_issue || '',
      status: row.status,
      receivedDate: toVnDate(row.received_date),
      resolvedDate: toVnDate(row.resolved_date),
      repairCost: parseFloat(row.repair_cost || 0),
      partsReplaced: row.parts_replaced,
      diagnosis: row.diagnosis || '',
      resolution: row.resolution || row.resolution_note || '',
      notes: row.notes || '',
      customerInfo: row.customer_info || '',
      handledBy: row.handled_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (err) { return null; }
};

// Lưu Ticket Bảo Hành
export const saveWarrantyCaseToCloud = async (warrantyCase) => {
  const client = initSupabaseClient();
  if (!client) return false;
  try {
    const dbRow = {
      id: isValidDBId(warrantyCase.id) ? warrantyCase.id : undefined,
      order_id: isValidDBId(warrantyCase.orderId) ? warrantyCase.orderId : null,
      laptop_id: isValidDBId(warrantyCase.laptopId) ? warrantyCase.laptopId : null,
      reported_issue: warrantyCase.issueDescription || warrantyCase.reportedIssue || '',
      status: warrantyCase.status,
      received_date: toIsoDate(warrantyCase.receivedDate),
      resolved_date: toIsoDate(warrantyCase.resolvedDate),
      repair_cost: warrantyCase.repairCost || 0,
      parts_replaced: warrantyCase.partsReplaced || '',
      diagnosis: warrantyCase.diagnosis || '',
      resolution: warrantyCase.resolution || '',
      resolution_note: warrantyCase.resolution || '',
      notes: warrantyCase.notes || '',
      customer_info: warrantyCase.customerInfo || '',
      handled_by: warrantyCase.handledBy || ''
    };
    const { data, error } = await client.from('warranty_cases').upsert(dbRow).select();
    if (error) return false;
    if (!data || data.length === 0) {
      alert(`⚠️ Row Level Security (RLS) đang chặn quyền ghi trên bảng warranty_cases.`);
      return false;
    }
    return true;
  } catch (err) { return false; }
};

// Lấy Lịch sử Kho (Stock Movements)
export const fetchStockMovementsFromCloud = async () => {
  const client = initSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('stock_movements').select(STOCK_MOVEMENT_SELECT).order('created_at', { ascending: false });
    if (error) return null;
    return data.map(row => ({
      id: row.id,
      laptopId: row.laptop_id,
      type: row.movement_type,
      fromLocation: row.from_location,
      toLocation: row.to_location,
      orderId: row.order_id || '',
      warrantyCaseId: row.warranty_case_id || '',
      note: row.note,
      performedBy: row.performed_by,
      createdAt: row.created_at
    }));
  } catch (err) { return null; }
};

// Lưu Lịch sử Kho
export const saveStockMovementToCloud = async (movement) => {
  const client = initSupabaseClient();
  if (!client) return false;
  try {
    const dbRow = {
      id: isValidDBId(movement.id) ? movement.id : undefined,
      laptop_id: isValidDBId(movement.laptopId) ? movement.laptopId : null,
      movement_type: movement.type || movement.movementType || '',
      from_location: movement.fromLocation || null,
      to_location: movement.toLocation || null,
      order_id: isValidDBId(movement.orderId) ? movement.orderId : null,
      warranty_case_id: isValidDBId(movement.warrantyCaseId) ? movement.warrantyCaseId : null,
      note: movement.note || '',
      performed_by: movement.performedBy || null
    };
    const { error } = await client.from('stock_movements').insert(dbRow);
    return !error;
  } catch (err) { return false; }
};

// =============================================
// APP SETTINGS (thay localStorage)
// =============================================

// Đọc tất cả settings từ Supabase
export const fetchAllSettings = async () => {
  const client = initSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('app_settings').select('*');
    if (error || !data) return null;
    const settings = {};
    data.forEach(row => { settings[row.key] = row.value; });
    return settings;
  } catch (err) { return null; }
};

// Đọc 1 setting theo key
export const fetchSetting = async (key) => {
  const client = initSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('app_settings').select('value').eq('key', key).single();
    if (error || !data) return null;
    return data.value;
  } catch (err) { return null; }
};

// Lưu 1 setting (upsert) — chỉ khi đã login
export const saveSetting = async (key, value) => {
  const client = initSupabaseClient();
  if (!client) return false;
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return false;
    const { error } = await client.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
    return !error;
  } catch (err) { return false; }
};

// Lưu nhiều settings cùng lúc — chỉ khi đã login
export const saveSettings = async (settingsObj) => {
  const client = initSupabaseClient();
  if (!client) return false;
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return false;
    const rows = Object.entries(settingsObj).map(([key, value]) => ({ key, value }));
    const { error } = await client.from('app_settings').upsert(rows, { onConflict: 'key' });
    return !error;
  } catch (err) { return false; }
};

// Đăng ký nhận thông báo thay đổi thời gian thực (Realtime Subscription)
export const subscribeRealtimeChanges = (onLaptopChange, onOrderChange, onPaymentChange, onWarrantyChange, onSettingsChange) => {
  const client = initSupabaseClient();
  if (!client) return () => {};

  const channel = client
    .channel('citilap-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'laptops' }, payload => {
      if (onLaptopChange) onLaptopChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      if (onOrderChange) onOrderChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, payload => {
      if (onPaymentChange) onPaymentChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_cases' }, payload => {
      if (onWarrantyChange) onWarrantyChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, payload => {
      if (onSettingsChange) onSettingsChange(payload);
    })
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
};

// Lấy Khách Hàng (Customers)
export const fetchCustomersFromCloud = async () => {
  const client = initSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('customers').select('*').order('created_at', { ascending: false });
    if (error) return null;
    return data.map(mapCustomerFromDB);
  } catch (err) { return null; }
};

// Lưu Khách Hàng
export const saveCustomerToCloud = async (customer) => {
  const client = initSupabaseClient();
  if (!client) return false;
  try {
    const dbRow = mapCustomerToDB(customer);
    const { data, error } = await client.from('customers').upsert(dbRow, { onConflict: 'id' }).select();
    if (error) return false;
    if (!data || data.length === 0) return false;
    return mapCustomerFromDB(data[0]); // Return saved mapped row
  } catch (err) { return false; }
};
