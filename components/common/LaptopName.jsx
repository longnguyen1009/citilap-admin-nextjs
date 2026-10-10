'use client';

import toast from 'react-hot-toast';
import { Copy } from 'lucide-react';

export function LaptopName({ name }) {
  return String(name || '').split(/(không\s+cảm\s+ứng|k\s+cảm\s+ứng|màu\s+(?:trắng|đen|xám|tím)|xanh\s+bạc|xám\s+bạc|cảm\s+ứng|trắng|tím)/giu).map((part, index) =>
    index % 2 ? <strong className="laptop-color-highlight" key={index}>{part}</strong> : part
  );
}

export function LaptopCopyId({ id, name, prefix = '' }) {
  async function copyName() {
    try {
      await navigator.clipboard.writeText(name);
      toast.success('Đã copy tên laptop');
    } catch {
      toast.error('Không thể copy tên laptop. Vui lòng thử lại.');
    }
  }

  return <button type="button" className="laptop-copy-id" disabled={!name}
    title="Copy tên laptop" aria-label={`Copy tên laptop ${id}`}
    onClick={copyName}><span>{prefix}{id}</span><Copy size={12} aria-hidden="true" /></button>;
}
