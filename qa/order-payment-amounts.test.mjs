import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { remainingOrderAmount, orderBalanceAfterDeposit } from '../lib/orderPaymentAmounts.mjs';
import { recordOrderPaymentWithAccount } from '../lib/cloudflare/payments.mjs';
import { createOrderWithInventory } from '../lib/cloudflare/remaining.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('db/d1/migrations/0001_schema.sql','utf8'));
  const db = {
    prepare(sql) { return { sql,args:[], bind(...args) { return { sql,args, first:async()=>sqlite.prepare(sql).get(...args),run:async()=>sqlite.prepare(sql).run(...args) }; } }; },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results=statements.map(({sql,args})=>({results:sqlite.prepare(sql).all(...args)})); sqlite.exec('COMMIT'); return results; }
      catch(error) {sqlite.exec('ROLLBACK');throw error;}
    },
  };
  return {sqlite,db};
}

test('post-deposit amount stays fixed when balance payments reduce debt',()=>{
  for (const amountPaid of [1,18,20]) {
    const order={salePrice:20,depositAmount:1,amountPaid};
    assert.equal(orderBalanceAfterDeposit(order),19);
    assert.equal(remainingOrderAmount(order),20-amountPaid);
  }
  assert.equal(orderBalanceAfterDeposit({salePrice:20,depositAmount:3}),17);
});

test('optional salesperson migration preserves assigned sales and normalizes blanks',()=>{
  const {sqlite}=fixture();
  try {
    sqlite.exec("INSERT INTO orders(sale_online,sale_offline) VALUES ('','  '),('Assigned sale',NULL)");
    sqlite.exec(readFileSync('db/d1/migrations/0012_optional_order_sales.sql','utf8'));
    const rows=sqlite.prepare('SELECT sale_online,sale_offline FROM orders ORDER BY id').all();
    assert.equal(rows[0].sale_online,null);
    assert.equal(rows[0].sale_offline,null);
    assert.equal(rows[1].sale_online,'Assigned sale');
    assert.equal(rows[1].sale_offline,null);
  } finally {sqlite.close();}
});

test('new order, repeated deposits, balance, COD and replay share the same remaining amount',async()=>{
  const {sqlite,db}=fixture();
  try {
    sqlite.exec("INSERT INTO cash_accounts(id,code,name,account_type,currency,opening_balance_at,created_by) VALUES('cash','TEST','Test','CASH','VND','2026-10-01','Test')");
    const {order}=await createOrderWithInventory(db,{p_order:{sale_price:30,cod_amount:99,sale_online:'',sale_offline:'  '},p_recorded_by:'Test'});
    assert.equal(order.sale_online,null);
    assert.equal(order.sale_offline,null);
    assert.equal(order.cod_amount,30);
    assert.equal(order.deposit_amount,0);
    const steps=[['deposit',1,1,29],['deposit',2,3,27],['balance',10,3,17],['cod',17,3,0]];
    for (const [index,[type,amount,deposit,remaining]] of steps.entries()) {
      const payload={p_order_id:order.id,p_amount:amount,p_payment_type:type,p_payment_date:'2026-10-06',p_account_id:'cash',p_recorded_by:'Test',p_idempotency_key:`payment-test-${index}`};
      await recordOrderPaymentWithAccount(db,payload);
      await recordOrderPaymentWithAccount(db,payload);
      const current=sqlite.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
      assert.equal(current.deposit_amount,deposit);
      assert.equal(current.cod_amount,remaining);
      assert.equal(current.debt_amount,remaining);
      assert.equal(remainingOrderAmount({salePrice:current.sale_price,amountPaid:current.amount_paid}),remaining);
    }
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM payments').get().n,4);
    assert.equal(sqlite.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
  } finally {sqlite.close();}
});

test('migration repairs old summaries without deleting orders or payments',()=>{
  const {sqlite}=fixture();
  try {
    sqlite.exec("INSERT INTO orders(id,sale_price,cod_amount) VALUES(1,30,30),(2,20,0); INSERT INTO payments(order_id,payment_type,amount,payment_date) VALUES(1,'deposit',1,'2026-10-01'),(1,'deposit',2,'2026-10-02'),(1,'balance',27,'2026-10-03')");
    sqlite.exec(readFileSync('db/d1/migrations/0011_order_payment_totals.sql','utf8'));
    const orders=sqlite.prepare('SELECT deposit_amount,amount_paid,cod_amount FROM orders ORDER BY id').all();
    assert.deepEqual(orders.map(row=>({...row})),[{deposit_amount:3,amount_paid:30,cod_amount:0},{deposit_amount:0,amount_paid:0,cod_amount:20}]);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM payments').get().n,3);
  } finally {sqlite.close();}
});
