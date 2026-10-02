'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, CirclePlus, Coins, RefreshCw, Search, X } from 'lucide-react';
import { getAuthHeaders } from '@/lib/apiFetchers';
import ListPagination, { useListPagination } from '../ui/ListPagination';

const TYPE_LABELS = {
  TRADE_IN_ACQUISITION: 'Giá thu máy cũ',
  VN_SHIPPING: 'Vận chuyển về Việt Nam',
  PAYMENT_FEE: 'Phí thanh toán',
  REPAIR: 'Sửa chữa',
  RAM_UPGRADE: 'Nâng cấp RAM',
  SSD_UPGRADE: 'Nâng cấp SSD',
  ACCESSORY: 'Phụ kiện',
  CLEANING: 'Vệ sinh',
  OTHER: 'Khác',
  REFUND_CREDIT: 'Hoàn / giảm giá',
};
const MANUAL_TYPES = ['VN_SHIPPING', 'RAM_UPGRADE', 'SSD_UPGRADE', 'ACCESSORY', 'CLEANING', 'OTHER'];
const REASON_LABELS = {
  UNKNOWN_SOURCE: 'Chưa xác định nguồn nhập',
  MISSING_PURCHASE_BATCH: 'Chưa gắn lô mua',
  MISSING_EXCHANGE_RATE: 'Thiếu tỷ giá mua',
  MISSING_TRADE_IN_ACQUISITION: 'Thiếu giá thu máy cũ',
  ACTIVE_REPAIR_COST_PENDING: 'Phiếu sửa chưa hoàn tất',
};
const vnd = value => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0))} ₫`;

async function api(url, options = {}) {
  const headers = await getAuthHeaders();
  const response = await fetch(url, { ...options, headers: { ...headers, 'Content-Type': 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể xử lý yêu cầu');
  return data;
}

export default function Costs() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api('/api/costs'));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api('/api/costs')
      .then(data => { if (active) setRows(data); })
      .catch(loadError => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => rows.filter(row => (
    (!status || row.cost_status === status)
    && `${row.laptops?.name || ''} ${row.laptops?.serial || ''} ${row.laptops?.location || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )), [rows, search, status]);
  const costPages = useListPagination(visible, `${search}|${status}`);
  const totals = useMemo(() => ({
    landed: rows.reduce((sum, row) => sum + Number(row.landed_cost_vnd || 0), 0),
    complete: rows.filter(row => row.cost_status === 'COMPLETE').length,
    incomplete: rows.filter(row => row.cost_status === 'INCOMPLETE').length,
  }), [rows]);

  const open = async row => {
    try {
      await api('/api/costs', { method: 'POST', body: JSON.stringify({ action: 'sync', laptopId: row.laptop_id }) });
      setDetail(await api(`/api/costs?laptopId=${row.laptop_id}`));
      setError('');
    } catch (openError) {
      setError(openError.message);
    }
  };
  const refreshDetail = async laptopId => {
    setDetail(await api(`/api/costs?laptopId=${laptopId}`));
    await load();
  };
  const addCost = async event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    try {
      await api('/api/costs', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          laptopId: detail.summary.laptop_id,
          costType: form.get('costType'),
          amountVnd: form.get('amountVnd'),
          description: form.get('description'),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      await refreshDetail(detail.summary.laptop_id);
      formElement.reset();
      setError('');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };
  const voidCost = async component => {
    const reason = window.prompt('Lý do hủy cấu phần chi phí');
    if (!reason) return;
    setSaving(true);
    try {
      await api('/api/costs', {
        method: 'POST',
        body: JSON.stringify({ action: 'void', id: component.id, reason }),
      });
      await refreshDetail(detail.summary.laptop_id);
      setError('');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="cost-page">
    <header className="cost-hero">
      <div>
        <span>GIÁ VỐN THEO TỪNG MÁY</span>
        <h1>Giá vốn thực tế</h1>
        <p>Giá mua và vận chuyển Trung Quốc lấy trực tiếp từ laptop. Chi phí sửa chữa, nâng cấp và vận chuyển bổ sung được cộng đúng một lần.</p>
      </div>
      <button onClick={load}><RefreshCw size={17} /> Đồng bộ danh sách</button>
    </header>
    {error && <div className="error-message" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}

    <section className="cost-metrics">
      <article><Coins /><div><b>{vnd(totals.landed)}</b><span>Tổng giá vốn</span></div></article>
      <article><Calculator /><div><b>{rows.length}</b><span>Laptop được theo dõi</span></div></article>
      <article><b>{totals.complete}</b><span>Đủ dữ liệu giá vốn</span></article>
      <article className="warn"><b>{totals.incomplete}</b><span>Cần bổ sung dữ liệu</span></article>
    </section>

    <section className="cost-toolbar">
      <label><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, serial, vị trí" /></label>
      <select aria-label="Lọc giá vốn" value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">Tất cả trạng thái</option>
        <option value="COMPLETE">Đủ dữ liệu</option>
        <option value="INCOMPLETE">Thiếu dữ liệu</option>
      </select>
    </section>

    <div className="cost-layout cost-layout-wide">
      <section className="cost-table-wrap">
        <table className="cost-table">
          <thead><tr><th>Laptop</th><th>Giá mua</th><th>Vận chuyển</th><th>Sửa / nâng cấp</th><th>Giá vốn</th><th>Độ đầy đủ</th><th>Thao tác</th></tr></thead>
          <tbody>{costPages.pageRows.map(row => <tr key={row.laptop_id} onClick={() => open(row)}>
            <td><b>{row.laptops?.name || `Laptop #${row.laptop_id}`}</b><small>{row.laptops?.serial || 'Chưa có serial'} · {row.laptops?.location || '—'}</small></td>
            <td>{vnd(row.purchase_cost_vnd)}</td>
            <td>{vnd(Number(row.cn_shipping_vnd) + Number(row.vn_shipping_vnd))}</td>
            <td>{vnd(Number(row.repair_cost_vnd) + Number(row.upgrade_cost_vnd) + Number(row.accessory_cost_vnd) + Number(row.other_cost_vnd))}</td>
            <td><strong>{vnd(row.landed_cost_vnd)}</strong></td>
            <td><span className={`cost-status ${row.cost_status}`}>{row.cost_status === 'COMPLETE' ? 'ĐỦ DỮ LIỆU' : 'CẦN BỔ SUNG'}</span>{row.reasons?.map(reason => <small key={reason}>{REASON_LABELS[reason] || reason}</small>)}</td>
            <td><button className="cost-open" onClick={event => { event.stopPropagation(); open(row); }}>Chi tiết</button></td>
          </tr>)}</tbody>
        </table>
        {!visible.length && <div className="cost-empty">Không có laptop phù hợp bộ lọc.</div>}
        <ListPagination {...costPages} />
      </section>
    </div>

    {detail && <div className="modal-backdrop active"><div className="cost-drawer">
      <header><div><small>LAPTOP #{detail.summary.laptop_id}</small><h2>Chi tiết giá vốn</h2><span className={`cost-status ${detail.summary.cost_status}`}>{detail.summary.cost_status === 'COMPLETE' ? 'ĐỦ DỮ LIỆU' : 'CẦN BỔ SUNG'}</span></div><button onClick={() => setDetail(null)}><X /></button></header>
      <div className="cost-total"><span>Giá vốn hiện tại</span><b>{vnd(detail.summary.landed_cost_vnd)}</b></div>
      <section className="cost-components">
        <article><div><b>Giá mua quy đổi</b><small>Giá tệ × tỷ giá của laptop</small></div><strong>{vnd(detail.summary.purchase_cost_vnd)}</strong></article>
        <article><div><b>Vận chuyển Trung Quốc</b><small>Phí tệ × tỷ giá của laptop</small></div><strong>{vnd(detail.summary.cn_shipping_vnd)}</strong></article>
        {detail.components.map(component => <article className={component.voided_at ? 'voided' : ''} key={component.id}>
          <div><b>{TYPE_LABELS[component.cost_type] || component.cost_type}</b><small>{component.description} · {component.source_type}</small><small>{new Date(component.occurred_at).toLocaleString('vi-VN')}</small></div>
          <strong>{component.cost_type === 'REFUND_CREDIT' ? '-' : ''}{vnd(component.amount_vnd)}</strong>
          {component.source_type === 'MANUAL' && !component.voided_at && <button onClick={() => voidCost(component)}>Hủy</button>}
        </article>)}
      </section>
      <form className="cost-add-form" onSubmit={addCost}>
        <h3><CirclePlus size={17} /> Thêm chi phí phát sinh</h3>
        <select name="costType">{MANUAL_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select>
        <input name="amountVnd" type="number" min="0" step="1" placeholder="Số tiền VND" required />
        <input name="description" placeholder="Mô tả / chứng từ" required />
        <button disabled={saving}>Ghi nhận</button>
      </form>
    </div></div>}
  </div>;
}
