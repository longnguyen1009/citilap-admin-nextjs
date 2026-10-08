'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Repeat2, Plus, RefreshCw, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getAuthHeaders } from '@/lib/apiFetchers';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const labels = { WALK_IN: 'Khách lẻ bán máy', BUYBACK: 'Thu lại từ đơn cũ', EXCHANGE: 'Đổi máy / lên đời' };
const money = value => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
async function api(path, options = {}) {
  const response = await fetch(`/api/trade-ins${path}`, { ...options, headers: { ...await getAuthHeaders(), 'Content-Type': 'application/json' } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Không thể xử lý yêu cầu');
  return result;
}

export default function TradeIns() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api(`?q=${encodeURIComponent(search)}&page=${page}`, { signal: controller.signal })
      .then(setData).catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, search, version]);
  const refresh = () => { setLoading(true); setError(''); setVersion(v => v + 1); };
  return <main className="salesops-page">
    <header className="salesops-hero"><div className="salesops-title"><Repeat2/><div><span>THU ĐỔI</span><h1>Thu cũ đổi mới</h1><p>Nhận máy từ khách hoặc đổi sang máy khác trong kho.</p></div></div><Button variant="outline" onClick={refresh}><RefreshCw size={16}/> Đồng bộ</Button></header>
    <form noValidate className="salesops-toolbar" onSubmit={e => { e.preventDefault(); setLoading(true); setPage(1); setSearch(query); setVersion(v => v + 1); }}>
      <Input aria-label="Tìm hồ sơ thu đổi" placeholder="Mã hồ sơ, tên máy, Serial…" value={query} onChange={e => setQuery(e.target.value)}/>
      {query && <Button type="button" variant="ghost" aria-label="Xóa tìm kiếm" onClick={() => { setQuery(''); setSearch(''); setPage(1); }}><X size={16}/></Button>}
      <Button variant="outline"><Search size={16}/> Tìm</Button>
      {user?.role === 'ADMIN' && <Button type="button" onClick={() => setOpen(true)}><Plus size={16}/> Thu máy / đổi máy</Button>}
    </form>
    {error && <p role="alert" className="error-message">{error} <Button variant="outline" onClick={refresh}>Thử lại</Button></p>}
    {loading ? <div role="status" className="salesops-empty">Đang tải hồ sơ…</div> : !data.rows.length ? <div className="salesops-empty">Chưa có hồ sơ phù hợp.</div> : <div className="salesops-grid">{data.rows.map(row => <article className="salesops-card" key={row.id}>
      <header><div><small>{row.trade_in_code} · {labels[row.workflow] || 'Hồ sơ cũ'}</small><h3>{row.model}</h3></div><span>{row.status === 'CONVERTED_TO_INVENTORY' ? 'Đã nhập kho' : row.status}</span></header>
      <p><b>{row.serial || 'Chưa có Serial'}</b>{row.seller_name && <> · {row.seller_name} {row.seller_phone}</>}</p>
      <dl><div><dt>Laptop nhập kho</dt><dd>#{row.inventory_laptop_id || row.original_laptop_id || '—'}</dd></div><div><dt>Ngày nhận</dt><dd>{new Date(row.created_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</dd></div></dl>
      {row.order_id && <p>Đơn gốc #{row.order_id}{row.new_order_id && <> → Đơn mới #{row.new_order_id} · Giá thu {money(row.agreed_value_vnd)}</>}</p>}
    </article>)}</div>}
    <div className="flex items-center justify-end gap-3 py-4"><span>{data.total} hồ sơ · Trang {page}</span><Button variant="outline" disabled={page === 1 || loading} onClick={() => { setLoading(true); setPage(p => p - 1); }}>Trước</Button><Button variant="outline" disabled={page * 20 >= data.total || loading} onClick={() => { setLoading(true); setPage(p => p + 1); }}>Sau</Button></div>
    {open && <ReceiveDialog onClose={() => setOpen(false)} onSuccess={() => { setOpen(false); refresh(); toast.success('Đã ghi nhận thu đổi và cập nhật kho'); }}/>} 
  </main>;
}

