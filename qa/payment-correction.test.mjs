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

test('admin can reclassify payments and update deposits, financial category, and audit atomically', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('db/d1/migrations/0001_schema.sql', 'utf8'));
  const db = {
    prepare(sql) { return { bind(...args) { return { first: async () => sqlite.prepare(sql).get(...args), sql, args }; } }; },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { for (const { sql, args } of statements) sqlite.prepare(sql).all(...args); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  sqlite.exec(`INSERT INTO orders(id,sale_price,amount_paid,deposit_amount,debt_amount,cod_amount,is_active)
    VALUES(2,30,6,2,24,24,1);
    INSERT INTO payments(id,order_id,payment_type,amount,payment_date) VALUES
      (10,2,'deposit',2,'2026-10-05'),(11,2,'balance',4,'2026-10-05');
    INSERT INTO financial_records(record_type,category,amount,order_id,payment_id,occurred_on) VALUES
      ('income','deposit',2,2,10,'2026-10-05'),('income','balance',4,2,11,'2026-10-05');
    INSERT INTO cash_accounts(id,code,name,account_type,currency,opening_balance_at,created_by)
      VALUES('account','TEST','Test','CASH','VND','2026-10-01','Test');
    UPDATE payments SET account_id='account' WHERE id=10;
    INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,idempotency_key,created_by)
      VALUES('account','IN',2000000,'VND','PAYMENT','10','CUSTOMER_PAYMENT','2026-10-05','reclass-payment','Test');`);
  const admin = { id: 'test', name: 'Test', role: 'ADMIN' };
  const first = { id: 10, amount: 2, expectedAmount: 2, paymentType: 'balance', expectedPaymentType: 'deposit', reason: 'Sai loại thu tiền' };
  let result = await correctPayment(db, admin, first);
  assert.equal(result.payment.payment_type, 'balance');
  assert.equal(result.order.amount_paid, 6);
  assert.equal(result.order.deposit_amount, 0);
  assert.equal(result.order.debt_amount, 24);
  const ledger = sqlite.prepare('SELECT amount,category FROM financial_records WHERE payment_id=10').get();
  assert.equal(ledger.amount, 2);
  assert.equal(ledger.category, 'balance');
  assert.equal(sqlite.prepare('SELECT amount FROM account_transactions WHERE reference_id=\'10\'').get().amount, 2000000);
  const audit = JSON.parse(sqlite.prepare("SELECT changes FROM activity_logs WHERE entity_type='PAYMENT' ORDER BY id DESC LIMIT 1").get().changes);
  assert.equal(audit.before.payment_type, 'deposit');
  assert.equal(audit.after.payment_type, 'balance');
  assert.equal(audit.reason, first.reason);

  await assert.rejects(correctPayment(db, admin, first), { status: 409 });
  await assert.rejects(correctPayment(db, admin, { ...first, expectedPaymentType: 'balance', paymentType: 'refund' }), /hoàn tiền/);

  result = await correctPayment(db, admin, { id: 11, amount: 5, expectedAmount: 4, paymentType: 'deposit', expectedPaymentType: 'balance', reason: 'Điều chỉnh cọc' });
  assert.equal(result.order.amount_paid, 7);
  assert.equal(result.order.deposit_amount, 5);
  assert.equal(result.order.debt_amount, 23);
  assert.equal(sqlite.prepare('SELECT category,amount FROM financial_records WHERE payment_id=11').get().category, 'deposit');

  sqlite.exec("CREATE TRIGGER reject_audit_type BEFORE INSERT ON activity_logs BEGIN SELECT RAISE(ABORT,'rollback test'); END");
  await assert.rejects(correctPayment(db, admin, { id: 11, amount: 5, expectedAmount: 5, paymentType: 'other', expectedPaymentType: 'deposit', reason: 'Test rollback' }));
  assert.equal(sqlite.prepare('SELECT payment_type FROM payments WHERE id=11').get().payment_type, 'deposit');
  assert.equal(sqlite.prepare('SELECT category FROM financial_records WHERE payment_id=11').get().category, 'deposit');
  assert.equal(sqlite.prepare('SELECT deposit_amount FROM orders WHERE id=2').get().deposit_amount, 5);
  sqlite.close();
});
