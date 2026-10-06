import {readFileSync} from 'node:fs';
import {normalize} from './normalize-october-sheet.mjs';
const q = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const insert = (table, row) => `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(q).join(',')});`;
const qcPassDetails=JSON.stringify(Object.fromEntries(['model','cpu','gpu','ram','ssd','mainboard','screen','keyboard','keyboard_backlight','touchpad','camera','microphone','speaker','wifi','bluetooth','usb','usb_c','hdmi','lan','battery','ssd_health','fan','cooling','cpu_stress','gpu_stress','charger','exterior'].map(key=>[key,{result:'PASS',note:'QC PASS theo dữ liệu xác nhận'}])));
const statusSource='C:/Users/Admin/.codex/attachments/d0423bec-2e9c-45fe-b1ca-2df0a1bd9ba6/pasted-text.txt';
const statusMap={'Sẵn hàng':'available','Chưa về hàng':'in_transit','Đã bán':'sold','ĐÃ cọc':'reserved','Hủy':'ignored'};
export const explicitLaptopStatuses = new Map(readFileSync(statusSource,'utf8').replace(/\r/g,'').split('\n').slice(1)
 .map(line=>line.split('\t').map(value=>value.trim())).filter(([id,label])=>/^\d+$/.test(id)&&statusMap[label])
 .map(([id,label])=>[id,statusMap[label]]));
