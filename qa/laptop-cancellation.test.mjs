import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ignoreIncomingLaptop, updateLaptopProcurement } from '../lib/cloudflare/procurement.mjs';
import { createOrderWithInventory, updateOrderWithInventory } from '../lib/cloudflare/remaining.mjs';
import { D1ReadQuery } from '../lib/cloudflare/query.mjs';
function adapter(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      const query = {
        bind(...params) { values = params; return query; },
        async first() { return statement.get(...values) || null; },
        async run() { return { success: true, meta: statement.run(...values) }; },
        execute() { return { success: true, results: statement.all(...values) }; },
      };
      return query;
    },
    async batch(queries) {
      sqlite.exec('BEGIN');
      try { const results = queries.map(query => query.execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

function fixture(status='available') {
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync('db/d1/migrations/0001_schema.sql','utf8'));
 sqlite.prepare('INSERT INTO laptops(id,name,status,is_active,month_key) VALUES(1,?,?,1,?)').run('Cancellation fixture',status,'2026-10');
 return {sqlite,db:adapter(sqlite)};
}
const cancel=db=>ignoreIncomingLaptop(db,{p_laptop_id:1,p_reason:'User confirmed cancellation',p_actor:'Test Admin'});
for(const status of ['in_transit','waiting_qc','available','repair'])test('cancel '+status+' persists status, inactive flag and audit',async()=>{
 const {sqlite,db}=fixture(status);try{
 const row=await cancel(db);assert.equal(row.status,'ignored');assert.equal(row.is_active,false);
 const persisted=sqlite.prepare('SELECT * FROM laptops WHERE id=1').get();assert.equal(persisted.status,'ignored');assert.ok(persisted.ignored_at);assert.equal(persisted.ignored_by,'Test Admin');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM activity_logs').get().n,1);
 await assert.rejects(cancel(db));assert.equal(sqlite.prepare('SELECT count(*) n FROM activity_logs').get().n,1);
 }finally{sqlite.close();}
});
for(const status of ['sold','reserved','supplier_return','ignored'])test('reject cancellation of '+status,async()=>{
 const {sqlite,db}=fixture(status);try{await assert.rejects(cancel(db));assert.equal(sqlite.prepare('SELECT status FROM laptops').get().status,status);}finally{sqlite.close();}
});
for(const field of ['laptop_id','requested_laptop_id'])test('active order '+field+' prevents cancellation atomically',async()=>{
 const {sqlite,db}=fixture();try{
 sqlite.exec("INSERT INTO orders("+field+",order_status,is_active,sale_price) VALUES(1,'pending',1,20)");
 await assert.rejects(cancel(db));assert.equal(sqlite.prepare('SELECT status FROM laptops').get().status,'available');
 }finally{sqlite.close();}
});
test('cancelled machine cannot be edited or ordered and stays visible on reload',async()=>{
 const {sqlite,db}=fixture();try{
 await cancel(db);
 await assert.rejects(updateLaptopProcurement(db,{p_laptop_id:1,p_data:{name:'Changed'},p_actor:'Admin'}));
 for(const field of ['laptop_id','requested_laptop_id'])await assert.rejects(createOrderWithInventory(db,{p_order:{[field]:1,sale_price:20,order_status:'pending'},p_recorded_by:'Admin'}));
 sqlite.exec("INSERT INTO orders(id,sale_price,order_status,is_active) VALUES(1,20,'pending',1)");
 await assert.rejects(updateOrderWithInventory(db,{p_order:{id:1,laptop_id:1},p_recorded_by:'Admin'}));
 sqlite.exec("INSERT INTO laptops(id,name,status,is_active,month_key) VALUES(2,'Hidden inactive','available',0,'2026-10'),(3,'Other month','available',1,'2026-09')");
 const result=await new D1ReadQuery(db,'laptops').select('*',{count:'exact'}).eq('month_key','2026-10').orEquals({is_active:true,status:'ignored'});
 assert.equal(result.error,null);assert.equal(result.count,1);assert.equal(result.data[0].id,1);assert.equal(result.data[0].status,'ignored');
 assert.equal(sqlite.prepare('SELECT name FROM laptops WHERE id=1').get().name,'Cancellation fixture');
 }finally{sqlite.close();}
});
