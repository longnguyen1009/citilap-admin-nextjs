import React, { useState } from 'react';
import { usePresetConfigs } from '../../lib/useFieldOptions';
import { Type, Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PresetManagementSection() {
  const { presets, addPreset, removePreset } = usePresetConfigs();
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) {
      toast.error('Vui lòng nhập đủ mã gợi ý và cấu hình chi tiết');
      return;
    }
    const saved = await addPreset(newKey.trim(), newValue.trim());
    if (!saved) {
      toast.error('Không thể lưu gợi ý cấu hình lên cloud.');
      return;
    }
    toast.success('Đã thêm gợi ý cấu hình!');
    setNewKey('');
    setNewValue('');
    setIsAdding(false);
  };

  const handleRemove = async (key) => {
    if (window.confirm(`Xóa gợi ý cấu hình "${key}"?`)) {
      const saved = await removePreset(key);
      if (!saved) {
        toast.error('Không thể xóa gợi ý cấu hình trên cloud.');
        return;
      }
      toast.success('Đã xóa gợi ý!');
    }
  };

  const entries = Object.entries(presets || {});

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
            <Type size={20} color="#8b5cf6" />
            Gợi ý Cấu hình Sản phẩm
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0 0' }}>
            Tạo các mẫu gõ tắt để nhập nhanh tên sản phẩm & cấu hình chi tiết.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px', background: '#8b5cf6', color: '#fff',
              borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontWeight: 500, fontSize: '0.875rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#7c3aed'}
            onMouseOut={(e) => e.currentTarget.style.background = '#8b5cf6'}
          >
            <Plus size={16} />
            Thêm gợi ý
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '24px' }}>
        {isAdding && (
          <div style={{
            background: '#f8fafc', padding: '16px', borderRadius: '8px',
            border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start'
          }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                Mã gợi ý (Gõ tắt)
              </label>
              <input 
                type="text"
                placeholder="VD: Legion 5 2021"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
              />
            </div>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                Cấu hình chi tiết
              </label>
              <input 
                type="text"
                placeholder="VD: Legion 5 2021 R7-5800H/16/512/3060"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
              <button
                onClick={handleAdd}
                style={{
                  padding: '8px 16px', background: '#22c55e', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem'
                }}
              >
                Lưu
              </button>
              <button
                onClick={() => setIsAdding(false)}
                style={{
                  padding: '8px 16px', background: '#fff', color: '#64748b',
                  border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem'
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        <div style={{
          overflowX: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: '8px'
        }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '0.875rem', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px', fontWeight: 600, width: '30%' }}>Mã gợi ý (Gõ tắt)</th>
                <th style={{ padding: '12px', fontWeight: 600, width: '60%' }}>Cấu hình chi tiết hiển thị</th>
                <th style={{ padding: '12px', fontWeight: 600, textAlign: 'right', width: '10%' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>Chưa có cấu hình gợi ý nào</td>
                </tr>
              ) : (
                entries.map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#334155' }}>{k}</td>
                    <td style={{ padding: '12px', color: '#475569' }}>{v}</td>
                    <td style={{ padding: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => handleRemove(k)}
                        style={{
                          padding: '6px', color: '#94a3b8', background: 'transparent',
                          border: 'none', borderRadius: '4px', cursor: 'pointer'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2'; }}
                        onMouseOut={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
                        title="Xóa gợi ý"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