export function buildStatusCorrection() {
 const groups={};
 for(const [id,status] of explicitLaptopStatuses) (groups[status]??=[]).push(id);
 const cases=Object.entries(groups).map(([status,ids])=>`WHEN id IN (${ids.join(',')}) THEN '${status}'`).join(' ');
 return `-- Correct laptop states from the user-confirmed October list after 0013.
UPDATE laptops SET status=CASE ${cases} ELSE status END WHERE month_key='10/2026' AND id IN (${[...explicitLaptopStatuses.keys()].join(',')});
CREATE TABLE _oct_status_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _oct_status_guard SELECT CASE WHEN
 (SELECT count(*) FROM laptops WHERE month_key='10/2026')=165 AND
 (SELECT count(*) FROM laptops WHERE month_key='10/2026' AND status='available')=123 AND
 (SELECT count(*) FROM laptops WHERE month_key='10/2026' AND status='in_transit')=29 AND
 (SELECT count(*) FROM laptops WHERE month_key='10/2026' AND status='sold')=9 AND
 (SELECT count(*) FROM laptops WHERE month_key='10/2026' AND status='reserved')=3 AND
 (SELECT count(*) FROM laptops WHERE month_key='10/2026' AND status='ignored')=1
 THEN 1 ELSE 0 END;
DROP TABLE _oct_status_guard;
`;
}
export function buildSeptemberOrderLaptopCorrection() {
 const ids=normalize().september_supplement.map(row=>row.id);
 return `-- Move September-purchased laptops used by October orders into the October operating cohort.
UPDATE laptops SET import_date='2026-09-01',warehouse_date='2026-10-01',month_key='10/2026' WHERE id IN (${ids.join(',')});
UPDATE purchase_batches SET purchase_date='2026-09-01',notes='Mua trong tháng 9; nhập kho và chuyển cohort vận hành tháng 10' WHERE batch_code LIKE 'GS2-2026-09-%';
CREATE TABLE _september_order_laptop_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _september_order_laptop_guard SELECT CASE WHEN
 (SELECT count(*) FROM laptops WHERE id IN (${ids.join(',')}) AND import_date='2026-09-01' AND warehouse_date='2026-10-01' AND month_key='10/2026')=${ids.length}
 AND NOT EXISTS(SELECT 1 FROM orders o LEFT JOIN laptops l ON l.id=COALESCE(o.laptop_id,o.requested_laptop_id) WHERE COALESCE(o.laptop_id,o.requested_laptop_id) IS NOT NULL AND l.id IS NULL)
 THEN 1 ELSE 0 END;
DROP TABLE _september_order_laptop_guard;
`;
}
export function buildReplacement() {
 const d=normalize(), machines=[...d.october_laptops,...d.september_supplement];
 if(d.issues.length) throw Error('Unresolved normalization issues');
 const sql=['-- DESTRUCTIVE: replaces operational data. Backup remote before applying.',
 '-- Opening payment balances are NOT reconciled bank transactions. Original source retained.',
 'PRAGMA defer_foreign_keys=ON;',readFileSync(new URL('../db/d1/imports/2026-10-review/approved-suppliers.sql',import.meta.url),'utf8')];
 sql.push('CREATE TABLE _oct_supplier_guard(code TEXT PRIMARY KEY, supplier_id TEXT NOT NULL);');
sql.push(`INSERT INTO cash_accounts(id,code,name,account_type,currency,opening_balance,opening_balance_at,is_active,created_by)
SELECT '04fbb0da-771b-4821-bcf3-053f03956043','VCB_TOI','VCB TOI','BANK','VND',0,'2026-10-01',1,'SYSTEM_MIGRATION'
WHERE NOT EXISTS (SELECT 1 FROM cash_accounts WHERE name='VCB TOI');
CREATE TABLE _oct_account_guard(id TEXT NOT NULL);
 INSERT INTO _oct_account_guard
 SELECT (SELECT id FROM cash_accounts WHERE name='VCB TOI' ORDER BY CASE WHEN id='04fbb0da-771b-4821-bcf3-053f03956043' THEN 0 ELSE 1 END, id LIMIT 1);`);
 for(const code of new Set(machines.map(r=>r.supplier_code))) sql.push(`INSERT INTO _oct_supplier_guard SELECT ${q(code)},(SELECT id FROM suppliers WHERE code=${q(code)});`);
 const old=readFileSync(new URL('../db/d1/migrations/0010_google_sheet_inventory_seed.sql',import.meta.url),'utf8');
 sql.push(...old.match(/^DELETE FROM .*;$/gm));
 sql.push('CREATE TABLE IF NOT EXISTS sheet_import_sources(source_key TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)));');
 sql.push('DELETE FROM sheet_import_sources;');
 for(const o of d.orders) sql.push(`INSERT OR REPLACE INTO sheet_import_sources VALUES(${q(o.key)},${q(JSON.stringify(o))});`);
 for(const m of machines) sql.push(`INSERT OR REPLACE INTO sheet_import_sources VALUES(${q('laptop:'+m.id)},${q(JSON.stringify(m))});`);
 const batches=new Map();
 for(const m of machines) {
  const key=m.month+'-'+m.supplier_code;
  if(!batches.has(key)) batches.set(key,[]);
  batches.get(key).push(m);
 }
 for(const [key,rows] of batches) {
  const r=rows[0], rate=rows.find(x=>x.exchange_rate>0)?.exchange_rate || (rows.every(x=>!x.purchase_cny)?1:null);
  if(!rate) throw Error('Missing exchange rate '+key);
  sql.push(`INSERT INTO purchase_batches(batch_code,supplier_id,purchase_date,exchange_rate,subtotal_rmb,domestic_shipping_rmb,status,notes,created_by,updated_by,procurement_flow) SELECT ${q('GS2-'+key)},supplier_id,${q(r.month+'-01')},${rate},${rows.reduce((s,x)=>s+(x.purchase_cny||0),0)},${rows.reduce((s,x)=>s+(x.shipping_cny||0),0)},'CONFIRMED','Ngày mua giữ theo sheet nguồn; máy được đơn tháng 10 chọn chuyển cohort khi nhập kho','SYSTEM_MIGRATION','SYSTEM_MIGRATION','DIRECT' FROM _oct_supplier_guard WHERE code=${q(r.supplier_code)};`);
 }
 // Reuse canonical category keys for existing IDs; new IDs retain source category.
 const categories=new Map([...old.matchAll(/^  \((\d+), '(?:[^']|'')*', '(?:[^']|'')*', '([^']+)'/gm)].map(m=>[m[1],m[2]]));
 for(const m of machines) {
  const status=explicitLaptopStatuses.get(m.id) ?? (/HỦY|HUỶ/.test(m.status_raw)?'ignored':/Đã Bán/i.test(m.status_raw)?'sold':'waiting_qc');
  const row={id:Number(m.id),serial:m.serial,name:m.configuration,category:categories.get(m.id)||m.category,
   import_date:m.month+'-01',warehouse_date:m.source==='september'?'2026-10-01':null,month_key:'10/2026',status,location:'other',
   condition_note:m.condition_notes,seller:m.supplier_raw,price_rmb:m.purchase_cny,shipping_rmb:m.shipping_cny,
   exchange_rate:m.exchange_rate,import_price_vnd:m.import_price_million_vnd,
   source_type:'SUPPLIER_PURCHASE',purchase_price_rmb:m.purchase_cny||0,purchase_exchange_rate:m.exchange_rate||1,
   tracking_code_cn:m.tracking_raw,customer_note:'Nhập snapshot; chưa xác nhận ngày nhận/QC. '+m.status_raw,created_by:'SYSTEM_MIGRATION'};
  sql.push(insert('laptops',row).replace(') VALUES',',purchase_batch_id) VALUES').replace(/\);$/,`,(SELECT id FROM purchase_batches WHERE batch_code=${q('GS2-'+m.month+'-'+m.supplier_code)}));`));
 }
 const customerPhones=new Map();
 for(const o of d.orders) {
  const id=Number(o.external_number), raw=o.raw, cancelled=/HUỶ|HỦY/.test(o.status_raw);
  const status=cancelled?'cancelled':o.status_raw==='HOÀN THÀNH'?'done':/GIAO|COD/.test(o.status_raw)?'shipping':o.deposit_million_vnd>0?'deposited':'new';
  const dep=o.deposit_million_vnd, paid=o.payment_status_raw==='HOÀN THÀNH'?o.sale_million_vnd:dep;
  const method={'Nhờ HCM giao dịch':'hcm_agent','Qua trực tiếp shop':'direct_store','Ship trực tiếp khách':'direct_ship','Xe Ghép':'shared_car'}[raw['GỬI HÀNG']]||null;
  const phone=o.customer_raw.match(/(?:\+84|0)[\d .-]{8,15}/)?.[0]?.replace(/[^\d+]/g,'')||null;
  const customerId=phone&&customerPhones.has(phone)?customerPhones.get(phone):id;
  if(customerId===id) sql.push(insert('customers',{id,name:o.customer_raw||'Khách chưa có tên trong sheet',phone,address:o.address_raw}));
  if(phone) customerPhones.set(phone,customerId);
  sql.push(insert('orders',{id,created_date:o.created_date,month_key:'10/2026',order_type:'retail',
   order_status:status,payment_status:paid===o.sale_million_vnd?'paid':/COD/.test(o.payment_status_raw)?'cod':dep>0?'deposited':'unpaid',
   laptop_id:cancelled?null:Number(o.laptop_id)||null,requested_laptop_id:Number(o.laptop_id)||null,requested_configuration:o.configuration,
   sale_price:o.sale_million_vnd,deposit_amount:dep,amount_paid:paid,debt_amount:o.sale_million_vnd-paid,cod_amount:o.sale_million_vnd-dep,
   customer_id:customerId,customer_info:o.customer_raw,customer_address:o.address_raw,shipping_method:method,
   delivery_status:status==='shipping'?'shipped':status==='done'?(method==='direct_store'?'at_store':'delivered'):'preparing',
   setup_note:raw['CÀI ĐẶT'],warranty:raw['BH'],tracking_code:raw['MÃ VẬN ĐƠN'],
   note:o.confirmed_notes.join('\n'),cost_snapshot_status:'LEGACY'}));
  sql.push(`UPDATE orders SET sale_online=(SELECT option_key FROM app_options WHERE group_key='saleOnline' AND label=${q(raw['SALE ONL'])} LIMIT 1),sale_offline=(SELECT option_key FROM app_options WHERE group_key='saleOffline' AND label=${q(raw['SALE OFF'])} LIMIT 1) WHERE id=${id};`);
  const gifts=raw['QUÀ TẶNG']||'';
  const skus=[/balo/i.test(gifts)?'PK-BAG':null,/chuột/i.test(gifts)?'PK-MOUSE':null,/di chuột|lót chuột/i.test(gifts)?'PK-PAD':null].filter(Boolean);
  if(skus.length) sql.push(`UPDATE orders SET gift_preset='custom',gift_accessory_ids=(SELECT json_group_array(id) FROM accessories WHERE sku IN (${skus.map(q).join(',')})) WHERE id=${id};`);
  if(dep>0) sql.push(insert('payments',{order_id:id,payment_type:'deposit',amount:dep,payment_method:'sheet_opening',payment_date:'2026-10-06',note:'Số dư cọc tại ngày nhập snapshot; ngày cọc gốc: '+raw['CỌC'],recorded_by:'SYSTEM_MIGRATION',idempotency_key:'gs2-deposit-'+id}));
  if(paid>dep) sql.push(insert('payments',{order_id:id,payment_type:'other',amount:paid-dep,payment_method:'sheet_opening',payment_date:'2026-10-06',note:'Số dư thanh toán theo trạng thái hoàn thành, KHÔNG phải tiền ngân hàng đã đối soát; xem nguồn '+o.key+'; '+raw['Phương thức TT'],recorded_by:'SYSTEM_MIGRATION',idempotency_key:'gs2-opening-'+id}));
 }
 sql.push(`UPDATE laptops SET status=CASE WHEN EXISTS(SELECT 1 FROM orders WHERE laptop_id=laptops.id AND order_status IN ('shipping','done')) THEN 'sold' ELSE 'reserved' END WHERE id NOT IN (${[...explicitLaptopStatuses.keys()].join(',')}) AND EXISTS(SELECT 1 FROM orders WHERE laptop_id=laptops.id);`);
 sql.push(`UPDATE laptops SET warehouse_date='2026-10-01',received_at='2026-10-01T00:00:00.000Z',location='store',charger_status='with_charger',available_for_sale_at='2026-10-01T00:00:00.000Z',qc_details=${q(qcPassDetails)},screen_status='ok',camera_mic_status='ok',mainboard_status='ok' WHERE status='available';
 INSERT INTO qc_inspections(id,inspection_code,laptop_id,status,result,started_by,started_at,completed_by,completed_at,overall_notes,mainboard_status,charger_status,cosmetic_grade,idempotency_key,completion_idempotency_key,disposition,detail_snapshot)
 SELECT 'gs3-qc-'||id,'QC-GS3-'||printf('%04d',id),id,'COMPLETED','PASS','SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','QC PASS tất cả theo dữ liệu xác nhận','ORIGINAL','ORIGINAL','A','gs3-qc-start-'||id,'gs3-qc-pass-'||id,'PASS',${q(qcPassDetails)} FROM laptops WHERE status='available';
 INSERT INTO stock_movements(laptop_id,movement_type,from_location,to_location,note,performed_by,created_at,reference_type,reference_id)
 SELECT id,'RECEIVED','IN_TRANSIT','QC','Nhận theo lô mua 01/10/2026','SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','PURCHASE_BATCH',cast(purchase_batch_id AS TEXT) FROM laptops WHERE status='available';
 INSERT INTO stock_movements(laptop_id,movement_type,from_location,to_location,note,performed_by,created_at,reference_type,reference_id)
 SELECT l.id,'QC_PASS','QC','store','QC PASS tất cả','SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','QC_INSPECTION',q.id FROM laptops l JOIN qc_inspections q ON q.laptop_id=l.id;
 UPDATE purchase_batches SET status=CASE
  WHEN NOT EXISTS(SELECT 1 FROM laptops WHERE purchase_batch_id=purchase_batches.id AND status='in_transit') THEN 'RECEIVED'
  WHEN NOT EXISTS(SELECT 1 FROM laptops WHERE purchase_batch_id=purchase_batches.id AND status<>'in_transit') THEN 'IN_TRANSIT_VN'
  ELSE 'PARTIALLY_RECEIVED' END;`);
 sql.push(`UPDATE orders SET profit_vnd=round(sale_price-(SELECT import_price_vnd FROM laptops WHERE id=orders.laptop_id),6) WHERE laptop_id IS NOT NULL;`);
 sql.push(`UPDATE payments SET payment_method='transfer_cash',account_id=(SELECT id FROM _oct_account_guard),note=note||'; Người dùng xác nhận chuyển khoản vào VCB TOI';
 UPDATE orders SET payment_method='transfer_cash';
 INSERT INTO financial_records(record_type,category,amount,order_id,payment_id,laptop_id,occurred_on,payment_method,note,recorded_by)
 SELECT 'income',p.payment_type,p.amount,p.order_id,p.id,o.laptop_id,p.payment_date,p.payment_method,p.note,'SYSTEM_MIGRATION' FROM payments p JOIN orders o ON o.id=p.order_id;
 INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,description,idempotency_key,created_by)
 SELECT account_id,'IN',round(amount*1000000),'VND','PAYMENT',cast(id AS TEXT),'CUSTOMER_PAYMENT',payment_date,note,'gs2-account-'||id,'SYSTEM_MIGRATION' FROM payments;
 DROP TABLE _oct_account_guard;`);
 sql.push(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
 SELECT 'ORDER',cast(id AS TEXT),'CREATE',json_object('source','GOOGLE_SHEET_REPLACEMENT','opening_balance',amount_paid),'SYSTEM_MIGRATION' FROM orders;`);
 sql.push(`CREATE TABLE _oct_result_guard(ok INTEGER CHECK(ok=1));
 INSERT INTO _oct_result_guard SELECT CASE WHEN (SELECT count(*) FROM laptops)=190 AND (SELECT count(*) FROM laptops WHERE month_key='10/2026')=190 AND (SELECT count(*) FROM orders)=60 AND (SELECT count(*) FROM qc_inspections WHERE result='PASS')=123 AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;
 DROP TABLE _oct_result_guard; DROP TABLE _oct_supplier_guard;`);
 return sql.join('\n')+'\n';
}
if(process.argv.includes('--sql')) console.log(buildReplacement());
if(process.argv.includes('--status-sql')) console.log(buildStatusCorrection());
if(process.argv.includes('--september-order-sql')) console.log(buildSeptemberOrderLaptopCorrection());
