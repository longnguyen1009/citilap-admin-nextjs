// Operational lists default to the business month, never implicitly all history.
export function monthDateRange(monthKey) {
  if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(monthKey)) throw new Error('Tháng không hợp lệ');
  const [month, year] = monthKey.split('/').map(Number);
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`,
  };
}

export function parseListScope(params, now = new Date()) {
  const all = params.get('all');
  if (all !== null && !['true', 'false'].includes(all)) throw new Error('all phải là true hoặc false');
  const monthKey = params.get('monthKey');
  if (monthKey !== null && !/^(0[1-9]|1[0-2])\/\d{4}$/.test(monthKey)) {
    throw new Error('monthKey phải có định dạng MM/YYYY');
  }
  if (all === 'true' && monthKey !== null) throw new Error('Chỉ chọn một tháng hoặc all=true');
  if (all === 'true') return { all: true };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', month: '2-digit', year: 'numeric',
  }).formatToParts(now);
  return { all: false, monthKey: monthKey ?? `${parts.find(p => p.type === 'month').value}/${parts.find(p => p.type === 'year').value}` };
}
