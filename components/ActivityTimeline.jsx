import React, { useEffect, useState } from 'react';
import { History, Clock, FileEdit, Plus, Trash2 } from 'lucide-react';
import { getAuthHeaders } from '../lib/apiFetchers';

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
    if (!changes || Object.keys(changes).length === 0) return null;
    
    return (
      <div style={{ 
        marginTop: '8px', 
        padding: '8px', 
        background: '#f8fafc', 
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
        fontSize: '0.85rem'
      }}>
        {Object.entries(changes).map(([key, diff]) => {
          if (diff && typeof diff === 'object' && 'old' in diff && 'new' in diff) {
            return (
              <div key={key} style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: '#475569' }}>{key}:</span>{' '}
                <span style={{ textDecoration: 'line-through', color: '#94a3b8', marginRight: '4px' }}>
                  {String(diff.old === null || diff.old === '' ? '(trống)' : diff.old)}
                </span>
                <span style={{ color: '#059669', fontWeight: 500 }}>
                  ➔ {String(diff.new === null || diff.new === '' ? '(trống)' : diff.new)}
                </span>
              </div>
            );
          }
          return null; // fallback for non-diff objects (like CREATE where it logs the whole body, but we usually just say "Tạo mới")
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
