export function invoiceOrderValue(order, snakeKey, camelKey) {
  const snakeValue = order?.[snakeKey];
  if (snakeValue !== undefined && snakeValue !== null && snakeValue !== '') return snakeValue;
  const camelValue = order?.[camelKey];
  return camelValue !== undefined && camelValue !== null && camelValue !== '' ? camelValue : '';
}

export function invoiceEmployee(order, createdBy = '') {
  return invoiceOrderValue(order, 'sale_offline', 'saleOffline')
    || invoiceOrderValue(order, 'sale_online', 'saleOnline')
    || createdBy
    || '';
}
