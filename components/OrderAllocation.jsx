'use client';
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/lib/apiFetchers';
import { Modal } from '@/components/ui/modal';
import { useInventory } from '@/context/InventoryContext';

export default function OrderAllocation({ order, onClose, initialLaptopId }) {
  const { applyAllocationUpdate } = useInventory();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(String(initialLaptopId || order.laptopId || ''));
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/order-allocation', { headers: await getAuthHeaders() });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (active) setData(payload);
      } catch (err) { if (active) setError(err.message); }
    })();
    return () => { active = false; };
  }, []);
  const owner = data?.orders.find(item => String(item.laptop_id) === selected && String(item.id) !== String(order.id));
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/order-allocation', {
        method: 'POST', headers: await getAuthHeaders(),
        body: JSON.stringify({ orderId: Number(order.id), laptopId: selected ? Number(selected) : null, expectedOwner: owner?.id ?? null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      applyAllocationUpdate(payload);
      onClose(payload);
    } catch (err) { setError(err.message); setSaving(false); }
  }
  async function release() {
    if (saving || !order.laptopId) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/order-allocation', {
        method: 'POST', headers: await getAuthHeaders(),
        body: JSON.stringify({ orderId: Number(order.id), laptopId: null, expectedOwner: null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      applyAllocationUpdate(payload);
      onClose(payload);
    } catch (err) { setError(err.message); setSaving(false); }
  }
  return <Modal open onOpenChange={open => { if (!open && !saving) onClose(); }} title={`Phân máy · Đơn #${order.id}`} description="Chọn máy thực tế cho đơn hàng."><form onSubmit={submit}>
    {(order.requestedConfiguration || order.requested_configuration) && (
      <div style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
        fontSize: 13,
        color: '#1e40af'
      }}>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📋 Cấu hình đã chọn / yêu cầu:</span>
          {(order.requestedLaptopId || order.requested_laptop_id) && (
            <span style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: 4 }}>
              Máy từng chọn: #{order.requestedLaptopId || order.requested_laptop_id}
            </span>
          )}
        </div>
        <div style={{ marginTop: 4, fontWeight: 500, color: '#1e3a8a' }}>
          {order.requestedConfiguration || order.requested_configuration}
        </div>
      </div>
    )}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label htmlFor="allocation-search" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>Tìm ID, cấu hình hoặc serial</label>
        <input id="allocation-search" className="form-control" style={{ width: '100%', boxSizing: 'border-box' }} value={search} onChange={event => setSearch(event.target.value)} disabled={saving} placeholder="Nhập tên máy, serial hoặc ID..." />
      </div>
      <div>
        <label htmlFor="allocation-machine" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>Máy thực tế</label>
        <select id="allocation-machine" className="form-control" style={{ width: '100%', boxSizing: 'border-box' }} value={selected} onChange={event => setSelected(event.target.value)} disabled={!data || saving}>
          <option value="">Chọn máy</option>
          {data?.machines.filter(machine => String(machine.id) === selected || `${machine.id} ${machine.name} ${machine.serial || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map(machine => <option key={machine.id} value={machine.id}>#{machine.id} · {machine.name} · {machine.serial || 'Chưa serial'}</option>)}
        </select>
      </div>
    </div>
    {owner && (
      <div role="status" style={{
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 8,
        padding: '10px 14px',
        marginTop: 14,
        fontSize: 13,
        color: '#92400e',
        lineHeight: 1.4
      }}>
        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: '#b45309' }}>
          <span>⚠️ Máy đang giữ cho đơn #{owner.id} · {owner.customer_info || 'Chưa có tên khách'}</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#78350f' }}>
          Xác nhận sẽ chuyển máy sang đơn này. Đơn #{owner.id} sẽ chuyển về trạng thái <strong>Chờ phân máy</strong>, <strong>vẫn lưu cấu hình đã chọn</strong> và <strong>giữ nguyên tiền đã thu</strong>.
        </div>
      </div>
    )}
    {error && <p role="alert" className="form-submit-error">{error}</p>}
    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
      <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Đóng</button>
      {order.laptopId && <button type="button" className="btn btn-outline" disabled={saving} onClick={release}>Giải phóng máy</button>}
      <button className="btn btn-primary" disabled={!data || saving || !selected || String(selected) === String(order.laptopId || '')}>{saving ? 'Đang lưu…' : owner ? 'Xác nhận chuyển máy' : 'Xác nhận phân máy'}</button>
    </div>
  </form></Modal>;
}
