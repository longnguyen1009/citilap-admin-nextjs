'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, CircleDollarSign, PackagePlus, Plus, Save, Search } from 'lucide-react';
import { getAuthHeaders } from '@/lib/apiFetchers';
import { DESTINATIONS, PAYMENT_METHODS, formatRmb, formatVnd } from '@/lib/procurement';
import ListPagination, { useListPagination } from '../ui/ListPagination';

const emptySupplier = { code:'', name:'', display_name:'', wechat_name:'', wechat_id:'', phone:'', country:'Trung Quốc', province:'', city:'', address:'', bank_name:'', bank_account_name:'', bank_account_number:'', alipay_account:'', preferred_shipping_destination:'OTHER', notes:'', active:true };

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { ...(await getAuthHeaders()), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Yêu cầu thất bại');
  return data;
}

function Notice({ error, children }) { return error ? <div className="procurement-notice error">{error}</div> : children ? <div className="procurement-notice success">{children}</div> : null; }

export default function Procurement({ mode }) {
  const [suppliers,setSuppliers] = useState([]); const [payments,setPayments] = useState([]);
  const [loading,setLoading] = useState(true); const [error,setError] = useState('');
  const [supplierDraft,setSupplierDraft] = useState(null);
  const [supplierSearch,setSupplierSearch] = useState('');
  const isSuppliers = mode === 'suppliers'; const isPayments = mode === 'payments';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (isSuppliers) { setSuppliers(await api('/api/suppliers') || []); return; }
      if (isPayments) setPayments(await api('/api/supplier-payments'));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [isPayments,isSuppliers]);
  // Network synchronization intentionally refreshes local view state when route/detail changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const submitSupplier = async e => {
    e.preventDefault(); setError('');
    try { await api('/api/suppliers',{ method:'POST',body:JSON.stringify(supplierDraft) }); setSupplierDraft(null); await load(); } catch(e2){ setError(e2.message); }
  };
  const visibleSuppliers = useMemo(() => suppliers.filter(s => `${s.code} ${s.name} ${s.wechat_name} ${s.wechat_id}`.toLowerCase().includes(supplierSearch.toLowerCase())), [suppliers, supplierSearch]);
  const supplierPages = useListPagination(visibleSuppliers, supplierSearch);
  const paymentPages = useListPagination(payments);

  return <main className="procurement-page">
    <header className="procurement-header"><div><p>NHÀ CUNG CẤP</p><h1>{isSuppliers?'Nhà cung cấp':isPayments?'Thanh toán nhà cung cấp':'Lô mua hàng'}</h1><span>Quản lý nguồn hàng Trung Quốc, giá mua và công nợ theo từng lô.</span></div>
      <nav><Link href="/suppliers" className={isSuppliers?'active':''}><Building2 size={16}/>Nhà cung cấp</Link><Link href="/purchases" className={!isSuppliers&&!isPayments?'active':''}><PackagePlus size={16}/>Lô mua</Link><Link href="/supplier-payments" className={isPayments?'active':''}><CircleDollarSign size={16}/>Thanh toán</Link></nav>
    </header>
    <Notice error={error}/>
    {loading ? <div className="procurement-empty">Đang tải dữ liệu…</div> : isSuppliers ? <>
      <div className="procurement-actions"><div className="procurement-search"><Search size={16}/><input placeholder="Tìm mã, tên, WeChat…" value={supplierSearch} onChange={e=>setSupplierSearch(e.target.value)}/></div><button className="btn btn-primary" onClick={()=>setSupplierDraft({...emptySupplier})}><Plus size={16}/>Thêm nhà cung cấp</button></div>
      {supplierDraft && <form className="procurement-form" onSubmit={submitSupplier}><div className="form-title"><div><h2>{supplierDraft.id?'Sửa nhà cung cấp':'Nhà cung cấp mới'}</h2><p>Thông tin liên hệ và tài khoản thanh toán.</p></div><button type="button" className="btn btn-outline" onClick={()=>setSupplierDraft(null)}>Đóng</button></div><div className="procurement-grid">{[['code','Mã NCC *'],['name','Tên nhà cung cấp *'],['display_name','Tên hiển thị'],['wechat_name','Tên WeChat'],['wechat_id','WeChat ID'],['phone','Số điện thoại'],['province','Tỉnh'],['city','Thành phố'],['address','Địa chỉ'],['bank_name','Ngân hàng'],['bank_account_name','Chủ tài khoản'],['bank_account_number','Số tài khoản'],['alipay_account','Tài khoản Alipay']].map(([key,label])=><label key={key}>{label}<input value={supplierDraft[key]||''} onChange={e=>setSupplierDraft({...supplierDraft,[key]:e.target.value})}/></label>)}<label>Điểm nhận ưu tiên<select value={supplierDraft.preferred_shipping_destination} onChange={e=>setSupplierDraft({...supplierDraft,preferred_shipping_destination:e.target.value})}>{Object.entries(DESTINATIONS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="wide">Ghi chú<textarea value={supplierDraft.notes||''} onChange={e=>setSupplierDraft({...supplierDraft,notes:e.target.value})}/></label></div><button className="btn btn-primary"><Save size={16}/>Lưu nhà cung cấp</button></form>}
      <div className="procurement-table-wrap"><table className="procurement-table"><thead><tr><th>Mã</th><th>Nhà cung cấp</th><th>Liên hệ</th><th>Khu vực</th><th>Điểm nhận</th><th>Trạng thái</th><th/></tr></thead><tbody>{supplierPages.pageRows.map(s=><tr key={s.id}><td><strong>{s.code}</strong></td><td>{s.name}<small>{s.display_name}</small></td><td>{s.wechat_name||s.phone||'—'}<small>{s.wechat_id}</small></td><td>{[s.city,s.province,s.country].filter(Boolean).join(', ')}</td><td>{DESTINATIONS[s.preferred_shipping_destination]}</td><td><span className={`procurement-status ${s.active?'ok':'muted'}`}>{s.active?'Đang dùng':'Ngừng dùng'}</span></td><td><button className="btn btn-sm btn-outline" onClick={()=>setSupplierDraft({...s})}>Sửa</button></td></tr>)}</tbody></table>{!visibleSuppliers.length&&<div className="procurement-empty">Chưa có nhà cung cấp.</div>}<ListPagination {...supplierPages}/></div>
    </> : isPayments ? <div className="procurement-table-wrap"><table className="procurement-table"><thead><tr><th>Ngày</th><th>Lô mua</th><th>Nhà cung cấp</th><th>Phương thức</th><th>RMB</th><th>Quy đổi VND</th><th>Tham chiếu</th></tr></thead><tbody>{paymentPages.pageRows.map(p=><tr key={p.id}><td>{p.payment_date}</td><td><Link href={`/purchases?id=${p.purchase_batch_id}`}>{p.purchase_batches?.batch_code}</Link></td><td>{p.suppliers?.name}</td><td>{PAYMENT_METHODS[p.payment_method]}</td><td><strong>{formatRmb(p.amount_rmb)}</strong></td><td>{formatVnd(p.amount_vnd)}</td><td>{p.reference||'—'}<small>{p.recorded_by}</small></td></tr>)}</tbody></table>{!payments.length&&<div className="procurement-empty">Chưa có thanh toán nhà cung cấp.</div>}<ListPagination {...paymentPages}/></div> : null}
  </main>;
}
