import { D } from '../fieldOptions';
import { labelToKey, resolveLabel, readCustomConfig } from '../useFieldOptions';
import { getSupabaseClient, getSupabaseCredentials } from '../supabaseClient';

// ─── Auth guard: kiểm tra session trước khi đọc/ghi ───
const hasActiveSession = async () => {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data: { session } } = await client.auth.getSession();
  return !!session;
};

// ─── Selective Columns: chỉ lấy cột cần thiết, giảm ~30-40% payload ───
const LAPTOP_COLS = 'id,serial,name,location,category,conditionNote,chargerStatus,seller,status,priceRmb,shippingRmb,exchangeRate,importPriceVnd,trackingCode,importDate,warehouseDate,is_active,batteryHealth,isLocked,screenStatus,cameraMicStatus,mainboardStatus,created_at,partsHistory';
// Alias cho select trong Supabase query (snake_case)
const LAPTOP_SELECT = 'id,serial,name,location,category,condition_note,charger_status,seller,status,price_rmb,shipping_rmb,exchange_rate,import_price_vnd,tracking_code,import_date,warehouse_date,is_active,battery_health,is_locked,screen_status,camera_mic_status,mainboard_status,created_at,parts_history';

const ORDER_SELECT = 'id,created_date,sale_online,sale_offline,note,order_type,order_status,payment_status,payment_method,delivery_status,shipping_method,laptop_id,sale_price,deposit_amount,deposit_note,cod_amount,amount_paid,debt_amount,credit_card_fee,profit_vnd,trade_in_laptop_id,customer_info,customer_address,tracking_code,ship_date,setup_note,warranty,gifts,laptop_locked,reservation_expires_at,cancel_reason,cancelled_at,is_active,created_at,updated_at';

const PAYMENT_SELECT = 'id,order_id,payment_type,category,amount,payment_method,payment_date,note,recorded_by,created_at';

const WARRANTY_SELECT = 'id,order_id,laptop_id,reported_issue,status,received_date,resolved_date,repair_cost,parts_replaced,diagnosis,resolution,notes,customer_info,handled_by,created_at,updated_at';

const STOCK_MOVEMENT_SELECT = 'id,laptop_id,movement_type,from_location,to_location,order_id,warranty_case_id,note,performed_by,created_at';

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

// Helper: Chuyển bất kỳ value nào (dù là label cũ hay key) thành key chuẩn để lưu DB
const toKey = (groupKey, val, fallbackKey) => {
  if (!val) return fallbackKey;
  return labelToKey(groupKey, val, readCustomConfig()) || val || fallbackKey;
};

// Helper: Chuyển key từ DB thành label hiển thị cho UI
const toLabel = (groupKey, val, fallbackKey) => {
  const targetVal = val || fallbackKey;
  return resolveLabel(groupKey, targetVal, readCustomConfig()) || targetVal;
};

// Mapper từ Supabase DB (snake_case) -> JS Object (camelCase)
export const mapLaptopFromDB = (dbRow) => ({
  id: dbRow.id,
  serial: dbRow.serial || '',
  name: dbRow.name || '',
  category: toLabel('category', dbRow.category, '1'),
  importDate: toVnDate(dbRow.import_date),
  warehouseDate: toVnDate(dbRow.warehouse_date),
  location: toLabel('laptopLocation', dbRow.location, 'store'),
  chargerStatus: toLabel('chargerStatus', dbRow.charger_status, 'with_charger'),
  status: toLabel('laptopStatus', dbRow.status, 'available'),
  priceRmb: parseFloat(dbRow.price_rmb || 0),
  shippingRmb: parseFloat(dbRow.shipping_rmb || 0),
  exchangeRate: parseFloat(dbRow.exchange_rate || 3550),
  importPriceVnd: parseFloat(dbRow.import_price_vnd || 0),
  trackingCode: dbRow.tracking_code || '',
  batteryHealth: parseInt(dbRow.battery_health || 100, 10),
  isLocked: !!dbRow.is_locked,
  screenStatus: toLabel('componentStatus', dbRow.screen_status, 'ok'),
  cameraMicStatus: toLabel('componentStatus', dbRow.camera_mic_status, 'ok'),
  mainboardStatus: toLabel('componentStatus', dbRow.mainboard_status, 'ok'),
  conditionNote: dbRow.condition_note || '',
  seller: toLabel('seller', dbRow.seller, 'guangzhou'),
  isActive: dbRow.is_active !== false,
  created_at: dbRow.created_at || null,
  partsHistory: dbRow.parts_history || []
});

