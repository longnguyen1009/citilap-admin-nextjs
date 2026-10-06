'use client';
import { useEffect, useState } from 'react';
import { invoiceRequest } from '@/lib/invoiceClient';

const presets = { none: [], mouse: ['mouse'], backpack: ['backpack'], basic: ['mouse','backpack'], full: ['mouse','backpack','mousepad','sleeve'] };
export default function InvoiceOrderFields({ value, onChange }) {
  const [catalog, setCatalog] = useState({ branches: [], accessories: [] });
  const [error, setError] = useState('');
  useEffect(() => { let active = true; invoiceRequest('/api/invoice-catalog').then(data => { if (active) setCatalog(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const choose = preset => {
    const selected = (presets[preset] || []).map(kind => catalog.accessories.find(item => item.active && item.kind === kind));
    if (selected.some(item => !item)) { setError('Combo thiếu phụ kiện đang hoạt động. Kiểm tra danh mục phụ kiện.'); return; }
    setError('');
    onChange({ ...value, giftPreset: preset, giftAccessoryIds: selected.map(item => item.id) });
  };
  return <fieldset className="invoice-order-fields" aria-label="Chi nhánh và quà tặng">
    {error && <p role="alert" className="invoice-error">{error}</p>}
    <label>Chi nhánh bán hàng *<select required value={value.branchId || ''} onChange={e => onChange({ ...value, branchId: e.target.value })}>
      <option value="">Chọn chi nhánh</option>{catalog.branches.filter(b => b.active || String(b.id) === String(value.branchId)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select></label>
    <label>Combo quà tặng<select value={value.giftPreset || ''} onChange={e => choose(e.target.value)}>
      <option value="" disabled>Chọn quà tặng</option><option value="none">Không tặng</option><option value="mouse">Chỉ chuột</option><option value="backpack">Chỉ balo</option><option value="basic">Chuột + balo</option><option value="full">Full combo</option><option value="custom" disabled>Tùy chọn</option>
    </select></label>
    <div className="invoice-gift-options">{catalog.accessories.filter(a => a.active).map(a => <label key={a.id}><input type="checkbox" checked={(value.giftAccessoryIds || []).map(String).includes(String(a.id))} onChange={e => onChange({ ...value, giftPreset: 'custom', giftAccessoryIds: e.target.checked ? [...(value.giftAccessoryIds || []), a.id] : (value.giftAccessoryIds || []).filter(id => String(id) !== String(a.id)) })} />{a.name}</label>)}</div>
  </fieldset>;
}
