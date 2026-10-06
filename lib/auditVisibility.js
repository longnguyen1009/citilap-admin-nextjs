import { SALES_ROLES, TECHNICAL_ROLES } from './roles.mjs';

// Audit values are untrusted historical JSON. Only known, operational fields
// may leave the server for non-admin readers, including nested event payloads.
const operational = new Set([
  'id', 'sku', 'serial', 'name', 'category', 'status', 'location',
  'chargerStatus', 'batteryHealth', 'screenStatus', 'cameraMicStatus',
  'mainboardStatus', 'importDate', 'warehouseDate', 'laptopId',
  'movementType', 'fromLocation', 'toLocation', 'event',
]);
const sales = new Set([
  ...operational, 'orderId', 'customerId', 'customerInfo', 'customerAddress',
  'salePrice', 'orderStatus', 'paymentStatus', 'paymentMethod', 'amountPaid',
  'debtAmount', 'depositAmount', 'codAmount', 'deliveryStatus', 'shippingMethod',
  'trackingCode', 'shipDate', 'createdDate', 'orderType', 'paymentType', 'amount',
  'saleOnline', 'saleOffline', 'note', 'depositNote', 'creditCardFee',
  'tradeInLaptopId', 'requestedLaptopId', 'requestedConfiguration', 'requestedCategory',
  'setupNote', 'warranty', 'monthKey', 'branchId', 'giftPreset', 'giftAccessoryIds',
  'reservationExpiresAt', 'cancelReason', 'cancelledAt', 'returnedAt', 'returnReason', 'paymentDueAt',
]);
const canonical = key => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
export function canReadAudit(role, entity) {
  if (role === 'ADMIN') return true;
  const allowed = SALES_ROLES.includes(role)
    ? ['LAPTOP', 'ORDER', 'CUSTOMER', 'WARRANTY', 'STOCK_MOVEMENT', 'PAYMENT']
    : (TECHNICAL_ROLES.includes(role) || role === 'STAFF') ? ['LAPTOP', 'WARRANTY', 'STOCK_MOVEMENT'] : [];
  return allowed.includes(entity);
}
export function visibleAuditChanges(changes, role) {
  if (role === 'ADMIN') return changes;
  const allowed = SALES_ROLES.includes(role) ? sales : operational;
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => allowed.has(canonical(key)) || ['old', 'new', 'before', 'after'].includes(key))
      .map(([key, item]) => [key, clean(item)]));
  };
  return clean(changes);
}
