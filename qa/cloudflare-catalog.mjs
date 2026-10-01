// Read the final PostgreSQL catalog in an isolated, in-memory database.
// This script never connects to Supabase and never executes SQL against D1.
import { PGlite } from '@electric-sql/pglite';
import { readFile, writeFile } from 'node:fs/promises';
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
  await db.exec((await readFile('init_full_db.sql', 'utf8')).replace(/^\uFEFF/, ''));
  const query = async sql => (await db.query(sql)).rows;
  const catalog = {
    columns: await query(`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,is_identity,is_generated,generation_expression
      FROM information_schema.columns WHERE table_schema='public'
      AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')
      ORDER BY table_name,ordinal_position`),
    constraints: await query(`SELECT t.relname AS table_name,c.conname,c.contype,pg_get_constraintdef(c.oid,true) AS definition
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND c.contype<>'n' ORDER BY t.relname,c.conname`),
    indexes: await query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`),
    functions: await query(`SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname`),
    triggers: await query(`SELECT c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid,true) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`),
    views: await query(`SELECT viewname AS name,definition FROM pg_views WHERE schemaname='public' ORDER BY viewname`),
  };
  await writeFile('docs/cloudflare/postgres-catalog.json', JSON.stringify(catalog, null, 2) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(catalog).map(([name, rows]) => [name, rows.length]))));
} finally {
  await db.close();
}
