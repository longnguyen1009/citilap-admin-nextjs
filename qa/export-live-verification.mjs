import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
const env = Object.fromEntries((await readFile('.env', 'utf8')).split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const origin = process.env.APP_URL || 'http://localhost:3000';
const login = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
assert.ok(login.ok, 'Admin login');
const session = await login.json();
const headers = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
const output = 'test-results/purchase-invoice';
await mkdir(output, { recursive: true });
const checks = [];
for (const [type, route, expected] of [['orders', 'orders', 32], ['laptops', 'inventory', 24]]) {
  const list = await fetch(`${origin}/api/${route}?all=true&limit=250`, { headers });
  assert.ok(list.ok, `${type} list`);
  const payload = await list.json();
  const rows = Array.isArray(payload) ? payload : payload.data;
  assert.ok(!payload.hasMore, 'QA fixture fits in one page; do not silently truncate');
  assert.ok(Array.isArray(rows) && rows.length > 0);
  const ids = rows.map(row => row.id);
  for (const format of ['csv', 'xlsx']) {
    const response = await fetch(`${origin}/api/exports`, { method: 'POST', headers, body: JSON.stringify({ type, format, ids }) });
    assert.equal(response.status, 200, `${type} ${format}: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (format === 'xlsx') {
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(buffer);
      const sheet = book.worksheets[0];
      assert.equal(sheet.columnCount, expected);
      assert.equal(sheet.rowCount, ids.length + 1);
      if (type === 'orders') {
        const titles = sheet.getRow(1).values;
        for (let i = 0; i < rows.length; i++) {
          const date = rows[i].shipDate || '';
          const isoDate = /^\d{2}\/\d{2}\/\d{4}$/.test(date) ? date.split('/').reverse().join('-') : date;
          assert.equal(String(sheet.getCell(i + 2, titles.indexOf('Ngày gửi')).value || ''), isoDate);
          if (rows[i].saleOffline) assert.ok(sheet.getCell(i + 2, titles.indexOf('SALE Offline')).value);
          if (rows[i].giftAccessoryIds?.length) assert.ok(sheet.getCell(i + 2, titles.indexOf('Quà tặng')).value);
        }
      }
    } else assert.ok(buffer.subarray(0, 3).equals(Buffer.from([239, 187, 191])));
    await writeFile(`${output}/${type}.${format}`, buffer);
    checks.push({ type, format, rows: ids.length, columns: expected });
  }
}
const denied = await fetch(`${origin}/api/exports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'orders', format: 'csv', ids: [1] }) });
assert.equal(denied.status, 401);
await writeFile(`${output}/exports-report.json`, JSON.stringify({ checks, anonymousStatus: denied.status, writes: 0 }, null, 2));
console.log(JSON.stringify({ checks, anonymousStatus: denied.status, writes: 0 }));
