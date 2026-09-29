import assert from 'node:assert/strict';
import { currentSchema } from './current-schema.mjs';
const db = await currentSchema();
try {
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const { account } = await one(`SELECT create_cash_account('{"code":"QA_CASH","name":"QA","currency":"VND","account_type":"CASH","opening_balance":0,"opening_balance_at":"2026-01-01T00:00:00Z"}','QA') account`);
  const post = () => one(`SELECT post_manual_account_transaction($1,'IN',100000,'QA','2026-09-01T00:00:00Z','QA','qa-ledger-retry') entry`, [account.id]);
  const first = await post(); const retry = await post();
  assert.equal(first.entry.id, retry.entry.id);
  assert.equal(Number((await one('SELECT count(*) n FROM account_transactions')).n), 1);
  await assert.rejects(db.query('UPDATE account_transactions SET amount=1 WHERE id=$1', [first.entry.id]));
  await assert.rejects(db.query('DELETE FROM account_transactions WHERE id=$1', [first.entry.id]));
  assert.equal(Number((await one('SELECT amount FROM account_transactions WHERE id=$1', [first.entry.id])).amount), 100000);
  assert.equal((await one("SELECT has_table_privilege('authenticated','account_transactions','SELECT') allowed")).allowed, false);
  await db.query('SELECT get_financial_operations_summary()');
  console.log('PASS financial operations 7/7: retry, append-only, rollback, grants, summary (current schema)');
} finally { await db.close(); }
