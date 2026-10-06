import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { correctPayment } from '../lib/cloudflare/payment-correction.mjs';

test('payment corrections: permissions, ledgers, stale edits, limits and atomic rollback', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('db/d1/migrations/0001_schema.sql', 'utf8'));
  const db = {
    prepare(sql) { return { bind(...args) { return { first: async () => sqlite.prepare(sql).get(...args), sql, args }; } }; },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { for (const {sql,args} of statements) sqlite.prepare(sql).all(...args); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  sqlite.exec(`INSERT INTO orders(id,sale_price,amount_paid,deposit_amount,debt_amount,cod_amount,is_active) VALUES(1,30,1,1,29,29,1);
    INSERT INTO payments(id,order_id,payment_type,amount,payment_date) VALUES(1,1,'deposit',1,'2026-10-05');
    INSERT INTO financial_records(record_type,category,amount,order_id,payment_id,occurred_on) VALUES('income','deposit',1,1,1,'2026-10-05');`);
  const admin = {id:'test',name:'Test',role:'ADMIN'};
  sqlite.exec(`INSERT INTO cash_accounts(id,code,name,account_type,currency,opening_balance_at,created_by) VALUES('account','TEST','Test','CASH','VND','2026-10-01','Test');
    UPDATE payments SET account_id='account' WHERE id=1;
    INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,idempotency_key,created_by)
    VALUES('account','IN',1000000,'VND','PAYMENT','1','CUSTOMER_PAYMENT','2026-10-05','test-payment','Test');`);
  const input = {id:1,amount:2,expectedAmount:1,reason:'Correct entry'};
  await assert.rejects(correctPayment(db,{role:'SALES'},input), {status:403});
  const result = await correctPayment(db,admin,input);
  assert.equal(result.order.amount_paid,2);
  assert.equal(result.order.deposit_amount,2);
  assert.equal(result.order.debt_amount,28);
  assert.equal(result.order.cod_amount,28);
  assert.equal(sqlite.prepare('SELECT amount FROM account_transactions').get().amount,2000000);
  assert.equal(sqlite.prepare('SELECT amount FROM financial_records').get().amount,2);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM activity_logs').get().n,2);
  await assert.rejects(correctPayment(db,admin,input), {status:409});
  await assert.rejects(correctPayment(db,admin,{...input,expectedAmount:2,amount:31}));
  sqlite.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON activity_logs BEGIN SELECT RAISE(ABORT,'test rollback'); END");
  await assert.rejects(correctPayment(db,admin,{...input,expectedAmount:2,amount:3}));
  assert.equal(sqlite.prepare('SELECT amount FROM payments').get().amount,2);
  assert.equal(sqlite.prepare('SELECT amount_paid FROM orders').get().amount_paid,2);
  sqlite.exec('DROP TRIGGER reject_audit');
  sqlite.exec("INSERT INTO account_reconciliations(account_id,recorded_balance,actual_balance,reconciled_at,created_by) VALUES('account',2000000,2000000,'2026-10-06','Test')");
  await assert.rejects(correctPayment(db,admin,{...input,expectedAmount:2,amount:3}), /đối soát/);
  sqlite.close();
});
