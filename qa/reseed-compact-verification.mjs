import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const { PGlite } = createRequire(path.join(os.tmpdir(), 'citilap-db-validation', 'package.json'))('@electric-sql/pglite');
const db = new PGlite();
const one = async sql => (await db.query(sql)).rows[0];

try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
  await db.exec(await readFile('init_full_db.sql', 'utf8'));
  await db.exec(await readFile('reseed_data.sql', 'utf8'));

  assert.equal((await one('SELECT count(*)::int n FROM laptops')).n, 30);
  assert.equal((await one('SELECT count(*)::int n FROM orders')).n, 20);
  assert.equal((await one("SELECT count(*)::int n FROM orders WHERE month_key='08/2026'")).n, 10);
  assert.equal((await one("SELECT count(*)::int n FROM orders WHERE month_key='09/2026'")).n, 10);
  assert.equal((await one('SELECT count(*)::int n FROM suppliers')).n, 16);
  assert.equal((await one("SELECT count(*)::int n FROM app_options WHERE group_key='category' AND is_active")).n, 31);
  assert.equal(Number((await one("SELECT value->>'defaultRate' rate FROM app_settings WHERE key='formula'")).rate), 3990);
  assert.equal((await one('SELECT count(*)::int n FROM laptops WHERE exchange_rate=3990')).n, 30);
  console.log('PASS compact reseed: 30 laptops, 20 orders (10 August + 10 September), 31 categories, 16 suppliers, rate 3990');
} finally {
  await db.close();
}
