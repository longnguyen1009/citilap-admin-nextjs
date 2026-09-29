import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const { PGlite } = createRequire(path.join(os.tmpdir(), 'citilap-db-validation', 'package.json'))('@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
  await db.exec(await readFile('init_full_db.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20260927040000_simplify_month_queries.sql', 'utf8'));
  await db.exec(`INSERT INTO suppliers(code,name,created_by) VALUES('TEST','Supplier','QA');
    INSERT INTO purchase_batches(batch_code,supplier_id,purchase_date,exchange_rate,created_by,updated_by)
    SELECT 'TEST',id,'2026-06-12',3550,'QA','QA' FROM suppliers;
    INSERT INTO laptops(name,serial,month_key,is_active) VALUES
      ('A','serial-a','09/2026',true),('B','serial-b','09/2026',true),
      ('C','serial-c','12/2025',true),('D','serial-d','08/2026',false);`);
  assert.deepEqual((await db.query("SELECT * FROM list_data_months('operations')")).rows.map(r => r.month_key), ['09/2026','12/2025']);
  assert.deepEqual((await db.query("SELECT * FROM list_data_months('purchases')")).rows.map(r => r.month_key), ['06/2026']);
  assert.equal((await db.query("SELECT to_regclass('public.laptops_serial_unique_idx') gone")).rows[0].gone, null);
  await assert.rejects(db.exec("INSERT INTO laptops(serial) VALUES(' SERIAL-A ')"), /duplicate key/);
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','list_data_months(text)','execute') allowed")).rows[0].allowed, false);
  console.log('PASS: month deduplication/order/active scope, purchase dates, duplicate index removal, serial uniqueness, RPC permissions and repeat migration');
} finally { await db.close(); }
