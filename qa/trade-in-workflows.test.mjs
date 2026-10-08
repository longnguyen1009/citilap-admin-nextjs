import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiveCustomerLaptop } from '../lib/cloudflare/trade-in-workflows.mjs';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('db/d1/migrations').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`db/d1/migrations/${file}`, 'utf8'));
  sql.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO customers(id,name,phone,address) VALUES(9001,'Khách cũ','0912345678','Hà Nội');
    INSERT INTO laptops(id,name,serial,category,status,import_price_vnd,month_key,qc_details) VALUES
      (9001,'Máy cũ','SERIAL-OLD','loq','available',10,'01/2026','{"screen":"PASS"}'),
      (9002,'Máy mới','SERIAL-NEW','loq','available',20,'01/2026','{}');
    INSERT INTO orders(id,laptop_id,customer_id,customer_info,customer_address,sale_price,amount_paid,debt_amount,order_status,payment_status,laptop_locked,month_key)
      VALUES(9001,9001,9001,'Khách cũ - 0912345678','Hà Nội',15,15,0,'done','paid',1,'01/2026');
    INSERT INTO cash_accounts(id,code,name,account_type,currency,opening_balance_at,created_by)
      VALUES('test-cash','TEST-CASH','Quỹ kiểm thử','CASH','VND','2020-01-01','Test');`);
  const db = {
    prepare(query) { const statement = args => ({ query, args, first: async () => sql.prepare(query).get(...args), all: async () => ({ results: sql.prepare(query).all(...args) }) }); return { ...statement([]), bind: (...args) => statement(args) }; },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = statements.map(({ query, args }) => ({ results: sql.prepare(query).all(...args) })); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { sql, db, get: (table, id) => sql.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) };
}
const admin = { role: 'ADMIN', name: 'Test admin' };
const walk = { workflow: 'WALK_IN', sellerName: 'Khách lẻ', name: 'LOQ 15', category: 'loq', serial: 'WALK-1', idempotencyKey: 'walk-in-test-1' };
const buy = { workflow: 'BUYBACK', orderId: 9001, sellerName: 'Khách cũ', sellerPhone: '0912345678', idempotencyKey: 'buy-back-test-1' };
const exchange = { workflow: 'EXCHANGE', orderId: 9001, laptopId: 9002, agreedVnd: 12000000, saleVnd: 25000000, accountId: 'test-cash', idempotencyKey: 'exchange-test-1' };

test('walk-in receives current-month waiting-QC stock, source and seller; unknown cost stays null', async () => {
  const { sql, db, get } = fixture();
  try {
    const row = await receiveCustomerLaptop(db, admin, walk), laptop = get('laptops', row.inventory_laptop_id);
    assert.equal(laptop.status, 'waiting_qc'); assert.equal(laptop.seller, 'Thu lại khách lẻ');
    assert.equal(laptop.source_type, 'TRADE_IN'); assert.equal(laptop.import_price_vnd, null);
    assert.equal(laptop.month_key, sql.prepare("SELECT strftime('%m/%Y','now','+7 hours') AS m").get().m);
    assert.equal(row.seller_name, walk.sellerName);
    assert.equal((await receiveCustomerLaptop(db, admin, walk)).id, row.id);
    assert.equal(sql.prepare("SELECT count(*) n FROM stock_movements WHERE reference_type='TRADE_IN'").get().n, 1);
    await assert.rejects(receiveCustomerLaptop(db, admin, { ...walk, name: 'changed' }), { status: 409 });
    await assert.rejects(receiveCustomerLaptop(db, admin, { ...walk, idempotencyKey: 'new-serial-conflict' }), { status: 409 });
  } finally { sql.close(); }
});

test('buyback creates new acquisition with same serial while preserving old order, laptop and QC history', async () => {
  const { sql, db, get } = fixture();
  try {
    const before = get('orders', 9001);
    const row = await receiveCustomerLaptop(db, admin, buy), fresh = get('laptops', row.inventory_laptop_id);
    assert.notEqual(fresh.id, 9001); assert.equal(fresh.previous_laptop_id, 9001);
    assert.equal(fresh.serial, 'SERIAL-OLD'); assert.equal(fresh.name, 'Máy cũ'); assert.equal(fresh.status, 'waiting_qc');
    assert.equal(fresh.qc_details, '{}'); assert.equal(get('laptops', 9001).qc_details, '{"screen":"PASS"}');
    assert.equal(get('laptops', 9001).serial, 'SERIAL-OLD'); assert.equal(get('laptops', 9001).acquisition_closed, 1);
    assert.deepEqual(get('orders', 9001), before);
    assert.throws(() => sql.exec("UPDATE laptops SET status='available' WHERE id=9001"));
    assert.throws(() => sql.exec("INSERT INTO orders(laptop_id,sale_price) VALUES(9001,20)"));
    assert.throws(() => sql.exec("UPDATE orders SET note='change historical order' WHERE id=9001"));
    await assert.rejects(receiveCustomerLaptop(db, admin, { ...buy, idempotencyKey: 'buy-back-again' }));
  } finally { sql.close(); }
});

test('exchange atomically cancels old order, restores laptop and copies customer; difference only enters all three ledgers', async () => {
  const { sql, db, get } = fixture();
  try {
    const row = await receiveCustomerLaptop(db, admin, exchange), old = get('orders', 9001), fresh = get('orders', row.new_order_id);
    assert.equal(old.order_status, 'cancelled'); assert.equal(old.cancel_reason, 'ĐỔI HÀNG'); assert.equal(old.laptop_locked, 0);
    assert.equal(old.amount_paid, 15); assert.equal(fresh.customer_id, old.customer_id); assert.equal(fresh.customer_info, old.customer_info); assert.equal(fresh.customer_address, old.customer_address);
    assert.equal(fresh.order_status, 'new'); assert.equal(fresh.sale_price, 25); assert.equal(fresh.trade_in_credit_vnd, 12000000);
    assert.equal(fresh.amount_paid, 13); assert.equal(fresh.debt_amount, 0); assert.equal(fresh.payment_status, 'paid');
    assert.equal(get('laptops', 9001).status, 'available'); assert.equal(get('laptops', 9002).status, 'reserved');
    assert.equal(get('laptops', 9001).month_key, fresh.month_key);
    assert.equal(sql.prepare('SELECT amount FROM payments WHERE order_id>9001').get().amount, 13);
    assert.equal(sql.prepare('SELECT amount FROM financial_records WHERE order_id>9001').get().amount, 13);
    assert.equal(sql.prepare("SELECT amount FROM account_transactions WHERE account_id='test-cash'").get().amount, 13000000);
    assert.equal((await receiveCustomerLaptop(db, admin, exchange)).id, row.id);
    assert.equal(sql.prepare('SELECT count(*) n FROM payments WHERE order_id>9001').get().n, 1);
    assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { sql.close(); }
});

test('equal-value exchange needs no cash account and creates no synthetic cash receipt', async () => {
  const { sql, db, get } = fixture();
  try {
    const row = await receiveCustomerLaptop(db, admin, { ...exchange, saleVnd: 12000000, accountId: '' });
    assert.equal(get('orders', row.new_order_id).amount_paid, 0);
    assert.equal(get('orders', row.new_order_id).payment_status, 'paid');
    assert.equal(sql.prepare('SELECT count(*) n FROM payments WHERE order_id>9001').get().n, 0);
  } finally { sql.close(); }
});

test('failed cash validation and late audit failure roll back every stock, order and money change', async () => {
  const { sql, db, get } = fixture();
  try {
    const tables = ['trade_ins', 'payments', 'financial_records', 'account_transactions'];
    const counts = tables.map(table => sql.prepare(`SELECT count(*) n FROM ${table}`).get().n);
    await assert.rejects(receiveCustomerLaptop(db, admin, { ...exchange, accountId: 'missing' }));
    assert.equal(get('orders', 9001).order_status, 'done');
    sql.exec("CREATE TRIGGER reject_trade_audit BEFORE INSERT ON activity_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    await assert.rejects(receiveCustomerLaptop(db, admin, exchange));
    assert.equal(get('orders', 9001).order_status, 'done'); assert.equal(get('laptops', 9001).status, 'sold'); assert.equal(get('laptops', 9002).status, 'available');
    tables.forEach((table,index) => assert.equal(sql.prepare(`SELECT count(*) n FROM ${table}`).get().n, counts[index]));
  } finally { sql.close(); }
});

test('permissions, old debt, missing phone, unavailable replacement and negative difference fail before writes', async () => {
  const { sql, db } = fixture();
  try {
    await assert.rejects(receiveCustomerLaptop(db, { role: 'SALES' }, walk), { status: 403 });
    await assert.rejects(receiveCustomerLaptop(db, admin, { ...buy, sellerPhone: '' }));
    await assert.rejects(receiveCustomerLaptop(db, admin, { ...exchange, saleVnd: 10000000 }));
    sql.exec('UPDATE orders SET debt_amount=1 WHERE id=9001');
    await assert.rejects(receiveCustomerLaptop(db, admin, exchange));
    sql.exec("UPDATE orders SET debt_amount=0 WHERE id=9001; UPDATE laptops SET status='reserved' WHERE id=9002");
    await assert.rejects(receiveCustomerLaptop(db, admin, exchange));
    assert.equal(sql.prepare('SELECT count(*) n FROM trade_ins').get().n, 0);
  } finally { sql.close(); }
});
