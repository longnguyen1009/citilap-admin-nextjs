const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const payload = {
  id: '4',
  serial: '19951995',
  name: 'Legion 5 Pro 2022 R5-6600H/16/512/3060/2.5K 165Hz',
  categoryId: 'e0364a2b-079b-47c8-8a42-0e818d45605e',
  importDate: '26/08/2026',
  warehouseDate: null,
  locationId: '34e0059a-1e80-417a-bf74-38d5a8ce86ab',
  chargerStatusId: '2696c365-236b-47d2-9a42-33b477c57839',
  statusId: 'd2692923-856c-4398-81bb-f3621fdd271c',
  priceRmb: 4000,
  shippingRmb: 40,
  exchangeRate: 3900,
  importPriceVnd: 16.16,
  wholesalePriceVnd: 0,
  retailPriceVnd: 0,
  customProfit: 0,
  trackingCode: '19961996',
  batteryHealth: 100,
  cycleCount: 96,
  warrantySupplier: '29/7/28',
  isLocked: false,
  screenStatusId: null,
  cameraMicStatusId: null,
  mainboardStatusId: null,
  conditionNote: 'máy đẹp keng 98-99%',
  sellerId: null,
  isActive: true,
  partsHistory: []
};

const toIsoDate = (d) => {
  if (!d) return null;
  const parts = d.split('/');
  return parts.length === 3 ? parts[2] + '-' + parts[1] + '-' + parts[0] : d;
};
const isValidDBId = (id) => typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id));

const dbRow = {
  id: isValidDBId(payload.id) ? payload.id : undefined,
  serial: payload.serial || '',
  name: payload.name || '',
  category_id: payload.categoryId || null,
  import_date: toIsoDate(payload.importDate),
  warehouse_date: toIsoDate(payload.warehouseDate),
  location_id: payload.locationId || null,
  charger_status_id: payload.chargerStatusId || null,
  status_id: payload.statusId || null,
  price_rmb: payload.priceRmb || 0,
  shipping_rmb: payload.shippingRmb || 0,
  exchange_rate: payload.exchangeRate || 3550,
  import_price_vnd: payload.importPriceVnd || 0,
  wholesale_price_vnd: payload.wholesalePriceVnd || 0,
  retail_price_vnd: payload.retailPriceVnd || 0,
  custom_profit: payload.customProfit || 0,
  tracking_code: payload.trackingCode || '',
  battery_health: payload.batteryHealth || 100,
  
    is_locked: payload.isLocked,
  screen_status_id: payload.screenStatusId || null,
  camera_mic_status_id: payload.cameraMicStatusId || null,
  mainboard_status_id: payload.mainboardStatusId || null,
  condition_note: payload.conditionNote || '',
  seller_id: payload.sellerId || null,
  is_active: payload.isActive !== false,
  parts_history: payload.partsHistory || []
};

console.log('Sending dbRow:', dbRow);

supabase.from('laptops').upsert(dbRow, { onConflict: 'id' }).select().then(res => {
  console.log('Result:', res.error ? JSON.stringify(res.error, null, 2) : res.data);
});
