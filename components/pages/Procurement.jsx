'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, ChevronRight, CircleDollarSign, PackagePlus, Plus, Save, Search, Trash2 } from 'lucide-react';
import { getAuthHeaders } from '@/lib/apiFetchers';
import { DESTINATIONS, PAYMENT_METHODS, PURCHASE_STATUSES, formatRmb, formatVnd } from '@/lib/procurement';
import ListPagination, { useListPagination } from '../ui/ListPagination';

const today = () => new Date().toISOString().slice(0, 10);
const emptySupplier = { code:'', name:'', display_name:'', wechat_name:'', wechat_id:'', phone:'', country:'Trung Quốc', province:'', city:'', address:'', bank_name:'', bank_account_name:'', bank_account_number:'', alipay_account:'', preferred_shipping_destination:'OTHER', notes:'', active:true };
const emptyItem = () => ({ brand:'', model:'', cpu:'', gpu:'', ram:'', ssd:'', screen:'', serial:'', supplier_serial:'', supplier_item_ref:'', purchase_price_rmb:'', condition:'', notes:'' });
const emptyBatch = () => ({ supplier_id:'', purchase_date:today(), exchange_rate:'3550', domestic_shipping_rmb:'0', other_cost_rmb:'0', destination:'OTHER', notes:'' });

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { ...(await getAuthHeaders()), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Yêu cầu thất bại');
  return data;
}

function Notice({ error, children }) { return error ? <div className="procurement-notice error">{error}</div> : children ? <div className="procurement-notice success">{children}</div> : null; }

