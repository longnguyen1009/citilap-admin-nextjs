// Preserve the array contract for existing screens while avoiding silent
// truncation at the database API's row limit. Never return partial success.
export async function fetchPagedList(url, headers, { signal, pageSize = 250 } = {}) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set('limit', String(pageSize));
    pageUrl.searchParams.set('offset', String(offset));
    const response = await fetch(pageUrl, { headers, signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error || `Không thể tải danh sách (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    if (!payload || !Array.isArray(payload.data) || typeof payload.hasMore !== 'boolean') {
      throw new Error('Phản hồi phân trang không hợp lệ.');
    }
    rows.push(...payload.data);
    if (!payload.hasMore) return rows;
    if (!payload.data.length) throw new Error('Danh sách thay đổi trong lúc tải. Vui lòng thử lại.');
    offset += payload.data.length;
  }
}
