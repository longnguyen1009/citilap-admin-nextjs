import { fetchPagedList } from './fetchPagedList';

// Authentication is carried by the HttpOnly same-origin D1 session cookie.
export const getAuthHeaders = async () => ({ 'Content-Type': 'application/json' });

export const fetchLaptopsFromCloud = async (opts = {}) => {
  const url = new URL('/api/inventory', window.location.origin);
  if (opts.monthKey) url.searchParams.append('monthKey', opts.monthKey);
  if (opts.all) url.searchParams.append('all', 'true');
  return fetchPagedList(url, opts.headers || await getAuthHeaders(), { signal: opts.signal });
};

export const saveLaptopToCloud = async (laptop, options = {}) => {
  const url = new URL('/api/inventory', window.location.origin);
  if (options.create) url.searchParams.set('mode', 'create');

  const res = await fetch(url, {
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
  return fetchPagedList(url, opts.headers || await getAuthHeaders(), { signal: opts.signal });
};

const orderCreateKeys = new WeakMap();
export const saveOrderToCloud = async (order) => {
  const creating=!(order.id && /^\d+$/.test(String(order.id)) && Number(order.id)>0);
  if(creating&&!orderCreateKeys.has(order))orderCreateKeys.set(order,crypto.randomUUID());
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: {...await getAuthHeaders(),...(creating?{'Idempotency-Key':order.idempotencyKey||orderCreateKeys.get(order)}:{})},
    body: JSON.stringify(order)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `HTTP error! status: ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
};

export const fetchWarrantyCasesFromCloud = async (opts = {}) => {
  const res = await fetch('/api/warranty', { headers: opts.headers || await getAuthHeaders() });
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

export const fetchAllSettings = async (opts = {}) => {
  const res = await fetch('/api/settings', { headers: opts.headers || await getAuthHeaders() });
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

export const fetchCustomersFromCloud = async (opts = {}) => {
  const headers = opts.headers || await getAuthHeaders();
  const requestedPage = Number(opts.page || 0);
  const limit = Math.min(200, Math.max(1, Number(opts.limit || 200)));
  const loadPage = async (page) => {
    const url = new URL('/api/customers', window.location.origin);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return res.json();
  };

  const first = await loadPage(requestedPage || 1);
  if (!first) return null;
  if (Array.isArray(first)) return first;
  if (requestedPage) return first?.data || null;

  const rows = [...(first?.data || [])];
  const total = Number(first?.total || rows.length);
  const pageCount = Math.ceil(total / limit);
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await loadPage(page);
    if (!result) return null;
    rows.push(...(Array.isArray(result) ? result : (result?.data || [])));
  }
  return rows;
};

export const fetchAppOptionsFromCloud = async (opts = {}) => {
  const res = await fetch('/api/options', { headers: opts.headers || await getAuthHeaders() });
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
  const res = await fetch(url, { headers: opts.headers || await getAuthHeaders() });
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
