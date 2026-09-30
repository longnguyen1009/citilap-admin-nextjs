'use client';
import { useEffect, useRef } from 'react';

export function useColumnResize(widths, setWidths) {
  const cleanup = useRef(null);
  useEffect(() => () => cleanup.current?.(), []);
  return (event, key) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cleanup.current?.();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = widths[key] || 100;
    const pointerId = event.pointerId;
    const move = e => {
      if (e.pointerId !== pointerId) return;
      setWidths(previous => ({ ...previous, [key]: Math.max(45, startWidth + e.clientX - startX) }));
    };
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', stop);
      handle.classList.remove('is-resizing');
      document.body.classList.remove('is-column-resizing');
      cleanup.current = null;
    };
    const end = e => { if (e.pointerId === pointerId) stop(); };
    cleanup.current = stop;
    handle.classList.add('is-resizing');
    document.body.classList.add('is-column-resizing');
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    window.addEventListener('blur', stop);
  };
}
