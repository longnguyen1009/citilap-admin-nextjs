'use client';
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useInventory } from '@/context/InventoryContext';
import { getAuthHeaders } from '@/lib/apiFetchers';
import { getOptions } from '@/lib/useFieldOptions';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useSubmission } from '@/lib/useSubmission';

export const PAYMENT_TYPES = [
  { key: 'deposit', label: 'Thu tiền cọc' },
  { key: 'balance', label: 'Thu phần còn lại' },
  { key: 'cod', label: 'Thu COD' },
  { key: 'refund', label: 'Hoàn tiền' },
  { key: 'other', label: 'Khoản khác' }
];

const today = () => {
  const value = new Date();
  const offset = value.getTimezoneOffset() * 60 * 1000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
};

const formatAmount = value => `${Number(value || 0).toFixed(2)} tr`;

export default function RecordPaymentModal({
  open = true,
  onClose,
  initialOrderId = '',
  onSuccess
}) {
  const { orders, recordPayment, appOptions } = useInventory();
  const paymentMethods = getOptions('paymentMethod', appOptions);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [paymentForm, setPaymentForm] = useState({
    orderId: String(initialOrderId || ''),
    paymentType: 'deposit',
    amount: '',
    paymentMethod: 'transfer_cash',
    paymentDate: today(),
    referenceCode: '',
    note: '',
    accountId: '',
    idempotencyKey: ''
  });
  const [message, setMessage] = useState(null);
  const submission = useSubmission();
  const saving = submission.pending;

  const activeOrders = useMemo(() => orders.filter(order => order.isActive !== false && Number(order.salePrice || 0) > 0), [orders]);
  const selectedOrder = activeOrders.find(order => String(order.id) === String(paymentForm.orderId));
  const remaining = selectedOrder ? Math.max(0, Number(selectedOrder.debtAmount || 0)) : 0;

  useEffect(() => {
    let active = true;
    getAuthHeaders()
      .then(headers => fetch('/api/cash-accounts?currency=VND', { headers }))
      .then(response => response.ok ? response.json() : [])
      .then(accounts => {
        if (active) setCashAccounts(accounts);
      })
      .catch(() => {
        if (active) setCashAccounts([]);
      });
    return () => { active = false; };
  }, []);

  const handlePaymentSubmit = async event => {
    event.preventDefault();
    return submission.run(async () => {
      setMessage(null);
      const idempotencyKey = paymentForm.idempotencyKey || crypto.randomUUID();
      setPaymentForm(prev => ({ ...prev, idempotencyKey }));
      try {
        const result = await recordPayment({ ...paymentForm, amount: Number(paymentForm.amount), idempotencyKey });
        if (!result.ok) {
          setMessage({ type: 'error', text: result.message });
          toast.error(result.message || 'Không thể lưu giao dịch.');
          return;
        }
        toast.success('Đã ghi nhận thanh toán và cập nhật công nợ.');
        if (onSuccess) onSuccess(result);
        onClose();
      } catch (error) {
        setMessage({ type: 'error', text: error.message || 'Không thể lưu giao dịch. Vui lòng thử lại.' });
        toast.error(error.message || 'Không thể lưu giao dịch.');
      }
    });
  };

  return (
    <Modal open={open} onOpenChange={o => { if (!saving && !o) onClose(); }} title="Ghi nhận thanh toán" maxWidth="max-w-xl">
      <form aria-busy={saving} onSubmit={handlePaymentSubmit} style={{ display: 'grid', gap: '14px' }}>
        {message?.type === "error" && <p role="alert" className="form-submit-error">{message.text}</p>}
        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
            Đơn hàng <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            id="payment-order"
            aria-label="Đơn hàng cần thu tiền"
            className="form-control"
            required
            value={paymentForm.orderId}
            onChange={e => setPaymentForm(prev => ({ ...prev, orderId: e.target.value }))}
          >
            <option value="">Chọn đơn hàng</option>
            {activeOrders.map(order => (
              <option key={order.id} value={order.id}>
                #{order.id} - {formatAmount(order.salePrice)} - còn {formatAmount(order.debtAmount)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
            Loại giao dịch
          </label>
          <select
            className="form-control"
            value={paymentForm.paymentType}
            onChange={e => setPaymentForm(prev => ({ ...prev, paymentType: e.target.value }))}
          >
            {PAYMENT_TYPES.map(item => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
            Số tiền (triệu VNĐ) <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            className="form-control"
            type="number"
            min="0.01"
            step="0.01"
            max={paymentForm.paymentType === 'refund' ? Number(selectedOrder?.amountPaid || 0) : (remaining > 0 ? remaining : undefined)}
            placeholder={!selectedOrder ? 'Chọn đơn hàng trước' : ''}
            disabled={!selectedOrder}
            required
            value={paymentForm.amount}
            onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
          />
          {!selectedOrder && (
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
              Vui lòng chọn đơn hàng để nhập số tiền
            </span>
          )}
          {selectedOrder && paymentForm.paymentType !== 'refund' && remaining > 0 && (
            <span
              style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', display: 'block', cursor: 'pointer' }}
              onClick={() => setPaymentForm(prev => ({ ...prev, amount: String(remaining) }))}
              title="Bấm để tự động điền toàn bộ số tiền còn lại"
            >
              Còn phải thu: <span style={{ color: '#2563eb', textDecoration: 'underline' }}>{formatAmount(remaining)}</span>
            </span>
          )}
        </div>
        <div className="finance-form-grid">
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
              Phương thức
            </label>
            <select
              className="form-control"
              value={paymentForm.paymentMethod}
              onChange={e => setPaymentForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
            >
              {paymentMethods.map(item => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
              Ngày thanh toán
            </label>
            <input
              className="form-control"
              type="date"
              required
              value={paymentForm.paymentDate}
              onChange={e => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
            />
          </div>
        </div>
        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
            Tài khoản nhận/chi <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            data-testid="payment-account-select"
            className="form-control"
            required
            value={paymentForm.accountId}
            onChange={e => setPaymentForm(prev => ({ ...prev, accountId: e.target.value, idempotencyKey: prev.idempotencyKey || crypto.randomUUID() }))}
          >
            <option value="">Chọn tài khoản VND</option>
            {cashAccounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
          {!cashAccounts.length && (
            <span style={{ fontSize: '.75rem', color: '#b45309' }}>
              ADMIN cần tạo tài khoản tiền và opening balance trước khi ghi payment mới.
            </span>
          )}
        </div>
        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
            Mã tham chiếu
          </label>
          <input
            className="form-control"
            value={paymentForm.referenceCode}
            onChange={e => setPaymentForm(prev => ({ ...prev, referenceCode: e.target.value }))}
            placeholder="Mã giao dịch ngân hàng / vận đơn"
          />
        </div>
        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
            Ghi chú
          </label>
          <textarea
            className="form-control"
            rows={2}
            value={paymentForm.note}
            onChange={e => setPaymentForm(prev => ({ ...prev, note: e.target.value }))}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="default" size="sm" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu giao dịch'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
