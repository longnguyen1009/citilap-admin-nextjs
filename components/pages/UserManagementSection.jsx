import React, { useState, useEffect } from 'react';
import { Plus, Edit3, Lock, Trash2, Check, X, UserX, Shield } from 'lucide-react';
import UserModal from './UserModal';
import { fetchUsersFromCloud, saveUserToCloud } from '../../lib/apiFetchers';

export default function UserManagementSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchUsersFromCloud();
      setUsers(data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(fetchUsers);
  }, []);

  const handleOpenAdd = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (user) => {
    if (!window.confirm(`Bạn có chắc muốn ${user.is_active ? 'vô hiệu hóa' : 'mở khóa'} tài khoản ${user.email}?`)) return;
    
    try {
      await saveUserToCloud({ id: user.id, is_active: !user.is_active, role: user.role, name: user.name }, true);
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      marginTop: '32px'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #e2e8f0',
        background: 'rgba(248, 250, 252, 0.5)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h2 style={{
            fontSize: '1.125rem',
            fontWeight: 'bold',
            color: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: 0
          }}>
            <Shield size={20} color="#2563eb" />
            Quản lý Tài khoản (Nhân viên)
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0 0' }}>
            Tạo, sửa đổi quyền hạn và quản lý trạng thái tài khoản nhân sự.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 16px', background: '#2563eb', color: '#fff',
            borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontWeight: 500, fontSize: '0.875rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#1d4ed8'}
          onMouseOut={(e) => e.currentTarget.style.background = '#2563eb'}
        >
          <Plus size={16} />
          Tạo tài khoản
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>Đang tải danh sách tài khoản...</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#ef4444' }}>{error}</div>
        ) : (
          <div style={{
            overflowX: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: '8px'
          }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '0.875rem', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Họ tên</th>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Email</th>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Quyền (Role)</th>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Trạng thái</th>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Đăng nhập cuối</th>
                  <th style={{ padding: '12px', fontWeight: 600, textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>Không có dữ liệu</td>
                  </tr>
                ) : (
                  users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                      <td style={{ padding: '12px', fontWeight: 500, color: '#1e293b' }}>{u.name}</td>
                      <td style={{ padding: '12px', color: '#475569' }}>{u.email}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                          background: u.role === 'ADMIN' ? '#fee2e2' : u.role === 'TECHNICAL' ? '#fef3c7' : '#dbeafe',
                          color: u.role === 'ADMIN' ? '#b91c1c' : u.role === 'TECHNICAL' ? '#b45309' : '#1d4ed8'
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {u.is_active ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 500, fontSize: '0.75rem' }}>
                            <Check size={14} /> Hoạt động
                          </span>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontWeight: 500, fontSize: '0.75rem' }}>
                            <UserX size={14} /> Bị khóa
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px', color: '#64748b', fontSize: '0.75rem' }}>
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('vi-VN') : 'Chưa đăng nhập'}
                      </td>
                      <td style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => handleOpenEdit(u)}
                          style={{
                            padding: '6px', color: '#94a3b8', background: 'transparent',
                            border: 'none', borderRadius: '4px', cursor: 'pointer'
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.background = '#eff6ff'; }}
                          onMouseOut={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
                          title="Sửa quyền / Đổi mật khẩu"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          style={{
                            padding: '6px', color: '#94a3b8', background: 'transparent',
                            border: 'none', borderRadius: '4px', cursor: 'pointer'
                          }}
                          onMouseOver={(e) => { 
                            e.currentTarget.style.color = u.is_active ? '#dc2626' : '#16a34a'; 
                            e.currentTarget.style.background = u.is_active ? '#fef2f2' : '#f0fdf4'; 
                          }}
                          onMouseOut={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
                          title={u.is_active ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                        >
                          {u.is_active ? <Lock size={16} /> : <Check size={16} />}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <UserModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => { setIsModalOpen(false); fetchUsers(); }}
          initialData={editingUser}
        />
      )}
    </div>
  );
}
