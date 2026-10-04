const laptopKeys = new Set(`id sku serial name category importDate warehouseDate location chargerStatus status retailPriceVnd trackingCode customerNote batteryHealth warrantySupplier screenStatus cameraMicStatus mainboardStatus conditionNote isActive monthKey createdAt updatedAt availableForSaleAt sourceType sourceReferenceId domesticSourceName supplierName seller purchaseBatchId trackingCodeCn receivedAt soldAt ignoredAt ignoreReason batchCode`.split(' '));
const orderKeys = new Set(`id createdDate saleOnline saleOffline note orderType orderStatus paymentStatus paymentMethod deliveryStatus shippingMethod laptopId requestedLaptopId requestedConfiguration requestedCategory salePrice depositAmount depositNote codAmount amountPaid debtAmount creditCardFee tradeInLaptopId tradeInCreditVnd customerId customerInfo customerAddress trackingCode shipDate setupNote warranty branchId giftPreset laptopLocked reservationExpiresAt cancelReason cancelledAt returnedAt returnReason isActive monthKey createdAt updatedAt paymentDueAt`.split(' '));
const invoiceOrderKeys = new Set([
  ...orderKeys,
  'created_date', 'sale_online', 'sale_offline', 'note', 'order_type', 'order_status',
  'payment_status', 'payment_method', 'delivery_status', 'shipping_method', 'laptop_id',
  'requested_laptop_id', 'requested_configuration', 'requested_category', 'sale_price',
  'deposit_amount', 'deposit_note', 'cod_amount', 'amount_paid', 'debt_amount',
  'trade_in_laptop_id', 'trade_in_credit_vnd', 'customer_id', 'customer_info',
  'customer_address', 'tracking_code', 'ship_date', 'setup_note', 'warranty', 'branch_id',
  'gift_preset', 'gift_accessory_ids', 'laptop_locked', 'reservation_expires_at',
  'cancel_reason', 'cancelled_at', 'returned_at', 'return_reason', 'is_active',
  'month_key', 'created_at', 'updated_at', 'payment_due_at',
]);
const qcKeys = new Set('serial model cpu gpu ram ssd mainboard screen keyboard keyboard_backlight touchpad camera microphone speaker wifi bluetooth usb usb_c hdmi lan battery ssd_health fan cooling cpu_stress gpu_stress charger exterior'.split(' '));
const qcKeyAliases = {
  keyboardBacklight: 'keyboard_backlight',
  usbC: 'usb_c',
  ssdHealth: 'ssd_health',
  cpuStress: 'cpu_stress',
  gpuStress: 'gpu_stress',
};
const pickScalars = (row, keys) => Object.fromEntries(Object.entries(row || {})
  .filter(([key, value]) => keys.has(key) && (value === null || typeof value !== 'object')));
export function publicLaptop(row) {
  if (!row) return row;
  const result = pickScalars(row, laptopKeys);
  // Technical data is schema-validated on write. Select only known entries.
  if (row.qcDetails && typeof row.qcDetails === 'object') {
    result.qcDetails = Object.fromEntries(Object.entries(row.qcDetails)
      .map(([key, value]) => [qcKeyAliases[key] || key, value])
      .filter(([key, value]) => qcKeys.has(key) && value && typeof value === 'object' && !Array.isArray(value))
      .map(([key, value]) => [key, pickScalars(value, new Set(['result', 'note', 'notes']))]));
    if (['', 'A', 'B', 'C', 'D'].includes(row.qcDetails.cosmeticGrade)) result.qcDetails.cosmeticGrade = row.qcDetails.cosmeticGrade;
  }
  if (row.activeReservation) {
    result.activeReservation = pickScalars(row.activeReservation, new Set(['id', 'code', 'expiresAt', 'reservedBy']));
    if (row.activeReservation.customer) result.activeReservation.customer = pickScalars(row.activeReservation.customer, new Set(['id', 'name', 'phone']));
  }
  const rawPartsHistory = row.partsHistory || row.parts_history;
  if (Array.isArray(rawPartsHistory)) {
    result.partsHistory = rawPartsHistory.map(item => ({
      date: String(item?.date ?? '').slice(0, 50),
      log: String(item?.log ?? '').slice(0, 1000),
    }));
  }
  return result;
}
export function publicOrder(row) {
  if (!row) return row;
  const result = pickScalars(row, orderKeys);
  if (Array.isArray(row.giftAccessoryIds)) result.giftAccessoryIds = row.giftAccessoryIds.filter(id => Number.isSafeInteger(Number(id)) && Number(id) > 0);
  return result;
}

export function publicInvoice(invoice) {
  if (!invoice?.snapshot) return invoice;
  const snapshot = invoice.snapshot;
  return {
    ...pickScalars(invoice, new Set(['id', 'invoice_number', 'order_id', 'laptop_id', 'customer_id', 'created_by', 'created_at'])),
    snapshot: {
      currency: snapshot.currency,
      unit_multiplier: snapshot.unit_multiplier,
      total: snapshot.total,
      paid: snapshot.paid,
      customer: snapshot.customer && pickScalars(snapshot.customer, new Set(['id', 'name', 'phone', 'address'])),
      branch: snapshot.branch && pickScalars(snapshot.branch, new Set(['id', 'name', 'address', 'phone'])),
      order: snapshot.order && pickScalars(snapshot.order, invoiceOrderKeys),
      items: Array.isArray(snapshot.items) ? snapshot.items.map(item => pickScalars(item,
        new Set(['kind', 'id', 'sku', 'name', 'quantity', 'price', 'total', 'serial', 'note']))) : [],
      payments: Array.isArray(snapshot.payments) ? snapshot.payments.map(payment => pickScalars(payment,
        new Set(['id', 'payment_type', 'amount', 'payment_method', 'payment_date', 'note', 'reference_code', 'recorded_by']))) : [],
      financial_records: Array.isArray(snapshot.financial_records) ? snapshot.financial_records
        .filter(row => row?.payment_id)
        .map(row => pickScalars(row, new Set(['id', 'payment_id', 'occurred_on', 'category', 'amount', 'payment_method']))) : [],
    },
  };
}
