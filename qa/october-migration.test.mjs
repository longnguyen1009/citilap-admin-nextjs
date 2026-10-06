import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {buildReplacement,buildSeptemberOrderLaptopCorrection} from '../scripts/build-october-replacement.mjs';
import {normalize} from '../scripts/normalize-october-sheet.mjs';
const dir=new URL('../db/d1/migrations/',import.meta.url);
function fixture() {
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(dir).filter(f=>/^000[1-9].*sql$/.test(f)).sort()) db.exec(readFileSync(new URL(file,dir),'utf8'));
 const data=normalize();
 for(const code of new Set([...data.october_laptops,...data.september_supplement].map(r=>r.supplier_code))) {
  if(data.new_suppliers.some(r=>r.code===code)) continue;
  db.prepare("INSERT OR IGNORE INTO suppliers(code,name,created_by) VALUES(?,?,'TEST')").run(code,code);
 }
 db.exec("INSERT INTO cash_accounts(id,code,name,account_type,currency,opening_balance_at,created_by) VALUES('04fbb0da-771b-4821-bcf3-053f03956043','TEST_VCB','VCB TOI','BANK','VND','2026-10-01','TEST')");
 return db;
}
test('replacement loads 190 machines and 60 orders with valid ledgers',()=>{
 const db=fixture();
 db.exec('BEGIN'); db.exec(buildReplacement()); db.exec('COMMIT');
 assert.equal(readFileSync(new URL('0016_move_september_order_laptops_to_october.sql',dir),'utf8').trim(),buildSeptemberOrderLaptopCorrection().trim());
 db.exec(buildSeptemberOrderLaptopCorrection());
 db.exec(readFileSync(new URL('0017_sync_laptop_tracking_codes.sql',dir),'utf8'));
 db.exec(readFileSync(new URL('0018_single_laptop_tracking_code.sql',dir),'utf8'));
 const count=table=>db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
 assert.equal(count('laptops'),190); assert.equal(count('orders'),60);
 assert.equal(db.prepare("SELECT count(*) n FROM laptops WHERE month_key='09/2026'").get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM laptops WHERE import_date='2026-09-01' AND warehouse_date='2026-10-01' AND month_key='10/2026'").get().n,25);
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.equal(db.prepare('SELECT count(*) n FROM orders o WHERE abs(amount_paid-coalesce((SELECT sum(amount) FROM payments WHERE order_id=o.id),0))>0.000001').get().n,0);
 assert.equal(db.prepare('SELECT count(*) n FROM orders WHERE abs(cod_amount-sale_price+deposit_amount)>0.000001').get().n,0);
 assert.equal(db.prepare('SELECT amount_paid FROM orders WHERE id=14').get().amount_paid,31.5);
 assert.equal(db.prepare("SELECT created_date FROM orders WHERE id=267").get().created_date,'2026-09-30');
 assert.deepEqual(db.prepare("SELECT status,count(*) n FROM laptops WHERE month_key='10/2026' GROUP BY status ORDER BY status").all().map(r=>({...r})),[
  {status:'available',n:123},{status:'ignored',n:1},{status:'in_transit',n:29},{status:'reserved',n:3},{status:'sold',n:34},
 ]);
 assert.equal(db.prepare("SELECT status FROM laptops WHERE id=1463").get().status,'available');
 assert.equal(db.prepare("SELECT status FROM laptops WHERE id=1704").get().status,'ignored');
 assert.equal(db.prepare("SELECT status FROM laptops WHERE id=1966").get().status,'in_transit');
 assert.equal(db.prepare("SELECT count(*) n FROM qc_inspections WHERE status='COMPLETED' AND result='PASS'").get().n,123);
 assert.ok(db.prepare("SELECT count(*) n FROM purchase_batches WHERE purchase_date='2026-09-01'").get().n>0);
 assert.equal(db.prepare("SELECT note FROM orders WHERE id=266").get().note,'hẹn 1/9 cọc thêm 500k giữ máy 2 tuần\n-> Hnao qua khách báo, xem con khác cx đc');
 assert.equal(db.prepare("SELECT note FROM orders WHERE id=8").get().note,'Đổi từ LO1509 Dell trạm sang Legion 5 2022');
 assert.equal(db.prepare("SELECT count(*) n FROM laptops WHERE trim(coalesce(tracking_code_cn,''))<>''").get().n,172);
 assert.equal(db.prepare("SELECT count(*) n FROM pragma_table_info('laptops') WHERE name='tracking_code'").get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM pragma_table_info('laptops') WHERE name='tracking_code_cn'").get().n,1);
 assert.equal(db.prepare("SELECT count(*) n FROM pragma_table_info('orders') WHERE name='tracking_code'").get().n,1);
 assert.equal(count('account_transactions'),count('payments'));
 assert.equal(db.prepare('SELECT sum(amount) total FROM account_transactions').get().total,Math.round(db.prepare('SELECT sum(amount)*1000000 total FROM payments').get().total));
 db.close();
});
test('missing existing supplier aborts before operational deletion',()=>{
 const db=fixture(); db.exec("DELETE FROM suppliers WHERE code='QUEANH'; INSERT INTO customers(name) VALUES('preserved'); BEGIN");
 assert.throws(()=>db.exec(buildReplacement())); db.exec('ROLLBACK');
 assert.equal(db.prepare('SELECT name FROM customers').get().name,'preserved'); db.close();
});
