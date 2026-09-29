import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export async function currentSchema() {
  const { PGlite } = createRequire(path.join(os.tmpdir(), 'citilap-db-validation', 'package.json'))('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
    await db.exec(await readFile('init_full_db.sql', 'utf8'));
    return db;
  } catch (error) { await db.close(); throw error; }
}
