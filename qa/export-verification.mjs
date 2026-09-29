import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { exportTable, csvTable } from '../lib/exportData.js';

const rows = [{ id: 1, sale_offline: 'seller', sale_online: 'online', laptop_id: 7, customer_id: 9, gift_accessory_ids: [4], ship_date: '2026-09-30', deposit_amount: 2, sale_price: 12, note: 'Dòng "một",\nDòng hai' }];
const context = { laptops: [{ id: 7, name: 'Laptop thử', serial: '000123' }], customers: [{ id: 9, name: 'Khách thử', phone: '0912345678' }], accessories: [{ id: 4, name: 'Chuột không dây' }], options: [{ group_key: 'saleOffline', option_key: 'seller', label: 'Nhân viên cửa hàng' }] };
const table = exportTable('orders', rows, context);
const cell = title => table.rows[0][table.headers.indexOf(title)];
assert.equal(table.headers.length, 32);
assert.equal(cell('SALE Offline'), 'Nhân viên cửa hàng');
assert.equal(cell('Quà tặng'), 'Chuột không dây');
assert.equal(cell('Ngày gửi'), '2026-09-30');
assert.equal(cell('Tiền cọc (triệu VNĐ)'), 2);
assert.equal(cell('Khách hàng'), 'Khách thử');
assert.equal(cell('Serial'), '000123');
assert.equal(cell('Điện thoại'), '0912345678');
const laptopTable = exportTable('laptops', [{ id: 7, purchase_price_rmb: 0, price_rmb: 100, purchase_exchange_rate: 3550, serial: '000123' }]);
assert.equal(laptopTable.headers.length, 24);
assert.equal(laptopTable.rows[0][14], 0);
for (const current of [table, laptopTable]) for (const row of current.rows) assert.equal(row.length, current.headers.length);
const csv = csvTable(table);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('"Dòng ""một"",\nDòng hai"'));
assert.ok(csvTable({ headers: ['Text'], rows: [['=1+1'], [' @SUM(1)']] }).includes("'=1+1"));
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Test');
sheet.addRow(table.headers); sheet.addRows(table.rows);
const decoded = new ExcelJS.Workbook();
await decoded.xlsx.load(await workbook.xlsx.writeBuffer());
assert.equal(decoded.worksheets[0].getCell(2, table.headers.indexOf('Điện thoại') + 1).value, '0912345678');
assert.equal(decoded.worksheets[0].getCell(2, table.headers.indexOf('Serial') + 1).value, '000123');
assert.equal(decoded.worksheets[0].getCell(2, table.headers.indexOf('Giá bán (triệu VNĐ)') + 1).value, 12);
const source = (await readFile('app/api/exports/route.js', 'utf8')).replace(/^import .*;\r?\n/gm, '').replace('export const runtime', 'const runtime').replace('export async function', 'async function');
for (const role of [null, 'SALES', 'TECH', 'TECHNICAL', 'STAFF']) {
  const handler = new Function('requireUser', 'getSupabaseAdminClient', source + '\nreturn POST;')(
    async (_request, allowed) => { assert.deepEqual(allowed, ['ADMIN']); return { ok: false, response: new Response(null, { status: role ? 403 : 401 }) }; },
    () => { throw new Error('Unauthorized DB read'); },
  );
  assert.equal((await handler(new Request('http://localhost/api/exports', { method: 'POST' }))).status, role ? 403 : 401);
}
console.log('PASS exports: 32 order / 24 laptop columns, gifts/offline/date, CSV quoting/formulas, XLSX types, five denied roles');
