import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const { PGlite } = createRequire(path.join(os.tmpdir(), 'citilap-db-validation', 'package.json'))('@electric-sql/pglite');
const db = new PGlite();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
  await db.exec(await readFile('init_full_db.sql', 'utf8'));
  await db.exec(await readFile('reseed_data.sql', 'utf8'));
  const machine = await one("SELECT id,name FROM laptops WHERE status='available' LIMIT 1");
  const makeOrder = async () => (await one(`SELECT create_order_with_inventory($1::jsonb,'QA') result`, [JSON.stringify({
    requested_laptop_id: machine.id, sale_price: 25, order_status: 'new', payment_status: 'unpaid', is_active: true,
  })])).result.order;
  const a = await makeOrder(); const b = await makeOrder();
  assert.equal(a.requested_configuration, machine.name);
  await db.query("UPDATE orders SET reservation_expires_at=timezone('utc',now())+interval '48 hours' WHERE id=$1", [a.id]);
  assert.equal((await one('SELECT reservation_expires_at FROM orders WHERE id=$1', [a.id])).reservation_expires_at, null);
  console.log('PASS order allocations do not keep an expiry time');
  for (const order of [a,b]) await db.query("SELECT record_order_payment($1,1,'deposit')", [order.id]);
  assert.equal((await one('SELECT status FROM laptops WHERE id=$1',[machine.id])).status,'available');
  console.log('PASS shared configuration deposits preserve available stock and configuration');
  await db.query("SELECT allocate_order_laptop($1,$2,NULL,'QA')",[a.id,machine.id]);
  assert.equal((await one('SELECT status FROM laptops WHERE id=$1',[machine.id])).status,'reserved');
  await assert.rejects(db.query("SELECT allocate_order_laptop($1,$2,NULL,'QA')",[b.id,machine.id]), /thay đổi/);
  console.log('PASS allocation reserves stock and stale ownership is rejected');
  await db.query("SELECT allocate_order_laptop($1,$2,$3,'QA')",[b.id,machine.id,a.id]);
  assert.equal((await one('SELECT laptop_id FROM orders WHERE id=$1',[a.id])).laptop_id,null);
  assert.equal(Number((await one('SELECT amount_paid FROM orders WHERE id=$1',[a.id])).amount_paid),1);
  assert.equal(Number((await one('SELECT laptop_id FROM orders WHERE id=$1',[b.id])).laptop_id),Number(machine.id));
  console.log('PASS transfer keeps deposits on their original orders');
  await db.query("SELECT allocate_order_laptop($1,NULL,NULL,'QA')",[b.id]);
  assert.equal((await one('SELECT status FROM laptops WHERE id=$1',[machine.id])).status,'available');
  console.log('PASS releasing allocation restores stock');
  await assert.rejects(db.query("UPDATE orders SET order_status='prepared' WHERE id=$1",[a.id]), /phân máy/);
  await db.query("SELECT allocate_order_laptop($1,$2,NULL,'QA')",[b.id,machine.id]);
  await db.query("UPDATE orders SET order_status='prepared' WHERE id=$1",[b.id]);
  await db.query('SELECT refresh_laptop_inventory($1)',[machine.id]);
  await assert.rejects(db.query("SELECT allocate_order_laptop($1,$2,$3,'QA')",[a.id,machine.id,b.id]));
  console.log('PASS shipping requires allocation and committed machines cannot transfer');
} finally { await db.close(); }
