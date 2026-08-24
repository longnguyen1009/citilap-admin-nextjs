import React, { useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';

export default function TechCheckModal({ isOpen, onClose, laptop, onSave }) {
  const { dynamicOptions } = useInventory();
  const componentOpts = dynamicOptions?.COMPONENT_STATUS_OPTIONS || ['OK', 'Lỗi / Có vấn đề'];
  const statusOpts = dynamicOptions?.STATUS_OPTIONS || [];
  const [status, setStatus] = useState('');
  const [serial, setSerial] = useState('');
  const [screenStatus, setScreenStatus] = useState('OK');
  const [cameraMicStatus, setCameraMicStatus] = useState('OK');
  const [mainboardStatus, setMainboardStatus] = useState('OK');
  const [note, setNote] = useState('');
  const [batteryHealth, setBatteryHealth] = useState(100);
  const [isLocked, setIsLocked] = useState(false);
  const [partsLog, setPartsLog] = useState('');

  useEffect(() => {
    if (laptop) {
      setStatus(laptop.status || '');
      setSerial(laptop.serial || '');
      setScreenStatus(laptop.screenStatus || 'OK');
      setCameraMicStatus(laptop.cameraMicStatus || 'OK');
      setMainboardStatus(laptop.mainboardStatus || 'OK');
      setNote(laptop.conditionNote || '');
      setBatteryHealth(laptop.batteryHealth || 100);
      setIsLocked(laptop.isLocked || false);
      setPartsLog(''); // Reset parts log on open
    }
  }, [laptop]);

  if (!isOpen || !laptop) return null;

  const handleSave = (e) => {
    e.preventDefault();
    const updatedPartsHistory = partsLog.trim() 
      ? [...(laptop.partsHistory || []), { date: new Date().toLocaleDateString('vi-VN'), log: partsLog.trim() }]
      : laptop.partsHistory || [];

    onSave(laptop.id, {
      status,
      serial,
      screenStatus,
      cameraMicStatus,
      mainboardStatus,
      conditionNote: note,
      batteryHealth: parseFloat(batteryHealth),
      isLocked,
      partsHistory: updatedPartsHistory
    });
  };

  return (
    <div className="modal-backdrop active">
      <div className="modal-box glass" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h3>Kiểm Tra Kỹ Thuật (Tech Check) - {laptop.id}</h3>
          <button className="modal-close" type="button" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSave}>
          <div className="modal-body">
            <div style={{ marginBottom: '15px' }}>
              <strong>Mã máy:</strong> {laptop.name}
            </div>

            {/* Row 1: Serial (1/2) & Trạng thái (1/2) */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Serial:</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={serial} 
                  onChange={e => setSerial(e.target.value)} 
                  placeholder="Nhập Serial máy..."
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label>Trạng thái Máy (Sau khi test):</label>
                <select className="form-control" value={status} onChange={e => setStatus(e.target.value)}>
                  {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Pin, Màn hình, Cam/Mic, Mainboard (Mỗi cái 1/4) */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ margin: 0 }}>Pin (%) *</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.75rem' }} title="Mật khẩu BIOS / MDM (Máy bị Khóa)">
                    <input 
                      type="checkbox" 
                      checked={isLocked}
                      onChange={e => setIsLocked(e.target.checked)}
                    />
                    <span style={{ color: isLocked ? '#ef4444' : 'inherit', fontWeight: isLocked ? 'bold' : 'normal' }}>
                      Khóa
                    </span>
                  </label>
                </div>
                <input 
                  type="number" 
                  className="form-control" 
                  min="0" max="100" 
                  value={batteryHealth} 
                  onChange={e => setBatteryHealth(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label>Màn Hình:</label>
                <select className="form-control" value={screenStatus} onChange={e => setScreenStatus(e.target.value)}>
                  {componentOpts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label>Cam &amp; Mic:</label>
                <select className="form-control" value={cameraMicStatus} onChange={e => setCameraMicStatus(e.target.value)}>
                  {componentOpts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label>Mainboard:</label>
                <select className="form-control" value={mainboardStatus} onChange={e => setMainboardStatus(e.target.value)}>
                  {componentOpts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

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
          <div className="modal-footer" style={{ marginTop: '20px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary">Lưu Đánh Giá</button>
          </div>
        </form>
      </div>
    </div>
  );
}
