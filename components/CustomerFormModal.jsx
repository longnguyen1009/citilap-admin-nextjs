'use client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Edit2, UserPlus } from 'lucide-react';
export default function CustomerFormModal({ isModalOpen, setIsModalOpen, formData, setFormData, submission, handleSave }) {
  return (<Modal open={isModalOpen} onOpenChange={open => { if (!submission.pending) setIsModalOpen(open); }} title={formData.id ? 'Cập Nhật Khách Hàng' : 'Thêm Khách Hàng Mới'} maxWidth="max-w-md">
        <form onSubmit={handleSave} style={{ display: 'grid', gap: '14px' }}>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
              Tên Khách Hàng <span style={{color:'#ef4444'}}>*</span>
            </label>
            <input
              type="text"
              data-testid="customer-name-input"
              className="form-control"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="VD: Nguyễn Văn A"
              required
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
              Số Điện Thoại
            </label>
            <input
              type="text"
              data-testid="customer-phone-input"
              className="form-control"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
              placeholder="VD: 0987654321"
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
              Địa Chỉ
            </label>
            <input
              type="text"
              data-testid="customer-address-input"
              className="form-control"
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
              placeholder="VD: 123 Thái Hà, Hà Nội"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>Hủy</Button>
            <Button type="submit" disabled={submission.pending} data-testid="customer-save-button" variant="default" size="sm">
              {submission.pending ? 'Đang lưu…' : formData.id ? <><Edit2 size={14}/> Lưu</> : <><UserPlus size={14}/> Thêm mới</>}
            </Button>
          </div>
        </form>
      </Modal>);
}
