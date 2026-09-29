import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile('lib/fetchPagedList.js', 'utf8');
const { fetchPagedList } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originalFetch = globalThis.fetch;
try {
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    const offset = Number(url.searchParams.get('offset'));
    const data = Array.from({ length: Math.min(250, 1251 - offset) }, (_, i) => ({ id: offset + i + 1 }));
    return Response.json({ data, hasMore: offset + data.length < 1251 });
  };
  const rows = await fetchPagedList('http://localhost/api/inventory?monthKey=09%2F2026', {});
  assert.equal(rows.length, 1251);
  assert.equal(new Set(rows.map(row => row.id)).size, 1251);
  assert.equal(calls.length, 6);
  assert(calls.every(url => url.searchParams.get('monthKey') === '09/2026'));
  globalThis.fetch = async () => Response.json({ error: 'Forbidden' }, { status: 403 });
  await assert.rejects(fetchPagedList('http://localhost/api/orders', {}), error => error.status === 403);
  globalThis.fetch = async () => Response.json({ data: [], hasMore: true });
  await assert.rejects(fetchPagedList('http://localhost/api/orders', {}), /thay đổi/);
  globalThis.fetch = async url => Number(url.searchParams.get('offset')) === 0
    ? Response.json({ data: [{ id: 1 }], hasMore: true })
    : Response.json({ error: 'failed' }, { status: 503 });
  await assert.rejects(fetchPagedList('http://localhost/api/orders', {}), error => error.status === 503);
  console.log('PASS paged lists 7/7: 1251 rows, unique IDs, scope, HTTP failures, no partial success');
} finally { globalThis.fetch = originalFetch; }
