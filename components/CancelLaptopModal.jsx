'use client';
import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export default function CancelLaptopModal({ laptop, onClose, onConfirm }) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try { await onConfirm(); onClose(); }
    catch (failure) { setError(failure.message || 'Không thể HỦY sản phẩm. Vui lòng thử lại.'); }
    finally { busy.current = false; setPending(false); }
  };
  return <Modal open onOpenChange={open => { if (!open && !busy.current) onClose(); }}
    title="Xác nhận HỦY sản phẩm"
    description="Bạn chắc chắn muốn HỦY sản phẩm này? Sau khi hủy, sản phẩm không thể chỉnh sửa thông tin hoặc đặt đơn hàng."
    maxWidth="max-w-lg"
    footer={<><Button variant="outline" disabled={pending} onClick={onClose}>Không hủy</Button><Button variant="destructive" disabled={pending} onClick={confirm}>{pending ? 'Đang hủy…' : 'Xác nhận HỦY'}</Button></>}>
    <p><strong>#{laptop.id} · {laptop.name}</strong></p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </Modal>;
}
