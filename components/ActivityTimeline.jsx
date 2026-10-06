import React, { useEffect, useState } from 'react';
import { History, Clock, FileEdit, Plus, Trash2, ArrowRight } from 'lucide-react';
import { getAuthHeaders } from '../lib/apiFetchers';
import { FIELD_OPTION_GROUPS } from '../lib/fieldOptions';

const toCamelKey = (key) => String(key).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

const FIELD_LABELS = {
  ORDER: {
    createdDate: 'Ngày tạo đơn',
    saleOnline: 'SALE Online',
    saleOffline: 'SALE Offline',
    note: 'Ghi chú đơn hàng',
    orderType: 'Loại đơn hàng',
    orderStatus: 'Trạng thái đơn hàng',
    paymentStatus: 'Trạng thái thanh toán',
    paymentMethod: 'Phương thức thanh toán',
    deliveryStatus: 'Trạng thái giao hàng',
    shippingMethod: 'Phương thức gửi hàng',
    laptopId: 'Máy đã phân',
    requestedLaptopId: 'Máy tham khảo',
    requestedConfiguration: 'Cấu hình yêu cầu',
    requestedCategory: 'Phân loại yêu cầu',
    salePrice: 'Giá bán thực tế',
    depositAmount: 'Tiền cọc đã ghi nhận',
    depositNote: 'Ghi chú tiền cọc',
    codAmount: 'Thu hộ COD',
    amountPaid: 'Đã thu',
    debtAmount: 'Còn phải thu',
    creditCardFee: 'Phí thẻ',
    tradeInLaptopId: 'Máy thu cũ',
    customerId: 'Khách hàng',
    customerInfo: 'Thông tin khách hàng',
    customerAddress: 'Địa chỉ khách hàng',
    trackingCode: 'Mã vận đơn',
    shipDate: 'Ngày gửi hàng thực tế',
    setupNote: 'Yêu cầu cài đặt',
    warranty: 'Thời gian bảo hành',
    monthKey: 'Tháng dữ liệu',
    branchId: 'Chi nhánh bán hàng',
    giftPreset: 'Combo quà tặng',
    giftAccessoryIds: 'Quà tặng',
    reservationExpiresAt: 'Hết hạn giữ máy',
    cancelReason: 'Lý do hủy',
    cancelledAt: 'Thời điểm hủy',
    returnedAt: 'Thời điểm back máy',
    returnReason: 'Lý do back máy',
    paymentDueAt: 'Hạn thanh toán',
  },
};

const OPTION_GROUP_BY_FIELD = {
  orderType: 'orderType',
  orderStatus: 'orderStatus',
  paymentStatus: 'paymentStatus',
  paymentMethod: 'paymentMethod',
  deliveryStatus: 'deliveryStatus',
  shippingMethod: 'shippingMethod',
};

const MONEY_FIELDS = new Set(['salePrice', 'depositAmount', 'codAmount', 'amountPaid', 'debtAmount', 'creditCardFee']);
const ID_FIELDS = new Set(['laptopId', 'requestedLaptopId', 'tradeInLaptopId', 'customerId', 'branchId']);
const DATE_FIELDS = new Set(['createdDate', 'shipDate']);
const DATE_TIME_FIELDS = new Set(['reservationExpiresAt', 'cancelledAt', 'returnedAt', 'paymentDueAt']);

const optionLabel = (field, value) => {
  const group = FIELD_OPTION_GROUPS[OPTION_GROUP_BY_FIELD[field]];
  return group?.options?.find(option => String(option.key) === String(value))?.defaultLabel || value;
};

