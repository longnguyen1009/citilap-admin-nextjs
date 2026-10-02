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
]);
const canonical = key => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
export function canReadAudit(role, entity) {
  if (role === 'ADMIN') return true;
  const allowed = ['SALES', 'SALES_TECH'].includes(role)
    ? ['LAPTOP', 'ORDER', 'CUSTOMER', 'WARRANTY', 'STOCK_MOVEMENT', 'PAYMENT']
    : ['TECH', 'TECHNICAL', 'STAFF'].includes(role) ? ['LAPTOP', 'WARRANTY', 'STOCK_MOVEMENT'] : [];
  if (role === 'SALES_TECH') return [...new Set([...allowed, 'WARRANTY', 'STOCK_MOVEMENT'])].includes(entity);
  return allowed.includes(entity);
}
export function visibleAuditChanges(changes, role) {
  if (role === 'ADMIN') return changes;
  const allowed = ['SALES', 'SALES_TECH'].includes(role) ? sales : operational;
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => allowed.has(canonical(key)) || key === 'old' || key === 'new')
      .map(([key, item]) => [key, clean(item)]));
  };
  return clean(changes);
}
