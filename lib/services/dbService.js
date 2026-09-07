import { getSupabaseClient } from '../supabaseClient';
import { getSupabaseAdminClient } from '../supabaseAdmin';

// ─── Auth guard ───
export const hasActiveSession = async () => {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data: { session } } = await client.auth.getSession();
  return !!session;
};

// ─── Date Helpers ───
const toIsoDate = (vnDateStr) => {
  if (!vnDateStr) return null;
  if (String(vnDateStr).includes('-')) {
    const d = new Date(vnDateStr);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  const parts = String(vnDateStr).split('/');
  if (parts.length >= 3) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    const dateObj = new Date(`${y}-${m}-${d}T00:00:00Z`);
    return isNaN(dateObj.getTime()) ? null : dateObj.toISOString().split('T')[0];
  }
  return null;
};

const toVnDate = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const isValidDBId = (id) => typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id));

// ─── AUTO-MAPPER (Snake <-> Camel) ───
const VN_DATE_FIELDS = ['importDate', 'warehouseDate', 'createdDate', 'shipDate', 'receivedDate', 'resolvedDate', 'cancelledAt', 'paymentDate'];

const toCamel = (s) => s.replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''));
const toSnake = (s) => s.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const isObject = (o) => o === Object(o) && !Array.isArray(o) && typeof o !== 'function' && o !== null;

const keysToCamel = (o) => {
  if (isObject(o)) {
    const n = {};
    Object.keys(o).forEach((k) => {
      const camelKey = toCamel(k);
      let val = keysToCamel(o[k]);
      if (VN_DATE_FIELDS.includes(camelKey)) val = toVnDate(val);
      n[camelKey] = val;
    });
    return n;
  } else if (Array.isArray(o)) {
    return o.map((i) => keysToCamel(i));
  }
  return o;
};

const keysToSnake = (o) => {
  if (isObject(o)) {
    const n = {};
    Object.keys(o).forEach((k) => {
      const snakeKey = toSnake(k);
      let val = keysToSnake(o[k]);
      
      // Convert empty strings to null to prevent "invalid input syntax for type numeric"
      if (val === '') val = null;

      // Special Rules
      if (k === 'id' && !isValidDBId(val)) return; // Skip invalid IDs so Supabase can auto-generate
      if (VN_DATE_FIELDS.includes(k)) val = toIsoDate(val);
      
      // Auto mapping ID fixes (if UI sends something that doesn't match the standard)
      if (k === 'movementType') n['movement_type'] = val; // ensure backward compat if needed
      
      n[snakeKey] = val;
    });
    return n;
  } else if (Array.isArray(o)) {
    return o.map((i) => keysToSnake(i));
  }
  return o;
};

// ─── API Methods ───
// Laptops
export const fetchLaptopsFromCloud = async (opts = {}) => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    let query = client.from('laptops').select('*');
    if (opts.monthKey && opts.monthKey !== 'ALL') {
      const [mm, yyyy] = opts.monthKey.split('/');
      const monthStart = `${yyyy}-${mm.padStart(2, '0')}-01`;
      const monthEnd = `${yyyy}-${mm.padStart(2, '0')}-31`;
      query = query.or(`import_date.gte.${monthStart},import_date.lte.${monthEnd},status.eq.repairing,status.eq.available,status.eq.deposited,status.eq.not_imported,status.eq.returned_cn,status.eq.skipped`);
    }
    let res = await query.eq('is_active', true);
    if (res.error) {
      let retryQuery = client.from('laptops').select('*');
      if (opts.monthKey && opts.monthKey !== 'ALL') {
        const [mm, yyyy] = opts.monthKey.split('/');
        const monthStart = `${yyyy}-${mm.padStart(2, '0')}-01`;
        const monthEnd = `${yyyy}-${mm.padStart(2, '0')}-31`;
        retryQuery = retryQuery.or(`import_date.gte.${monthStart},import_date.lte.${monthEnd},status.eq.repairing,status.eq.available,status.eq.deposited,status.eq.not_imported,status.eq.returned_cn,status.eq.skipped`);
      }
      res = await retryQuery;
    }
    if (res.error || !res.data) return null;
    return keysToCamel(res.data);
  } catch (err) { return null; }
};

export const saveLaptopToCloud = async (laptop) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(laptop);
    delete dbRow.import_price_manually_edited;
    delete dbRow.profit_vnd; // computed property on frontend
    const { data, error } = await client.from('laptops').upsert(dbRow, { onConflict: 'id' }).select();
    if (error || !data || data.length === 0) throw new Error(error?.message || 'Bị chặn bởi RLS');
    return keysToCamel(data[0]);
  } catch (err) {
    console.error('Lỗi kết nối Supabase:', err);
    throw err;
  }
};