function EntitySearch({ type, title, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  const input = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const search = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError('');
    try { const result = await api(`?type=${type}&q=${encodeURIComponent(query)}`, { signal: controller.signal }); if (!controller.signal.aborted) setRows(result); }
    catch (err) { if (err.name !== 'AbortError') setError(err.message); }
    finally { if (!controller.signal.aborted) setPending(false); }
  };
  return <fieldset className="rounded-lg border border-input p-3"><legend className="px-1 text-sm font-semibold">{title}</legend>
    {selected ? <div className="flex items-start justify-between gap-3"><div><b>#{selected.id} · {selected.name}</b><p className="text-sm">{selected.serial} {type === 'orders' && <>· {selected.customer_name || selected.customer_info} · {selected.customer_phone}</>}</p></div><Button type="button" variant="outline" onClick={() => onSelect(null)}>Chọn lại</Button></div> : <>
      <div className="flex gap-2"><Input ref={input} value={query} onChange={e => setQuery(e.target.value)} aria-label={title} placeholder={type === 'orders' ? 'Tên khách, SĐT, mã đơn hoặc Serial' : 'Tên máy hoặc Serial'} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); search(); } }}/>
        {query && <Button type="button" variant="ghost" aria-label={`Xóa ${title.toLowerCase()}`} onClick={() => { request.current?.abort(); setQuery(''); setRows(null); setPending(false); input.current?.focus(); }}><X size={16}/></Button>}
        <Button type="button" variant="outline" disabled={pending} onClick={search}>Tìm</Button></div>
      {pending && <p role="status" className="py-2 text-sm">Đang tìm…</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
      {rows && !pending && <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">{!rows.length ? <p>Không có kết quả phù hợp.</p> : rows.map(row => <button key={row.id} type="button" className="w-full cursor-pointer rounded-md border border-input p-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onSelect(row)}><b>#{row.id} · {row.name}</b><br/>{row.serial}{type === 'orders' && <> · {row.customer_name || row.customer_info} · {row.customer_phone}</>}</button>)}{rows.length === 30 && <p className="text-sm">Hiển thị 30 kết quả đầu. Nhập cụ thể hơn để tìm tiếp.</p>}</div>}
    </>}
  </fieldset>;
}

