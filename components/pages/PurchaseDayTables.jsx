'use client';
import { Fragment, useEffect, useState } from 'react';
import { computeImportPrice } from '@/context/InventoryContext';
import ProductNameInput from '@/components/common/ProductNameInput';
import { formatRmb } from '@/lib/procurement';
import { useAuth } from '@/context/AuthContext';
import './purchase-day-tables.css';

export default function PurchaseDayTables({ groups, categories, formulaConfig, mutate, pending, onEdit, statuses }) {
  const { user } = useAuth();
  if (!user?.id) return null;
  return <PurchaseDraftTable key={user.id} storageKey={`citilap_purchase_inline_drafts:v2:${user.id}`} {...{ groups, categories, formulaConfig, mutate, pending, onEdit, statuses }} />;
}

function PurchaseDraftTable({ storageKey, groups, categories, formulaConfig, mutate, pending, onEdit, statuses }) {
  const [storageError, setStorageError] = useState('');
  const [drafts, setDrafts] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
      return Object.fromEntries(Object.entries(saved).filter(([, draft]) => draft && typeof draft === 'object' && draft.batch?.id && typeof draft.key === 'string' && typeof draft.name === 'string'));
    }
    catch { return {}; }
  });
  const [collapsed, setCollapsed] = useState({});
  useEffect(() => {
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(drafts)); }
    catch { queueMicrotask(() => setStorageError('Không thể lưu nháp trong trình duyệt. Hãy lưu máy trước khi rời trang.')); }
  }, [drafts, storageKey]);
  const update = (key, field, value) => setDrafts(current => ({ ...current, [key]: { ...current[key], [field]: value } }));
  const remove = key => {
    const next = { ...drafts };
    delete next[key];
    // Persist immediately because the parent refresh can otherwise unmount this table
    // before the state effect has written the cleared draft.
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError('Không thể cập nhật bản nháp trong trình duyệt.');
    }
    setDrafts(next);
  };
  return <section className="purchase-days">{storageError && <p role="alert">{storageError}</p>}{groups.map(group => {
    const suppliers = new Map();
    for (const entry of group.batches) {
      const key = String(entry.batch?.supplier_id ?? entry.batch?.supplier_name ?? 'unknown');
      if (!suppliers.has(key)) suppliers.set(key, { name: entry.batch?.supplier_name || 'Chưa rõ nhà cung cấp', batches: [], rows: [] });
      const supplier = suppliers.get(key);
      if (entry.batch) supplier.batches.push(entry.batch);
      supplier.rows.push(...entry.laptops.map(laptop => ({ laptop, batch: entry.batch })));
    }
    return <article className="purchase-day" key={group.date}><button className="purchase-day-heading" aria-expanded={!collapsed[group.date]} onClick={() => setCollapsed(current => ({ ...current, [group.date]: !current[group.date] }))}><b>{collapsed[group.date] ? '▸' : '▾'} {group.date === 'Không rõ ngày' ? group.date : new Date(`${group.date}T00:00:00`).toLocaleDateString('vi-VN')}</b><span>{suppliers.size} nhà cung cấp · {group.batches.reduce((sum, item) => sum + item.laptops.length, 0)} máy</span></button>{!collapsed[group.date] && <div className="purchase-day-scroll"><table><thead><tr><th>Nhà cung cấp</th><th>Máy</th><th>Phân loại</th><th>Mã VC / Serial</th><th>Giá / Ship (CNY)</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{[...suppliers.entries()].map(([supplierId, supplier]) => {
      const key = `${group.date}:${supplierId}`;
      const draft = drafts[key];
      const cell = <td rowSpan={supplier.rows.length + (draft ? 1 : 0)} className="purchase-supplier"><b>{supplier.name}</b><small>{supplier.rows.filter(row => row.laptop.received_at).length}/{supplier.rows.length} đã nhận</small>{supplier.batches.map(batch => <button key={batch.id} title={`Thêm máy vào ${batch.batch_code}`} disabled={pending || Boolean(draft)} onClick={() => setDrafts(current => ({ ...current, [key]: { batch, key: crypto.randomUUID(), name: '', category: categories[0]?.option_key || '', purchase_price_rmb: '', shipping_rmb: '0', tracking_code_cn: '', serial: '', notes: '' } }))}>+ Thêm{supplier.batches.length > 1 && <small>{batch.batch_code}</small>}</button>)}</td>;
      return <Fragment key={key}>{supplier.rows.map(({ laptop }, index) => <tr key={laptop.id} className={`purchase-row status-${laptop.status}`}>{index === 0 && cell}<td className="purchase-machine"><b title={laptop.name}>#{laptop.id} · {laptop.name}</b>{laptop.condition_note && <small title={laptop.condition_note}>{laptop.condition_note}</small>}</td><td>{categories.find(option => option.option_key === laptop.category)?.label || laptop.category || '—'}</td><td><code>Mã VC: {laptop.tracking_code_cn || '—'}</code><small>Serial: {laptop.serial || '—'}</small></td><td>{formatRmb(laptop.purchase_price_rmb)}<small>Ship {formatRmb(laptop.shipping_rmb)}</small></td><td><span className={`intake-status intake-status-${laptop.status}`}>{statuses[laptop.status] || laptop.status}</span></td><td><button aria-label={`Sửa máy ${laptop.id}`} onClick={() => onEdit({ laptopId: laptop.id, data: { name: laptop.name, category: laptop.category || '', purchase_price_rmb: laptop.purchase_price_rmb, shipping_rmb: laptop.shipping_rmb, import_price_vnd: laptop.import_price_vnd ?? computeImportPrice(laptop.purchase_price_rmb, laptop.shipping_rmb, laptop.purchase_exchange_rate, formulaConfig), tracking_code_cn: laptop.tracking_code_cn || '', serial: laptop.serial || '', notes: laptop.condition_note || '', purchase_batch_id: laptop.purchase_batch_id } })}>Sửa</button></td></tr>)}{draft && <tr className="purchase-draft"><td><form id={draft.key} onSubmit={event => { event.preventDefault(); const { batch, key: requestKey, ...laptop } = draft; mutate({ action: 'addToBatch', batchId: batch.id, key: requestKey, laptop: { ...laptop, import_price_vnd: computeImportPrice(laptop.purchase_price_rmb, laptop.shipping_rmb, batch.exchange_rate, formulaConfig) } }, () => remove(key)); }}><ProductNameInput required value={draft.name} onValueChange={value => update(key, 'name', value)} /><input aria-label="Ghi chú máy mới" placeholder="Ghi chú nội bộ" value={draft.notes} onChange={event => update(key, 'notes', event.target.value)} /></form></td><td><select form={draft.key} required aria-label="Phân loại máy mới" value={draft.category} onChange={event => update(key, 'category', event.target.value)}><option value="">Chọn phân loại</option>{categories.map(option => <option key={option.option_key} value={option.option_key}>{option.label}</option>)}</select></td><td>{[['tracking_code_cn', 'Mã VC'], ['serial', 'Serial']].map(([field, label]) => <input key={field} aria-label={`${label} máy mới`} placeholder={label} value={draft[field]} onChange={event => update(key, field, event.target.value)} />)}</td><td>{[['purchase_price_rmb', 'Giá CNY'], ['shipping_rmb', 'Ship CNY']].map(([field, label]) => <input key={field} form={draft.key} required type="number" min="0" step="0.01" aria-label={label} placeholder={label} value={draft[field]} onChange={event => update(key, field, event.target.value)} />)}</td><td><small>Dòng mới · Chưa lưu</small><small>Giá nhập: {computeImportPrice(draft.purchase_price_rmb, draft.shipping_rmb, draft.batch.exchange_rate, formulaConfig)} triệu VNĐ</small></td><td><button type="submit" form={draft.key} disabled={pending}>Lưu máy</button><button type="button" disabled={pending} onClick={() => remove(key)}>Hủy</button></td></tr>}</Fragment>;
    })}</tbody></table></div>}</article>;
  })}{!groups.length && <p>Không có laptop phù hợp.</p>}</section>;
}
