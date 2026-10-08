"use client";
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeDollarSign, CircleDollarSign, CreditCard, Landmark, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { getAuthHeaders } from '../../lib/apiFetchers';
import { getOptions } from '../../lib/useFieldOptions';
import { Modal } from '../ui/modal';
import { Button } from '@/components/ui/button';
import { useSubmission } from '@/lib/useSubmission';
import ListPagination, { useListPagination } from '../ui/ListPagination';
import RecordPaymentModal from '../RecordPaymentModal';

const paymentTypes = [
  { key: 'deposit', label: 'Thu tiền cọc' },
  { key: 'balance', label: 'Thu phần còn lại' },
  { key: 'cod', label: 'Thu COD' },
  { key: 'refund', label: 'Hoàn tiền' },
  { key: 'other', label: 'Khoản khác' }
];
const editablePaymentTypes = paymentTypes.filter(type => type.key !== 'refund');

const paymentTypeBadgeClass = {
  deposit: 'pill-badge pill-purple',
  balance: 'pill-badge pill-success',
  cod: 'pill-badge pill-warning',
  refund: 'pill-badge pill-danger',
  other: 'pill-badge pill-neutral'
};

const paymentMethodBadgeClass = {
  transfer_cash: 'pill-badge pill-info',
  card: 'pill-badge pill-purple',
  installment: 'pill-badge pill-info',
  debt: 'pill-badge pill-danger'
};

const today = () => {
  const value = new Date();
  const offset = value.getTimezoneOffset() * 60 * 1000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
};
const formatAmount = value => `${Number(value || 0).toFixed(2)} tr`;

