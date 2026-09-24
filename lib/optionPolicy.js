export const SYSTEM_OPTION_GROUPS = Object.freeze([
  'laptopStatus', 'laptopLocation', 'chargerStatus', 'componentStatus',
  'orderStatus', 'paymentStatus', 'deliveryStatus', 'orderType',
  'paymentMethod', 'warrantyCaseStatus',
]);

export const EXTENSIBLE_OPTION_GROUPS = Object.freeze([
  'category', 'seller', 'shippingMethod', 'saleOnline', 'saleOffline',
]);

export const ALLOWED_OPTION_GROUPS = Object.freeze([
  ...SYSTEM_OPTION_GROUPS,
  ...EXTENSIBLE_OPTION_GROUPS,
]);

export const isSystemOptionGroup = groupKey => SYSTEM_OPTION_GROUPS.includes(String(groupKey));
export const isExtensibleOptionGroup = groupKey => EXTENSIBLE_OPTION_GROUPS.includes(String(groupKey));
