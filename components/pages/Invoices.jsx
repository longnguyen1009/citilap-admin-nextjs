'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Printer, ArrowLeft, CheckCircle2, Search } from 'lucide-react';
import { invoiceRequest, invoiceMoney } from '@/lib/invoiceClient';
import { useInventory } from '@/context/InventoryContext';
import ListPagination, { useListPagination } from '../ui/ListPagination';

const code = id => `HD${String(id).padStart(6,'0')}`;
const date = value => value ? new Date(value).toLocaleString('vi-VN') : '—';
export default function Invoices({ id, query = '' }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const { getLabel } = useInventory();
  const filtered = Array.isArray(rows) && !id ? rows.filter(row => [code(row.id),row.order_id,row.snapshot?.customer?.name,row.snapshot?.customer?.phone].join(' ').toLowerCase().includes(search.toLowerCase())) : [];
  const invoicePages = useListPagination(filtered, search);
  useEffect(() => {
    let active = true;
    invoiceRequest(`/api/invoices?${id ? `id=${encodeURIComponent(id)}` : query}`).then(data => { if (active) setRows(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id, query]);
  if (error) return <div className="invoice-error" role="alert">{error} <Link href="/invoices">Danh sách hóa đơn</Link></div>;
  if (!rows) return <p role="status">Đang tải hóa đơn…</p>;
  if (!id) {
    return <section className="invoice-workspace"><header className="invoice-toolbar"><div><p className="invoice-eyebrow">CITILAP · CHỨNG TỪ BÁN HÀNG</p><h1><FileText size={24} /> Quản lý hóa đơn</h1><p>{rows.length} hóa đơn đã xuất · Bản lưu tại thời điểm xuất</p></div><Link href="/orders" className="btn btn-primary">Đến đơn hàng</Link></header>
      <label className="invoice-search"><Search size={18} /><input aria-label="Tìm hóa đơn" placeholder="Tìm mã hóa đơn, đơn hàng, tên hoặc SĐT khách…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <div className="invoice-paper invoice-table-scroll"><table className="invoice-table"><thead><tr><th>Hóa đơn</th><th>Khách hàng</th><th>Chi nhánh</th><th>Ngày tạo</th><th>Tổng tiền</th><th>Đã thu</th><th /></tr></thead><tbody>{invoicePages.pageRows.map(row => { const snapshot=row.snapshot || {}; const total=Number(snapshot.total || 0); const paid=Number(snapshot.paid || 0); const debt=Number(snapshot.order?.debt_amount ?? Math.max(total-paid,0)); return <tr key={row.id}><td><strong>{code(row.id)}</strong><small>Đơn #{row.order_id}</small></td><td>{snapshot.customer?.name || '—'}<small>{snapshot.customer?.phone || '—'}</small></td><td>{snapshot.branch?.name || '—'}</td><td>{date(row.created_at)}</td><td>{invoiceMoney(total)}</td><td>{invoiceMoney(paid)}<small>{debt <= 0 && total > 0 ? 'Đã hoàn tất nghĩa vụ' : `Còn ${invoiceMoney(debt)}`}</small></td><td><Link href={`/invoices/${row.id}`}>Xem chi tiết hóa đơn →</Link></td></tr>; })}</tbody></table>{!filtered.length && <p className="invoice-empty">Chưa có hóa đơn phù hợp. Có thể xuất khi đơn đang giao hoặc hoàn thành và đã nhận cọc.</p>}<ListPagination {...invoicePages} /></div>
    </section>;
  }
  const invoice = rows[0];
  if (!invoice) return <p>Không tìm thấy hóa đơn. <Link href="/invoices">Về danh sách</Link></p>;
  const s = invoice.snapshot || {}, o = s.order || {}, customer = s.customer || {};
  const total = Number(s.total || 0), paid = Number(s.paid || 0);
  const tradeInCredit = Number(o.trade_in_credit_vnd || 0);
  const debt = Number(o.debt_amount ?? Math.max(total - paid, 0));
  const payments = Array.isArray(s.payments) ? s.payments : [];
  const items = Array.isArray(s.items) ? s.items : [];
  const financialRecords = Array.isArray(s.financial_records) ? s.financial_records : [];
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((total - debt) / total * 100))) : 0;
  const label = (group, value) => getLabel(group, value) || value || '—';
  return <article className="invoice-workspace invoice-detail">
    <div className="invoice-toolbar invoice-no-print"><Link href="/invoices"><ArrowLeft size={16} /> Danh sách hóa đơn</Link><button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /> In / Lưu PDF</button></div>
    <div className="invoice-paper"><header className="invoice-document-header"><div><p className="invoice-eyebrow">CITILAP · HÓA ĐƠN BÁN HÀNG</p><h1><FileText size={23} /> {code(invoice.id)}</h1><div className="invoice-badges"><span><CheckCircle2 size={13} /> {label('orderStatus',o.order_status)}</span><span>{label('orderType',o.order_type)}</span><span>{label('paymentMethod',o.payment_method)}</span><span>{percent >= 100 ? 'Đã thanh toán đủ' : `Đã thanh toán ${percent}%`}</span></div></div><div className="invoice-document-date">Đơn hàng #{invoice.order_id}<small>{date(invoice.created_at)}</small></div></header>
    <div className="invoice-columns"><section><h2>Thông tin đơn bán</h2><dl className="invoice-facts">{[
      ['Khách hàng',customer.name],['Số điện thoại',customer.phone],['Địa chỉ',o.customer_address || customer.address],['Chi nhánh',s.branch?.name],['Địa chỉ chi nhánh',s.branch?.address],['SALE Online',label('saleOnline',o.sale_online)],['SALE Offline',label('saleOffline',o.sale_offline)],['Ngày tạo hóa đơn',date(invoice.created_at)],['Người xuất',invoice.created_by]
    ].map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value || '—'}</dd></div>)}</dl><aside className="invoice-note"><strong>Ghi chú</strong><p>{o.note || 'Không có ghi chú'}</p></aside></section>
    <section><h2>Thanh toán & tài chính</h2><dl className="invoice-facts"><div><dt>Tổng tiền hàng</dt><dd>{invoiceMoney(total)}</dd></div><div className="invoice-total"><dt>Tổng nghĩa vụ</dt><dd>{invoiceMoney(total)}</dd></div><div><dt>Tiền đã thu</dt><dd className="invoice-paid">{invoiceMoney(paid)}</dd></div>{tradeInCredit > 0 && <div><dt>Credit thu cũ</dt><dd>{invoiceMoney(tradeInCredit / 1000000)}</dd></div>}<div><dt>Còn phải thu</dt><dd>{invoiceMoney(debt)}</dd></div></dl><progress max="100" value={percent} aria-label="Tỷ lệ hoàn tất nghĩa vụ" /><div className="invoice-progress-caption"><span>{percent}% nghĩa vụ đã hoàn tất</span><strong>{percent >= 100 ? 'Đã hoàn tất' : 'Còn công nợ'}</strong></div>
    <div className="invoice-payment-history"><h3>Lịch sử thanh toán</h3>{payments.length ? payments.map(p => <div className="invoice-receipt" key={p.id}><div><strong>{({deposit:'Đặt cọc',balance:'Thanh toán',cod:'Thu COD',refund:'Hoàn tiền',other:'Thu khác'})[p.payment_type] || p.payment_type} · {label('paymentMethod',p.payment_method)}</strong><small>{p.payment_date || '—'} · {p.recorded_by || '—'}</small>{(p.note || p.reference_code) && <small>{[p.note,p.reference_code].filter(Boolean).join(' · ')}</small>}</div><strong>{p.payment_type === 'refund' ? '−' : '+'}{invoiceMoney(p.amount)}</strong></div>) : <p className="invoice-empty">Chưa có lịch sử thanh toán.</p>}</div>
    {financialRecords.length > 0 && <details className="invoice-finance"><summary>Chứng từ tài chính liên quan ({financialRecords.length})</summary>{financialRecords.map(f => <p key={f.id}>#{f.id} · {f.occurred_on} · {f.category} · {invoiceMoney(f.amount)} {f.payment_id ? `(Thanh toán #${f.payment_id})` : ''}</p>)}<small>Chứng từ đối ứng, không cộng lần nữa vào số tiền đã thu.</small></details>}
    </section></div>
    <section className="invoice-products"><h2>Danh sách sản phẩm <span>{items.length} SP</span></h2><div className="invoice-table-scroll"><table className="invoice-table"><thead><tr><th>#</th><th>Sản phẩm</th><th>SL</th><th>Giá bán</th><th>Thành tiền</th><th>Serial</th><th>Ghi chú</th></tr></thead><tbody>{items.map((item,index) => <tr key={`${item.kind}-${item.id}`}><td>{index+1}</td><td><strong>{item.name}</strong>{item.kind === 'gift' && <span className="invoice-gift-badge">Quà tặng</span>}</td><td>{item.quantity}</td><td>{invoiceMoney(item.price)}</td><td><strong>{invoiceMoney(item.total)}</strong></td><td>{item.serial || '—'}</td><td>{item.note || '—'}</td></tr>)}</tbody></table>{!items.length && <p className="invoice-empty">Hóa đơn chưa có dữ liệu sản phẩm.</p>}</div></section>
    <footer className="invoice-document-footer">Thông tin bán hàng được lưu tại thời điểm xuất · Thanh toán được đồng bộ theo lịch sử thu tiền · Đơn vị: VND</footer></div>
  </article>;
}
