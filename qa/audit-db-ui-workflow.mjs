// Read-only effective-schema and source-reference inventory for DB/UI workflow audits.
// Usage: node qa/audit-db-ui-workflow.mjs
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

const requirePglite = createRequire(path.join(os.tmpdir(), 'citilap-db-validation', 'package.json'));
const { PGlite } = requirePglite('@electric-sql/pglite');
const db = new PGlite();
const sourceDirs = ['app/api', 'components/pages', 'lib/services'];
const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => {
  const full = `${dir}/${entry.name}`;
  return entry.isDirectory() ? walk(full) : /\.(js|jsx)$/.test(entry.name) ? [full] : [];
}))).flat();

try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
  await db.exec(await readFile('init_full_db.sql', 'utf8'));

  const tables = (await db.query(`SELECT c.relname AS name,
      (SELECT count(*)::int FROM information_schema.columns x WHERE x.table_schema='public' AND x.table_name=c.relname) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`)).rows;
  const files = (await Promise.all(sourceDirs.map(walk))).flat();
  const texts = await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')]));

  const indexes = (await db.query(`SELECT t.relname AS table_name, i.relname AS index_name,
      x.indisunique, x.indisprimary, x.indkey::text AS keys, x.indclass::text AS classes,
      x.indcollation::text AS collations, x.indoption::text AS options,
      pg_get_expr(x.indpred,x.indrelid) AS predicate, pg_get_expr(x.indexprs,x.indrelid) AS expression
    FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
      JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND x.indisvalid ORDER BY t.relname,i.relname`)).rows;
  const duplicateIndexes = [];
  for (const [index, a] of indexes.entries()) for (const b of indexes.slice(index + 1)) {
    if (a.table_name !== b.table_name) continue;
    const keys = ['indisunique', 'keys', 'classes', 'collations', 'options', 'predicate', 'expression'];
    if (keys.every(key => a[key] === b[key])) duplicateIndexes.push([a.index_name, b.index_name]);
  }
  const duplicateChecks = (await db.query(`SELECT a.conrelid::regclass::text AS table_name,
      a.conname AS first, b.conname AS second, pg_get_constraintdef(a.oid) AS definition
    FROM pg_constraint a JOIN pg_constraint b ON a.conrelid=b.conrelid AND a.oid<b.oid
    WHERE a.contype='c' AND b.contype='c' AND a.conbin=b.conbin
      AND a.connamespace='public'::regnamespace ORDER BY 1,2`)).rows;

  const report = tables.map(({ name, columns }) => {
    const routeRefs = texts.filter(([file, text]) => file.startsWith('app/api/') && text.includes(`'${name}'`)).map(([file]) => file);
    const uiRefs = texts.filter(([file, text]) => file.startsWith('components/pages/') && text.includes(name)).map(([file]) => file);
    const serviceRefs = texts.filter(([file, text]) => file.startsWith('lib/services/') && text.includes(`'${name}'`)).map(([file]) => file);
    return { table: name, columns, routeRefs, uiRefs, serviceRefs };
  });
  console.log(JSON.stringify({ tableCount: tables.length, indexCount: indexes.length,
    duplicateIndexes, duplicateChecks, tables: report }, null, 2));
} finally {
  await db.close();
}