// Orders
export const fetchOrdersFromCloud = async (opts = {}) => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    let query = client.from('orders').select('*');
    if (opts.monthKey && opts.monthKey !== 'ALL') {
      const [mm, yyyy] = opts.monthKey.split('/');
      const monthStart = `${yyyy}-${mm.padStart(2, '0')}-01`;
      const monthEnd = `${yyyy}-${mm.padStart(2, '0')}-31`;
      query = query.gte('created_date', monthStart).lte('created_date', monthEnd);
    }
    let res = await query.eq('is_active', true);
    if (res.error) {
      let retryQuery = client.from('orders').select('*');
      if (opts.monthKey && opts.monthKey !== 'ALL') {
        const [mm, yyyy] = opts.monthKey.split('/');
        const monthStart = `${yyyy}-${mm.padStart(2, '0')}-01`;
        const monthEnd = `${yyyy}-${mm.padStart(2, '0')}-31`;
        retryQuery = retryQuery.gte('created_date', monthStart).lte('created_date', monthEnd);
      }
      res = await retryQuery;
    }
    if (res.error || !res.data) return null;
    return keysToCamel(res.data);
  } catch (err) { return null; }
};

export const saveOrderToCloud = async (order) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(order);
    const { data, error } = await client.from('orders').upsert(dbRow, { onConflict: 'id' }).select();
    if (error || !data || data.length === 0) throw new Error(error?.message || 'Bị chặn bởi RLS');
    return keysToCamel(data[0]);
  } catch (err) { throw err; }
};

// Warranty Cases
export const fetchWarrantyCasesFromCloud = async () => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('warranty_cases').select('*').order('created_at', { ascending: false });
    if (error) return null;
    return keysToCamel(data);
  } catch (err) { return null; }
};

export const saveWarrantyCaseToCloud = async (warrantyCase) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(warrantyCase);
    const { data, error } = await client.from('warranty_cases').upsert(dbRow).select().single();
    if (error || !data) return false;
    return keysToCamel(data);
  } catch (err) { return false; }
};

// Stock Movements
export const fetchStockMovementsFromCloud = async () => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('stock_movements').select('*').order('created_at', { ascending: false });
    if (error) return null;
    return keysToCamel(data);
  } catch (err) { return null; }
};

export const saveStockMovementToCloud = async (movement) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(movement);
    if (movement.type) dbRow.movement_type = movement.type; // Backward compatibility for UI
    const { error } = await client.from('stock_movements').insert(dbRow);
    return !error;
  } catch (err) { return false; }
};

// Customers
export const fetchCustomersFromCloud = async () => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('customers').select('*').order('created_at', { ascending: false });
    if (error) return null;
    return keysToCamel(data);
  } catch (err) { return null; }
};

export const saveCustomerToCloud = async (customer) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const dbRow = keysToSnake(customer);
    const { data, error } = await client.from('customers').upsert(dbRow, { onConflict: 'id' }).select();
    if (error || !data || data.length === 0) return false;
    return keysToCamel(data[0]);
  } catch (err) { return false; }
};

// App Settings
export const fetchAllSettings = async () => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('app_settings').select('*');
    if (error || !data) return null;
    const settings = {};
    data.forEach(row => { settings[row.key] = row.value; });
    return settings;
  } catch (err) { return null; }
};

export const fetchSetting = async (key) => {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('app_settings').select('value').eq('key', key).single();
    if (error || !data) return null;
    return data.value;
  } catch (err) { return null; }
};

export const saveSetting = async (key, value) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const { error } = await client.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
    return !error;
  } catch (err) { return false; }
};

export const saveSettings = async (settingsObj) => {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  try {
    const rows = Object.entries(settingsObj).map(([key, value]) => ({ key, value }));
    const { error } = await client.from('app_settings').upsert(rows, { onConflict: 'key' });
    return !error;
  } catch (err) { return false; }
};

export const subscribeRealtimeChanges = (onLaptopChange, onOrderChange, onPaymentChange, onWarrantyChange, onSettingsChange) => {
  const client = getSupabaseAdminClient();
  if (!client) return () => {};

  const channel = client
    .channel('citilap-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'laptops' }, payload => {
      if (onLaptopChange) onLaptopChange(keysToCamel(payload));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      if (onOrderChange) onOrderChange(keysToCamel(payload));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, payload => {
      if (onPaymentChange) onPaymentChange(keysToCamel(payload));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_cases' }, payload => {
      if (onWarrantyChange) onWarrantyChange(keysToCamel(payload));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, payload => {
      if (onSettingsChange) onSettingsChange(payload);
    })
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
};
