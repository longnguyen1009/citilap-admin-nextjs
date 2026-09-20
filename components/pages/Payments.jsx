"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, CircleDollarSign, CreditCard, FileText, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { fetchFinancialRecordsFromCloud, saveFinancialRecordToCloud } from '../../lib/apiFetchers';
import { getOptions } from '../../lib/useFieldOptions';
import { Modal } from '../ui/modal';
import { Button } from '@/components/ui/button';

const paymentTypes = [
  { key: 'deposit', label: 'Thu tiền cọc' },
  { key: 'balance', label: 'Thu phần còn lại' },
  { key: 'cod', label: 'Thu COD' },
  { key: 'refund', label: 'Hoàn tiền' },
  { key: 'other', label: 'Khoản khác' }
];

const paymentTypeBadgeClass = {
  deposit: 'pill-badge pill-warning',
  balance: 'pill-badge pill-success',
  cod: 'pill-badge pill-info',
  refund: 'pill-badge pill-danger',
  other: 'pill-badge pill-neutral'
};

const paymentMethodBadgeClass = {
  transfer_cash: 'pill-badge pill-info',
  card: 'pill-badge pill-purple',
  installment: 'pill-badge pill-info',
  debt: 'pill-badge pill-danger'
};

const recordTypeLabels = {
  expense: 'Chi phí',
  income: 'Thu khác',
  adjustment: 'Điều chỉnh'
};

const recordTypeBadgeClass = {
  expense: 'pill-badge pill-danger',
  income: 'pill-badge pill-success',
  adjustment: 'pill-badge pill-info'
};

const today = () => {
  const value = new Date();
  const offset = value.getTimezoneOffset() * 60 * 1000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
};
const formatAmount = value => `${Number(value || 0).toFixed(2)} tr`;

