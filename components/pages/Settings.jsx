"use client";
import React, { useState, useMemo } from 'react';
import { useInventory, monthYearToKey } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { Settings as SettingsIcon, Check, ChevronDown, ChevronUp, Plus, Trash2, Calendar, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import UserManagementSection from './UserManagementSection';
import PresetManagementSection from './PresetManagementSection';
import { getAuthHeaders } from '../../lib/apiFetchers';
import { labelToKey } from '../../lib/useFieldOptions';

const GROUP_SECTIONS = [
  {
    sectionLabel: '💻 Sản phẩm (Laptop)',
    groups: ['category', 'laptopStatus', 'laptopLocation', 'chargerStatus', 'componentStatus', 'seller'],
  },
  {
    sectionLabel: '🛒 Đơn hàng',
    groups: ['orderStatus', 'paymentStatus', 'deliveryStatus', 'orderType', 'paymentMethod', 'shippingMethod', 'giftOptions', 'saleOnline', 'saleOffline'],
  },
  {
    sectionLabel: '🔧 Bảo hành',
    groups: ['warrantyCaseStatus'],
  },
];

// Mapping for group human-readable titles
const GROUP_TITLES = {
  category: 'Danh mục / Phân loại (Category)',
  laptopStatus: 'Trạng thái Laptop',
  laptopLocation: 'Vị trí kho',
  chargerStatus: 'Trạng thái Sạc',
  componentStatus: 'Trạng thái Linh kiện (Check máy)',
  seller: 'Nguồn hàng / Người bán',
  orderStatus: 'Trạng thái Đơn hàng',
  paymentStatus: 'Trạng thái Thanh toán',
  deliveryStatus: 'Trạng thái Giao hàng',
  orderType: 'Loại Đơn hàng',
  paymentMethod: 'Phương thức Thanh toán',
  shippingMethod: 'Đơn vị Vận chuyển',
  giftOptions: 'Gói Quà tặng',
  saleOnline: 'Nhân viên Sale (Kênh bán)',
  saleOffline: 'Nhân viên Sale (Tại shop)',
  warrantyCaseStatus: 'Trạng thái Bảo hành'
};

function OptionRow({ option, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(option.label || '');

  const commit = async () => {
    const trimmed = draftLabel.trim();
    if (trimmed && trimmed !== option.label) {
      await onUpdate(option.id, trimmed);
    } else {
      setDraftLabel(option.label); // reset
    }
    setEditing(false);
  };

  return (
    <div data-testid={`option-row-${option.option_key}`} style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px',
      borderRadius: '8px',
      background: 'transparent',
      border: '1px solid #e2e8f0',
      transition: 'all 0.15s',
      marginBottom: '4px'
    }}>
      {/* Key badge */}
      <code style={{
        fontSize: '0.68rem', fontFamily: 'monospace',
        background: '#f1f5f9', color: '#64748b',
        padding: '2px 6px', borderRadius: '4px',
        minWidth: '110px', flexShrink: 0,
      }}>
        {option.option_key}
      </code>

      {/* Label editor */}
      {editing ? (
        <input
          autoFocus
          data-testid={`option-label-input-${option.option_key}`}
          value={draftLabel}
          onChange={e => setDraftLabel(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraftLabel(option.label); setEditing(false); } }}
          style={{
            flex: 1, padding: '5px 10px', borderRadius: '6px',
            border: '1.5px solid #3b82f6', outline: 'none',
            fontSize: '0.88rem', fontWeight: 500,
          }}
        />
      ) : (
        <span
          data-testid={`option-label-${option.option_key}`}
          onClick={() => { setDraftLabel(option.label); setEditing(true); }}
          title="Click để đổi tên"
          style={{
            flex: 1, padding: '5px 10px', borderRadius: '6px',
            border: '1.5px solid transparent',
            fontSize: '0.88rem', fontWeight: 500,
            cursor: 'text',
            color: '#334155',
          }}
        >
          {option.label}
        </span>
      )}

      {/* Actions */}
      {editing ? (
        <button onClick={commit} style={{ background: '#ecfdf5', border: '1px solid #34d399', borderRadius: '6px', padding: '4px 8px', color: '#059669', cursor: 'pointer' }}>
          <Check size={14} />
        </button>
      ) : (
        <button data-testid={`option-delete-${option.option_key}`} onClick={() => onDelete(option.id)} title="Xoá option này" style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

function GroupPanel({ groupKey, options, onAdd, onUpdate, onDelete }) {
  const [collapsed, setCollapsed] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [newLabelInput, setNewLabelInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const title = GROUP_TITLES[groupKey] || groupKey;
  
  // Sort options alphabetically by label for consistency
  const sortedOptions = [...(options || [])].sort((a, b) => (a.label || '').localeCompare(b.label || ''));

  const handleAddNewOption = async (e) => {
    e.preventDefault();
    const trimmedKey = newKeyInput.trim();
    const trimmedLabel = newLabelInput.trim();

    if (!trimmedKey || !trimmedLabel) {
      toast.error('Vui lòng nhập đủ Mã và Tên lựa chọn!');
      return;
    }
    
    // Check if key already exists locally
    if (options.some(o => String(o.option_key).toLowerCase() === trimmedKey.toLowerCase())) {
      toast.error('Mã này đã tồn tại trong nhóm!');
      return;
    }

    setIsSubmitting(true);
    const success = await onAdd(groupKey, trimmedKey, trimmedLabel);
    setIsSubmitting(false);

    if (success) {
      setNewLabelInput('');
      setNewKeyInput('');
      setShowAddForm(false);
    }
  };

  return (
    <div data-testid={`option-group-${groupKey}`} style={{
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      background: '#fff',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div
        data-testid={`option-collapse-toggle-${groupKey}`}
        onClick={() => setCollapsed(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', cursor: 'pointer',
          background: '#f8fafc',
          borderBottom: collapsed ? 'none' : '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
            {title}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            ({options?.length || 0} lựa chọn)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {collapsed ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronUp size={16} color="#94a3b8" />}
        </div>
      </div>

      {/* Options list */}
      {!collapsed && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sortedOptions.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
              Chưa có tuỳ chọn nào.
            </div>
          ) : (
            sortedOptions.map(opt => (
              <OptionRow
                key={opt.id}
                option={opt}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))
          )}

          {/* Add option button / form */}
          {showAddForm ? (
            <form onSubmit={handleAddNewOption} style={{ display: 'flex', gap: '8px', marginTop: '8px', padding: '4px 0', flexWrap: 'wrap' }}>
              <input
                autoFocus
                data-testid="option-key-input"
                placeholder="Mã key (vd: new_item)"
                value={newKeyInput}
                onChange={e => setNewKeyInput(e.target.value)}
                style={{ width: '150px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
                disabled={isSubmitting}
              />
              <input
                data-testid="option-label-input"
                placeholder="Tên hiển thị (vd: Hàng mới về)"
                value={newLabelInput}
                onChange={e => setNewLabelInput(e.target.value)}
                style={{ flex: 1, minWidth: '180px', padding: '6px 12px', borderRadius: '6px', border: '1.5px solid #3b82f6', outline: 'none', fontSize: '0.85rem' }}
                disabled={isSubmitting}
              />
              <button disabled={isSubmitting} type="submit" data-testid="option-submit-button" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                {isSubmitting ? 'Đang lưu...' : 'Thêm'}
              </button>
              <button disabled={isSubmitting} type="button" onClick={() => setShowAddForm(false)} style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.82rem' }}>
                Hủy
              </button>
            </form>
          ) : (
            <button
              data-testid={`option-add-toggle-${groupKey}`}
              onClick={() => setShowAddForm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'transparent', border: '1px dashed #cbd5e1',
                borderRadius: '8px', padding: '8px', marginTop: '4px',
                color: '#64748b', cursor: 'pointer', fontSize: '0.85rem',
                justifyContent: 'center'
              }}
            >
              <Plus size={16} /> Thêm tuỳ chọn mới
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  // get appOptions from context (which fetches from DB on load)
  const { appOptions, updateAppOptions, selectedMonth, laptops, orders, rollToNewMonth, parseMonthYear } = useInventory();

  // Group options by group_key
  const groupedOptions = useMemo(() => {
    const map = {};
    if (appOptions && Array.isArray(appOptions)) {
      appOptions.forEach(opt => {
        if (!opt.is_active) return; // Only show active options for now
        if (!map[opt.group_key]) map[opt.group_key] = [];
        map[opt.group_key].push(opt);
      });
    }
    return map;
  }, [appOptions]);

  // Handle adding new option via API
  const handleAddOption = async (groupKey, optionKey, label) => {
    try {
      const res = await fetch('/api/options', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ group_key: groupKey, option_key: optionKey, label })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add option');
      
      toast.success('Đã thêm tuỳ chọn mới!');
      
      // Update local context
      if (updateAppOptions) {
        await updateAppOptions();
      }
      return true;
    } catch (err) {
      console.error('Lỗi khi thêm option:', err);
      toast.error(err.message || 'Có lỗi xảy ra!');
      return false;
    }
  };

  // Handle updating existing option label via API
  const handleUpdateOption = async (id, newLabel) => {
    try {
      const res = await fetch('/api/options', {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ id, label: newLabel })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update option');
      
      toast.success('Đã cập nhật tên hiển thị!');
      
      if (updateAppOptions) {
        await updateAppOptions();
      }
    } catch (err) {
      console.error('Lỗi khi cập nhật option:', err);
      toast.error(err.message || 'Có lỗi xảy ra!');
    }
  };

  // Handle soft deleting an option via API (set is_active = false)
  const handleDeleteOption = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xoá tuỳ chọn này? (Các đơn hàng cũ dùng tuỳ chọn này vẫn giữ nguyên UUID nhưng sẽ không chọn được mới)')) return;
    try {
      const res = await fetch('/api/options', {
        method: 'PUT', // We use PUT to soft delete by setting isActive to false
        headers: await getAuthHeaders(),
        body: JSON.stringify({ id, is_active: false })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete option');
      
      toast.success('Đã xoá tuỳ chọn!');
      
      if (updateAppOptions) {
        await updateAppOptions();
      }
    } catch (err) {
      console.error('Lỗi khi xoá option:', err);
      toast.error(err.message || 'Có lỗi xảy ra!');
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', marginTop: '40px' }}>
        <h2>Không có quyền truy cập</h2>
        <p style={{ color: '#64748b' }}>Trang Cài đặt cấu hình hệ thống chỉ dành cho tài khoản Admin.</p>
      </div>
    );
  }

  // ─── Tính toán cho nút chuyển tháng ───
  const now = new Date();
  const currentMonthStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const targetMonth = currentMonthStr;

  // Đếm số máy và đơn chưa hoàn thành từ tháng hiện tại sẽ được chuyển
  const OPEN_LAPTOP_STATUS = ['available', 'deposited', 'repairing', 'not_imported', 'returned_cn', 'skipped'];
  const OPEN_ORDER_STATUS = ['new', 'deposited', 'prepared'];

  const willMoveLaptops = laptops.filter(l => {
    if (l.isActive === false) return false;
    const m = l.monthKey || parseMonthYear(l.importDate, l.created_at || l.createdAt);
    if (monthYearToKey(m) >= monthYearToKey(targetMonth)) return false;
    // Chỉ đếm máy trong trạng thái "chưa xong"
    const statusKey = labelToKey('laptopStatus', l.status, appOptions) || String(l.status).toLowerCase();
    return OPEN_LAPTOP_STATUS.includes(statusKey);
  }).length;

  const willMoveOrders = orders.filter(o => {
    if (o.isActive === false) return false;
    const m = o.monthKey || parseMonthYear(o.createdDate, o.created_at || o.createdAt);
    if (monthYearToKey(m) >= monthYearToKey(targetMonth)) return false;
    const statusKey = labelToKey('orderStatus', o.orderStatus, appOptions) || String(o.orderStatus).toLowerCase();
    return OPEN_ORDER_STATUS.includes(statusKey);
  }).length;

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', paddingBottom: '60px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px',
        paddingBottom: '16px', borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '12px' }}>
          <SettingsIcon size={24} color="#3b82f6" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Quản lý Tuỳ chọn Hệ thống (Database)
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Thêm, sửa, xoá các danh mục thuộc tính hiển thị (Được lưu trực tiếp trong cơ sở dữ liệu)
          </p>
        </div>
      </div>

      {/* ─── Quản lý theo tháng ─── */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          background: '#fff',
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '14px 16px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
            borderBottom: '1px solid #e2e8f0',
          }}>
            <Calendar size={18} color="#3b82f6" />
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
              📅 Quản lý theo tháng
            </span>
          </div>

          <div style={{ padding: '16px' }}>
            {/* Hiển thị tháng hiện tại đang lọc */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '12px', fontSize: '0.9rem', color: '#475569',
            }}>
              <span>Tháng đang xem:</span>
              <span style={{
                fontWeight: 700, color: '#1e293b',
                background: '#f1f5f9', padding: '4px 12px', borderRadius: '6px',
                fontFamily: 'monospace', fontSize: '0.92rem',
              }}>
                {selectedMonth}
              </span>
            </div>

            {/* Preview: bao nhiêu sẽ được chuyển */}
            {willMoveLaptops > 0 || willMoveOrders > 0 ? (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: '8px', padding: '12px 14px',
                marginBottom: '14px', fontSize: '0.85rem', color: '#92400e',
              }}>
                Sẽ chuyển <b>{willMoveLaptops}</b> máy và <b>{willMoveOrders}</b> đơn đủ điều kiện sang tháng hiện tại <b>{targetMonth}</b>.
              </div>
            ) : (
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: '8px', padding: '12px 14px',
                marginBottom: '14px', fontSize: '0.85rem', color: '#166534',
              }}>
                Không thấy máy hoặc đơn nào cần chuyển từ dữ liệu đang xem sang {targetMonth}. Bạn vẫn có thể chạy để hệ thống kiểm tra toàn bộ các tháng trước.
              </div>
            )}

            {/* Nút kiểm tra và cập nhật về tháng hiện tại */}
            <button
              onClick={async () => {
                const confirmMsg = willMoveLaptops > 0 || willMoveOrders > 0
                  ? `Chuyển ${willMoveLaptops} máy, ${willMoveOrders} đơn đủ điều kiện sang tháng hiện tại ${targetMonth}?\n\nĐơn đang giao, hoàn thành, hủy hoặc trả hàng sẽ giữ nguyên tháng cũ.`
                  : `Kiểm tra toàn bộ các tháng trước và chuyển dữ liệu đủ điều kiện sang tháng hiện tại ${targetMonth}?`;
                if (!window.confirm(confirmMsg)) return;

                const toastId = toast.loading('Đang chuyển tháng...');
                const result = await rollToNewMonth(targetMonth);
                toast.dismiss(toastId);
                if (result.ok) {
                  toast.success(`Đã chuyển ${result.laptopsMoved} máy, ${result.ordersMoved} đơn sang ${result.monthKey}`);
                } else {
                  toast.error(result.message || 'Chuyển tháng thất bại.');
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '12px 20px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff',
                border: 'none', borderRadius: '10px',
                fontSize: '0.92rem', fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <ArrowRight size={16} />
              {`Kiểm tra và cập nhật sang tháng hiện tại ${targetMonth}`}
            </button>

            <p style={{
              marginTop: '10px', fontSize: '0.78rem', color: '#94a3b8',
              lineHeight: '1.5', textAlign: 'center',
            }}>
              Chỉ chuyển máy tồn và đơn mới tạo/đã cọc/đã chuẩn bị. Đơn đang giao hoặc đã hoàn thành giữ nguyên tháng cũ.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {GROUP_SECTIONS.map((section, idx) => (
          <div key={idx}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#334155', marginBottom: '16px', paddingLeft: '4px' }}>
              {section.sectionLabel}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {section.groups && section.groups.map(groupKey => (
                <GroupPanel
                  key={groupKey}
                  groupKey={groupKey}
                  options={groupedOptions[groupKey]}
                  onAdd={handleAddOption}
                  onUpdate={handleUpdateOption}
                  onDelete={handleDeleteOption}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <PresetManagementSection />
      <UserManagementSection />
    </div>
  );
}
