const laptopKeys = new Set(`id sku serial name category importDate warehouseDate location chargerStatus status retailPriceVnd trackingCode customerNote batteryHealth screenStatus cameraMicStatus mainboardStatus conditionNote isActive monthKey createdAt updatedAt availableForSaleAt sourceType sourceReferenceId purchaseBatchId trackingCodeCn receivedAt soldAt ignoredAt ignoreReason batchCode`.split(' '));
const orderKeys = new Set(`id createdDate saleOnline saleOffline note orderType orderStatus paymentStatus paymentMethod deliveryStatus shippingMethod laptopId requestedLaptopId requestedConfiguration requestedCategory salePrice depositAmount depositNote codAmount amountPaid debtAmount creditCardFee tradeInLaptopId tradeInCreditVnd customerId customerInfo customerAddress trackingCode shipDate setupNote warranty branchId giftPreset laptopLocked reservationExpiresAt cancelReason cancelledAt returnedAt returnReason isActive monthKey createdAt updatedAt paymentDueAt`.split(' '));
const qcKeys = new Set('serial model cpu gpu ram ssd mainboard screen keyboard keyboard_backlight touchpad camera microphone speaker wifi bluetooth usb usb_c hdmi lan battery ssd_health fan cooling cpu_stress gpu_stress charger exterior'.split(' '));
const pickScalars = (row, keys) => Object.fromEntries(Object.entries(row || {})
  .filter(([key, value]) => keys.has(key) && (value === null || typeof value !== 'object')));
export function publicLaptop(row) {
  if (!row) return row;
  const result = pickScalars(row, laptopKeys);
  // Technical data is schema-validated on write. Select only known entries.
  if (row.qcDetails && typeof row.qcDetails === 'object') {
    result.qcDetails = Object.fromEntries(Object.entries(row.qcDetails)
      .filter(([key, value]) => qcKeys.has(key) && value && typeof value === 'object' && !Array.isArray(value))
      .map(([key, value]) => [key, pickScalars(value, new Set(['result', 'note', 'notes']))]));
    if (['', 'A', 'B', 'C', 'D'].includes(row.qcDetails.cosmeticGrade)) result.qcDetails.cosmeticGrade = row.qcDetails.cosmeticGrade;
  }
  if (row.activeReservation) {
    result.activeReservation = pickScalars(row.activeReservation, new Set(['id', 'code', 'expiresAt', 'reservedBy']));
    if (row.activeReservation.customer) result.activeReservation.customer = pickScalars(row.activeReservation.customer, new Set(['id', 'name', 'phone']));
  }
  return result;
}
export function publicOrder(row) {
  if (!row) return row;
  const result = pickScalars(row, orderKeys);
  if (Array.isArray(row.giftAccessoryIds)) result.giftAccessoryIds = row.giftAccessoryIds.filter(id => Number.isSafeInteger(Number(id)) && Number(id) > 0);
  return result;
}
