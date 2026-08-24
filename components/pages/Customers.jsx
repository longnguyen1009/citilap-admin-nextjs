"use client";
import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Edit2 } from 'lucide-react';

export default function Customers() {
  const { customers, createCustomer, updateCustomer } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: '', phone: '', address: '' });

  const filteredCustomers = customers.filter(c => 
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    if (formData.id) {
      await updateCustomer(formData.id, { name: formData.name, phone: formData.phone, address: formData.address });
    } else {
      await createCustomer({ name: formData.name, phone: formData.phone, address: formData.address });
    }
    setIsModalOpen(false);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-title">
          <h1>Khách Hàng</h1>
          <span className="subtitle">Quản lý danh sách khách hàng</span>
        </div>
        <div className="header-actions">
          <input 
            type="text" 
            className="form-control" 
            placeholder="Tìm theo tên, SĐT..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '300px' }}
          />
          <button className="btn btn-primary" onClick={openAdd}>
            + Thêm Khách Hàng
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tên Khách Hàng</th>
              <th>Số Điện Thoại</th>
              <th>Địa Chỉ</th>
              <th>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-state">Chưa có khách hàng nào</td>
              </tr>
            ) : (
              filteredCustomers.map(c => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{c.id}</td>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.phone}</td>
                  <td>{c.address}</td>
                  <td>
                    <button className="btn-icon" title="Cập nhật" onClick={() => openEdit(c)}>
                      <Edit2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>{formData.id ? 'Cập Nhật Khách Hàng' : 'Thêm Khách Hàng Mới'}</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>Tên Khách Hàng <span style={{color: 'red'}}>*</span></label>
                  <input type="text" className="form-control" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Số Điện Thoại</label>
                  <input type="text" className="form-control" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Địa Chỉ</label>
                  <input type="text" className="form-control" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
                <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Hủy</button>
                  <button type="submit" className="btn btn-primary">Lưu Lại</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
