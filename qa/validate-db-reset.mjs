import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const { PGlite } = createRequire(path.join(os.tmpdir(),'citilap-db-validation','package.json'))('@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;`);
  const init = await readFile('init_full_db.sql','utf8');
  const seed = await readFile('reseed_data.sql','utf8');
  await db.exec(init);
  console.log('PASS full schema bootstrap');
  await db.exec(`INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
    INSERT INTO public.user_profiles(id,name,role) VALUES ('00000000-0000-0000-0000-000000000001','Reset verification','ADMIN');`);
  await db.exec(seed);
  console.log('PASS first seed');
  await db.exec(seed);
  console.log('PASS repeated seed');
  await db.exec(init);
  const profiles = await db.query('SELECT role FROM public.user_profiles');
  if(profiles.rows.length!==1 || profiles.rows[0].role!=='ADMIN') throw Error('Profile not preserved');
  console.log('PASS repeated bootstrap preserves auth/profile');
  await db.exec(seed);
  console.log('PASS seed after schema rebuild');
  const invalid = await db.query(`SELECT
    (SELECT count(*) FROM laptops l WHERE l.is_locked IS DISTINCT FROM EXISTS(
      SELECT 1 FROM orders o WHERE o.laptop_id=l.id AND o.laptop_locked)) locks,
    (SELECT count(*) FROM orders o WHERE o.amount_paid <> coalesce((
      SELECT sum(CASE WHEN f.record_type='expense' THEN -f.amount ELSE f.amount END)
      FROM financial_records f WHERE f.order_id=o.id),0)) ledger,
    (SELECT count(*) FROM laptop_landed_costs c JOIN laptops l ON l.id=c.laptop_id
      WHERE c.landed_cost_vnd<>l.import_price_vnd*1000000) costs,
    (SELECT count(*) FROM customer_receivable_summaries r JOIN orders o ON o.id=r.order_id
      WHERE o.order_status IN ('cancelled','returned') OR o.payment_status='refunded') receivables`);
  if(Object.values(invalid.rows[0]).some(n=>Number(n)!==0)) throw Error(JSON.stringify(invalid.rows[0]));
  console.log('PASS inventory locks, finance ledger, landed costs and collectible debt');
  await db.query('SELECT get_management_dashboard(), get_financial_operations_summary()');
  console.log('PASS dashboard and finance summary functions');
  console.log(JSON.stringify((await db.query(`SELECT month_key,count(*) orders,
    (SELECT count(*) FROM laptops l WHERE l.month_key=o.month_key) laptops,
    (SELECT count(*) FROM payments p WHERE to_char(p.payment_date,'MM/YYYY')=o.month_key) payments
    FROM orders o GROUP BY month_key ORDER BY month_key`)).rows,null,2));
} catch(error) { console.error(error.message, error.detail || '', error.where || ''); process.exitCode=1; }
finally {await db.close();}
