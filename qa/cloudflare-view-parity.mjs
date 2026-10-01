import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

// Compare reports against PostgreSQL using fresh, isolated test fixtures.
// No network access and no writes to either production database.
const pg = new PGlite();
const sqlite = new DatabaseSync(':memory:');
const catalog = JSON.parse(await readFile('docs/cloudflare/postgres-catalog.json', 'utf8'));
const quote = value => `"${value.replaceAll('"', '""')}"`;
const encode = value => value instanceof Date ? value.toISOString() : typeof value === 'boolean' ? Number(value)
  : value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return Number(value);
  if (typeof value === 'number') return Math.round(value * 1e6) / 1e6;
  if (typeof value === 'string') {
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return normalize(Number(value));
    if (value.startsWith('[')) { try { return normalize(JSON.parse(value)); } catch { /* plain text */ } }
    if (/^\d{4}-\d\d-\d\d[T ]\d\d:/.test(value)) return new Date(value).toISOString();
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort().map(([key, item]) => [key, normalize(item)]));
  return value;
}
try {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
  await pg.exec((await readFile('init_full_db.sql', 'utf8')).replace(/^\uFEFF/, ''));
  await pg.exec((await readFile('reseed_data.sql', 'utf8')).replace(/^\uFEFF/, ''));
  sqlite.exec(await readFile('db/d1/migrations/0001_schema.sql', 'utf8'));
  sqlite.exec(await readFile('db/d1/migrations/0003_views.sql', 'utf8'));
  sqlite.exec('BEGIN; PRAGMA defer_foreign_keys=ON;');
  for (const table of [...new Set(catalog.columns.map(column => column.table_name))]) {
    const columns = catalog.columns.filter(column => column.table_name === table && column.is_generated !== 'ALWAYS').map(column => column.column_name);
    const rows = (await pg.query(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`)).rows;
    const insert = sqlite.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
    for (const row of rows) insert.run(...columns.map(column => encode(row[column])));
  }
  sqlite.exec('COMMIT');
  let totalRows = 0;
  for (const view of catalog.views) {
    const expected = (await pg.query(`SELECT * FROM ${quote(view.name)}`)).rows.map(normalize);
    const actual = sqlite.prepare(`SELECT * FROM ${quote(view.name)}`).all().map(normalize);
    const sort = rows => rows.map(row => JSON.stringify(row)).sort();
    assert.deepEqual(sort(actual), sort(expected), `Report differs: ${view.name}`);
    totalRows += actual.length;
    console.log(`PASS ${view.name}: ${actual.length} rows`);
  }
  console.log(`PASS 7/7 view parity checks, ${totalRows} rows compared`);
} finally { sqlite.close(); await pg.close(); }
