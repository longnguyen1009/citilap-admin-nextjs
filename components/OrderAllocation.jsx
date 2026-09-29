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
    <label htmlFor="allocation-search">Tìm ID, cấu hình hoặc serial</label>
    <input id="allocation-search" className="form-control" value={search} onChange={event => setSearch(event.target.value)} disabled={saving} />
    <label htmlFor="allocation-machine">Máy thực tế</label>
    <select id="allocation-machine" className="form-control" value={selected} onChange={event => setSelected(event.target.value)} disabled={!data || saving}>
      <option value="">Chọn máy</option>
      {data?.machines.filter(machine => String(machine.id) === selected || `${machine.id} ${machine.name} ${machine.serial || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map(machine => <option key={machine.id} value={machine.id}>#{machine.id} · {machine.name} · {machine.serial || 'Chưa serial'}</option>)}
    </select>
    {owner && <p role="status">Máy đang giữ cho đơn #{owner.id} · {owner.customer_info}. Xác nhận sẽ chuyển máy sang đơn này; đơn #{owner.id} trở lại chờ phân máy và giữ nguyên tiền đã thu.</p>}
    {error && <p role="alert" className="form-submit-error">{error}</p>}
    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
      <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Đóng</button>
      {order.laptopId && <button type="button" className="btn btn-outline" disabled={saving} onClick={release}>Giải phóng máy</button>}
      <button className="btn btn-primary" disabled={!data || saving || !selected || String(selected) === String(order.laptopId || '')}>{saving ? 'Đang lưu…' : owner ? 'Xác nhận chuyển máy' : 'Xác nhận phân máy'}</button>
    </div>
  </form></Modal>;
}