export default function Procurement({ mode }) {
  const pathname = usePathname(); const router = useRouter(); const params = useSearchParams();
  const detailId = params.get('id');
  const [suppliers,setSuppliers] = useState([]); const [batches,setBatches] = useState([]); const [payments,setPayments] = useState([]);
  const [cashAccounts,setCashAccounts] = useState([]);
  const [detail,setDetail] = useState(null); const [loading,setLoading] = useState(true); const [error,setError] = useState('');
  const [supplierDraft,setSupplierDraft] = useState(null); const [batchDraft,setBatchDraft] = useState(null); const [items,setItems] = useState([emptyItem()]); const [paymentDraft,setPaymentDraft] = useState(null); const [submitting,setSubmitting] = useState(false);
  const [supplierSearch,setSupplierSearch] = useState('');
  const isSuppliers = mode === 'suppliers'; const isPayments = mode === 'payments';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const supplierRows = await api('/api/suppliers'); setSuppliers(supplierRows || []);
      setCashAccounts(await api('/api/cash-accounts?currency=CNY'));
      if (isSuppliers) return;
      const batchRows = await api('/api/purchases'); setBatches(batchRows || []);
      if (isPayments) setPayments(await api('/api/supplier-payments'));
      if (detailId) setDetail(await api(`/api/purchases?id=${detailId}`)); else setDetail(null);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [detailId,isPayments,isSuppliers]);
  // Network synchronization intentionally refreshes local view state when route/detail changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const submitSupplier = async e => {
    e.preventDefault(); setError('');
    try { await api('/api/suppliers',{ method:'POST',body:JSON.stringify(supplierDraft) }); setSupplierDraft(null); await load(); } catch(e2){ setError(e2.message); }
  };
  const openBatch = row => {
    if (row) router.push(`/purchases?id=${row.id}`);
    else { setDetail(null); setBatchDraft({...emptyBatch(),idempotencyKey:crypto.randomUUID()}); setItems([emptyItem()]); router.push('/purchases'); }
  };
  const editDraft = () => { setBatchDraft({ ...detail.batch }); setItems(detail.items.map(({ id, purchase_batch_id, created_at, updated_at, status, laptop_id, ...rest }) => rest)); };
  const saveBatch = async e => {
    e.preventDefault(); setError('');
    try {
      const updating = Boolean(detail?.batch?.id);
      if (submitting) return; setSubmitting(true);
      const result = await api('/api/purchases',{ method:'POST',body:JSON.stringify({ action:updating?'update':'create',id:detail?.batch?.id,batch:batchDraft,items,idempotencyKey:batchDraft.idempotencyKey }) });
      setBatchDraft(null); router.push(`/purchases?id=${result.id}`); await load();
    } catch(e2){ setError(e2.message); } finally { setSubmitting(false); }
  };
  const transition = async action => { try { await api('/api/purchases',{method:'POST',body:JSON.stringify({action,id:detail.batch.id})}); await load(); } catch(e){ setError(e.message); } };
  const pay = async e => {
    e.preventDefault(); if (submitting) return; setSubmitting(true); try { await api('/api/supplier-payments',{method:'POST',body:JSON.stringify({...paymentDraft,purchaseBatchId:detail.batch.id})}); setPaymentDraft(null); await load(); } catch(e2){ setError(e2.message); } finally { setSubmitting(false); }
  };
  const subtotal = useMemo(() => items.reduce((sum,item)=>sum+Number(item.purchase_price_rmb||0),0),[items]);
  const visibleSuppliers = useMemo(() => suppliers.filter(s => `${s.code} ${s.name} ${s.wechat_name} ${s.wechat_id}`.toLowerCase().includes(supplierSearch.toLowerCase())), [suppliers, supplierSearch]);
  const supplierPages = useListPagination(visibleSuppliers, supplierSearch);
  const paymentPages = useListPagination(payments);
  const batchPages = useListPagination(batches);

  return <main className="procurement-page">
    <header className="procurement-header"><div><p>OPERATIONS · PHASE 1</p><h1>{isSuppliers?'Nhà cung cấp':isPayments?'Thanh toán nhà cung cấp':'Lô mua hàng'}</h1><span>Quản lý nguồn hàng Trung Quốc, giá mua và công nợ theo từng lô.</span></div>
      <nav><Link href="/suppliers" className={isSuppliers?'active':''}><Building2 size={16}/>Nhà cung cấp</Link><Link href="/purchases" className={!isSuppliers&&!isPayments?'active':''}><PackagePlus size={16}/>Lô mua</Link><Link href="/supplier-payments" className={isPayments?'active':''}><CircleDollarSign size={16}/>Thanh toán</Link></nav>
    </header>
    <Notice error={error}/>
    {loading ? <div className="procurement-empty">Đang tải dữ liệu…</div> : isSuppliers ? <>
      <div className="procurement-actions"><div className="procurement-search"><Search size={16}/><input placeholder="Tìm mã, tên, WeChat…" value={supplierSearch} onChange={e=>setSupplierSearch(e.target.value)}/></div><button className="btn btn-primary" onClick={()=>setSupplierDraft({...emptySupplier})}><Plus size={16}/>Thêm nhà cung cấp</button></div>
      {supplierDraft && <form className="procurement-form" onSubmit={submitSupplier}><div className="form-title"><div><h2>{supplierDraft.id?'Sửa nhà cung cấp':'Nhà cung cấp mới'}</h2><p>Thông tin liên hệ và tài khoản thanh toán.</p></div><button type="button" className="btn btn-outline" onClick={()=>setSupplierDraft(null)}>Đóng</button></div><div className="procurement-grid">{[['code','Mã NCC *'],['name','Tên nhà cung cấp *'],['display_name','Tên hiển thị'],['wechat_name','Tên WeChat'],['wechat_id','WeChat ID'],['phone','Số điện thoại'],['province','Tỉnh'],['city','Thành phố'],['address','Địa chỉ'],['bank_name','Ngân hàng'],['bank_account_name','Chủ tài khoản'],['bank_account_number','Số tài khoản'],['alipay_account','Tài khoản Alipay']].map(([key,label])=><label key={key}>{label}<input value={supplierDraft[key]||''} onChange={e=>setSupplierDraft({...supplierDraft,[key]:e.target.value})}/></label>)}<label>Điểm nhận ưu tiên<select value={supplierDraft.preferred_shipping_destination} onChange={e=>setSupplierDraft({...supplierDraft,preferred_shipping_destination:e.target.value})}>{Object.entries(DESTINATIONS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="wide">Ghi chú<textarea value={supplierDraft.notes||''} onChange={e=>setSupplierDraft({...supplierDraft,notes:e.target.value})}/></label></div><button className="btn btn-primary"><Save size={16}/>Lưu nhà cung cấp</button></form>}
      <div className="procurement-table-wrap"><table className="procurement-table"><thead><tr><th>Mã</th><th>Nhà cung cấp</th><th>Liên hệ</th><th>Khu vực</th><th>Điểm nhận</th><th>Trạng thái</th><th/></tr></thead><tbody>{supplierPages.pageRows.map(s=><tr key={s.id}><td><strong>{s.code}</strong></td><td>{s.name}<small>{s.display_name}</small></td><td>{s.wechat_name||s.phone||'—'}<small>{s.wechat_id}</small></td><td>{[s.city,s.province,s.country].filter(Boolean).join(', ')}</td><td>{DESTINATIONS[s.preferred_shipping_destination]}</td><td><span className={`procurement-status ${s.active?'ok':'muted'}`}>{s.active?'Đang dùng':'Ngừng dùng'}</span></td><td><button className="btn btn-sm btn-outline" onClick={()=>setSupplierDraft({...s})}>Sửa</button></td></tr>)}</tbody></table>{!visibleSuppliers.length&&<div className="procurement-empty">Chưa có nhà cung cấp.</div>}<ListPagination {...supplierPages}/></div>
    </> : isPayments ? <div className="procurement-table-wrap"><table className="procurement-table"><thead><tr><th>Ngày</th><th>Lô mua</th><th>Nhà cung cấp</th><th>Phương thức</th><th>RMB</th><th>Quy đổi VND</th><th>Tham chiếu</th></tr></thead><tbody>{paymentPages.pageRows.map(p=><tr key={p.id}><td>{p.payment_date}</td><td><Link href={`/purchases?id=${p.purchase_batch_id}`}>{p.purchase_batches?.batch_code}</Link></td><td>{p.suppliers?.name}</td><td>{PAYMENT_METHODS[p.payment_method]}</td><td><strong>{formatRmb(p.amount_rmb)}</strong></td><td>{formatVnd(p.amount_vnd)}</td><td>{p.reference||'—'}<small>{p.recorded_by}</small></td></tr>)}</tbody></table>{!payments.length&&<div className="procurement-empty">Chưa có thanh toán nhà cung cấp.</div>}<ListPagination {...paymentPages}/></div> : batchDraft ?
      <form className="procurement-form" onSubmit={saveBatch}><div className="form-title"><div><h2>{detail?'Sửa lô nháp':'Tạo lô mua mới'}</h2><p>Mã lô sẽ được sinh tự động khi lưu.</p></div><button type="button" className="btn btn-outline" onClick={()=>setBatchDraft(null)}>Đóng</button></div><div className="procurement-grid"><label>Nhà cung cấp *<select value={batchDraft.supplier_id} onChange={e=>setBatchDraft({...batchDraft,supplier_id:e.target.value})}><option value="">Chọn nhà cung cấp</option>{suppliers.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></label><label>Ngày mua *<input type="date" value={batchDraft.purchase_date} onChange={e=>setBatchDraft({...batchDraft,purchase_date:e.target.value})}/></label><label>Tỷ giá VND/CNY *<input type="number" min="1" step="0.01" value={batchDraft.exchange_rate} onChange={e=>setBatchDraft({...batchDraft,exchange_rate:e.target.value})}/></label><label>Điểm nhận<select value={batchDraft.destination} onChange={e=>setBatchDraft({...batchDraft,destination:e.target.value})}>{Object.entries(DESTINATIONS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Ship nội địa (RMB)<input type="number" min="0" step="0.01" value={batchDraft.domestic_shipping_rmb} onChange={e=>setBatchDraft({...batchDraft,domestic_shipping_rmb:e.target.value})}/></label><label>Chi phí khác (RMB)<input type="number" min="0" step="0.01" value={batchDraft.other_cost_rmb} onChange={e=>setBatchDraft({...batchDraft,other_cost_rmb:e.target.value})}/></label><label className="wide">Ghi chú<textarea value={batchDraft.notes||''} onChange={e=>setBatchDraft({...batchDraft,notes:e.target.value})}/></label></div><div className="purchase-items-title"><h3>Sản phẩm trong lô</h3><strong>{formatRmb(subtotal)}</strong></div>{items.map((item,index)=><div className="purchase-item-row" key={index}><span>{index+1}</span>{[['brand','Hãng'],['model','Model *'],['cpu','CPU'],['gpu','GPU'],['ram','RAM'],['ssd','SSD'],['serial','Serial (nếu có)'],['purchase_price_rmb','Giá RMB *']].map(([key,label])=><label key={key}>{label}<input type={key==='purchase_price_rmb'?'number':'text'} min="0" step="0.01" value={item[key]||''} onChange={e=>setItems(items.map((x,i)=>i===index?{...x,[key]:e.target.value}:x))}/></label>)}<button type="button" aria-label="Xóa sản phẩm" onClick={()=>items.length>1&&setItems(items.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div>)}<div className="procurement-form-actions"><button type="button" className="btn btn-outline" onClick={()=>setItems([...items,emptyItem()])}><Plus size={16}/>Thêm sản phẩm</button><button className="btn btn-primary" disabled={submitting}><Save size={16}/>{submitting?'Đang lưu…':'Lưu lô nháp'}</button></div></form>
      : detail ? <PurchaseDetail detail={detail} onBack={()=>router.push('/purchases')} onEdit={editDraft} onTransition={transition} paymentDraft={paymentDraft} setPaymentDraft={setPaymentDraft} onPay={pay} cashAccounts={cashAccounts}/>
      : <><div className="procurement-actions"><div/><button className="btn btn-primary" onClick={()=>openBatch()}><Plus size={16}/>Tạo lô mua</button></div><div className="procurement-table-wrap"><table className="procurement-table"><thead><tr><th>Mã lô</th><th>Ngày mua</th><th>Nhà cung cấp</th><th>Sản phẩm</th><th>Tổng tiền</th><th>Đã trả / Còn nợ</th><th>Trạng thái</th><th/></tr></thead><tbody>{batchPages.pageRows.map(b=><tr key={b.id}><td><strong>{b.batch_code}</strong></td><td>{b.purchase_date}</td><td>{b.supplier_code}<small>{b.supplier_name}</small></td><td>{b.item_count}</td><td>{formatRmb(b.total_rmb)}</td><td>{formatRmb(b.paid_rmb)}<small className="debt">Nợ {formatRmb(b.debt_rmb)}</small></td><td><span className={`procurement-status status-${b.status.toLowerCase()}`}>{PURCHASE_STATUSES[b.status]}</span></td><td><button className="icon-link" onClick={()=>openBatch(b)}>Chi tiết <ChevronRight size={15}/></button></td></tr>)}</tbody></table>{!batches.length&&<div className="procurement-empty">Chưa có lô mua hàng.</div>}<ListPagination {...batchPages}/></div></>}
  </main>;
}

function PurchaseDetail({ detail,onBack,onEdit,onTransition,paymentDraft,setPaymentDraft,onPay,cashAccounts }) {
  const b=detail.batch; const canPay=['CONFIRMED','PARTIALLY_PAID'].includes(b.status)&&Number(b.debt_rmb)>0;
  return <div className="purchase-detail"><div className="purchase-detail-head"><button className="btn btn-outline" onClick={onBack}>← Danh sách</button><div><p>LÔ MUA</p><h2>{b.batch_code}</h2><span>{b.supplier_code} · {b.supplier_name}</span></div><div className="purchase-detail-actions">{b.status==='DRAFT'&&<><button className="btn btn-outline" onClick={onEdit}>Sửa nháp</button><button className="btn btn-primary" onClick={()=>onTransition('confirm')}>Xác nhận lô</button><button className="btn btn-danger" onClick={()=>onTransition('cancel')}>Hủy</button></>}{b.status==='CONFIRMED'&&<button className="btn btn-danger" onClick={()=>onTransition('cancel')}>Hủy lô</button>}</div></div><div className="purchase-kpis"><div><span>Tổng lô</span><strong>{formatRmb(b.total_rmb)}</strong></div><div><span>Đã thanh toán</span><strong className="green">{formatRmb(b.paid_rmb)}</strong></div><div><span>Công nợ</span><strong className="red">{formatRmb(b.debt_rmb)}</strong></div><div><span>Trạng thái</span><strong>{PURCHASE_STATUSES[b.status]}</strong></div></div>
    {canPay&&!paymentDraft&&<button className="btn btn-primary payment-open" onClick={()=>setPaymentDraft({amountRmb:b.debt_rmb,exchangeRate:b.exchange_rate,paymentMethod:'WECHAT',paymentDate:today(),reference:'',notes:'',accountId:'',idempotencyKey:crypto.randomUUID()})}><CircleDollarSign size={16}/>Ghi nhận thanh toán</button>}
    {paymentDraft&&<form className="supplier-payment-form" onSubmit={onPay}><h3>Thanh toán nhà cung cấp</h3><label>Số tiền RMB<input type="number" min="0.01" max={b.debt_rmb} step="0.01" value={paymentDraft.amountRmb} onChange={e=>setPaymentDraft({...paymentDraft,amountRmb:e.target.value})}/></label><label>Tỷ giá<input type="number" min="1" step="0.01" value={paymentDraft.exchangeRate} onChange={e=>setPaymentDraft({...paymentDraft,exchangeRate:e.target.value})}/></label><label>Phương thức<select value={paymentDraft.paymentMethod} onChange={e=>setPaymentDraft({...paymentDraft,paymentMethod:e.target.value})}>{Object.entries(PAYMENT_METHODS).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label>Tài khoản CNY<select required value={paymentDraft.accountId} onChange={e=>setPaymentDraft({...paymentDraft,accountId:e.target.value})}><option value="">Chọn tài khoản</option>{cashAccounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label>Ngày thanh toán<input type="date" value={paymentDraft.paymentDate} onChange={e=>setPaymentDraft({...paymentDraft,paymentDate:e.target.value})}/></label><label>Tham chiếu<input value={paymentDraft.reference} onChange={e=>setPaymentDraft({...paymentDraft,reference:e.target.value})}/></label><button className="btn btn-primary">Xác nhận</button><button type="button" className="btn btn-outline" onClick={()=>setPaymentDraft(null)}>Đóng</button></form>}
    <section className="detail-section"><h3>Danh sách sản phẩm <span>{detail.items.length}</span></h3><div className="procurement-table-wrap"><table className="procurement-table"><thead><tr><th>#</th><th>Sản phẩm</th><th>Cấu hình</th><th>Serial</th><th>Giá mua</th><th>Trạng thái</th></tr></thead><tbody>{detail.items.map((i,n)=><tr key={i.id}><td>{n+1}</td><td><strong>{i.brand} {i.model}</strong></td><td>{[i.cpu,i.gpu,i.ram,i.ssd].filter(Boolean).join(' · ')||'—'}</td><td>{i.serial||'Chưa có'}</td><td>{formatRmb(i.purchase_price_rmb)}</td><td>{i.status}</td></tr>)}</tbody></table></div></section>
    <section className="detail-section"><h3>Lịch sử thanh toán <span>{detail.payments.length}</span></h3>{detail.payments.length?<div className="procurement-table-wrap"><table className="procurement-table"><thead><tr><th>Ngày</th><th>Phương thức</th><th>RMB</th><th>Quy đổi</th><th>Tham chiếu</th><th>Người ghi</th></tr></thead><tbody>{detail.payments.map(p=><tr key={p.id}><td>{p.payment_date}</td><td>{PAYMENT_METHODS[p.payment_method]}</td><td>{formatRmb(p.amount_rmb)}</td><td>{formatVnd(p.amount_vnd)}</td><td>{p.reference||'—'}</td><td>{p.recorded_by}</td></tr>)}</tbody></table></div>:<div className="procurement-empty compact">Chưa phát sinh thanh toán.</div>}</section>
  </div>;
}
