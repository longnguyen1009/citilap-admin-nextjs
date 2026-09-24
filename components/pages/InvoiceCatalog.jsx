'use client';
import { useEffect, useState } from 'react';
import { invoiceRequest, invoiceMoney } from '@/lib/invoiceClient';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import ListPagination, { useListPagination } from '../ui/ListPagination';

const empty = { name: '', sku: '', kind: 'other', price: 0, note: '', address: '', active: true };
export default function InvoiceCatalog({ type = 'accessories' }) {
  const { user } = useAuth();
  const [rows,setRows] = useState([]);
  const [draft,setDraft] = useState(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [search,setSearch] = useState('');
  const branches = type === 'branches';
  const filteredRows = rows.filter(r=>String(r.name || '').toLowerCase().includes(search.toLowerCase()));
  const catalogPages = useListPagination(filteredRows, `${type}|${search}`);
  useEffect(() => { let active=true; invoiceRequest('/api/invoice-catalog').then(data => { if(active) setRows(data[type]); }).catch(e => { if(active) setError(e.message); }).finally(() => { if(active) setLoading(false); }); return () => { active=false; }; }, [type]);
  async function save(e) {
    e.preventDefault(); if(busy) return; setBusy(true);
    try { const row = await invoiceRequest('/api/invoice-catalog', { ...draft,type }); setRows(prev => draft.id ? prev.map(r => r.id === row.id ? row : r) : [...prev,row]); setDraft(null); setError(''); toast.success('Đã lưu'); }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="invoice-workspace invoice-catalog"><header className="invoice-toolbar"><div><h2>{branches ? 'Chi nhánh bán hàng' : 'Quản lý phụ kiện'}</h2><p>{branches ? 'Chi nhánh dùng cho đơn hàng và bản lưu hóa đơn.' : 'Danh mục phụ kiện dùng trong combo quà tặng.'}</p></div>{user?.role === 'ADMIN' && <button className="btn btn-primary" onClick={() => { setDraft({ ...empty }); setError(''); }}>Thêm {branches ? 'chi nhánh' : 'phụ kiện'}</button>}</header>
    {error && <p role="alert" className="invoice-error">{error}</p>}
    {draft && <form className="invoice-catalog-form" onSubmit={save}><label>Tên<input required maxLength={160} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} /></label>
    {branches ? <label>Địa chỉ<input maxLength={1000} value={draft.address} onChange={e=>setDraft({...draft,address:e.target.value})} /></label> : <>
    <label>Loại<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value})}>{Object.entries({mouse:'Chuột',backpack:'Balo',mousepad:'Lót chuột',sleeve:'Túi chống sốc',other:'Khác'}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>Giá bán (triệu đồng)<input type="number" min="0" step="0.001" value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})} /></label><label>Ghi chú<input maxLength={2000} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})} /></label></>}
    <label><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})} /> Đang sử dụng</label><div><button type="submit" className="btn btn-primary" disabled={busy}>{busy?'Đang lưu…':'Lưu'}</button> <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>setDraft(null)}>Hủy</button></div></form>}
    <input aria-label="Tìm danh mục" placeholder="Tìm theo tên…" value={search} onChange={e=>setSearch(e.target.value)} />
    <div className="invoice-paper invoice-table-scroll"><table className="invoice-table"><thead><tr><th>ID</th><th>Tên</th><th>{branches?'Địa chỉ':'Giá bán'}</th><th>Trạng thái</th><th /></tr></thead><tbody>{catalogPages.pageRows.map(r=><tr key={r.id}><td>#{r.id}</td><td>{r.name}</td><td>{branches?r.address:invoiceMoney(r.price)}</td><td>{r.active?'Đang sử dụng':'Ngừng sử dụng'}</td><td>{user?.role==='ADMIN' && <button className="btn btn-sm btn-outline" onClick={()=>setDraft({...empty,...r})}>Sửa</button>}</td></tr>)}</tbody></table>{loading ? <p className="invoice-empty">Đang tải…</p> : !filteredRows.length && <p className="invoice-empty">Chưa có dữ liệu.</p>}<ListPagination {...catalogPages}/></div>
  </section>;
}
