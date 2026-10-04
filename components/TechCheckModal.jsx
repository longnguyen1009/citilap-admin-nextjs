import React, { useState } from 'react';
import QCDetailsFields from './QCDetailsFields';
import './pages/qc-quick.css';

export default function TechCheckModal({ isOpen, onClose, laptop, onSave }) {
  const [note, setNote] = useState(() => laptop?.conditionNote || '');
  const [partsLog, setPartsLog] = useState('');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [details, setDetails] = useState(() => ({ ...laptop?.qcDetails, serialNumber: laptop?.serial || '', batteryHealth: laptop?.batteryHealth ?? '' }));

  if (!isOpen || !laptop) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    const { serialNumber, batteryHealth, ...qcDetails } = details;
    const summary = key => qcDetails[key]?.result === 'PASS' ? 'ok'
      : qcDetails[key]?.result === 'FAIL' ? 'error' : null;
    const cameraMicResults = ['camera', 'microphone'].map(key => qcDetails[key]?.result);
    const updates = {
      conditionNote: note,
      qcDetails,
      screenStatus: summary('screen'),
      mainboardStatus: summary('mainboard'),
      cameraMicStatus: cameraMicResults.includes('FAIL') ? 'error'
        : cameraMicResults.every(result => result === 'PASS') ? 'ok' : null,
    };
    if (partsLog.trim()) {
      updates.partsHistory = [
        ...(Array.isArray(laptop.partsHistory) ? laptop.partsHistory : []),
        { date: new Date().toLocaleDateString('vi-VN'), log: partsLog.trim() }
      ];
    }
    if (String(serialNumber ?? '').trim() !== String(laptop.serial ?? '').trim()) updates.serial = String(serialNumber ?? '').trim();
    if (String(batteryHealth ?? '') !== String(laptop.batteryHealth ?? '')) updates.batteryHealth = batteryHealth === '' ? null : Number(batteryHealth);

    try { await onSave(laptop.id, updates); } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop active tech-check-backdrop">
      <div className="modal-box glass tech-check-modal" role="dialog" aria-modal="true">
        <div className="modal-header tech-check-header">
          <h3>Kiểm Tra Kỹ Thuật (Tech Check) - {laptop.id}</h3>
          <button className="modal-close" type="button" onClick={onClose}>&times;</button>
        </div>
        <form className="tech-check-form" onSubmit={handleSave}>
          <div className="modal-body tech-check-body">
            {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
            <div style={{ marginBottom: '15px' }}>
              <strong>Mã máy:</strong> {laptop.name}
            </div>

            <QCDetailsFields value={details} onChange={setDetails} />

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Ghi chú chung tình trạng máy:</label>
              <textarea 
                className="form-control" 
                rows="3" 
                value={note} 
                onChange={e => setNote(e.target.value)}
                placeholder="Ví dụ: Màn hình hơi xước nhẹ..."
              />
            </div>

            <div className="form-group">
              <label>Ghi chú thay thế / tháo ráp linh kiện (Nâng/hạ RAM, SSD):</label>
              <textarea 
                className="form-control" 
                rows="2" 
                value={partsLog} 
                onChange={e => setPartsLog(e.target.value)}
                placeholder="Chỉ nhập nếu có thao tác. Ví dụ: Tháo RAM 8GB lắp RAM 16GB..."
              />
              {laptop.partsHistory && laptop.partsHistory.length > 0 && (
                <div style={{ marginTop: '10px', fontSize: '0.8rem', background: '#f8fafc', padding: '10px', borderRadius: '4px' }}>
                  <strong>Lịch sử linh kiện:</strong>
                  <ul style={{ margin: '5px 0 0 20px', padding: 0 }}>
                    {laptop.partsHistory.map((h, i) => (
                      <li key={i}>[{h.date}] {h.log}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

          </div>
          <div className="modal-footer tech-check-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Đang lưu…' : 'Lưu Đánh Giá'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