function ReceiveDialog({ onClose, onSuccess }) {
  const [form, setForm] = useState({ workflow: 'WALK_IN', sellerName: '', sellerPhone: '', name: '', serial: '', category: '', agreedVnd: '', saleVnd: '', accountId: '' });
  const [old, setOld] = useState(null), [next, setNext] = useState(null);
  const [options, setOptions] = useState({ accounts: [], categories: [] });
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [review, setReview] = useState(false), [discard, setDiscard] = useState(false);
  const key = useRef(null), busy = useRef(false);
  const dirty = useRef(false);
  const formRef = useRef(null);
  const loadOptions = useCallback(() => api('?type=options').then(setOptions).catch(err => setError(err.message)), []);
  useEffect(() => { loadOptions(); }, [loadOptions]);
  useEffect(() => {
    const beforeUnload = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  function update(name, value) {
    dirty.current = true; key.current = null; setForm(f => ({ ...f, [name]: value })); setError('');
    formRef.current?.querySelectorAll('[aria-invalid]').forEach(node => { node.removeAttribute('aria-invalid'); node.removeAttribute('aria-describedby'); });
  }
  const exchange = form.workflow === 'EXCHANGE';
  const difference = Number(form.saleVnd) - Number(form.agreedVnd);
  const close = () => { if (!busy.current) { if (dirty.current) setDiscard(true); else onClose(); } };
  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    if (!review) {
      const invalid = [...formRef.current.querySelectorAll('input[required]')].find(node => !node.value.trim());
      if (invalid) { invalid.setAttribute('aria-invalid', 'true'); invalid.setAttribute('aria-describedby', 'trade-error'); invalid.focus(); setError('Điền đầy đủ các thông tin bắt buộc.'); return; }
      if (form.workflow !== 'WALK_IN' && !old) return setError('Chọn đơn hàng đã bán.');
      if (form.workflow === 'WALK_IN' && !form.category) return setError('Chọn phân loại máy.');
      if (exchange && (!next || Number(form.agreedVnd) <= 0 || Number(form.saleVnd) < Number(form.agreedVnd) || (difference > 0 && !form.accountId))) return setError('Chọn máy mới, giá thu lại, giá bán từ giá thu lại trở lên và tài khoản nhận tiền bù.');
      setError(''); setReview(true); return;
    }
    busy.current = true; setPending(true); setError('');
    key.current ||= crypto.randomUUID();
    try { await api('', { method: 'POST', body: JSON.stringify({ ...form, orderId: old?.id, laptopId: next?.id, idempotencyKey: key.current }) }); dirty.current = false; onSuccess(); }
    catch (err) { setError(err.message); }
    finally { busy.current = false; setPending(false); }
  }
  return <Modal open onOpenChange={value => { if (!value) close(); }} title={review ? 'Kiểm tra và xác nhận thu đổi' : 'Thu cũ đổi mới'} description="Nguồn nhập kho: Thu lại khách lẻ" maxWidth="max-w-3xl">
    <form ref={formRef} noValidate onSubmit={submit} aria-busy={pending} className="space-y-4">
      {discard ? <><p>Đóng hồ sơ và bỏ các thông tin chưa lưu?</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDiscard(false)}>Tiếp tục nhập</Button><Button type="button" variant="destructive" onClick={onClose}>Bỏ thông tin</Button></div></> : <>
      {!review ? <>
        <fieldset className="grid gap-2 sm:grid-cols-3"><legend className="mb-2 text-sm font-semibold">Chọn trường hợp</legend>{Object.entries(labels).map(([value, label], index) => <label key={value} className={`cursor-pointer rounded-lg border p-3 text-sm ${form.workflow === value ? 'border-primary bg-muted' : 'border-input'}`}><input type="radio" name="workflow" value={value} checked={form.workflow === value} onChange={() => { update('workflow', value); setOld(null); setNext(null); }}/><span className="ml-2">{index + 1}. {label}</span></label>)}</fieldset>
        {form.workflow !== 'WALK_IN' && <EntitySearch key={form.workflow} type="orders" title="Đơn hàng cũ đã bán" selected={old} onSelect={row => { setOld(row); update('sellerName', row?.customer_name || row?.customer_info || ''); update('sellerPhone', row?.customer_phone || ''); }}/>} 
        {!exchange && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Họ tên người bán *<Input required name="sellerName" autoComplete="name" value={form.sellerName} onChange={e => update('sellerName', e.target.value)}/></label>{form.workflow === 'BUYBACK' && <label className="text-sm font-medium">Số điện thoại *<Input required type="tel" autoComplete="tel" value={form.sellerPhone} onChange={e => update('sellerPhone', e.target.value)}/></label>}
          {form.workflow === 'WALK_IN' && <><label className="text-sm font-medium">Tên máy *<Input required value={form.name} onChange={e => update('name', e.target.value)}/></label><div className="text-sm font-medium"><span id="trade-category">Phân loại *</span><Select value={form.category} onValueChange={value => update('category', value)}><SelectTrigger aria-labelledby="trade-category"><SelectValue placeholder="Chọn phân loại"/></SelectTrigger><SelectContent className="z-[10002] w-[var(--radix-select-trigger-width)] max-h-[min(18rem,var(--radix-select-content-available-height))]">{options.categories.map(option => <SelectItem key={option.option_key} value={option.option_key}>{option.label}</SelectItem>)}</SelectContent></Select></div><label className="text-sm font-medium">Serial *<Input required value={form.serial} onChange={e => update('serial', e.target.value)}/></label></>}
        </div>}
        {exchange ? <><EntitySearch type="laptops" title="Máy mới trong kho" selected={next} onSelect={row => { setNext(row); update('saleVnd', row ? Math.round(Number(row.retail_price_vnd || 0) * 1e6).toString() : ''); }}/><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Giá thu lại (VNĐ) *<Input required type="number" min="1" step="1" value={form.agreedVnd} onChange={e => update('agreedVnd', e.target.value)}/></label><label className="text-sm font-medium">Giá bán máy mới (VNĐ) *<Input required type="number" min="1" step="1" value={form.saleVnd} onChange={e => update('saleVnd', e.target.value)}/></label></div><div className="rounded-lg bg-muted p-3"><p>Tiền bù thu ngay: <strong>{money(difference)}</strong></p><p className="text-sm">Khách hàng và địa chỉ được giữ nguyên từ đơn cũ.</p></div>{difference > 0 && <div><span id="trade-account" className="text-sm font-medium">Tài khoản nhận tiền bù *</span><Select value={form.accountId} onValueChange={value => update('accountId', value)}><SelectTrigger aria-labelledby="trade-account"><SelectValue placeholder="Chọn tài khoản VND"/></SelectTrigger><SelectContent className="z-[10002] w-[var(--radix-select-trigger-width)] max-h-[min(18rem,var(--radix-select-content-available-height))]">{options.accounts.map(account => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select>{!options.accounts.length && <p className="text-sm">Chưa có tài khoản VND khả dụng. <button type="button" className="cursor-pointer underline" onClick={loadOptions}>Tải lại</button></p>}</div>}</> : <p className="rounded-lg bg-muted p-3 text-sm">Máy được nhập vào tháng hiện tại, trạng thái <b>Chờ QC</b>. Giá vốn chưa được ghi nhận.{form.workflow === 'BUYBACK' && ' Tạo một laptop mới; giữ nguyên lịch sử máy và đơn đã bán.'}</p>}
      </> : <div className="space-y-3"><p className="font-semibold">{labels[form.workflow]}</p><p>{old ? `Đơn #${old.id} · ${old.name} · ${old.serial}` : `${form.name} · ${form.serial}`}</p>{exchange ? <><p>Đơn #{old.id} sẽ chuyển <b>HỦY · ĐỔI HÀNG</b>. Máy cũ về <b>Sẵn hàng</b> trong tháng hiện tại.</p><p>Tạo đơn mới cho <b>{old.customer_name || old.customer_info}</b> · Máy #{next.id} {next.name}.</p><dl className="space-y-2 rounded-lg bg-muted p-3"><div>Giá bán: <b>{money(form.saleVnd)}</b></div><div>Giá thu lại: <b>{money(form.agreedVnd)}</b></div><div>Thu bù ngay: <b>{money(difference)}</b> {difference > 0 && `vào ${options.accounts.find(a => a.id === form.accountId)?.name}`}</div></dl></> : <><p>Người bán: {form.sellerName} {form.sellerPhone}</p><p>Nhập kho · Thu lại khách lẻ · <b>Chờ QC</b>.</p></>}</div>}
      {error && <p id="trade-error" role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-input pt-4"><Button type="button" variant="outline" disabled={pending} onClick={() => review ? setReview(false) : close()}>{review ? 'Quay lại chỉnh sửa' : 'Đóng'}</Button><Button disabled={pending} className="min-w-40">{pending ? 'Đang ghi nhận…' : review ? exchange ? 'Xác nhận đổi và thu bù' : 'Xác nhận nhập kho' : 'Kiểm tra thông tin'}</Button></div>
      </>}
    </form>
  </Modal>;
}