const formatAuditValue = (field, value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (OPTION_GROUP_BY_FIELD[field]) return String(optionLabel(field, value));
  if (MONEY_FIELDS.has(field) && Number.isFinite(Number(value))) {
    return `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} triệu VND`;
  }
  if (ID_FIELDS.has(field) && Number.isFinite(Number(value))) return `#${value}`;
  if (field === 'giftAccessoryIds') {
    const values = Array.isArray(value) ? value : [value];
    return values.length ? values.map(item => Number.isFinite(Number(item)) ? `#${item}` : String(item)).join(', ') : '—';
  }
  if (DATE_FIELDS.has(field)) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  if (DATE_TIME_FIELDS.has(field)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('vi-VN');
  }
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const extractChangeRows = (changes) => {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return [];

  if (changes.before && changes.after && typeof changes.before === 'object' && typeof changes.after === 'object') {
    const keys = [...new Set([...Object.keys(changes.before), ...Object.keys(changes.after)])];
    return keys
      .filter(key => JSON.stringify(changes.before[key]) !== JSON.stringify(changes.after[key]))
      .map(key => ({ key, before: changes.before[key], after: changes.after[key] }));
  }

  return Object.entries(changes).flatMap(([key, diff]) => {
    if (key === 'event' || !diff || typeof diff !== 'object' || Array.isArray(diff)) return [];
    if ('before' in diff || 'after' in diff) return [{ key, before: diff.before, after: diff.after }];
    if ('old' in diff || 'new' in diff) return [{ key, before: diff.old, after: diff.new }];
    return [];
  });
};

const ActivityTimeline = ({ entityType, entityId }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ entityType, entityId: String(entityId) });
        const res = await fetch(`/api/activity-logs?${params}`, { headers: await getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (err) {
        console.error('Failed to fetch logs', err);
      }
      setLoading(false);
    };

    if (entityId) {
      fetchLogs();
    }
  }, [entityType, entityId]);

  if (loading) {
    return <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>Đang tải lịch sử...</div>;
  }

  if (logs.length === 0) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#9ca3af' }}>
        <History size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
        <div>Chưa có lịch sử thay đổi nào</div>
      </div>
    );
  }

  const renderChanges = (changes) => {
    const rows = extractChangeRows(changes);
    if (rows.length === 0) {
      return (
        <div style={{ marginTop: '8px', padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', color: '#64748b', fontSize: '0.8rem' }}>
          Bản cập nhật cũ này không lưu chi tiết giá trị trước/sau.
        </div>
      );
    }

    return (
      <div style={{ 
        marginTop: '8px', 
        padding: '9px 10px',
        background: '#f8fafc', 
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        fontSize: '0.85rem'
      }}>
        <div style={{ marginBottom: '7px', color: '#475569', fontSize: '0.76rem', fontWeight: 700 }}>
          {rows.length} trường thay đổi
        </div>
        {rows.map(({ key, before, after }, index) => {
          const field = toCamelKey(key);
          const label = FIELD_LABELS[entityType]?.[field]
            || field.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
          return (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(145px, 0.7fr) minmax(0, 1fr) 18px minmax(0, 1fr)', gap: '7px', alignItems: 'center', padding: '7px 0', borderTop: index ? '1px solid #e2e8f0' : '0' }}>
              <span style={{ fontWeight: 650, color: '#334155' }}>{label}</span>
              <span style={{ minWidth: 0, padding: '5px 7px', borderRadius: '6px', background: '#fff', color: '#64748b', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {formatAuditValue(field, before)}
              </span>
              <ArrowRight size={14} color="#94a3b8" aria-hidden="true" />
              <span style={{ minWidth: 0, padding: '5px 7px', borderRadius: '6px', background: '#ecfdf5', color: '#047857', fontWeight: 650, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {formatAuditValue(field, after)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h4 style={{ 
        fontSize: '1rem', 
        color: '#1e293b', 
        marginBottom: '1rem', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        paddingBottom: '8px',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <History size={18} /> Lịch Sử Cập Nhật
      </h4>
      
      <div style={{ position: 'relative', paddingLeft: '16px' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute',
          left: '7px',
          top: '8px',
          bottom: '8px',
          width: '2px',
          background: '#e2e8f0',
          zIndex: 0
        }} />

        {logs.map((log) => {
          let Icon = FileEdit;
          let iconColor = '#3b82f6';
          let iconBg = '#dbeafe';
          
          if (log.action === 'CREATE') {
            Icon = Plus;
            iconColor = '#059669';
            iconBg = '#d1fae5';
          } else if (log.action === 'DELETE') {
            Icon = Trash2;
            iconColor = '#ef4444';
            iconBg = '#fee2e2';
          }

          const date = new Date(log.created_at);

          return (
            <div key={log.id} style={{ position: 'relative', zIndex: 1, marginBottom: '1.5rem' }}>
              <div style={{ 
                position: 'absolute', 
                left: '-16px', 
                top: '2px', 
                background: iconBg, 
                color: iconColor,
                width: '18px', 
                height: '18px', 
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 0 4px #ffffff'
              }}>
                <Icon size={10} strokeWidth={3} />
              </div>
              
              <div style={{ paddingLeft: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>
                    {log.user_name || 'Hệ thống'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '0.8rem' }}>
                    <Clock size={12} />
                    {date.toLocaleDateString('vi-VN')} {date.toLocaleTimeString('vi-VN')}
                  </div>
                </div>
                
                <div style={{ color: '#475569', fontSize: '0.9rem' }}>
                  {log.action === 'CREATE' ? 'Đã tạo mới bản ghi' : 'Đã cập nhật thông tin'}
                </div>
                
                {log.action === 'UPDATE' && renderChanges(log.changes)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityTimeline;