export default function Payments({ initialOrderId = '' }) {
  const { orders, payments, customers, editPayment, appOptions, isAdmin } = useInventory();
  const [editingPayment, setEditingPayment] = useState(null);
  const paymentMethods = getOptions('paymentMethod', appOptions);
  const [message, setMessage] = useState(null);
  const submission = useSubmission();
  const saving = submission.pending;

  // Search & filter state
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');

  // Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(Boolean(initialOrderId));

  const activeOrders = useMemo(() => orders.filter(order => order.isActive !== false && Number(order.salePrice || 0) > 0), [orders]);
  const incomeTotal = payments.reduce((sum, item) => sum + (item.paymentType === 'refund' ? 0 : Number(item.amount || 0)), 0);
  const refundTotal = payments.reduce((sum, item) => sum + (item.paymentType === 'refund' ? Number(item.amount || 0) : 0), 0);
  const ordersWithDebt = activeOrders.filter(o => Number(o.debtAmount || 0) > 0).length;

  const customerByOrderId = useMemo(() => {
    const customerById = new Map(customers.map(customer => [String(customer.id), customer]));
    return new Map(orders.map(order => {
      const customer = customerById.get(String(order.customerId));
      const snapshotLines = String(order.customerInfo || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      const snapshotPhoneLine = snapshotLines.find(line => line.replace(/\D/g, '').length >= 8) || '';
      const snapshotPhone = snapshotPhoneLine.match(/(?:\+?84|0)[\d\s.-]{7,}/)?.[0]?.trim() || snapshotPhoneLine;
      const phone = customer?.phone || customer?.phoneNumber || snapshotPhone || '';
      const snapshotName = snapshotLines
        .map(line => line === snapshotPhoneLine ? line.replace(snapshotPhone, '').trim() : line)
        .find(Boolean) || '';
      const name = customer?.name || snapshotName;
      const display = [name, phone].filter(Boolean).join(' - ');
      return [String(order.id), { name: String(name).trim(), phone: String(phone).trim(), display }];
    }));
  }, [orders, customers]);

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const search = paymentSearch.trim().toLowerCase();
      const searchDigits = search.replace(/\D/g, '');
      const customer = customerByOrderId.get(String(p.orderId)) || { name: '', phone: '', display: '' };
      const customerPhone = customer.phone;
      const matchPhone = customerPhone.toLowerCase().includes(search)
        || (searchDigits.length >= 3 && customerPhone.replace(/\D/g, '').includes(searchDigits));
      const matchCustomerName = customer.name.toLowerCase().includes(search);
      const matchSearch = !search ||
        String(p.paymentDate || '').includes(search) ||
        String(p.paymentDate || '').split('-').reverse().join('/').includes(search) ||
        String(p.orderId || '').includes(search) ||
        matchPhone ||
        matchCustomerName ||
        (paymentTypes.find(t => t.key === p.paymentType)?.label || '').toLowerCase().includes(search) ||
        (paymentMethods.find(m => m.key === p.paymentMethod)?.label || '').toLowerCase().includes(search) ||
        (p.referenceCode || '').toLowerCase().includes(search) ||
        (p.recordedBy || '').toLowerCase().includes(search);
      const matchType = paymentTypeFilter === 'ALL' || p.paymentType === paymentTypeFilter;
      const matchMethod = paymentMethodFilter === 'ALL' || p.paymentMethod === paymentMethodFilter;
      return matchSearch && matchType && matchMethod;
    });
  }, [payments, paymentSearch, paymentTypeFilter, paymentMethodFilter, paymentMethods, customerByOrderId]);
  const paymentPages = useListPagination(filteredPayments, `${paymentSearch}|${paymentTypeFilter}|${paymentMethodFilter}`);

  return (
    <section className="page-section list-workspace-page">
      {/* HEADER */}
      <div className="section-title section-header list-page-header">
        <div>
          <h1 className="list-page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>
            <BadgeDollarSign size={24} className="text-primary" /> Thu tiền đơn hàng
          </h1>
          <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
            Ghi nhận tiền khách trả và theo dõi lịch sử thu/hoàn theo đơn
          </span>
        </div>
        <div className="section-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="default" size="sm" onClick={() => setIsPaymentModalOpen(true)}>
            <CreditCard size={14} /> Ghi nhận thanh toán
          </Button>
          {isAdmin && (
            <Link className="btn btn-secondary btn-sm" href="/finance/transactions">
              <Landmark size={14} /> Đối soát tài chính
            </Link>
          )}
        </div>
      </div>

      {/* MESSAGE */}
      {message && (
        <div style={{ marginBottom: '12px', padding: '10px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 500, background: message.type === 'error' ? '#fef2f2' : '#ecfdf5', color: message.type === 'error' ? '#b91c1c' : '#047857' }}>
          {message.text}
        </div>
      )}

      {/* SUMMARY STRIP */}
      <div className="list-summary-strip" aria-label="Tóm tắt tài chính">
        <div className="list-summary-item list-summary-item-success">
          <div className="summary-icon"><CircleDollarSign size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Đã thu</span>
            <strong className="summary-value">{formatAmount(incomeTotal)}</strong>
          </div>
        </div>
        <div className="list-summary-item list-summary-item-warning">
          <div className="summary-icon"><RefreshCw size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Đã hoàn</span>
            <strong className="summary-value">{formatAmount(refundTotal)}</strong>
          </div>
        </div>
        <div className="list-summary-item list-summary-item-value">
          <div className="summary-icon"><TrendingUp size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Thực thu</span>
            <strong className="summary-value">{formatAmount(incomeTotal - refundTotal)}</strong>
          </div>
        </div>
        <div className="list-summary-item">
          <div className="summary-icon"><CreditCard size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Đơn còn nợ</span>
            <strong className="summary-value">{ordersWithDebt}</strong>
          </div>
        </div>
      </div>

      {/* PAYMENT HISTORY TABLE */}
      <div className="card glass p-0 list-table-card" style={{ marginBottom: '12px' }}>
        {/* Filter bar */}
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', margin: 0 }}>
            <CreditCard size={16} /> Lịch sử thanh toán
          </h3>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Tìm giao dịch, đơn, tên/SĐT, ngày..."
                value={paymentSearch}
                onChange={e => setPaymentSearch(e.target.value)}
                style={{ padding: '5px 8px 5px 28px', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '6px', width: '200px', background: '#fff' }}
              />
            </div>
            <select
              value={paymentTypeFilter}
              onChange={e => setPaymentTypeFilter(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff' }}
            >
              <option value="ALL">Tất cả loại</option>
              {paymentTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select
              value={paymentMethodFilter}
              onChange={e => setPaymentMethodFilter(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff' }}
            >
              <option value="ALL">Tất cả phương thức</option>
              {paymentMethods.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="list-table-scroll">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Ngày</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Đơn</th>
                <th style={{ width: '210px', minWidth: '210px' }}>Tên - SĐT</th>
                <th style={{ width: '140px' }}>Loại</th>
                <th style={{ width: '125px', textAlign: 'right' }}>Số tiền (triệu VNĐ)</th>
                <th style={{ width: '190px', minWidth: '190px' }}>Phương thức</th>
                <th>Tham chiếu</th>
                <th style={{ width: '120px' }}>Người ghi nhận</th>
                {isAdmin && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                    <CreditCard size={40} style={{ opacity: 0.15, marginBottom: '12px' }} />
                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500 }}>Chưa có giao dịch thanh toán</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.7 }}>Bấm &quot;Ghi nhận thanh toán&quot; để bắt đầu</p>
                  </td>
                </tr>
              ) : paymentPages.pageRows.map(payment => (
                <tr key={payment.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{payment.paymentDate}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>#{payment.orderId}</td>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 650, color: '#334155' }}>
                    {customerByOrderId.get(String(payment.orderId))?.display || '—'}
                  </td>
                  <td>
                    <span className={paymentTypeBadgeClass[payment.paymentType] || 'pill-badge pill-neutral'}>
                      {paymentTypes.find(item => item.key === payment.paymentType)?.label || payment.paymentType}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: payment.paymentType === 'refund' ? '#dc2626' : '#059669' }}>
                    {payment.paymentType === 'refund' ? '-' : '+'}{formatAmount(payment.amount)}
                  </td>
                  <td>
                    <span className={paymentMethodBadgeClass[payment.paymentMethod] || 'pill-badge pill-neutral'}>
                      {paymentMethods.find(item => item.key === payment.paymentMethod)?.label || payment.paymentMethod}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{payment.referenceCode || '-'}</td>
                  <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{payment.recordedBy || '-'}</td>
                  {isAdmin && <td>{payment.paymentType === 'refund' ? <span style={{ color: '#94a3b8', fontSize: '0.8rem' }} title="Hoàn tiền được xử lý theo quy trình riêng">—</span> : <Button size="sm" variant="outline" onClick={() => { setMessage(null); setEditingPayment({ id: Number(payment.id), expectedAmount: Number(payment.amount), amount: payment.amount, expectedPaymentType: payment.paymentType, paymentType: payment.paymentType, reason: '' }); }}>Sửa</Button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ListPagination {...paymentPages} />
      </div>

      {/* PAYMENT MODAL */}
      <Modal open={Boolean(editingPayment)} onOpenChange={open => { if (!open && !saving) setEditingPayment(null); }} title="Sửa giao dịch thu tiền" maxWidth="max-w-xl">
        {editingPayment && <form onSubmit={event => { event.preventDefault(); submission.run(async () => {
          const result = await editPayment({ ...editingPayment, amount: Number(editingPayment.amount) });
          setMessage({ type: result.ok ? 'success' : 'error', text: result.ok ? 'Đã sửa giao dịch và cập nhật công nợ.' : result.message });
          if (result.ok) setEditingPayment(null);
        }); }} style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Giao dịch cũ: <strong>{paymentTypes.find(type => type.key === editingPayment.expectedPaymentType)?.label}</strong> · {formatAmount(editingPayment.expectedAmount)}. Thay đổi được lưu vào lịch sử.</p>
          <label style={{ display: 'grid', gap: 6 }}>Loại thu tiền
            <select className="form-control" required value={editingPayment.paymentType} onChange={e => setEditingPayment({ ...editingPayment, paymentType: e.target.value })}>
              {editablePaymentTypes.map(type => <option key={type.key} value={type.key}>{type.label}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>Số tiền mới (triệu VNĐ)<input className="form-control" type="number" min="0.000001" step="0.000001" required value={editingPayment.amount} onChange={e => setEditingPayment({ ...editingPayment, amount: e.target.value })} /></label>
          <label style={{ display: 'grid', gap: 6 }}>Lý do sửa<textarea className="form-control" required maxLength={1000} rows={3} value={editingPayment.reason} onChange={e => setEditingPayment({ ...editingPayment, reason: e.target.value })} /></label>
          {message?.type === 'error' && <p role="alert">{message.text}</p>}
          <Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</Button>
        </form>}
      </Modal>
      {isPaymentModalOpen && (
        <RecordPaymentModal
          open={isPaymentModalOpen}
          initialOrderId={initialOrderId}
          onClose={() => setIsPaymentModalOpen(false)}
        />
      )}

    </section>
  );
}
