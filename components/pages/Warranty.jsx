"use client";
import React, { useMemo, useState } from 'react';
import { useInventory, isOrderCommitted } from '../../context/InventoryContext';
import { RESOLVED_WARRANTY_STATUS_KEYS } from '../../lib/fieldOptions';
import { labelToKey } from '../../lib/useFieldOptions';
import { Wrench, Search, Plus, CheckCircle2 } from 'lucide-react';

const emptyCase = () => ({
  laptopId: '', orderId: '', customerInfo: '', receivedDate: new Date().toLocaleDateString('vi-VN'),
  reportedIssue: '', status: 'received', diagnosis: '', resolution: '', repairCost: '', notes: ''
});

export default function Warranty() {
  const { laptops, orders, customers, warrantyCases, WARRANTY_CASE_STATUS_OPTIONS, createWarrantyCase, updateWarrantyCase } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [formData, setFormData] = useState(emptyCase);

  const rows = useMemo(() => warrantyCases.filter(item => {
    const laptop = laptops.find(machine => machine.id === item.laptopId);
    const source = [item.id, item.customerInfo, item.reportedIssue, laptop?.id, laptop?.name, laptop?.serial].join(' ').toLowerCase();
    return !searchTerm || source.includes(searchTerm.toLowerCase());
  }), [warrantyCases, laptops, searchTerm]);
  const openCases = rows.filter(item => {
    const k = labelToKey('warrantyCaseStatus', item.status);
    return !RESOLVED_WARRANTY_STATUS_KEYS.includes(k);
  }).length;

  const openCreate = () => { setEditingCase(null); setFormData(emptyCase()); setIsModalOpen(true); };
  const openEdit = (item) => { setEditingCase(item); setFormData({ ...item, repairCost: item.repairCost ?? '' }); setIsModalOpen(true); };
  const handleLaptopChange = (laptopId) => {
    const laptop = laptops.find(item => String(item.id) === String(laptopId));
    const linkedOrder = orders.find(order => String(order.laptopId) === String(laptopId) && isOrderCommitted(order));
    setFormData(prev => ({ ...prev, laptopId, orderId: linkedOrder?.id || '', customerInfo: linkedOrder?.customerId ? (customers.find(c => c.id === linkedOrder.customerId)?.name || '') : prev.customerInfo, notes: laptop?.conditionNote || prev.notes }));
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = editingCase ? await updateWarrantyCase(editingCase.id, formData) : await createWarrantyCase(formData);
    if (!result.ok) return alert(`⛔ ${result.message}`);
    setIsModalOpen(false);
  };

  return (
    <section className="page-section">
      <div className="section-title section-header">
        <div><h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}><Wrench className="text-primary" size={24} /> Bảo Hành & Đổi Trả</h1><p className="subtitle">{openCases} phiếu đang xử lý · mọi lần tiếp nhận đều gắn với máy và đơn gốc.</p></div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Tiếp Nhận Bảo Hành</button>
      </div>

      <div className="card glass filter-card" style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem' }}><div className="filter-item"><label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}><Search size={13} style={{ display: 'inline', marginRight: '3px' }} /> Tìm phiếu, máy, serial hoặc khách</label><input className="form-control" style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem', width: 'min(420px, 100%)' }} value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></div></div>

      <div className="card glass p-0" style={{ overflowX: 'auto' }}>
        <table className="data-table data-table-wide" style={{ width: '100%' }}><thead><tr><th>Phiếu</th><th>Máy / Serial</th><th>Khách & Đơn</th><th>Lỗi khách báo</th><th>Tiếp nhận</th><th>Trạng thái</th><th>Chi phí (tr)</th><th /></tr></thead>
          <tbody>{rows.length === 0 ? <tr><td colSpan={8} className="empty-cell">Chưa có phiếu bảo hành nào.</td></tr> : rows.map(item => {
            const laptop = laptops.find(machine => machine.id === item.laptopId);
            return <tr key={item.id}><td style={{ color: 'var(--primary)', fontWeight: 700 }}>{item.id}</td><td><strong>{laptop?.id || item.laptopId}</strong><br /><span style={{ fontSize: '0.8rem' }}>{laptop?.name || 'Máy đã bị xóa'}</span><br /><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{laptop?.serial || '-'}</span></td><td>{item.customerInfo || '-'}<br /><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.orderId ? `Đơn #${item.orderId}` : 'Chưa liên kết đơn'}</span></td><td>{item.reportedIssue}</td><td>{item.receivedDate}</td><td><span className="status-badge status-back-tq">{item.status}</span></td><td>{Number(item.repairCost || 0).toFixed(2)}</td><td><button className="btn btn-sm btn-primary" onClick={() => openEdit(item)}>Cập nhật</button></td></tr>;
          })}</tbody>
        </table>
      </div>

      {isModalOpen && <div className="modal-backdrop active"><div className="modal-box glass" style={{ maxWidth: '760px' }}>
        <div className="modal-header"><h3>{editingCase ? `Cập nhật phiếu ${editingCase.id}` : 'Tiếp nhận bảo hành / đổi trả'}</h3><button className="modal-close" type="button" onClick={() => setIsModalOpen(false)}>&times;</button></div>
        <form onSubmit={handleSubmit}><div className="modal-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          <div className="form-group"><label>Máy *</label><select className="form-control" value={formData.laptopId} onChange={event => handleLaptopChange(event.target.value)} disabled={Boolean(editingCase)} required><option value="">-- Chọn máy --</option>{laptops.map(laptop => <option key={laptop.id} value={laptop.id}>{laptop.id} · {laptop.name} · SN: {laptop.serial || '-'}</option>)}</select></div>
          <div className="form-group"><label>Đơn gốc</label><select className="form-control" value={formData.orderId} onChange={event => setFormData({ ...formData, orderId: event.target.value })}><option value="">-- Chưa liên kết --</option>{orders.filter(order => !formData.laptopId || String(order.laptopId) === String(formData.laptopId)).map(order => <option key={order.id} value={order.id}>#{order.id} · {customers.find(c => String(c.id) === String(order.customerId))?.name}</option>)}</select></div>
          <div className="form-group"><label>Khách hàng</label><input className="form-control" value={formData.customerInfo} onChange={event => setFormData({ ...formData, customerInfo: event.target.value })} /></div>
          <div className="form-group"><label>Ngày tiếp nhận</label><input className="form-control" value={formData.receivedDate} onChange={event => setFormData({ ...formData, receivedDate: event.target.value })} required /></div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Lỗi khách báo *</label><textarea className="form-control" rows={3} value={formData.reportedIssue} onChange={event => setFormData({ ...formData, reportedIssue: event.target.value })} required /></div>
          <div className="form-group"><label>Trạng thái xử lý</label><select className="form-control" value={formData.status} onChange={event => setFormData({ ...formData, status: event.target.value })}>{WARRANTY_CASE_STATUS_OPTIONS.map(option => (<option key={option.key} value={option.key}>{option.label}</option>))}</select></div>
          <div className="form-group"><label>Chi phí sửa (triệu VNĐ)</label><input type="number" step="any" min="0" className="form-control" value={formData.repairCost} onChange={event => setFormData({ ...formData, repairCost: event.target.value })} /></div>
          <div className="form-group"><label>Chẩn đoán kỹ thuật</label><textarea className="form-control" rows={3} value={formData.diagnosis} onChange={event => setFormData({ ...formData, diagnosis: event.target.value })} /></div>
          <div className="form-group"><label>Hướng xử lý / kết quả</label><textarea className="form-control" rows={3} value={formData.resolution} onChange={event => setFormData({ ...formData, resolution: event.target.value })} /></div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Ghi chú tiếp nhận</label><textarea className="form-control" rows={2} value={formData.notes} onChange={event => setFormData({ ...formData, notes: event.target.value })} /></div>
        </div><div className="modal-footer" style={{ marginTop: '20px' }}><button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Hủy</button><button type="submit" className="btn btn-primary"><CheckCircle2 size={16} /> Lưu Phiếu</button></div></form>
      </div></div>}
    </section>
  );
}
