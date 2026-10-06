// Amounts are in million VND; round at VND precision.
export function orderBalanceAfterDeposit(order) {
  return Math.max(0, Math.round((Number(order.salePrice || 0) - Number(order.depositAmount || 0)) * 1000000) / 1000000);
}

export function remainingOrderAmount(order) {
  return Math.max(0, Math.round((Number(order.salePrice || 0) - Number(order.amountPaid || 0)
    - Number(order.tradeInCreditVnd || 0) / 1000000) * 1000000) / 1000000);
}
