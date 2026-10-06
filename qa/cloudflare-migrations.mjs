import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const directory = 'db/d1/migrations';
const files = (await readdir(directory)).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
assert.ok(files.length >= 20, `Expected the complete D1 chain, found ${files.length} migrations`);

const db = new DatabaseSync(':memory:');
try {
  for (const file of files) {
    try {
      db.exec(await readFile(`${directory}/${file}`, 'utf8'));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`, { cause: error });
    }
  }

  db.exec('PRAGMA foreign_keys = ON');
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
  assert.equal(foreignKeys.length, 0, `Foreign-key violations: ${JSON.stringify(foreignKeys)}`);

  const whCn = db.prepare("SELECT is_active,label FROM app_options WHERE group_key='laptopLocation' AND option_key='wh_cn'").get();
  assert.equal(whCn?.is_active, 1);
  assert.equal(whCn?.label, 'KHO TQ');

  const legacyTech = db.prepare("SELECT count(*) AS count FROM user_profiles WHERE role='TECH'").get();
  assert.equal(legacyTech.count, 0);

  const procurementDrift = db.prepare(`SELECT count(*) AS count FROM laptops
    WHERE source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')
      AND (price_rmb IS NOT purchase_price_rmb OR exchange_rate IS NOT purchase_exchange_rate)`).get();
  assert.equal(procurementDrift.count, 0);

  console.log(`PASS full D1 migration chain: ${files.length}/${files.length}, foreign keys clean, canonical procurement aliases synchronized`);
} finally {
  db.close();
}
