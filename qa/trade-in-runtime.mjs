import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const schema = new DatabaseSync(':memory:');
for (const file of readdirSync('db/d1/migrations').filter(f => f.endsWith('.sql')).sort()) schema.exec(readFileSync(`db/d1/migrations/${file}`, 'utf8'));
const ddl = schema.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END,rowid").all();
schema.close();
const bundle = await build({
  stdin: { contents: `import { receiveCustomerLaptop } from './lib/cloudflare/trade-in-workflows.mjs';
    export default { async fetch(request, env) {
      try { return Response.json(await receiveCustomerLaptop(env.DB, {role:'ADMIN',name:'Runtime'}, await request.json())); }
      catch(e) { return Response.json({error:e.message},{status:e.status||500}); }
    }};`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'node', external: ['node:*'],
});
const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-09-30', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'] }));
try {
  const db = await runtime.getD1Database('DB');
  for (const { sql } of ddl) await db.prepare(sql).run();
  await db.batch([
    db.prepare("INSERT INTO app_options(group_key,option_key,label,is_active) VALUES('category','loq','LOQ',1)"),
    db.prepare("INSERT INTO laptops(id,name,serial,category,status,import_price_vnd) VALUES(1,'Old','OLD','loq','sold',10),(2,'New','NEW','loq','available',20)"),
    db.prepare("INSERT INTO orders(id,laptop_id,customer_info,customer_address,sale_price,amount_paid,debt_amount,order_status,payment_status) VALUES(1,1,'Runtime customer','Address',15,15,0,'done','paid')"),
    db.prepare("INSERT INTO cash_accounts(id,code,name,account_type,currency,opening_balance_at,created_by) VALUES('cash','CASH','Test','CASH','VND','2020-01-01','Test')"),
  ]);
  const call = input => runtime.dispatchFetch('https://test.example', { method: 'POST', body: JSON.stringify(input) });
  const walk = { workflow: 'WALK_IN', sellerName: 'Runtime seller', name: 'LOQ', category: 'loq', serial: 'WALK', idempotencyKey: 'runtime-walk-key' };
  const concurrent = await Promise.all([call(walk), call(walk)]);
  const results = await Promise.all(concurrent.map(r => r.json()));
  assert.deepEqual(concurrent.map(r => r.status), [200, 200], JSON.stringify(results));
  assert.equal(results[0].id, results[1].id);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM laptops WHERE serial='WALK'").first()).n, 1);
  const exchange = { workflow: 'EXCHANGE', orderId: 1, laptopId: 2, saleVnd: 25000000, agreedVnd: 12000000, accountId: 'cash', idempotencyKey: 'runtime-exchange-key' };
  const response = await call(exchange), result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal((await db.prepare('SELECT amount FROM account_transactions').first()).amount, 13000000);
  const replay = await call(exchange);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).new_order_id, result.new_order_id);
  assert.equal((await db.prepare('SELECT count(*) n FROM payments').first()).n, 1);
  await assert.rejects(db.prepare("UPDATE orders SET note='edit old' WHERE id=1").run());
  await db.prepare("CREATE TRIGGER fail_receipt BEFORE INSERT ON stock_movements BEGIN SELECT RAISE(ABORT,'fixture failure'); END").run();
  const failed = await call({ ...walk, serial: 'ROLLBACK', idempotencyKey: 'runtime-rollback-key' });
  assert.notEqual(failed.status, 200);
  assert.equal((await db.prepare("SELECT count(*) n FROM laptops WHERE serial='ROLLBACK'").first()).n, 0);
  console.log('PASS real workerd/D1: concurrent replay, exchange credit/cash, repeat receipt prevention, historical order guard, atomic rollback');
} finally { await runtime.dispose(); }
