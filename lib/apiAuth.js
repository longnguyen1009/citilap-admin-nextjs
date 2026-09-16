import { getSupabaseAdminClient } from './supabaseAdmin';

export const VALID_ROLES = Object.freeze(['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);

export async function getUserProfile(request) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      try {
        const { data: { user }, error } = await adminClient.auth.getUser(token);
        if (user && !error) {
          const profile = { id: user.id, email: user.email, name: user.email?.split('@')[0] || 'User' };
          
          const { data: dbProfile } = await adminClient
            .from('user_profiles')
            .select('name, role, is_active')
            .eq('id', user.id)
            .single();
          if (!dbProfile || dbProfile.is_active === false) return null;

          profile.name = dbProfile.name || profile.name;
          // user_metadata có thể bị người dùng sửa qua Supabase Auth, không được
          // dùng để cấp quyền. Role chỉ lấy từ profile do server quản trị.
          if (!VALID_ROLES.includes(dbProfile.role)) return null;
          profile.role = dbProfile.role;
          return profile;
        }
      } catch (err) {
        console.error('Error fetching user profile from token:', err);
      }
    }
  }
  return null;
}

export async function getUserRole(request) {
  const profile = await getUserProfile(request);
  return profile?.role || null;
}

export async function requireUser(request, allowedRoles = null) {
  const profile = await getUserProfile(request);
  if (!profile) return { ok: false, response: new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return { ok: false, response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) };
  }
  return { ok: true, profile };
}

export function filterSensitiveFields(items, sensitiveKeys) {
  if (!Array.isArray(items)) return items;
  return items.map(item => {
    const filtered = { ...item };
    sensitiveKeys.forEach(k => { delete filtered[k]; });
    return filtered;
  });
}

const toCamelKey = (key) => key.replace(/[-_]([a-z])/gi, (_, letter) => letter.toUpperCase());

const assertNonNegativeNumber = (payload, key) => {
  if (payload[key] === undefined || payload[key] === null || payload[key] === '') return;
  const value = Number(payload[key]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} phải là số không âm`);
  }
};

export function sanitizePayload(payload, allowedKeys, sensitiveKeys = [], isAdmin = false) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload không hợp lệ');
  }

  const allowed = new Set(allowedKeys);
  const sensitive = new Set(sensitiveKeys);
  const result = {};
  Object.entries(payload).forEach(([key, value]) => {
    const canonicalKey = toCamelKey(key);
    if (!allowed.has(canonicalKey)) return;
    if (!isAdmin && sensitive.has(canonicalKey) && value !== undefined && value !== null && value !== '') {
      const error = new Error(`Không có quyền gửi trường nhạy cảm: ${canonicalKey}`);
      error.status = 403;
      throw error;
    }
    result[canonicalKey] = value;
  });
  return result;
}

export function validateLaptopNumbers(payload) {
  assertNonNegativeNumber(payload, 'priceRmb');
  assertNonNegativeNumber(payload, 'shippingRmb');
  assertNonNegativeNumber(payload, 'exchangeRate');
  assertNonNegativeNumber(payload, 'importPriceVnd');
  assertNonNegativeNumber(payload, 'wholesalePriceVnd');
  assertNonNegativeNumber(payload, 'retailPriceVnd');
  assertNonNegativeNumber(payload, 'batteryHealth');
  if (Number(payload.batteryHealth) > 100) throw new Error('batteryHealth phải từ 0 đến 100');
}

const assertTextLength = (payload, key, max, required = false) => {
  const value = payload[key];
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${key} là bắt buộc`);
    return;
  }
  if (typeof value !== 'string' || value.length > max) {
    throw new Error(`${key} không hợp lệ hoặc quá dài`);
  }
};

export const isValidPositiveId = (value) => (
  (typeof value === 'number' && Number.isInteger(value) && value > 0)
  || (typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0)
);

export function validateLaptopPayload(payload) {
  validateMonthKey(payload.monthKey);
  validateLaptopNumbers(payload);
  assertTextLength(payload, 'name', 240, true);
  assertTextLength(payload, 'serial', 100);
  assertTextLength(payload, 'trackingCode', 160);
  assertTextLength(payload, 'conditionNote', 2000);
  assertTextLength(payload, 'warrantySupplier', 160);
  if (payload.partsHistory !== undefined) {
    if (!Array.isArray(payload.partsHistory) || payload.partsHistory.length > 100
      || JSON.stringify(payload.partsHistory).length > 50000) {
      throw new Error('partsHistory không hợp lệ hoặc quá lớn');
    }
  }
}

