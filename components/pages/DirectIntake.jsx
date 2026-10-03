'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { computeImportPrice, useInventory } from '@/context/InventoryContext';
import { useAuth } from '@/context/AuthContext';
import { ChevronDown, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { getAuthHeaders } from '@/lib/apiFetchers';
import { formatRmb } from '@/lib/procurement';
import ProductNameInput from '@/components/common/ProductNameInput';
import PurchaseDayTables from './PurchaseDayTables';
import './direct-intake.css';
import './direct-intake-compact.css';
import './intake-cards.css';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const blankLaptop = category => ({ name: '', category: category || '', purchase_price_rmb: '', shipping_rmb: '0', import_price_vnd: '', tracking_code_cn: '', serial: '', notes: '' });
const STATUS = { in_transit: 'Chưa về hàng', waiting_qc: 'Chờ QC', available: 'Sẵn hàng', reserved: 'Đã cọc', sold: 'Đã bán', repair: 'Đang sửa chữa', supplier_return: 'Back lại NCC', ignored: 'Bỏ qua' };

async function callApi(body, search = '') {
  const response = await fetch(`/api/intake${body ? '' : search}`, { method: body ? 'POST' : 'GET', headers: await getAuthHeaders(), ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không thể xử lý dữ liệu nhập hàng');
  return data;
}

export default function DirectIntake({ receiving = false, batchId = '' }) {
  const [data, setData] = useState({ batches: [], laptops: [], unresolved: [], receipts: [], suppliers: [], categories: [] });
  const { selectedMonth, setSelectedMonth, availableMonths, formulaConfig } = useInventory();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canUseQc = ['ADMIN', 'TECH', 'TECHNICAL', 'SALES_TECH'].includes(user?.role);
  const [purchaseMonths, setPurchaseMonths] = useState([]);
  useEffect(() => {
    if (receiving || batchId) return;
    let active = true;
    getAuthHeaders().then(headers => fetch('/api/months?scope=purchases', { headers }))
      .then(response => response.ok ? response.json() : [])
      .then(months => { if (active) setPurchaseMonths(months); }).catch(() => {});
    return () => { active = false; };
  }, [receiving, batchId]);
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState(receiving ? 'in_transit' : 'all');
  const [draft, setDraft] = useState(null), [rows, setRows] = useState([blankLaptop()]), [pasteText, setPasteText] = useState('');
  const [selected, setSelected] = useState({}), [receivedDate, setReceivedDate] = useState(today()), [unknownRows, setUnknownRows] = useState([]), [notes, setNotes] = useState('');
  const [expandedDates, setExpandedDates] = useState({}), [expandedBatches, setExpandedBatches] = useState({}), [editing, setEditing] = useState(null);
  const [addingToBatch, setAddingToBatch] = useState(null);
  const busy = useRef(false), receiptKey = useRef(null);

  const load = useCallback(async (options) => {
    if (!receiving && !batchId && !isAdmin) {
      setLoading(false);
      setError('');
      return;
    }
    const background = options?.background === true;
    if (!background) setLoading(true);
    try {
      const result = await callApi(null, batchId ? `?batchId=${encodeURIComponent(batchId)}` : receiving ? '?all=true&mode=receiving' : selectedMonth === 'ALL' ? '?all=true' : `?monthKey=${encodeURIComponent(selectedMonth)}`);
      setData(current => ({ ...current, ...result, categories: result.categories || [] }));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      if (!background) setLoading(false);
    }
  }, [batchId, receiving, selectedMonth, isAdmin]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const batchById = useMemo(() => new Map(data.batches.map(x => [String(x.id), x])), [data.batches]);
  const incoming = useMemo(() => data.laptops.filter(x => x.status === 'in_transit'), [data.laptops]);
  const visible = useMemo(() => data.laptops.filter(laptop => {
    if (batchId && String(laptop.purchase_batch_id) !== batchId) return false;
    const batch = batchById.get(String(laptop.purchase_batch_id));
    const text = `${laptop.id} ${laptop.name} ${laptop.serial || ''} ${laptop.tracking_code_cn || ''} ${batch?.batch_code || ''} ${batch?.supplier_name || ''}`.toLocaleLowerCase('vi');
    return (filter === 'all' || laptop.status === filter) && (!receiving || laptop.status === 'in_transit') && text.includes(query.trim().toLocaleLowerCase('vi'));
  }), [batchById, data.laptops, filter, query, receiving, batchId]);
  const grouped = useMemo(() => {
    const dates = new Map();
    for (const laptop of visible) {
      const batch = batchById.get(String(laptop.purchase_batch_id));
      const date = batch?.purchase_date || 'Không rõ ngày';
      if (!dates.has(date)) dates.set(date, new Map());
      const key = String(batch?.id || 'unknown');
      if (!dates.get(date).has(key)) dates.get(date).set(key, { batch, laptops: [] });
      dates.get(date).get(key).laptops.push(laptop);
    }
    return [...dates.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, batches]) => ({ date, batches: [...batches.values()] }));
  }, [batchById, visible]);

  async function mutate(payload, success) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(''); setMessage('');
    try { await callApi(payload); success?.(); await load({ background: true }); } catch (e) { setError(e.message); } finally { busy.current = false; setPending(false); }
  }
  const updateRow = (index, key, value) => setRows(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const calculatedImportPrice = row => computeImportPrice(
    row.purchase_price_rmb,
    row.shipping_rmb,
    draft?.purchase_exchange_rate,
    formulaConfig
  );
  const rowsForSave = () => rows.map(row => ({
    ...row,
    import_price_vnd: row.import_price_vnd === '' ? calculatedImportPrice(row) : Number(row.import_price_vnd)
  }));
  function importPaste() {
    const parsed = pasteText.split(/\r?\n/).filter(Boolean).map(line => {
      const [name = '', category = '', price = '', tracking = '', shipping = '0', serial = '', note = '', importPrice = ''] = line.split('\t');
      const categoryOption = data.categories.find(option => option.option_key === category.trim() || option.label.toLocaleLowerCase('vi') === category.trim().toLocaleLowerCase('vi'));
      return { name: name.trim(), category: categoryOption?.option_key || data.categories[0]?.option_key || '', purchase_price_rmb: price.trim(), shipping_rmb: shipping.trim() || '0', import_price_vnd: importPrice.trim(), tracking_code_cn: tracking.trim(), serial: serial.trim(), notes: note.trim() };
    }).filter(row => row.name);
    if (parsed.length) { setRows(parsed); setPasteText(''); }
  }
  function submitReceipt() {
    receiptKey.current ||= crypto.randomUUID();
    const expected = Object.entries(selected).map(([laptopId, item]) => ({ laptop_id: Number(laptopId), serial: item.serial, notes: item.notes, received_at: receivedDate }));
    const unknown = unknownRows.map(row => ({ ...row, received_at: receivedDate }));
    mutate({ action: 'receive', key: receiptKey.current, expected, unknown, notes }, () => {
      receiptKey.current = null; setSelected({}); setUnknownRows([]); setNotes('');
      setMessage(`Đã nhận ${expected.length + unknown.length} máy và chuyển sang Chờ QC.`);
    });
  }

  if (!receiving && !batchId && !isAdmin) return <main className="intake-page">
    <section className="intake-panel" style={{ margin: '24px' }}>
      <h2>Không có quyền truy cập</h2>
      <p>Lô mua hàng và thông tin giá nhập chỉ dành cho tài khoản Admin.</p>
      <Link className="btn btn-primary" href="/receiving">Đi đến Nhận hàng</Link>
    </section>
  </main>;

  return <main className={`intake-page ${receiving ? 'intake-receiving-page' : ''}`}>
    <header className="intake-header"><div><p>PROCUREMENT / CITILAP</p><h1>{receiving ? 'Nhận hàng' : 'Lô mua hàng'}</h1><span>{receiving ? 'Tìm mã kiện · Chọn máy · Chuyển QC' : 'Theo dõi nhà cung cấp, giá mua và tiến độ nhận hàng.'}</span></div><nav>{isAdmin && <Link href="/purchases">Lô mua</Link>}<Link href="/receiving">Nhận hàng</Link>{canUseQc && <Link href="/qc">QC →</Link>}{isAdmin && <Link href="/suppliers">Nhà cung cấp</Link>}</nav></header>
    <section className="intake-stats"><div><small>Lô mua</small><b>{data.batches.length}</b></div><div><small>Chưa về hàng</small><b>{incoming.length}</b></div><div><small>Chờ QC</small><b>{data.laptops.filter(x => x.status === 'waiting_qc').length}</b></div><div><small>Chưa rõ nguồn</small><b>{data.unresolved.filter(x => x.status !== 'ignored').length}</b></div></section>
    {error && <p role="alert" className="intake-error">{error}</p>}{message && <p role="status" className="intake-success">{message}</p>}

    <div className="intake-toolbar">{!receiving && !batchId && <select aria-label="Tháng mua hàng" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>{[...new Set([selectedMonth, ...availableMonths, ...purchaseMonths])].filter(m => m !== 'ALL').map(month => <option key={month} value={month}>{month}</option>)}<option value="ALL">Tất cả tháng</option></select>}{receiving && <span>Máy chưa về · Tất cả tháng</span>}<input aria-label="Tìm theo mã vận chuyển, tên máy, serial hoặc lô" placeholder="Tìm tracking, tên máy, serial, lô…" value={query} onChange={e => setQuery(e.target.value)} />{!receiving && <select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tất cả trạng thái</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}<button onClick={load}>Tải lại</button>{!receiving && <button className="intake-primary" onClick={() => { setDraft({ supplier_id: '', purchase_date: today(), purchase_exchange_rate: 3550, notes: '', key: crypto.randomUUID() }); setRows([blankLaptop(data.categories[0]?.option_key)]); }}>+ Tạo lô mua</button>}</div>

    <div className="intake-list-meta"><span>{visible.length} máy phù hợp</span></div>
    {draft && <form className="intake-panel intake-create" onSubmit={e => { e.preventDefault(); mutate({ action: 'create', batch: draft, laptops: rowsForSave(), key: draft.key }, () => { setDraft(null); setMessage('Đã tạo lô mua và các laptop ở trạng thái Chưa về hàng.'); }); }}>
      <div className="intake-panel-title"><div><small>LÔ MUA MỚI</small><h2>Thông tin lô</h2></div><button type="button" onClick={() => setDraft(null)}>Đóng</button></div>
      <div className="intake-fields"><label>Nhà cung cấp<select required value={draft.supplier_id} onChange={e => setDraft({ ...draft, supplier_id: e.target.value })}><option value="">Chọn nhà cung cấp</option>{data.suppliers.map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label><label>Ngày mua<input required type="date" value={draft.purchase_date} onChange={e => setDraft({ ...draft, purchase_date: e.target.value })} /></label><label>Tỷ giá VND/CNY<input required type="number" min="1" value={draft.purchase_exchange_rate} onChange={e => setDraft({ ...draft, purchase_exchange_rate: e.target.value })} /></label><label className="wide">Ghi chú lô<input value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label></div>

      <div className="intake-paste"><textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder={'Dán nhiều dòng từ Excel: Tên máy[TAB]Phân loại[TAB]Giá CNY[TAB]Tracking[TAB]Ship CNY[TAB]Serial[TAB]Ghi chú[TAB]Giá nhập VNĐ (tùy chọn)'} /><button type="button" onClick={importPaste}>Nhập bảng đã dán</button></div>
      <div className="intake-scroll intake-create-table"><table><colgroup><col className="col-index"/><col className="col-name"/><col className="col-category"/><col className="col-cny"/><col className="col-cny"/><col className="col-import"/><col className="col-tracking"/><col className="col-serial"/><col className="col-note"/><col className="col-actions"/></colgroup><thead><tr><th>#</th><th>Tên máy</th><th>Phân loại máy</th><th>Giá CNY</th><th>Ship CNY</th><th>Giá nhập (triệu VNĐ)</th><th>Mã vận chuyển TQ</th><th>Serial</th><th>Ghi chú</th><th /></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{index + 1}</td><td className="intake-name-cell"><ProductNameInput required value={row.name} onValueChange={value => updateRow(index, 'name', value)} /></td><td><select required value={row.category} onChange={e => updateRow(index, 'category', e.target.value)}><option value="">Chọn phân loại</option>{data.categories.map(option => <option key={option.option_key} value={option.option_key}>{option.label}</option>)}</select></td><td><input type="number" min="0" step="0.01" required value={row.purchase_price_rmb} onChange={e => updateRow(index, 'purchase_price_rmb', e.target.value)} /></td><td><input type="number" min="0" step="0.01" value={row.shipping_rmb} onChange={e => updateRow(index, 'shipping_rmb', e.target.value)} /></td><td><input className={row.import_price_vnd === '' ? 'is-calculated' : ''} type="number" min="0" step="0.01" value={row.import_price_vnd === '' ? calculatedImportPrice(row) : row.import_price_vnd} onChange={e => updateRow(index, 'import_price_vnd', e.target.value)} title="Tự tính theo giá CNY, ship, tỷ giá và cấu hình phí; có thể nhập đè" /></td>{['tracking_code_cn','serial','notes'].map(field => <td key={field}><input type="text" value={row[field]} onChange={e => updateRow(index, field, e.target.value)} /></td>)}<td className="intake-row-actions"><button type="button" title="Nhân bản" onClick={() => setRows([...rows.slice(0, index + 1), { ...row, serial: '', tracking_code_cn: '' }, ...rows.slice(index + 1)])}><Copy size={15} /></button><button type="button" title="Xóa" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
      <footer><button type="button" onClick={() => setRows([...rows, blankLaptop(data.categories[0]?.option_key)])}><Plus size={15} /> Thêm máy</button><b>{rows.length} máy · {formatRmb(rows.reduce((s, x) => s + Number(x.purchase_price_rmb || 0), 0))}</b><button className="intake-primary" disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu lô mua'}</button></footer>
    </form>}

    <div className="intake-workspace">
    {receiving && <section className="intake-panel intake-receive"><div className="intake-panel-title"><div><small>PHIẾU NHẬN</small><h2>Máy nhận trong đợt này</h2></div><label>Ngày nhận<input type="date" max={today()} value={receivedDate} onChange={e => setReceivedDate(e.target.value)} /></label></div><p>Tìm bằng mã vận chuyển trên kiện, chọn đúng laptop rồi cập nhật serial và ghi chú chung của máy.</p>{Object.entries(selected).map(([id, item]) => { const laptop = incoming.find(x => String(x.id) === id); return <div className="receive-chip" key={id}><b>{laptop?.tracking_code_cn || 'Chưa tracking'}</b><span>{laptop?.name}</span><input placeholder="Serial thực nhận" value={item.serial} onChange={e => setSelected(current => ({ ...current, [id]: { ...current[id], serial: e.target.value } }))} /><input placeholder="Ghi chú chung của máy" value={item.notes} onChange={e => setSelected(current => ({ ...current, [id]: { ...current[id], notes: e.target.value } }))} /><button onClick={() => setSelected(current => { const next = { ...current }; delete next[id]; return next; })}>×</button></div>; })}<button onClick={() => setUnknownRows([...unknownRows, { name: '', serial: '', tracking_code_cn: '', notes: '' }])}>+ Máy chưa rõ nguồn</button>{unknownRows.map((row, index) => <div className="intake-fields" key={index}>{[['name','Tên máy'],['serial','Serial'],['tracking_code_cn','Mã trên kiện'],['notes','Ghi chú']].map(([field,label]) => <label key={field}>{label}<input value={row[field]} onChange={e => setUnknownRows(unknownRows.map((x,i) => i === index ? { ...x, [field]: e.target.value } : x))} /></label>)}<button onClick={() => setUnknownRows(unknownRows.filter((_,i) => i !== index))}>Bỏ</button></div>)}<label className="intake-notes">Ghi chú đợt nhận<textarea value={notes} onChange={e => setNotes(e.target.value)} /></label><button className="intake-primary" disabled={pending || Object.keys(selected).length + unknownRows.length === 0 || unknownRows.some(x => !x.name.trim())} onClick={submitReceipt}>Xác nhận nhận {Object.keys(selected).length + unknownRows.length} máy → Chờ QC</button></section>}

    {loading ? <p>Đang tải…</p> : !receiving ? <PurchaseDayTables groups={grouped} categories={data.categories} formulaConfig={formulaConfig} mutate={mutate} pending={pending} onEdit={setEditing} statuses={STATUS} /> : <section className="intake-tree">
      {grouped.map(group => {
        const openDate = expandedDates[group.date] ?? true;
        const count = group.batches.reduce((total, item) => total + item.laptops.length, 0);
        const received = group.batches.reduce((total, item) => total + item.laptops.filter(laptop => laptop.received_at).length, 0);
        return <article key={group.date} className="intake-date-group">
          <button className="intake-date-head" onClick={() => setExpandedDates({ ...expandedDates, [group.date]: !openDate })}>
            {openDate ? <ChevronDown /> : <ChevronRight />}
            <strong>{group.date === 'Không rõ ngày' ? group.date : new Date(`${group.date}T00:00:00`).toLocaleDateString('vi-VN')}</strong>
            <span>{group.batches.length} lô · {count} máy · {received}/{count} đã nhận</span>
          </button>
          {openDate && group.batches.map(({ batch, laptops }) => {
            const batchKey = String(batch?.id || 'unknown');
            const openBatch = expandedBatches[batchKey] ?? true;
            return <div className="intake-batch" key={batchKey}>
              <button className="intake-batch-head" onClick={() => setExpandedBatches({ ...expandedBatches, [batchKey]: !openBatch })}>
                {openBatch ? <ChevronDown /> : <ChevronRight />}
                <div><b>{batch?.batch_code || 'Chưa rõ lô'} · {batch?.supplier_name || 'Chưa rõ NCC'}</b><small>{laptops.length} máy{isAdmin ? ` · ${formatRmb(laptops.reduce((sum, laptop) => sum + Number(laptop.purchase_price_rmb || 0), 0))}` : ''}</small></div>
                <span className="intake-progress">{laptops.filter(laptop => laptop.received_at).length}/{laptops.length} đã nhận<progress aria-label="Tiến độ nhận hàng" max={laptops.length} value={laptops.filter(laptop => laptop.received_at).length} /></span>
              </button>
              {openBatch && <>
                {isAdmin && <div className="intake-batch-actions"><button type="button" onClick={() => setAddingToBatch({ batch, data: blankLaptop(data.categories[0]?.option_key), key: crypto.randomUUID() })}><Plus size={14} /> Thêm máy vào lô</button></div>}
                <div className="intake-scroll"><table><thead><tr><th>Nhận</th><th>Mã VC</th><th>Tên máy</th><th>Phân loại</th><th>Serial</th>{isAdmin && <th>Giá / ship</th>}<th>Trạng thái</th>{isAdmin && <th />}</tr></thead><tbody>
                  {laptops.map(laptop => <tr key={laptop.id} className={`status-${laptop.status} ${Object.hasOwn(selected, laptop.id) ? 'intake-selected-row' : ''}`}>
                    <td><input type="checkbox" checked={Object.hasOwn(selected, laptop.id)} onChange={event => setSelected(current => { const next = { ...current }; if (event.target.checked) next[laptop.id] = { serial: laptop.serial || '', notes: laptop.condition_note || '' }; else delete next[laptop.id]; return next; })} /></td>
                    <td><code>Mã VC: {laptop.tracking_code_cn || '—'}</code></td>
                    <td><b>#{laptop.id} · {laptop.name}</b><small>{laptop.condition_note}</small></td>
                    <td>{data.categories.find(option => option.option_key === laptop.category)?.label || laptop.category || '—'}</td>
                    <td>Serial: {laptop.serial || '—'}</td>
                    {isAdmin && <td>{formatRmb(laptop.purchase_price_rmb)}<small>Ship {formatRmb(laptop.shipping_rmb)}</small></td>}
                    <td><span className={`intake-status intake-status-${laptop.status}`}>{STATUS[laptop.status] || laptop.status}</span></td>
                    {isAdmin && <td><button title="Sửa dữ liệu mua hàng" onClick={() => setEditing({ laptopId: laptop.id, data: { name: laptop.name, category: laptop.category || data.categories[0]?.option_key || '', purchase_price_rmb: laptop.purchase_price_rmb, shipping_rmb: laptop.shipping_rmb, import_price_vnd: laptop.import_price_vnd ?? computeImportPrice(laptop.purchase_price_rmb, laptop.shipping_rmb, laptop.purchase_exchange_rate, formulaConfig), tracking_code_cn: laptop.tracking_code_cn || '', serial: laptop.serial || '', notes: laptop.condition_note || '', purchase_batch_id: laptop.purchase_batch_id } })}><Pencil size={15} /></button></td>}
                  </tr>)}
                </tbody></table></div>
              </>}
            </div>;
          })}
        </article>;
      })}
      {!grouped.length && <p>Không có laptop phù hợp.</p>}
    </section>}

    </div>
    {addingToBatch && <div className="intake-modal"><form className="intake-panel intake-edit-panel" onSubmit={event => { event.preventDefault(); const row=addingToBatch.data; mutate({ action: 'addToBatch', batchId: addingToBatch.batch.id, laptop: { ...row, import_price_vnd: row.import_price_vnd === '' ? computeImportPrice(row.purchase_price_rmb,row.shipping_rmb,addingToBatch.batch.exchange_rate,formulaConfig) : Number(row.import_price_vnd) }, key: addingToBatch.key }, () => { setAddingToBatch(null); setMessage(`Đã thêm máy vào lô ${addingToBatch.batch.batch_code}.`); }); }}><h2>Thêm máy vào lô · {addingToBatch.batch.batch_code}</h2><div className="intake-fields intake-edit-fields"><label>Tên máy<ProductNameInput required value={addingToBatch.data.name} onValueChange={value => setAddingToBatch(current => ({ ...current, data: { ...current.data, name: value } }))} /></label><label>Phân loại máy<select required value={addingToBatch.data.category} onChange={e => setAddingToBatch(current => ({ ...current, data: { ...current.data, category: e.target.value } }))}><option value="">Chọn phân loại</option>{data.categories.map(option => <option key={option.option_key} value={option.option_key}>{option.label}</option>)}</select></label><label>Giá CNY<input required type="number" min="0" step="0.01" value={addingToBatch.data.purchase_price_rmb} onChange={e => setAddingToBatch(current => ({ ...current, data: { ...current.data, purchase_price_rmb: e.target.value } }))} /></label><label>Ship CNY<input type="number" min="0" step="0.01" value={addingToBatch.data.shipping_rmb} onChange={e => setAddingToBatch(current => ({ ...current, data: { ...current.data, shipping_rmb: e.target.value } }))} /></label><label>Giá nhập (triệu VNĐ)<input type="number" min="0" step="0.01" value={addingToBatch.data.import_price_vnd === '' ? computeImportPrice(addingToBatch.data.purchase_price_rmb,addingToBatch.data.shipping_rmb,addingToBatch.batch.exchange_rate,formulaConfig) : addingToBatch.data.import_price_vnd} onChange={e => setAddingToBatch(current => ({ ...current, data: { ...current.data, import_price_vnd: e.target.value } }))} /></label><label>Mã vận chuyển TQ<input value={addingToBatch.data.tracking_code_cn} onChange={e => setAddingToBatch(current => ({ ...current, data: { ...current.data, tracking_code_cn: e.target.value } }))} /></label><label>Serial<input value={addingToBatch.data.serial} onChange={e => setAddingToBatch(current => ({ ...current, data: { ...current.data, serial: e.target.value } }))} /></label><label>Ghi chú<input value={addingToBatch.data.notes} onChange={e => setAddingToBatch(current => ({ ...current, data: { ...current.data, notes: e.target.value } }))} /></label></div><footer><button type="button" onClick={() => setAddingToBatch(null)}>Đóng</button><button className="intake-primary" disabled={pending}>{pending ? 'Đang lưu…' : 'Thêm vào lô'}</button></footer></form></div>}    {editing && <div className="intake-modal"><form className="intake-panel intake-edit-panel" onSubmit={e => { e.preventDefault(); mutate({ action: 'edit', ...editing }, () => { setEditing(null); setMessage('Đã cập nhật dữ liệu mua hàng và ghi nhật ký thay đổi.'); }); }}><h2>Sửa dữ liệu mua hàng · Laptop #{editing.laptopId}</h2><div className="intake-fields intake-edit-fields"><label>Tên máy<ProductNameInput required value={editing.data.name} onValueChange={value => setEditing({ ...editing, data: { ...editing.data, name: value } })} /></label><label>Phân loại máy<select required value={editing.data.category} onChange={e => setEditing({ ...editing, data: { ...editing.data, category: e.target.value } })}><option value="">Chọn phân loại</option>{data.categories.map(option => <option key={option.option_key} value={option.option_key}>{option.label}</option>)}</select></label><label>Giá CNY<input required type="number" min="0" step="0.01" value={editing.data.purchase_price_rmb} onChange={e => setEditing({ ...editing, data: { ...editing.data, purchase_price_rmb: e.target.value } })} /></label><label>Ship CNY<input type="number" min="0" step="0.01" value={editing.data.shipping_rmb} onChange={e => setEditing({ ...editing, data: { ...editing.data, shipping_rmb: e.target.value } })} /></label><label>Giá nhập (triệu VNĐ)<input type="number" min="0" step="0.01" value={editing.data.import_price_vnd} onChange={e => setEditing({ ...editing, data: { ...editing.data, import_price_vnd: e.target.value } })} /></label><label>Mã vận chuyển TQ<input value={editing.data.tracking_code_cn} onChange={e => setEditing({ ...editing, data: { ...editing.data, tracking_code_cn: e.target.value } })} /></label><label>Serial<input value={editing.data.serial} onChange={e => setEditing({ ...editing, data: { ...editing.data, serial: e.target.value } })} /></label><label>Ghi chú<input value={editing.data.notes} onChange={e => setEditing({ ...editing, data: { ...editing.data, notes: e.target.value } })} /></label><label className="intake-edit-batch">Chuyển sang lô<select value={editing.data.purchase_batch_id || ''} onChange={e => setEditing({ ...editing, data: { ...editing.data, purchase_batch_id: Number(e.target.value) } })}>{data.batches.map(x => <option key={x.id} value={x.id}>{x.batch_code} · {x.supplier_name}</option>)}</select></label></div><footer><button type="button" onClick={() => setEditing(null)}>Đóng</button><button className="intake-primary" disabled={pending}>Lưu thay đổi</button></footer></form></div>}
  </main>;
}


