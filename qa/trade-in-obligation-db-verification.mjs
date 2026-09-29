import assert from 'node:assert/strict';
import { currentSchema } from './current-schema.mjs';
const db = await currentSchema();
try {
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const order = await one(`INSERT INTO orders(sale_price,amount_paid,trade_in_credit_vnd,order_status,is_active)
    VALUES(30,5,10000000,'new',true) RETURNING id,debt_amount`);
  assert.equal(Number(order.debt_amount), 15);
  const paid = await one('UPDATE orders SET amount_paid=15 WHERE id=$1 RETURNING debt_amount,payment_status', [order.id]);
  assert.equal(Number(paid.debt_amount), 5);
  assert.equal(paid.payment_status, 'deposited');
  await assert.rejects(db.query('UPDATE orders SET amount_paid=25 WHERE id=$1', [order.id]));
  assert.equal(Number((await one('SELECT amount_paid FROM orders WHERE id=$1', [order.id])).amount_paid), 15);
  const closed = await one('UPDATE orders SET amount_paid=20 WHERE id=$1 RETURNING debt_amount,payment_status', [order.id]);
  assert.equal(Number(closed.debt_amount), 0);
  assert.equal(closed.payment_status, 'paid');
  console.log('PASS trade-in obligation 7/7: credit, debt, overflow rollback, fully paid (current schema)');
} finally { await db.close(); }
