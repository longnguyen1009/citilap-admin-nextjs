"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, CircleDollarSign, CreditCard, FileText, RefreshCw } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { fetchFinancialRecordsFromCloud, saveFinancialRecordToCloud } from '../../lib/apiFetchers';
import { getOptions } from '../../lib/useFieldOptions';

const paymentTypes = [
  { key: 'deposit', label: 'Thu tiền cọc' },
  { key: 'balance', label: 'Thu phần còn lại' },
  { key: 'cod', label: 'Thu COD' },
  { key: 'refund', label: 'Hoàn tiền' },
  { key: 'other', label: 'Khoản khác' }
];

const today = () => new Date().toISOString().slice(0, 10);

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
    recordType: 'expense', category: '', amount: '', occurredOn: today(), note: '', paymentMethod: 'transfer_cash'
  });
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingFinancial, setSavingFinancial] = useState(false);

  const activeOrders = useMemo(() => orders.filter(order => order.isActive !== false && Number(order.salePrice || 0) > 0), [orders]);
  const selectedOrder = activeOrders.find(order => String(order.id) === String(paymentForm.orderId));
  const remaining = selectedOrder ? Math.max(0, Number(selectedOrder.salePrice || 0) - Number(selectedOrder.amountPaid || 0)) : 0;
  const incomeTotal = payments.reduce((sum, item) => sum + (item.paymentType === 'refund' ? 0 : Number(item.amount || 0)), 0);
  const refundTotal = payments.reduce((sum, item) => sum + (item.paymentType === 'refund' ? Number(item.amount || 0) : 0), 0);

  useEffect(() => {
    if (!isAdmin) return;
    fetchFinancialRecordsFromCloud().then(data => {
      if (data) setFinancialRecords(data);
    });
  }, [isAdmin]);

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
      setFinancialForm(prev => ({ ...prev, category: '', amount: '', note: '' }));
      setMessage({ type: 'success', text: 'Đã lưu khoản thu/chi.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSavingFinancial(false);
    }
  };

  return (
    <section className="page-container">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="header-title">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BadgeDollarSign size={28} className="text-primary" /> Thanh toán & Tài chính
          </h1>
          <span className="subtitle" style={{ marginLeft: '38px' }}>Theo dõi tiền cọc, COD, hoàn tiền và các khoản thu chi</span>
        </div>
      </div>

      {message && <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', background: message.type === 'error' ? '#fef2f2' : '#ecfdf5', color: message.type === 'error' ? '#b91c1c' : '#047857' }}>{message.text}</div>}

      <div className="metrics-grid" style={{ marginBottom: '24px' }}>
        <div className="metric-card glass"><div className="metric-icon green"><CircleDollarSign size={24} /></div><div className="metric-info"><span className="metric-label">Đã thu</span><span className="metric-value">{formatAmount(incomeTotal)}</span><span className="metric-sub">Tổng payment không gồm hoàn tiền</span></div></div>
        <div className="metric-card glass"><div className="metric-icon orange"><RefreshCw size={24} /></div><div className="metric-info"><span className="metric-label">Đã hoàn</span><span className="metric-value">{formatAmount(refundTotal)}</span><span className="metric-sub">Tổng các giao dịch hoàn tiền</span></div></div>
        <div className="metric-card glass"><div className="metric-icon blue"><CreditCard size={24} /></div><div className="metric-info"><span className="metric-label">Đơn còn công nợ</span><span className="metric-value">{activeOrders.filter(order => Number(order.debtAmount || 0) > 0).length}</span><span className="metric-sub">Đơn đang còn số dư phải thu</span></div></div>
      </div>

      <div className="dashboard-grid" style={{ alignItems: 'start' }}>
        <form className="card glass" onSubmit={handlePaymentSubmit}>
          <div className="card-header"><h3><CreditCard size={18} /> Ghi nhận thanh toán</h3></div>
          <div className="card-body" style={{ display: 'grid', gap: '12px' }}>
            <label>Đơn hàng
              <select className="form-control" required value={paymentForm.orderId} onChange={event => setPaymentForm(prev => ({ ...prev, orderId: event.target.value }))}>
                <option value="">Chọn đơn hàng</option>
                {activeOrders.map(order => <option key={order.id} value={order.id}>#{order.id} - {formatAmount(order.salePrice)} - còn {formatAmount(order.debtAmount)}</option>)}
              </select>
            </label>
            <label>Loại giao dịch
              <select className="form-control" value={paymentForm.paymentType} onChange={event => setPaymentForm(prev => ({ ...prev, paymentType: event.target.value }))}>
                {paymentTypes.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label>Số tiền (triệu VNĐ)
              <input className="form-control" type="number" min="0.01" step="0.01" max={paymentForm.paymentType === 'refund' ? Number(selectedOrder?.amountPaid || 0) : remaining || undefined} required value={paymentForm.amount} onChange={event => setPaymentForm(prev => ({ ...prev, amount: event.target.value }))} />
            </label>
            <label>Phương thức
              <select className="form-control" value={paymentForm.paymentMethod} onChange={event => setPaymentForm(prev => ({ ...prev, paymentMethod: event.target.value }))}>
                {paymentMethods.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label>Ngày thanh toán<input className="form-control" type="date" required value={paymentForm.paymentDate} onChange={event => setPaymentForm(prev => ({ ...prev, paymentDate: event.target.value }))} /></label>
            <label>Mã tham chiếu<input className="form-control" value={paymentForm.referenceCode} onChange={event => setPaymentForm(prev => ({ ...prev, referenceCode: event.target.value }))} placeholder="Mã giao dịch ngân hàng / vận đơn" /></label>
            <label>Ghi chú<textarea className="form-control" rows="2" value={paymentForm.note} onChange={event => setPaymentForm(prev => ({ ...prev, note: event.target.value }))} /></label>
            <button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Đang lưu...' : 'Lưu giao dịch'}</button>
          </div>
        </form>

        {isAdmin && <form className="card glass" onSubmit={handleFinancialSubmit}>
          <div className="card-header"><h3><FileText size={18} /> Khoản thu / chi khác</h3></div>
          <div className="card-body" style={{ display: 'grid', gap: '12px' }}>
            <label>Loại sổ
              <select className="form-control" value={financialForm.recordType} onChange={event => setFinancialForm(prev => ({ ...prev, recordType: event.target.value }))}><option value="expense">Chi phí</option><option value="income">Thu khác</option><option value="adjustment">Điều chỉnh</option></select>
            </label>
            <label>Danh mục<input className="form-control" required value={financialForm.category} onChange={event => setFinancialForm(prev => ({ ...prev, category: event.target.value }))} placeholder="Ví dụ: phí ship, sửa chữa, quảng cáo" /></label>
            <label>Số tiền (triệu VNĐ)<input className="form-control" required type="number" min="0.01" step="0.01" value={financialForm.amount} onChange={event => setFinancialForm(prev => ({ ...prev, amount: event.target.value }))} /></label>
            <label>Ngày phát sinh<input className="form-control" required type="date" value={financialForm.occurredOn} onChange={event => setFinancialForm(prev => ({ ...prev, occurredOn: event.target.value }))} /></label>
            <label>Ghi chú<textarea className="form-control" rows="2" value={financialForm.note} onChange={event => setFinancialForm(prev => ({ ...prev, note: event.target.value }))} /></label>
            <button className="btn btn-outline" disabled={savingFinancial} type="submit">{savingFinancial ? 'Đang lưu...' : 'Lưu khoản thu / chi'}</button>
          </div>
        </form>}
      </div>

      <div className="glass-box" style={{ marginTop: '24px', padding: 0, overflow: 'hidden' }}>
        <div className="card-header"><h3><CreditCard size={18} /> Lịch sử thanh toán</h3></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Ngày</th><th>Đơn</th><th>Loại</th><th>Số tiền</th><th>Phương thức</th><th>Tham chiếu</th><th>Người ghi nhận</th></tr></thead><tbody>
          {payments.length === 0 ? <tr><td colSpan="7" className="empty-state">Chưa có giao dịch thanh toán</td></tr> : payments.map(payment => <tr key={payment.id}><td>{payment.paymentDate}</td><td>#{payment.orderId}</td><td>{paymentTypes.find(item => item.key === payment.paymentType)?.label || payment.paymentType}</td><td>{formatAmount(payment.amount)}</td><td>{payment.paymentMethod}</td><td>{payment.referenceCode || '-'}</td><td>{payment.recordedBy || '-'}</td></tr>)}
        </tbody></table></div>
      </div>

      {isAdmin && <div className="glass-box" style={{ marginTop: '24px', padding: 0, overflow: 'hidden' }}>
        <div className="card-header"><h3><FileText size={18} /> Sổ tài chính khác</h3></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Ngày</th><th>Loại</th><th>Danh mục</th><th>Số tiền</th><th>Ghi chú</th><th>Người ghi nhận</th></tr></thead><tbody>
          {financialRecords.length === 0 ? <tr><td colSpan="6" className="empty-state">Chưa có khoản thu chi khác</td></tr> : financialRecords.map(record => <tr key={record.id}><td>{record.occurredOn}</td><td>{record.recordType}</td><td>{record.category}</td><td>{formatAmount(record.amount)}</td><td>{record.note || '-'}</td><td>{record.recordedBy || '-'}</td></tr>)}
        </tbody></table></div>
      </div>}
    </section>
  );
}
