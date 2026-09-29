import { getAuthHeaders } from './apiFetchers';

export async function downloadExport(type, format, ids) {
  if (!ids.length) throw new Error('Không có dữ liệu phù hợp để xuất');
  const response = await fetch('/api/exports', { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ type, format, ids }) });
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Không thể xuất dữ liệu'); }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `CitiLap_${type}_${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
