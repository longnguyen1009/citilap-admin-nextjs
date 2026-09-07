"use client";
import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Edit2, Search, UserPlus, Users, Phone, MapPin, Hash, X } from 'lucide-react';

export default function Customers() {
  const { customers, createCustomer, updateCustomer } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: '', phone: '', address: '' });

  const filteredCustomers = customers.filter(c => 
    String(c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(c.phone || '').toLowerCase().includes(searchTerm.toLowerCase())
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
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="header-title">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={28} className="text-primary" /> Khách Hàng
          </h1>
          <span className="subtitle" style={{ marginLeft: '38px' }}>Quản lý và tra cứu thông tin khách hàng</span>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
          <div className="search-bar" style={{ position: 'relative', width: '320px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="form-control" 
              placeholder="Tìm theo tên, SĐT..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '38px', borderRadius: '8px', backgroundColor: 'var(--bg-glass-card)' }}
            />
          </div>
          <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px' }}>
            <UserPlus size={18} /> Thêm Mới
          </button>
        </div>
      </div>

      <div className="glass-box" style={{ padding: '0', overflow: 'hidden', borderRadius: '12px' }}>
        <table className="data-table">
          <thead style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <tr>
              <th style={{ width: '100px', textAlign: 'center' }}><Hash size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}/>ID</th>
              <th style={{ minWidth: '220px' }}><Users size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}/>Tên Khách Hàng</th>
              <th style={{ minWidth: '160px' }}><Phone size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}/>Số Điện Thoại</th>
              <th><MapPin size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}/>Địa Chỉ</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-state" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Users size={56} style={{ opacity: 0.15, marginBottom: '16px' }} />
                  <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 500 }}>Chưa có khách hàng nào</p>
                  <p style={{ margin: '6px 0 0', fontSize: '0.9rem', opacity: 0.7 }}>Bấm &quot;Thêm Mới&quot; để tạo hồ sơ khách hàng đầu tiên</p>
                </td>
              </tr>
            ) : (
              filteredCustomers.map(c => (
                <tr key={c.id} style={{ transition: 'all 0.2s ease' }} className="hover-row">
                  <td style={{ color: 'var(--primary)', fontWeight: '600', textAlign: 'center' }}>{c.id}</td>
                  <td><strong style={{ fontSize: '1.05rem' }}>{c.name}</strong></td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.phone || <span style={{opacity: 0.5}}>-</span>}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.address || <span style={{opacity: 0.5}}>-</span>}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button 
                      className="btn-icon" 
                      title="Cập nhật" 
                      onClick={() => openEdit(c)}
                      style={{ padding: '8px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', borderRadius: '6px' }}
                    >
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
        <div className="modal-backdrop active">
          <div className="modal-box glass" style={{ maxWidth: '480px', borderRadius: '16px', padding: '0' }}>
            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <UserPlus size={22} className="text-primary"/> 
                {formData.id ? 'Cập Nhật Khách Hàng' : 'Thêm Khách Hàng Mới'}
              </h2>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={24} />
              </button>
            </div>
            
            <div className="modal-body" style={{ padding: '24px' }}>
              <form onSubmit={handleSave}>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>
                    Tên Khách Hàng <span style={{color: '#ef4444'}}>*</span>
                  </label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    placeholder="VD: Nguyễn Văn A"
                    style={{ padding: '10px 14px', borderRadius: '8px' }}
                    required 
                  />
                </div>
                
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>Số Điện Thoại</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                    placeholder="VD: 0987654321"
                    style={{ padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>
                
                <div className="form-group" style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>Địa Chỉ</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.address} 
                    onChange={e => setFormData({...formData, address: e.target.value})} 
                    placeholder="VD: 123 Thái Hà, Hà Nội"
                    style={{ padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>
                
                <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)} style={{ borderRadius: '8px', padding: '8px 20px' }}>
                    Hủy Bỏ
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ borderRadius: '8px', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {formData.id ? <Edit2 size={16}/> : <UserPlus size={16}/>} 
                    Lưu Khách Hàng
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
