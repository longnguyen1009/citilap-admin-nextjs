import { getSupabaseClient } from './supabaseClient';

const getAuthHeaders = async () => {
  const headers = { 'Content-Type': 'application/json' };
  
  try {
    const savedUser = localStorage.getItem('citilap_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      if (parsed.role) {
        headers['X-Mock-Role'] = parsed.role;
      }
    }
  } catch (e) {}

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
  return res.ok ? await res.json() : null;
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
  return res.ok ? await res.json() : null;
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
  return res.ok ? await res.json() : null;
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
  const client = getSupabaseClient();
  if (!client) return () => {};

  const channel = client
    .channel('citilap-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'laptops' }, payload => {
      onLaptopChange(payload.eventType, payload.new, payload.old);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      onOrderChange(payload.eventType, payload.new, payload.old);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_cases' }, payload => {
      if (onWarrantyChange) onWarrantyChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_options' }, payload => {
      if (onSettingsChange) onSettingsChange(payload);
    })
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
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
  return res.ok ? await res.json() : null;
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
  return res.ok ? await res.json() : null;
};
