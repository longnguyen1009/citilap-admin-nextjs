import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize } from '../scripts/normalize-october-sheet.mjs';

const data = normalize();
test('confirmed zero deposits and full payment for order 14', () => {
  const three = data.october_orders.find(r => r.external_number === '3');
  const fourteen = data.october_orders.find(r => r.external_number === '14');
  assert.equal(three.deposit_million_vnd, 0);
  assert.equal(three.remainder_million_vnd, three.sale_million_vnd);
  assert.equal(fourteen.deposit_million_vnd, 0);
  assert.equal(fourteen.confirmed_paid_million_vnd, 31.5);
  assert.equal(fourteen.remainder_million_vnd, 31.5);
  assert.equal(fourteen.payment_status_raw, 'HOÀN THÀNH');
  assert.equal(fourteen.raw['CỌC'], '');
  assert.ok(!data.issues.some(r => r.type === 'unresolved_deposit'));
});
test('190 unique laptops and 60 unique orders', () => {
  assert.equal(new Set([...data.october_laptops, ...data.september_supplement].map(r => r.id)).size, 190);
  assert.equal(data.orders.length, 60);
  assert.equal(new Set(data.orders.map(r => r.external_number)).size, 60);
});
test('all suppliers mapped; only three new suppliers approved', () => {
  assert.ok([...data.october_laptops, ...data.september_supplement].every(r => r.supplier_code));
  assert.equal(data.new_suppliers.length, 3);
  assert.equal(data.october_laptops.find(r => r.id === '1966').supplier_code, 'QUEANH');
});
test('carryover confirmations and corrected date', () => {
  assert.equal(data.carryover_orders.length, 13);
  assert.ok(data.carryover_orders.every(r => !r.laptop_id && r.payment_status_raw === 'ĐÃ CỌC'));
  assert.equal(data.carryover_orders.find(r => r.external_number === '267').created_date, '2026-09-30');
});
test('corrections do not alter original source cells', () => {
  const order = data.orders.find(r => r.external_number === '267');
  assert.equal(order.date_raw, '31/9');
  assert.equal(data.orders.find(r => r.laptop_id === '1878').external_number, '46');
  assert.equal(data.orders.find(r => r.laptop_id === '1810').payment_status_raw, 'HOÀN THÀNH');
});
test('saved export exactly matches normalizer', () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../db/d1/imports/2026-10-review/normalized.json', import.meta.url), 'utf8')), data);
});
