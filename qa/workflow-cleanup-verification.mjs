import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const { PGlite } = createRequire(path.join(os.tmpdir(), 'citilap-db-validation/package.json'))('@electric-sql/pglite');
const db = new PGlite();
const name = '20260927164025_remove_redundant_workflow_objects.sql';
const one = async sql => (await db.query(sql)).rows[0];
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
  const init = await readFile('init_full_db.sql','utf8');
  await db.exec(init.split('-- MIGRATION: '+name)[0]+'COMMIT;');
  await db.exec(await readFile('reseed_data.sql','utf8'));
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const fingerprint = async () => {
    const values = {};
    for (const { tablename } of tables) {
      values[tablename] = await one(`SELECT count(*)::int n, md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM public."${tablename}" t`);
    }
    return values;
  };
  const before = await fingerprint();
  const migration = await readFile('supabase/migrations/'+name,'utf8');
  await db.exec(migration);
  await db.exec(migration);
  assert.deepEqual(await fingerprint(),before);
  console.log(`PASS all rows in ${tables.length} tables preserved after migration and replay`);
  assert.equal((await one("SELECT to_regclass('public.trade_ins_inventory_source_unique') value")).value,null);
  assert.notEqual((await one("SELECT to_regclass('public.trade_ins_inventory_laptop_id_key') value")).value,null);
  assert.equal((await one("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='user_profiles'::regclass AND conname='user_profiles_role_valid'")).n,0);
  assert.equal((await one("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='user_profiles'::regclass AND conname='user_profiles_role_check' AND convalidated")).n,1);
  console.log('PASS redundant index/check removed and authoritative constraints retained');
  assert.equal((await one("SELECT count(*)::int n FROM pg_proc WHERE proname IN ('guard_repair_laptop_transition','guard_supplier_return_laptop_transition')")).n,0);
  assert.equal((await one("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='laptops'::regclass AND tgname='laptops_status_workflow_guard'")).n,1);
  await db.query('SELECT get_management_dashboard(),get_financial_operations_summary()');
  console.log('PASS current state guard and management/finance reports survive cleanup');
} finally { await db.close(); }