export function validateOrderPayload(payload) {
  validateMonthKey(payload.monthKey);
  ['note', 'depositNote', 'customerInfo', 'customerAddress', 'setupNote', 'warranty', 'gifts', 'trackingCode', 'cancelReason']
    .forEach(key => assertTextLength(payload, key, key === 'customerAddress' ? 1000 : 2000));
  ['laptopId', 'tradeInLaptopId', 'customerId'].forEach(key => {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '' && !isValidPositiveId(payload[key])) {
      throw new Error(`${key} không hợp lệ`);
    }
  });
  ['salePrice', 'depositAmount', 'codAmount', 'amountPaid', 'debtAmount', 'creditCardFee']
    .forEach(key => assertNonNegativeNumber(payload, key));
  const salePrice = Number(payload.salePrice || 0);
  const depositAmount = Number(payload.depositAmount || 0);
  const amountPaid = Number(payload.amountPaid || 0);
  const codAmount = Number(payload.codAmount || 0);
  if (depositAmount > salePrice) throw new Error('depositAmount không được vượt salePrice');
  if (amountPaid > salePrice) throw new Error('amountPaid không được vượt salePrice');
  if (codAmount > Math.max(0, salePrice - amountPaid)) throw new Error('codAmount không được vượt số tiền còn nợ');
  if (payload.debtAmount !== undefined && Math.abs(Number(payload.debtAmount) - Math.max(0, salePrice - amountPaid)) > 0.01) {
    throw new Error('debtAmount không khớp salePrice - amountPaid');
  }
}

function validateMonthKey(value) {
  if (value !== undefined && !/^(0[1-9]|1[0-2])\/\d{4}$/.test(String(value))) {
    throw new Error('Tháng lưu phải có định dạng MM/YYYY.');
  }
}

export const LAPTOP_PAYLOAD_KEYS = [
  'monthKey',
  'id', 'serial', 'name', 'category', 'importDate', 'warehouseDate', 'location',
  'chargerStatus', 'status', 'priceRmb', 'shippingRmb', 'exchangeRate',
  'importPriceVnd', 'wholesalePriceVnd', 'retailPriceVnd', 'trackingCode', 'customerNote', 'batteryHealth',
  'warrantySupplier', 'isLocked', 'screenStatus', 'cameraMicStatus', 'mainboardStatus',
  'conditionNote', 'seller', 'isActive', 'partsHistory', 'createdAt', 'updatedAt',
  'profitVnd', 'importPriceManuallyEdited'
];

export const ORDER_PAYLOAD_KEYS = [
  'monthKey',
  'id', 'createdDate', 'saleOnline', 'saleOffline', 'note', 'orderType', 'orderStatus',
  'paymentStatus', 'paymentMethod', 'deliveryStatus', 'shippingMethod', 'laptopId',
  'salePrice', 'depositAmount', 'depositNote', 'codAmount', 'amountPaid', 'debtAmount',
  'creditCardFee', 'profitVnd', 'tradeInLaptopId', 'customerId', 'customerInfo',
  'customerAddress', 'trackingCode', 'shipDate', 'setupNote', 'warranty', 'gifts',
  'laptopLocked', 'reservationExpiresAt', 'cancelReason', 'cancelledAt', 'isActive',
  'createdAt', 'updatedAt'
];

export const WARRANTY_PAYLOAD_KEYS = [
  'id', 'orderId', 'laptopId', 'reportedIssue', 'status', 'receivedDate', 'resolvedDate',
  'repairCost', 'partsReplaced', 'diagnosis', 'resolution', 'resolutionNote', 'notes',
  'customerInfo', 'handledBy', 'createdAt', 'updatedAt'
];

export const STOCK_MOVEMENT_PAYLOAD_KEYS = [
  'id', 'laptopId', 'movementType', 'type', 'fromLocation', 'toLocation', 'orderId',
  'warrantyCaseId', 'note', 'performedBy', 'createdAt'
];

export const CUSTOMER_PAYLOAD_KEYS = ['id', 'name', 'phone', 'address'];

export const SENSITIVE_LAPTOP_KEYS = [
  'priceRmb', 'shippingRmb', 'exchangeRate', 'importPriceVnd', 'wholesalePriceVnd',
  'profitVnd', 'customProfit', 'seller', 'warrantySupplier'
];
export const SENSITIVE_ORDER_KEYS = ['profitVnd'];
