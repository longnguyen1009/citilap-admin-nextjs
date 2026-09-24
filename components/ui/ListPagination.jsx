"use client";

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const DEFAULT_PAGE_SIZE = 50;

export function useListPagination(rows, resetKey = '', pageSize = DEFAULT_PAGE_SIZE) {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (state.key !== resetKey) setState({ key: resetKey, page: 1 });
  else if (state.page > pageCount) setState({ key: resetKey, page: pageCount });
  const page = state.key === resetKey ? Math.min(state.page, pageCount) : 1;
  const setPage = updater => setState(current => {
    const currentPage = current.key === resetKey ? Math.min(current.page, pageCount) : 1;
    const nextPage = typeof updater === 'function' ? updater(currentPage) : updater;
    return { key: resetKey, page: Math.max(1, Math.min(pageCount, nextPage)) };
  });

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  return { page, setPage, pageCount, pageRows, total, pageSize };
}

export default function ListPagination({ page, setPage, pageCount, total, pageSize = DEFAULT_PAGE_SIZE }) {
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav className="list-pagination" aria-label="Phân trang danh sách">
      <span>Hiển thị <b>{first}–{last}</b> / {total} bản ghi</span>
      <div>
        <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1} aria-label="Trang trước"><ChevronLeft size={16}/></button>
        <strong>Trang {page} / {pageCount}</strong>
        <button type="button" onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page === pageCount} aria-label="Trang sau"><ChevronRight size={16}/></button>
      </div>
    </nav>
  );
}
