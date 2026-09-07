import { getSupabaseClient } from './supabaseClient';

export const getAuthHeaders = async () => {
  const headers = { 'Content-Type': 'application/json' };
  
  const client = getSupabaseClient();
  if (client) {
    const { data: { session } } = await client.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }
  
  return headers;
};

export const fetchLaptopsFromCloud = async (opts = {}) => {
  const url = new URL('/api/inventory', window.location.origin);
  if (opts.monthKey) url.searchParams.append('monthKey', opts.monthKey);
  if (opts.all) url.searchParams.append('all', 'true');
  const res = await fetch(url, { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const saveLaptopToCloud = async (laptop) => {
  const res = await fetch('/api/inventory', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(laptop)
  });
  if (!res.ok) {
    let errData = {};
    try { errData = await res.json(); } catch(e){}
    throw new Error(errData.error || `HTTP error! status: ${res.status}`);
  }
  return await res.json();
};

export const fetchOrdersFromCloud = async (opts = {}) => {
  const url = new URL('/api/orders', window.location.origin);
  if (opts.monthKey) url.searchParams.append('monthKey', opts.monthKey);
  if (opts.all) url.searchParams.append('all', 'true');
  const res = await fetch(url, { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const saveOrderToCloud = async (order) => {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(order)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP error! status: ${res.status}`);
  return data;
};

export const fetchWarrantyCasesFromCloud = async () => {
  const res = await fetch('/api/warranty', { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const saveWarrantyCaseToCloud = async (warrantyCase) => {
  const res = await fetch('/api/warranty', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(warrantyCase)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP error! status: ${res.status}`);
  return data;
};

export const fetchAllSettings = async () => {
  const res = await fetch('/api/settings', { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const saveSetting = async (key, value) => {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ [key]: value })
  });
  return res.ok ? await res.json() : null;
};

export const subscribeRealtimeChanges = (onLaptopChange, onOrderChange, onWarrantyChange, onSettingsChange) => {
  // Dữ liệu nghiệp vụ được đọc qua Route Handler đã kiểm tra quyền. Không subscribe
  // trực tiếp bảng Supabase ở browser vì sẽ buộc mở RLS và lộ giá vốn cho STAFF.
  // InventoryContext thực hiện refresh định kỳ qua API thay thế cho Realtime trực tiếp.
  void onLaptopChange;
  void onOrderChange;
  void onWarrantyChange;
  void onSettingsChange;
  return () => {};
};

export const fetchCustomersFromCloud = async () => {
  const res = await fetch('/api/customers', { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const fetchAppOptionsFromCloud = async () => {
  const res = await fetch('/api/options', { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const saveCustomerToCloud = async (customer) => {
  const res = await fetch('/api/customers', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(customer)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP error! status: ${res.status}`);
  return data;
};
export const fetchStockMovementsFromCloud = async () => {
  const res = await fetch('/api/stock-movements', { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const saveStockMovementToCloud = async (movement) => {
  const res = await fetch('/api/stock-movements', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(movement)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP error! status: ${res.status}`);
  return data;
};

export const fetchPaymentsFromCloud = async (opts = {}) => {
  const url = new URL('/api/payments', window.location.origin);
  if (opts.orderId) url.searchParams.set('orderId', opts.orderId);
  const res = await fetch(url, { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const savePaymentToCloud = async (payment) => {
  const res = await fetch('/api/payments', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payment)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP error! status: ${res.status}`);
  return data;
};

export const fetchFinancialRecordsFromCloud = async (opts = {}) => {
  const url = new URL('/api/financial-records', window.location.origin);
  if (opts.from) url.searchParams.set('from', opts.from);
  if (opts.to) url.searchParams.set('to', opts.to);
  const res = await fetch(url, { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const saveFinancialRecordToCloud = async (record) => {
  const res = await fetch('/api/financial-records', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(record)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP error! status: ${res.status}`);
  return data;
};

export const fetchUsersFromCloud = async () => {
  const url = new URL('/api/users', window.location.origin);
  const res = await fetch(url, { headers: await getAuthHeaders() });
  return res.ok ? await res.json() : null;
};

export const saveUserToCloud = async (payload, isEdit) => {
  const url = new URL('/api/users', window.location.origin);
  const res = await fetch(url, {
    method: isEdit ? 'PUT' : 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

export const updateUserStatus = async (id, isActive) => {
  const res = await fetch('/api/users', {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ id, is_active: isActive })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};
