import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { saveUserToCloud } from '../../lib/apiFetchers';

export default function UserModal({ isOpen, onClose, onSuccess, initialData }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'SALES',
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = !!initialData;

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        email: initialData.email || '',
        password: '', // Blank password unless changing
        role: initialData.role || 'SALES',
        is_active: initialData.is_active
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const payload = { ...formData };
      if (isEdit) {
        payload.id = initialData.id;
        // Don't send empty password on update
        if (!payload.password) delete payload.password;
      }

      await saveUserToCloud(payload, isEdit);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      {/* Backdrop */}
      <div 
        style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div style={{
        position: 'relative', background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: '12px',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%', maxWidth: '450px',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--glass-border)',
          background: 'rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderTopLeftRadius: '12px', borderTopRightRadius: '12px'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>
            {isEdit ? 'Chỉnh sửa Tài khoản' : 'Tạo Tài khoản mới'}
          </h2>
          <button 
            onClick={onClose}
            style={{
              padding: '8px', color: 'var(--text-secondary)', background: 'transparent',
              border: 'none', borderRadius: '8px', cursor: 'pointer'
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto' }}>
          {error && (
            <div style={{
              marginBottom: '16px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)',
              color: '#b91c1c', fontSize: '0.875rem', borderRadius: '8px',
              border: '1px solid #fee2e2', display: 'flex', alignItems: 'flex-start', gap: '8px'
            }}>
              <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form id="user-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Tên nhân viên <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input 
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)',
                  borderRadius: '8px', outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                placeholder="VD: Nguyễn Văn A"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Email đăng nhập <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input 
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)',
                  borderRadius: '8px', outline: 'none', background: 'rgba(255, 255, 255, 0.05)', boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                placeholder="VD: nhanvien@citilap.vn"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Mật khẩu {isEdit ? '(Để trống nếu không đổi)' : <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              <input 
                type="text"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required={!isEdit}
                minLength={6}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)',
                  borderRadius: '8px', outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                placeholder={isEdit ? "Nhập mật khẩu mới..." : "Ít nhất 6 ký tự"}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Quyền hạn (Role) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid var(--glass-border)',
                  borderRadius: '8px', outline: 'none', background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)',
                  fontWeight: 500, boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              >
                <option value="SALES">Sales (Bán hàng)</option>
                <option value="TECHNICAL">Technical (Kỹ thuật)</option>
                <option value="ADMIN">Admin (Quản trị viên)</option>
              </select>
            </div>
            
            {isEdit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <input 
                  type="checkbox" 
                  id="is_active" 
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="is_active" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500, cursor: 'pointer' }}>
                  Tài khoản đang hoạt động
                </label>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f1f5f9',
          background: 'rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'flex-end', gap: '12px',
          borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px'
        }}>
          <button 
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 16px', fontSize: '0.875rem', fontWeight: 600, color: '#475569',
              background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer'
            }}
          >
            Hủy
          </button>
          <button 
            type="submit"
            form="user-form"
            disabled={saving}
            style={{
              padding: '8px 24px', fontSize: '0.875rem', fontWeight: 600, color: '#fff',
              background: '#2563eb', border: 'none', borderRadius: '8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? (
              <span>Đang lưu...</span>
            ) : (
              <>
                <Save size={16} /> {isEdit ? 'Lưu thay đổi' : 'Tạo tài khoản'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