export default function Payments() {
  const { orders, payments, recordPayment, appOptions, isAdmin } = useInventory();
  const paymentMethods = getOptions('paymentMethod', appOptions);
  const [financialRecords, setFinancialRecords] = useState([]);
  const [paymentForm, setPaymentForm] = useState({
    orderId: '', paymentType: 'deposit', amount: '', paymentMethod: 'transfer_cash',
    paymentDate: today(), referenceCode: '', note: ''
  });
  const [financialForm, setFinancialForm] = useState({
    recordType: 'expense', category: '', amount: '', occurredOn: today(), note: '', paymentMethod: 'transfer_cash', orderId: ''
  });
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingFinancial, setSavingFinancial] = useState(false);

  // Search & filter state
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
  const [financialSearch, setFinancialSearch] = useState('');
  const [financialTypeFilter, setFinancialTypeFilter] = useState('ALL');

  // Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);

  const activeOrders = useMemo(() => orders.filter(order => order.isActive !== false && Number(order.salePrice || 0) > 0), [orders]);
  const selectedOrder = activeOrders.find(order => String(order.id) === String(paymentForm.orderId));
  const remaining = selectedOrder ? Math.max(0, Number(selectedOrder.salePrice || 0) - Number(selectedOrder.amountPaid || 0)) : 0;
  const incomeTotal = payments.reduce((sum, item) => sum + (item.paymentType === 'refund' ? 0 : Number(item.amount || 0)), 0);
  const refundTotal = payments.reduce((sum, item) => sum + (item.paymentType === 'refund' ? Number(item.amount || 0) : 0), 0);
  const ordersWithDebt = activeOrders.filter(o => Number(o.debtAmount || 0) > 0).length;

  useEffect(() => {
    if (!isAdmin) return;
    fetchFinancialRecordsFromCloud().then(data => {
      if (data) setFinancialRecords(data);
    });
  }, [isAdmin]);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const matchSearch = !paymentSearch ||
        String(p.orderId || '').includes(paymentSearch) ||
        (paymentTypes.find(t => t.key === p.paymentType)?.label || '').toLowerCase().includes(paymentSearch.toLowerCase()) ||
        (paymentMethods.find(m => m.key === p.paymentMethod)?.label || '').toLowerCase().includes(paymentSearch.toLowerCase()) ||
        (p.referenceCode || '').toLowerCase().includes(paymentSearch.toLowerCase()) ||
        (p.recordedBy || '').toLowerCase().includes(paymentSearch.toLowerCase());
      const matchType = paymentTypeFilter === 'ALL' || p.paymentType === paymentTypeFilter;
      const matchMethod = paymentMethodFilter === 'ALL' || p.paymentMethod === paymentMethodFilter;
      return matchSearch && matchType && matchMethod;
    });
  }, [payments, paymentSearch, paymentTypeFilter, paymentMethodFilter, paymentMethods]);

  // Filtered financial records
  const filteredFinancials = useMemo(() => {
    return financialRecords.filter(r => {
      const matchSearch = !financialSearch ||
        (r.category || '').toLowerCase().includes(financialSearch.toLowerCase()) ||
        (r.note || '').toLowerCase().includes(financialSearch.toLowerCase()) ||
        (r.recordedBy || '').toLowerCase().includes(financialSearch.toLowerCase());
      const matchType = financialTypeFilter === 'ALL' || r.recordType === financialTypeFilter;
      return matchSearch && matchType;
    });
  }, [financialRecords, financialSearch, financialTypeFilter]);

  const handlePaymentSubmit = async event => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const result = await recordPayment({ ...paymentForm, amount: Number(paymentForm.amount) });
    setSaving(false);
    if (!result.ok) {
      setMessage({ type: 'error', text: result.message });
      return;
    }
    setMessage({ type: 'success', text: 'Đã ghi nhận thanh toán và cập nhật công nợ.' });
    setPaymentForm(prev => ({ ...prev, amount: '', referenceCode: '', note: '' }));
    setTimeout(() => setIsPaymentModalOpen(false), 600);
  };

  const handleFinancialSubmit = async event => {
    event.preventDefault();
    setSavingFinancial(true);
    setMessage(null);
    try {
      const saved = await saveFinancialRecordToCloud({
        ...financialForm,
        amount: Number(financialForm.amount)
      });
      setFinancialRecords(prev => [saved, ...prev]);
      setFinancialForm(prev => ({ ...prev, category: '', amount: '', note: '', orderId: '' }));
      setMessage({ type: 'success', text: 'Đã lưu khoản thu/chi.' });
      setTimeout(() => setIsFinancialModalOpen(false), 600);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSavingFinancial(false);
    }
  };

  return (
    <section className="page-section list-workspace-page">
      {/* HEADER */}
      <div className="section-title section-header list-page-header">
        <div>
          <h1 className="list-page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>
            <BadgeDollarSign size={24} className="text-primary" /> Thanh toán & Tài chính
          </h1>
          <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
            Theo dõi tiền cọc, COD, hoàn tiền và các khoản thu chi
          </span>
        </div>
        <div className="section-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="default" size="sm" onClick={() => setIsPaymentModalOpen(true)}>
            <CreditCard size={14} /> Ghi nhận thanh toán
          </Button>
          {isAdmin && (
            <Button variant="secondary" size="sm" onClick={() => setIsFinancialModalOpen(true)}>
              <FileText size={14} /> Khoản thu/chi
            </Button>
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
                placeholder="Tìm giao dịch..."
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
                <th style={{ width: '140px' }}>Loại</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Số tiền</th>
                <th style={{ width: '190px', minWidth: '190px' }}>Phương thức</th>
                <th>Tham chiếu</th>
                <th style={{ width: '120px' }}>Người ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                    <CreditCard size={40} style={{ opacity: 0.15, marginBottom: '12px' }} />
                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500 }}>Chưa có giao dịch thanh toán</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.7 }}>Bấm &quot;Ghi nhận thanh toán&quot; để bắt đầu</p>
                  </td>
                </tr>
              ) : filteredPayments.map(payment => (
                <tr key={payment.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{payment.paymentDate}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>#{payment.orderId}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FINANCIAL RECORDS TABLE (Admin only) */}
      {isAdmin && (
        <div className="card glass p-0 list-table-card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', margin: 0 }}>
              <FileText size={16} /> Sổ tài chính khác
            </h3>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Tìm danh mục, ghi chú..."
                  value={financialSearch}
                  onChange={e => setFinancialSearch(e.target.value)}
                  style={{ padding: '5px 8px 5px 28px', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '6px', width: '200px', background: '#fff' }}
                />
              </div>
              <select
                value={financialTypeFilter}
                onChange={e => setFinancialTypeFilter(e.target.value)}
                style={{ padding: '5px 8px', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff' }}
              >
                <option value="ALL">Tất cả loại</option>
                <option value="expense">Chi phí</option>
                <option value="income">Thu khác</option>
                <option value="adjustment">Điều chỉnh</option>
              </select>
            </div>
          </div>
          <div className="list-table-scroll">
            <table className="data-table data-table-wide">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>Ngày</th>
                  <th style={{ width: '120px' }}>Loại</th>
                  <th style={{ minWidth: '150px' }}>Danh mục</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Số tiền</th>
                  <th>Ghi chú</th>
                  <th style={{ width: '120px' }}>Người ghi nhận</th>
                </tr>
              </thead>
              <tbody>
                {filteredFinancials.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                      <FileText size={40} style={{ opacity: 0.15, marginBottom: '12px' }} />
                      <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500 }}>Chưa có khoản thu chi khác</p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.7 }}>Bấm &quot;Khoản thu/chi&quot; để thêm mới</p>
                    </td>
                  </tr>
                ) : filteredFinancials.map(record => (
                  <tr key={record.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{record.occurredOn}</td>
                    <td>
                      <span className={recordTypeBadgeClass[record.recordType] || 'pill-badge pill-neutral'}>
                        {recordTypeLabels[record.recordType] || record.recordType}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{record.category}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: record.recordType === 'expense' ? '#dc2626' : '#059669' }}>
                      {formatAmount(record.amount)}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{record.note || '-'}</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{record.recordedBy || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      <Modal open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen} title="Ghi nhận thanh toán" maxWidth="max-w-xl">
        <form onSubmit={handlePaymentSubmit} style={{ display: 'grid', gap: '14px' }}>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Đơn hàng <span style={{color:'#ef4444'}}>*</span></label>
            <select className="form-control" required value={paymentForm.orderId} onChange={e => setPaymentForm(prev => ({ ...prev, orderId: e.target.value }))}>
              <option value="">Chọn đơn hàng</option>
              {activeOrders.map(order => <option key={order.id} value={order.id}>#{order.id} - {formatAmount(order.salePrice)} - còn {formatAmount(order.debtAmount)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Loại giao dịch</label>
            <select className="form-control" value={paymentForm.paymentType} onChange={e => setPaymentForm(prev => ({ ...prev, paymentType: e.target.value }))}>
              {paymentTypes.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Số tiền (triệu VNĐ) <span style={{color:'#ef4444'}}>*</span></label>
            <input
              className="form-control"
              type="number"
              min="0.01"
              step="0.01"
              max={paymentForm.paymentType === 'refund' ? Number(selectedOrder?.amountPaid || 0) : remaining}
              placeholder={!selectedOrder ? 'Chọn đơn hàng trước' : ''}
              disabled={!selectedOrder}
              required
              value={paymentForm.amount}
              onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
            />
            {!selectedOrder && <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px', display: 'block' }}>Vui lòng chọn đơn hàng để nhập số tiền</span>}
            {selectedOrder && paymentForm.paymentType !== 'refund' && remaining > 0 && (
              <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', display: 'block' }}>Còn nợ: {formatAmount(remaining)} tr</span>
            )}
          </div>
          <div className="finance-form-grid">
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Phương thức</label>
              <select className="form-control" value={paymentForm.paymentMethod} onChange={e => setPaymentForm(prev => ({ ...prev, paymentMethod: e.target.value }))}>
                {paymentMethods.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Ngày thanh toán</label>
              <input className="form-control" type="date" required value={paymentForm.paymentDate} onChange={e => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Mã tham chiếu</label>
            <input className="form-control" value={paymentForm.referenceCode} onChange={e => setPaymentForm(prev => ({ ...prev, referenceCode: e.target.value }))} placeholder="Mã giao dịch ngân hàng / vận đơn" />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Ghi chú</label>
            <textarea className="form-control" rows="2" value={paymentForm.note} onChange={e => setPaymentForm(prev => ({ ...prev, note: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsPaymentModalOpen(false)}>Hủy</Button>
            <Button type="submit" variant="default" size="sm" disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu giao dịch'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* FINANCIAL RECORD MODAL (Admin only) */}
      {isAdmin && (
        <Modal open={isFinancialModalOpen} onOpenChange={setIsFinancialModalOpen} title="Khoản thu / chi khác" maxWidth="max-w-xl">
          <form onSubmit={handleFinancialSubmit} style={{ display: 'grid', gap: '14px' }}>
            <div className="form-group">
              <label htmlFor="financial-order" style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Liên kết đơn hàng</label>
              <select id="financial-order" className="form-control" value={financialForm.orderId} onChange={e => setFinancialForm(prev => ({ ...prev, orderId: e.target.value }))}>
                <option value="">Không gắn với đơn hàng</option>
                {activeOrders.map(order => <option key={order.id} value={order.id}>#{order.id} · {order.customerInfo || 'Chưa có tên khách'} · {formatAmount(order.salePrice)}</option>)}
              </select>
              <small className="form-hint">Chọn đơn để khoản thu/chi xuất hiện trong phần tài chính của hóa đơn tương ứng.</small>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Loại sổ</label>
              <select className="form-control" value={financialForm.recordType} onChange={e => setFinancialForm(prev => ({ ...prev, recordType: e.target.value }))}>
                <option value="expense">Chi phí</option>
                <option value="income">Thu khác</option>
                <option value="adjustment">Điều chỉnh</option>
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Danh mục <span style={{color:'#ef4444'}}>*</span></label>
              <input className="form-control" required value={financialForm.category} onChange={e => setFinancialForm(prev => ({ ...prev, category: e.target.value }))} placeholder="Ví dụ: phí ship, sửa chữa, quảng cáo" />
            </div>
            <div className="finance-form-grid">
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Số tiền (triệu VNĐ)</label>
                <input className="form-control" required type="number" min="0.01" step="0.01" value={financialForm.amount} onChange={e => setFinancialForm(prev => ({ ...prev, amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Ngày phát sinh</label>
                <input className="form-control" required type="date" value={financialForm.occurredOn} onChange={e => setFinancialForm(prev => ({ ...prev, occurredOn: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>Ghi chú</label>
              <textarea className="form-control" rows="2" value={financialForm.note} onChange={e => setFinancialForm(prev => ({ ...prev, note: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsFinancialModalOpen(false)}>Hủy</Button>
              <Button type="submit" variant="secondary" size="sm" disabled={savingFinancial}>
                {savingFinancial ? 'Đang lưu...' : 'Lưu khoản thu/chi'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
