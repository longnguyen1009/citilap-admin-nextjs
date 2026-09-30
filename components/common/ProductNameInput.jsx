'use client';

import { useId, useMemo, useState } from 'react';
import { usePresetConfigs } from '@/lib/useFieldOptions';
import './product-name-input.css';

export default function ProductNameInput({ value = '', onValueChange, className = '', ...inputProps }) {
  const { presets } = usePresetConfigs();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const suggestions = useMemo(() => {
    const query = String(value).trim().toLocaleLowerCase('vi');
    if (!query) return [];
    return Object.entries(presets).filter(([key, label]) =>
      String(key).toLocaleLowerCase('vi').includes(query)
      || String(label).toLocaleLowerCase('vi').includes(query)
    ).slice(0, 12);
  }, [presets, value]);

  return <div className={`product-name-input ${className}`.trim()}>
    <input {...inputProps} role="combobox" aria-autocomplete="list" aria-expanded={open && suggestions.length > 0} aria-controls={open && suggestions.length ? listId : undefined} aria-activedescendant={open && activeIndex >= 0 && activeIndex < suggestions.length ? `${listId}-${activeIndex}` : undefined} value={value} onKeyDown={event => {
      inputProps.onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { setOpen(false); setActiveIndex(-1); }
      if (suggestions.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); setOpen(true);
        setActiveIndex(index => event.key === 'ArrowDown' ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length - 1 : index - 1));
      }
      if (event.key === 'Enter' && open && suggestions[activeIndex]) {
        event.preventDefault(); onValueChange?.(suggestions[activeIndex][1], event); setOpen(false); setActiveIndex(-1);
      }
    }} onChange={event => {
      onValueChange?.(event.target.value, event);
      setActiveIndex(-1);
      setOpen(true);
    }} onFocus={event => {
      setOpen(true);
      inputProps.onFocus?.(event);
    }} onBlur={event => {
      setTimeout(() => setOpen(false), 150);
      inputProps.onBlur?.(event);
    }} />
    {open && suggestions.length > 0 && <div id={listId} className="product-name-suggestions" role="listbox" aria-label="Gợi ý cấu hình">
      {suggestions.map(([key, label], index) => <button id={`${listId}-${index}`} tabIndex={-1} type="button" role="option" aria-selected={activeIndex === index} key={key}
        onMouseDown={event => event.preventDefault()} onClick={event => { onValueChange?.(label, event); setOpen(false); setActiveIndex(-1); }}>
        <strong>{key}</strong><span>{label}</span>
      </button>)}
    </div>}
  </div>;
}
