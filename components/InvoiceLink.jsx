'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { invoiceRequest } from '@/lib/invoiceClient';
import toast from 'react-hot-toast';

export default function InvoiceLink({ orderId, laptopId, customerId, invoiceId = null, issue = false, eligible = true, label }) {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [existingId, setExistingId] = useState(invoiceId);
  if (!['ADMIN','SALES'].includes(user?.role)) return null;
  if (issue && !eligible && !existingId) return null;
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (existingId) { router.push(`/invoices/${existingId}`); return; }
      const query = new URLSearchParams(orderId ? { orderId } : laptopId ? { laptopId } : { customerId });
      const found = await invoiceRequest(`/api/invoices?${query}`);
      if (found.length === 1) router.push(`/invoices/${found[0].id}`);
      else if (found.length > 1) router.push(`/invoices?${query}`);
      else if (issue) {
        const created = await invoiceRequest('/api/invoices', { orderId });
        setExistingId(created.id);
        router.push(`/invoices/${created.id}`);
      } else toast('Chưa có hóa đơn đã xuất.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };
  return <button type="button" className="btn btn-sm btn-outline invoice-link" disabled={busy} onClick={open}>
    {busy ? 'Đang tải…' : label || (issue ? (existingId ? 'Xem chi tiết hóa đơn' : 'Xuất hóa đơn') : 'Xem chi tiết hóa đơn')}
  </button>;
}
