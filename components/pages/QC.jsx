'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, ShieldCheck, ShieldX, Wrench, Undo2, X } from 'lucide-react';
import { getAuthHeaders } from '@/lib/apiFetchers';
import { repairMojibake } from '@/lib/textEncoding';
import ListPagination, { useListPagination } from '../ui/ListPagination';
import './qc-quick.css';
import QCDetailsFields from '../QCDetailsFields';

const OUTCOMES = [
  { key: 'PASS', label: 'Đạt', detail: 'Chuyển sang sẵn hàng bán', icon: ShieldCheck },
  { key: 'FAIL', label: 'Chưa đạt', detail: 'Giữ ở hàng chờ QC', icon: ShieldX },
  { key: 'REPAIR', label: 'Cần sửa chữa', detail: 'Chuyển sang sửa chữa và tạo phiếu sửa', icon: Wrench },
  { key: 'RETURN_CN', label: 'BACK về TQ', detail: 'Chuyển sang trả NCC và tạo phiếu trả', icon: Undo2 },
];
const outcomeFor = q => OUTCOMES.find(x => x.key === (q.disposition || q.result));
const historyVisual = q => outcomeFor(q) || { key: 'IN_PROGRESS', icon: ClipboardCheck };
const CHECK_LABELS = { PASS: 'Đạt', FAIL: 'Lỗi', WARNING: 'Cảnh báo', NOT_TESTED: 'Chưa test', NOT_APPLICABLE: 'Không áp dụng' };
const QC_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const QC_HISTORY_PAGE_SIZE = 50;
const EXTRA_SUPPLIER_TONES = [
  { bg: '#fce7f3', color: '#9d174d' },
  { bg: '#fef3c7', color: '#92400e' },
  { bg: '#cffafe', color: '#155e75' },
  { bg: '#fee2e2', color: '#991b1b' },
  { bg: '#e0e7ff', color: '#3730a3' },
];
const supplierTone = seller => {
  if (!seller) return { bg: '#f1f5f9', color: '#64748b' };
  const name = String(seller).trim().toLowerCase();
  if (name.includes('guangzhou')) return { bg: '#dbeafe', color: '#1d4ed8' };
  if (name.includes('shenzhen')) return { bg: '#d1fae5', color: '#065f46' };
  if (name.includes('beijing')) return { bg: '#ede9fe', color: '#5b21b6' };
  if (name.includes('a-ming') || name.includes('aming')) return { bg: '#ffedd5', color: '#c2410c' };
  if (name.includes('xiao')) return { bg: '#ccfbf1', color: '#0f766e' };
  const hash = [...name].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
  return EXTRA_SUPPLIER_TONES[hash % EXTRA_SUPPLIER_TONES.length];
};
const parseDateValue = value => {
  if (!value) return null;
  const vnDate = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const date = vnDate ? new Date(`${vnDate[3]}-${vnDate[2]}-${vnDate[1]}T00:00:00+07:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const qcTime = q => q.completed_at || q.started_at;
const laptopReceivedTime = laptop => laptop.receivedAt || laptop.warehouseDate;
const sortWaitingLaptops = rows => rows.filter(item => item.status === 'waiting_qc').sort((a, b) => {
  const aTime = parseDateValue(laptopReceivedTime(a))?.getTime() || 0;
  const bTime = parseDateValue(laptopReceivedTime(b))?.getTime() || 0;
  return bTime - aTime || Number(b.id) - Number(a.id);
});
const qcDayKey = value => parseDateValue(value) ? new Intl.DateTimeFormat('sv-SE', { timeZone: QC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(parseDateValue(value)) : 'unknown';
const formatQcDay = (value, fallback = 'Không rõ ngày') => parseDateValue(value) ? new Intl.DateTimeFormat('vi-VN', { timeZone: QC_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseDateValue(value)) : fallback;
const formatQcHour = value => parseDateValue(value) ? new Intl.DateTimeFormat('vi-VN', { timeZone: QC_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(parseDateValue(value)) : '--:--';
async function request(url, options = {}) {
  const res = await fetch(url, { ...options, headers: await getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không thể xử lý yêu cầu');
  return data;
}
export default function QC() {
  const [laptops, setLaptops] = useState([]), [history, setHistory] = useState([]);
  const [active, setActive] = useState(null), [items, setItems] = useState([]);
  const [choice, setChoice] = useState(''), [notes, setNotes] = useState('');
  const [details, setDetails] = useState({});
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [message, setMessage] = useState(''), [loading, setLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1), [historyTotal, setHistoryTotal] = useState(0);
  const busy = useRef(false), completionKey = useRef(null);
  const loadHistory = useCallback(async page => {
    const result = await request(`/api/qc?page=${page}&limit=${QC_HISTORY_PAGE_SIZE}`);
    setHistory(result.data || []); setHistoryTotal(result.total || 0);
  }, []);
  const load = useCallback(async () => {
    const [ls] = await Promise.all([request('/api/inventory?all=true&status=waiting_qc'), loadHistory(historyPage)]);
    setLaptops(sortWaitingLaptops(ls));
  }, [historyPage, loadHistory]);
  useEffect(() => {
    let mounted = true;
    Promise.all([request('/api/inventory?all=true&status=waiting_qc'), request(`/api/qc?page=1&limit=${QC_HISTORY_PAGE_SIZE}`)])
      .then(([ls, hs]) => {
        if (mounted) { setLaptops(sortWaitingLaptops(ls)); setHistory(hs.data || []); setHistoryTotal(hs.total || 0); }
      }).catch(e => { if (mounted) setError(e.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);
  const changeHistoryPage = updater => {
    const nextPage = typeof updater === 'function' ? updater(historyPage) : updater;
    if (nextPage === historyPage || nextPage < 1) return;
    setHistoryPage(nextPage); loadHistory(nextPage).catch(e => setError(e.message));
  };
  const laptopPages = useListPagination(laptops);
  const historyPageCount = Math.max(1, Math.ceil(historyTotal / QC_HISTORY_PAGE_SIZE));
  const laptopsByReceivedDay = useMemo(() => laptopPages.pageRows.reduce((groups, laptop) => {
    const receivedAt = laptopReceivedTime(laptop);
    const key = qcDayKey(receivedAt);
    const group = groups.find(item => item.key === key);
    if (group) group.items.push(laptop);
    else groups.push({ key, label: formatQcDay(receivedAt, 'Chưa rõ ngày nhận'), items: [laptop] });
    return groups;
  }, []), [laptopPages.pageRows]);
  const historyByDay = useMemo(() => history.reduce((groups, inspection) => {
    const key = qcDayKey(qcTime(inspection));
    const group = groups.find(item => item.key === key);
    if (group) group.items.push(inspection);
    else groups.push({ key, label: formatQcDay(qcTime(inspection)), items: [inspection] });
    return groups;
  }, []), [history]);
  const open = async q => {
    const data = await request(`/api/qc?id=${q.id}`);
    if (!data.inspection) throw new Error('Không tìm thấy phiên QC');
    setActive(data.inspection); setItems(data.items || []); setChoice('');
    setDetails({ ...data.inspection.laptops?.qc_details, serialNumber: data.inspection.laptops?.serial || '', batteryHealth: data.inspection.laptops?.battery_health ?? '' });
    setNotes(data.inspection.laptops?.condition_note ?? data.inspection.overall_notes ?? ''); completionKey.current = crypto.randomUUID();
    setError(''); setMessage('');
  };
  const inspect = async laptop => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const q = history.find(x => String(x.laptop_id) === String(laptop.id) && x.status === 'IN_PROGRESS')
        || await request('/api/qc', { method: 'POST', body: JSON.stringify({ action: 'start', laptopId: Number(laptop.id), idempotencyKey: crypto.randomUUID() }) });
      await open(q); await load();
    } catch (e) { setError(e.message); } finally { busy.current = false; setSaving(false); }
  };
  const complete = async e => {
    e.preventDefault(); if (!choice || busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await request('/api/qc', { method: 'POST', body: JSON.stringify({ action: 'quick-complete', inspectionId: active.id, disposition: choice, notes, details, idempotencyKey: completionKey.current }) });
      setActive(null); setMessage(`Đã hoàn tất QC: ${OUTCOMES.find(x => x.key === choice).label}.`); await load();
    } catch (err) { setError(err.message); } finally { busy.current = false; setSaving(false); }
  };
  return <div className="qc-page">
    <header className="qc-header"><div><span>KIỂM TRA CHẤT LƯỢNG</span><h1>QC sản phẩm</h1><p>Chọn kết quả để hoàn tất QC và chuyển máy sang bước tiếp theo.</p></div><div className="qc-score"><ClipboardCheck /><strong>{laptops.length}</strong><small>máy chờ QC</small></div></header>
    {!active && error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status" className="quick-qc-success">{message}</p>}
    <section className="qc-grid"><div className="qc-panel"><div className="qc-panel-title"><h2>Hàng chờ QC</h2><span>{laptops.length} máy</span></div>
      <div className="qc-waiting-days">{laptopsByReceivedDay.map(group => <section className="qc-waiting-day" key={group.key}>
        <header><strong>{group.label}</strong><span>{group.items.length} máy</span></header>
        {group.items.map(l => {
          const tone = supplierTone(l.seller);
          return <article className="qc-machine" key={l.id}>
            <div>
              <strong className="qc-machine-title">#{l.id} <i>·</i> {l.name}</strong>
              <small className="qc-machine-meta">
                <span>Serial: {l.serial || 'Chưa có'}</span>
                <span className="qc-supplier-badge" style={{ '--seller-bg': tone.bg, '--seller-color': tone.color }}>{l.seller || 'Chưa rõ nhà cung cấp'}</span>
              </small>
            </div>
            <button disabled={saving} onClick={() => inspect(l)}>Chọn kết quả</button>
          </article>;
        })}
      </section>)}</div>
      {!laptops.length && <div className="qc-empty">{loading ? 'Đang tải…' : 'Không có máy chờ QC.'}</div>}<ListPagination {...laptopPages} /></div>
      <div className="qc-panel"><div className="qc-panel-title"><h2>Lịch sử QC</h2><span>{historyTotal} phiên</span></div>
      <div className="qc-history-days">{historyByDay.map(group => <section className="qc-history-day" key={group.key}><header><strong>{group.label}</strong><span>{group.items.length} phiên</span></header>{group.items.map(q => { const visual = historyVisual(q); const ResultIcon = visual.icon; return <button className={`qc-history ${visual.key}`} key={q.id} disabled={saving} onClick={() => open(q).catch(e => setError(e.message))}><span className={`qc-result ${visual.key}`}><ResultIcon /></span><span className="qc-history-main"><strong className="qc-history-title">#{q.laptop_id} <i>·</i> {q.laptops?.name || 'Laptop'}</strong><small className="qc-history-meta"><b>Serial: {q.laptops?.serial || q.laptops?.sku || 'Chưa có'}</b><i>·</i><span>{q.completed_by || q.started_by || 'Không rõ người thực hiện'}</span><i>·</i><time>{formatQcHour(qcTime(q))}</time></small></span><b className={`qc-history-status ${visual.key}`}>{visual.label || 'Đang kiểm tra'}</b></button>})}</section>)}</div><ListPagination page={historyPage} setPage={changeHistoryPage} pageCount={historyPageCount} total={historyTotal} pageSize={QC_HISTORY_PAGE_SIZE} /></div></section>
    {active && <div className="modal-backdrop active"><form className="qc-modal quick-qc-modal" onSubmit={complete} role="dialog" aria-modal="true" aria-labelledby="quick-qc-title">
      <header><div><small>{active.inspection_code}</small><h2 id="quick-qc-title">{active.laptops?.name}</h2><p>{active.laptops?.serial || 'Chưa có serial'} · {active.started_by}</p></div><button type="button" aria-label="Đóng QC" disabled={saving} onClick={() => setActive(null)}><X /></button></header>
      {error && <p className="quick-qc-error" role="alert">{error}</p>}
      {active.status === 'IN_PROGRESS' ? <><fieldset className="quick-qc-options" disabled={saving}><legend>Kết quả QC</legend>{OUTCOMES.map(({ key, label, detail, icon: Icon }) => <label key={key} className={`quick-qc-option ${key} ${choice === key ? 'selected' : ''}`}><input type="radio" name="disposition" value={key} checked={choice === key} onChange={() => setChoice(key)} required /><Icon size={22} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}</fieldset>
        <QCDetailsFields value={details} onChange={setDetails} disabled={saving} />
        <label className="quick-qc-notes">Ghi chú chung của laptop <span>(dùng chung với lô mua hàng)</span><textarea value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} rows={3} disabled={saving} /></label>
        <footer><span>{OUTCOMES.find(x => x.key === choice)?.detail || 'Chọn một kết quả để tiếp tục'}</span><button disabled={!choice || saving}>{saving ? 'Đang lưu…' : 'Hoàn tất QC'}</button></footer></>
      : <><QCDetailsFields value={details} onChange={setDetails} disabled /><div className="qc-readonly"><h3>{outcomeFor(active)?.label || active.status}</h3><p>{active.laptops?.condition_note || 'Không có ghi chú'}</p>
        {active.disposition === 'REPAIR' && <Link href="/repairs">Mở danh sách sửa chữa →</Link>}{active.disposition === 'RETURN_CN' && <Link href="/supplier-returns">Mở danh sách trả nhà cung cấp →</Link>}
        {!active.disposition && items.length > 0 && <details><summary>Checklist đã lưu</summary>{items.map(x => <p key={x.id}>{repairMojibake(x.label)}: {CHECK_LABELS[x.result]} {x.note}</p>)}</details>}</div></>}
    </form></div>}
  </div>;
}
