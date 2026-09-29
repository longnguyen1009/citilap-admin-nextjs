'use client';

import { useMemo, useState } from 'react';
import { usePresetConfigs } from '@/lib/useFieldOptions';
import './product-name-input.css';

export default function ProductNameInput({ value = '', onValueChange, className = '', ...inputProps }) {
  const { presets } = usePresetConfigs();
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => {
    const query = String(value).trim().toLocaleLowerCase('vi');
    if (!query) return [];
    return Object.entries(presets).filter(([key, label]) =>
      String(key).toLocaleLowerCase('vi').includes(query)
      || String(label).toLocaleLowerCase('vi').includes(query)
    ).slice(0, 12);
  }, [presets, value]);

  return <div className={`product-name-input ${className}`.trim()}>
    <input {...inputProps} value={value} onChange={event => {
      onValueChange?.(event.target.value, event);
      setOpen(true);
    }} onFocus={event => {
      setOpen(true);
      inputProps.onFocus?.(event);
    }} onBlur={event => {
      setTimeout(() => setOpen(false), 150);
      inputProps.onBlur?.(event);
    }} />
    {open && suggestions.length > 0 && <div className="product-name-suggestions" role="listbox">
      {suggestions.map(([key, label]) => <button type="button" role="option" aria-selected="false" key={key}
        onMouseDown={event => { event.preventDefault(); onValueChange?.(label, event); setOpen(false); }}>
        <strong>{key}</strong><span>{label}</span>
      </button>)}
    </div>}
  </div>;
}
