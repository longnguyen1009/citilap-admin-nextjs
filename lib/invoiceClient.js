import { getAuthHeaders } from './apiFetchers';

export async function invoiceRequest(path, body) {
  const response = await fetch(path, {
    headers: await getAuthHeaders(),
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không thể tải dữ liệu');
  return data;
}

export const invoiceMoney = value => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0
}).format(Number(value || 0) * 1000000);