// Mapper từ JS Object (camelCase) -> Supabase DB (snake_case)
export const mapLaptopToDB = (laptop) => ({
  id: laptop.id,
  serial: laptop.serial || '',
  name: laptop.name || '',
  category: toKey('category', laptop.category, '1'),
  import_date: toIsoDate(laptop.importDate),
  warehouse_date: toIsoDate(laptop.warehouseDate),
  location: toKey('laptopLocation', laptop.location, 'store'),
  charger_status: toKey('chargerStatus', laptop.chargerStatus, 'with_charger'),
  status: toKey('laptopStatus', laptop.status, 'available'),
  price_rmb: parseFloat(laptop.priceRmb || 0),
  shipping_rmb: parseFloat(laptop.shippingRmb || 0),
  exchange_rate: parseFloat(laptop.exchangeRate || 3550),
  import_price_vnd: parseFloat(laptop.importPriceVnd || 0),
  tracking_code: laptop.trackingCode || '',
  battery_health: parseInt(laptop.batteryHealth || 100, 10),
  is_locked: !!laptop.isLocked,
  screen_status: toKey('componentStatus', laptop.screenStatus, 'ok'),
  camera_mic_status: toKey('componentStatus', laptop.cameraMicStatus, 'ok'),
  mainboard_status: toKey('componentStatus', laptop.mainboardStatus, 'ok'),
  condition_note: laptop.conditionNote || '',
  seller: toKey('seller', laptop.seller, 'guangzhou'),
  is_active: laptop.isActive !== false,
  parts_history: laptop.partsHistory || []
});

// Mapper từ Order DB -> JS
export const mapOrderFromDB = (dbRow) => ({
  id: dbRow.id,
  createdDate: toVnDate(dbRow.created_date),
  saleOnline: toLabel('saleOnline', dbRow.sale_online, '1'),
    saleOffline: toLabel('saleOffline', dbRow.sale_offline, '1'),
  note: dbRow.note || '',
  orderType: toLabel('orderType', dbRow.order_type, 'retail'),
  orderStatus: toLabel('orderStatus', dbRow.order_status, 'new'),
  paymentStatus: toLabel('paymentStatus', dbRow.payment_status, 'unpaid'),
  paymentMethod: toLabel('paymentMethod', dbRow.payment_method, 'transfer_cash'),
  deliveryStatus: toLabel('deliveryStatus', dbRow.delivery_status, 'preparing'),
  shippingMethod: toLabel('shippingMethod', dbRow.shipping_method, 'viettelpost'),
  laptopId: dbRow.laptop_id || '',
  requestedLaptopId: dbRow.requested_laptop_id || '',
  salePrice: parseFloat(dbRow.sale_price || 0),
  depositAmount: parseFloat(dbRow.deposit_amount || 0),
  depositNote: dbRow.deposit_note || '',
  codAmount: parseFloat(dbRow.cod_amount || 0),
  amountPaid: parseFloat(dbRow.amount_paid || 0),
  debtAmount: parseFloat(dbRow.debt_amount || 0),
  creditCardFee: parseFloat(dbRow.credit_card_fee || 0),
  profitVnd: parseFloat(dbRow.profit_vnd || 0),
  tradeInLaptopId: dbRow.trade_in_laptop_id || '',
  customerInfo: dbRow.customer_info || '',
  customerAddress: dbRow.customer_address || '',
  trackingCode: dbRow.tracking_code || '',
  shipDate: toVnDate(dbRow.ship_date),
  setupNote: dbRow.setup_note || '',
  warranty: dbRow.warranty || '',
  gifts: toLabel('giftOptions', dbRow.gifts, 'basic_gift'),
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
  id: String(order.id),
  created_date: toIsoDate(order.createdDate),
  sale_online: toKey('saleOnline', order.saleOnline, '1'),
      sale_offline: toKey('saleOffline', order.saleOffline, '1'),
  note: order.note || '',
  order_type: toKey('orderType', order.orderType, 'retail'),
  order_status: toKey('orderStatus', order.orderStatus, 'new'),
  payment_status: toKey('paymentStatus', order.paymentStatus, 'unpaid'),
  payment_method: toKey('paymentMethod', order.paymentMethod, 'transfer_cash'),
  delivery_status: toKey('deliveryStatus', order.deliveryStatus, 'preparing'),
  shipping_method: toKey('shippingMethod', order.shippingMethod, 'viettelpost'),
  laptop_id: order.laptopId || null,
  requested_laptop_id: order.requestedLaptopId || null,
  sale_price: parseFloat(order.salePrice || 0),
  deposit_amount: parseFloat(order.depositAmount || 0),
  deposit_note: order.depositNote || '',
  cod_amount: parseFloat(order.codAmount || 0),
  amount_paid: parseFloat(order.amountPaid || 0),
  debt_amount: parseFloat(order.debtAmount || 0),
  credit_card_fee: parseFloat(order.creditCardFee || 0),
  profit_vnd: parseFloat(order.profitVnd || 0),
  trade_in_laptop_id: order.tradeInLaptopId || null,
  customer_info: order.customerInfo || '',
  customer_address: order.customerAddress || '',
  tracking_code: order.trackingCode || '',
  ship_date: toIsoDate(order.shipDate),
  setup_note: order.setupNote || '',
  warranty: order.warranty || '',
  gifts: toKey('giftOptions', order.gifts, 'basic_gift'),
  laptop_locked: order.laptopLocked || false,
  reservation_expires_at: order.reservationExpiresAt || null,
  cancel_reason: order.cancelReason || '',
  cancelled_at: order.cancelledAt || null,
  is_active: order.isActive !== false
});

// Lấy danh sách Laptops từ Supabase Cloud
// opts.monthKey: '07/2026' → fetch laptops theo tháng (server-side filter)
// opts.all: true → fetch tất cả (cho ALL view)
