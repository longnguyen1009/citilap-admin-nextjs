"use client";
import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Edit2, Search, UserPlus, Users, Phone, MapPin, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../ui/modal';
import { Button } from '@/components/ui/button';
import InvoiceLink from '../InvoiceLink';
import ListPagination, { useListPagination } from '../ui/ListPagination';
import { useSubmission } from '@/lib/useSubmission';

export default function Customers() {
  const { customers, createCustomer, updateCustomer } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: '', phone: '', address: '' });
  const submission = useSubmission();

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const q = searchTerm.toLowerCase();
    return customers.filter(c =>
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.phone || '').toLowerCase().includes(q) ||
      String(c.address || '').toLowerCase().includes(q)
    );
  }, [customers, searchTerm]);

  const stats = useMemo(() => ({
    total: customers.length,
    withPhone: customers.filter(c => c.phone).length,
    withAddress: customers.filter(c => c.address).length,
  }), [customers]);
  const customerPages = useListPagination(filteredCustomers, searchTerm);

  const openAdd = () => {
    setFormData({ id: null, name: '', phone: '', address: '' });
    setIsModalOpen(true);
  };

  const openEdit = (cust) => {
    setFormData({ id: cust.id, name: cust.name || '', phone: cust.phone || '', address: cust.address || '' });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    return submission.run(async () => {
    try {
    let result;
    if (formData.id) {
      result = await updateCustomer(formData.id, { name: formData.name, phone: formData.phone, address: formData.address });
    } else {
      result = await createCustomer({ name: formData.name, phone: formData.phone, address: formData.address });
    }
    if (!result?.ok) {
      toast.error(result?.message || 'Không thể lưu khách hàng.');
      return;
    }
    setIsModalOpen(false);
    } catch (error) {
      toast.error(error.message || 'Không thể lưu khách hàng. Vui lòng thử lại.');
    }
    });
  };

  return (
    <section className="page-section list-workspace-page">
      {/* HEADER */}
      <div className="section-title section-header list-page-header">
        <div>
          <h1 className="list-page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>
            <Users size={24} className="text-primary" /> Khách Hàng
          </h1>
          <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
            Quản lý và tra cứu thông tin khách hàng
          </span>
        </div>
        <div className="section-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button data-testid="customer-add-button" variant="default" size="sm" onClick={openAdd}>
            <UserPlus size={14} /> Thêm Mới
          </Button>
        </div>
      </div>

      {/* SUMMARY STRIP */}
      <div className="list-summary-strip" aria-label="Tóm tắt khách hàng">
        <div className="list-summary-item">
          <div className="summary-icon"><Users size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Tổng khách hàng</span>
            <strong className="summary-value">{stats.total}</strong>
          </div>
        </div>
        <div className="list-summary-item list-summary-item-success">
          <div className="summary-icon"><Phone size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Có SĐT</span>
            <strong className="summary-value">{stats.withPhone}</strong>
          </div>
        </div>
        <div className="list-summary-item list-summary-item-muted">
          <div className="summary-icon"><MapPin size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Có địa chỉ</span>
            <strong className="summary-value">{stats.withAddress}</strong>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="card glass p-0 list-table-card">
        {/* Filter bar */}
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', margin: 0 }}>
            <Users size={16} /> Danh sách khách hàng
          </h3>
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Tìm theo tên, SĐT, địa chỉ..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '5px 8px 5px 28px', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '6px', width: '260px', background: '#fff' }}
            />
          </div>
        </div>
        <div className="list-table-scroll">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th style={{ width: '80px', textAlign: 'center' }}><Hash size={13} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />ID</th>
                <th style={{ minWidth: '200px' }}><Users size={13} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />Tên khách hàng</th>
                <th style={{ minWidth: '140px' }}><Phone size={13} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />Số điện thoại</th>
                <th><MapPin size={13} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />Địa chỉ</th>
                <th style={{ width: '180px', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                    <Users size={40} style={{ opacity: 0.15, marginBottom: '12px' }} />
                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500 }}>
                      {searchTerm ? 'Không tìm thấy khách hàng phù hợp' : 'Chưa có khách hàng nào'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.7 }}>
                      {searchTerm ? 'Thử từ khóa khác hoặc xóa bộ lọc' : 'Bấm &quot;Thêm Mới&quot; để tạo hồ sơ khách hàng đầu tiên'}
                    </p>
                  </td>
                </tr>
              ) : (
                customerPages.pageRows.map(c => (
                  <tr key={c.id} data-testid={`customer-row-${c.id}`}>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{c.id}</td>
                    <td><strong style={{ fontSize: '0.9rem' }}>{c.name}</strong></td>
                    <td style={{ fontWeight: 500, color: c.phone ? '#1e293b' : '#cbd5e1' }}>{c.phone || '-'}</td>
                    <td style={{ fontSize: '0.82rem', color: c.address ? '#475569' : '#cbd5e1' }}>{c.address || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="customer-row-actions">
                      <button
                        data-testid={`customer-edit-button-${c.id}`}
                        className="btn-icon"
                        title="Cập nhật"
                        onClick={() => openEdit(c)}
                        style={{ padding: '6px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <InvoiceLink customerId={c.id} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ListPagination {...customerPages} />
      </div>

      {/* MODAL */}
      <Modal open={isModalOpen} onOpenChange={open => { if (!submission.pending) setIsModalOpen(open); }} title={formData.id ? 'Cập Nhật Khách Hàng' : 'Thêm Khách Hàng Mới'} maxWidth="max-w-md">
        <form onSubmit={handleSave} style={{ display: 'grid', gap: '14px' }}>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
              Tên Khách Hàng <span style={{color:'#ef4444'}}>*</span>
            </label>
            <input
              type="text"
              data-testid="customer-name-input"
              className="form-control"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="VD: Nguyễn Văn A"
              required
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
              Số Điện Thoại
            </label>
            <input
              type="text"
              data-testid="customer-phone-input"
              className="form-control"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
              placeholder="VD: 0987654321"
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
              Địa Chỉ
            </label>
            <input
              type="text"
              data-testid="customer-address-input"
              className="form-control"
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
              placeholder="VD: 123 Thái Hà, Hà Nội"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>Hủy</Button>
            <Button type="submit" disabled={submission.pending} data-testid="customer-save-button" variant="default" size="sm">
              {submission.pending ? 'Đang lưu…' : formData.id ? <><Edit2 size={14}/> Lưu</> : <><UserPlus size={14}/> Thêm mới</>}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
