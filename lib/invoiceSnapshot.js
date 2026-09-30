export function invoiceOrderValue(order, snakeKey, camelKey) {
  const snakeValue = order?.[snakeKey];
  if (snakeValue !== undefined && snakeValue !== null && snakeValue !== '') return snakeValue;
  const camelValue = order?.[camelKey];
  return camelValue !== undefined && camelValue !== null && camelValue !== '' ? camelValue : '';
}

// Snapshot totals are in million VND; trade-in credit is stored in VND.
export function invoiceSettlement(snapshot = {}) {
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const order = snapshot.order || {};
  const total = number(snapshot.total);
  const paid = number(snapshot.paid);
  const credit = number(order.trade_in_credit_vnd ?? order.tradeInCreditVnd) / 1000000;
  const recordedDebt = order.debt_amount ?? order.debtAmount;
  const debt = recordedDebt == null || recordedDebt === ''
    ? Math.max(total - paid - credit, 0) : Math.max(number(recordedDebt), 0);
  return { total, paid, credit, debt, excess: Math.max(paid + credit - total, 0) };
}

export function invoiceEmployee(order, createdBy = '') {
  return invoiceOrderValue(order, 'sale_offline', 'saleOffline')
    || invoiceOrderValue(order, 'sale_online', 'saleOnline')
    || createdBy
    || '';
}
