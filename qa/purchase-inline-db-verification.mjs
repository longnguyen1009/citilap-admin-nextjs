import assert from 'node:assert/strict';
import { currentSchema } from './current-schema.mjs';
const db = await currentSchema();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
try {
  const supplier = await one("INSERT INTO suppliers(code,name,created_by) VALUES('QA-INLINE','QA inline','QA') RETURNING id");
  const category = await one("SELECT option_key FROM app_options WHERE group_key='category' AND is_active=true LIMIT 1");
  const laptop = { name: 'QA inline laptop', category: category.option_key, purchase_price_rmb: 3000, shipping_rmb: 20, import_price_vnd: 11.121, serial: 'QA-INLINE-001', notes: 'Ghi chú kiểm tra' };
  const created = (await one("SELECT create_purchase_batch($1::jsonb,$2::jsonb,'QA','inline-create-001') AS value", [JSON.stringify({ supplier_id: supplier.id, purchase_date: '2026-09-30', purchase_exchange_rate: 3550 }), JSON.stringify([{ ...laptop, serial: 'QA-INITIAL' }])])).value;
  const batchId = created.batch?.id ?? created.id ?? created.laptops[0].purchase_batch_id;
  const add = async data => (await one("SELECT add_laptop_to_purchase_batch($1,$2::jsonb,'QA','inline-add-001') AS value", [batchId, JSON.stringify(data)])).value;
  const added = await add(laptop);
  const persisted = await one('SELECT * FROM laptops WHERE id=$1', [added.id]);
  assert.equal(persisted.name, laptop.name);
  assert.equal(persisted.serial, laptop.serial);
  assert.equal(persisted.condition_note, laptop.notes);
  assert.equal(persisted.status, 'in_transit');
  assert.equal(String(persisted.purchase_batch_id), String(batchId));
  assert.equal(persisted.month_key, '09/2026');
  assert.equal((await add(laptop)).id, added.id);
  assert.equal(Number((await one('SELECT count(*) AS count FROM laptops WHERE purchase_batch_id=$1', [batchId])).count), 2);
  console.log('PASS inline purchase DB: persisted fields, batch, month, state and idempotent retry; isolated local database');
} finally { await db.close(); }
