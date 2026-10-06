'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function OrderQuickNote({ value, onSave, orderId }) {
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async (content) => {
    const text = content !== undefined ? content : draft;
    if (text === (value || '') || saving) return;
    setSaving(true);
    try {
      const result = await onSave(text);
      if (!result?.ok) toast.error(result?.message || 'Không lưu được ghi chú.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <textarea
      aria-label={`Ghi chú đơn #${orderId}`}
      className="sheet-cell-textarea"
      rows={3}
      value={draft}
      disabled={saving}
      onChange={e => {
        setDraft(e.target.value);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={() => handleSave(draft)}
    />
  );
}
