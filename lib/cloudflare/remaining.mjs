import { createHash, randomUUID } from 'node:crypto';
const fail=m=>{throw Object.assign(new Error(m),{status:400});};
const first=r=>r?.results?.[0]||null;
const ORDER_FIELDS=new Set(['created_date','sale_online','sale_offline','note','order_type','order_status','payment_status','payment_method','delivery_status','shipping_method','laptop_id','requested_laptop_id','sale_price','deposit_amount','deposit_note','cod_amount','amount_paid','debt_amount','credit_card_fee','profit_vnd','trade_in_laptop_id','customer_id','customer_info','customer_address','tracking_code','ship_date','setup_note','warranty','month_key','branch_id','gift_preset','gift_accessory_ids','reservation_expires_at','cancel_reason','cancelled_at','returned_at','return_reason','payment_due_at','requested_configuration','requested_category']);
const ORDER_SYSTEM_FIELDS=new Set([...ORDER_FIELDS,'cost_snapshot_vnd','gross_profit_snapshot_vnd','direct_cost_snapshot_vnd','net_contribution_snapshot_vnd','cost_snapshot_status','cost_snapshot_reasons','cost_snapshotted_at']);
const ORDER_AUDIT_FIELDS=[...ORDER_FIELDS].filter(key=>key!=='profit_vnd');
const ORDER_AUDIT_NUMERIC_FIELDS=new Set(['sale_price','deposit_amount','cod_amount','amount_paid','debt_amount','credit_card_fee']);
const ORDER_AUDIT_ID_FIELDS=new Set(['laptop_id','requested_laptop_id','trade_in_laptop_id','customer_id','branch_id']);
const COMMITTED_ORDER_STATUSES=new Set(['prepared','shipping','done']);
const encoded=(k,v)=>['sale_online','sale_offline'].includes(k)?(typeof v==='string'?v.trim()||null:null):k==='gift_accessory_ids'&&Array.isArray(v)?JSON.stringify(v):(v===undefined?null:v);
const orderAuditValue=(key,value)=>{
  const normalized=encoded(key,value);
  if(normalized===null||normalized===undefined)return null;
  if(ORDER_AUDIT_NUMERIC_FIELDS.has(key)||ORDER_AUDIT_ID_FIELDS.has(key)){
    if(normalized==='')return null;
    const numeric=Number(normalized);
    return Number.isFinite(numeric)?numeric:normalized;
  }
  if(key==='gift_accessory_ids'&&typeof normalized==='string'){
    try{const parsed=JSON.parse(normalized);return Array.isArray(parsed)?parsed:normalized;}catch(_){return normalized;}
  }
  return normalized;
};
const orderAuditChanges=(before,next)=>Object.fromEntries(ORDER_AUDIT_FIELDS
  .filter(key=>Object.prototype.hasOwnProperty.call(next,key))
  .map(key=>[key,{before:orderAuditValue(key,before?.[key]),after:orderAuditValue(key,next[key])}])
  .filter(([,diff])=>JSON.stringify(diff.before)!==JSON.stringify(diff.after)));
const rounded=(value,digits=2)=>Math.round((Number(value)+Number.EPSILON)*(10**digits))/(10**digits);
async function deriveOrderEconomics(db,next,previous=null){
  const laptopId=next.laptop_id===undefined?previous?.laptop_id:next.laptop_id;
  const sale=Number(next.sale_price??previous?.sale_price??0);
  const fee=Number(next.credit_card_fee??previous?.credit_card_fee??0);
  const status=next.order_status??previous?.order_status;
  const laptop=laptopId?await db.prepare('SELECT import_price_vnd FROM laptops WHERE id=?').bind(laptopId).first():null;
  const hasImportPrice=laptop?.import_price_vnd!==null&&laptop?.import_price_vnd!==undefined&&Number.isFinite(Number(laptop.import_price_vnd));
  const importPrice=hasImportPrice?Number(laptop.import_price_vnd):null;
  const economics={profit_vnd:hasImportPrice&&Number.isFinite(sale)?rounded(sale-importPrice,4):0};
  if(previous?.cost_snapshotted_at) return {profit_vnd:previous.profit_vnd};
  if(previous && COMMITTED_ORDER_STATUSES.has(previous.order_status)) return {profit_vnd:previous.profit_vnd,
    cost_snapshot_status:'INCOMPLETE',cost_snapshot_reasons:'["MISSING_HISTORICAL_COST_EVIDENCE"]'};
  if(COMMITTED_ORDER_STATUSES.has(status)&&!previous?.cost_snapshotted_at&&laptopId){
    const saleVnd=Number.isFinite(sale)?rounded(sale*1000000):0;
    const directCostVnd=Number.isFinite(fee)?rounded(fee*1000000):0;
    const costVnd=hasImportPrice?rounded(importPrice*1000000):null;
    Object.assign(economics,{
      cost_snapshot_vnd:costVnd,
      gross_profit_snapshot_vnd:costVnd===null?null:rounded(saleVnd-costVnd),
      direct_cost_snapshot_vnd:directCostVnd,
      net_contribution_snapshot_vnd:costVnd===null?null:rounded(saleVnd-costVnd-directCostVnd),
      cost_snapshot_status:costVnd===null?'INCOMPLETE':'COMPLETE',
      cost_snapshot_reasons:costVnd===null?'["MISSING_IMPORT_PRICE_VND"]':'[]',
      cost_snapshotted_at:new Date().toISOString(),
    });
  }
  return economics;
}
function snapshotCostGuard(db,order,data){
  if(!data.cost_snapshotted_at)return [];
  return [db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM laptops WHERE id=? AND round(import_price_vnd*1000000,2) IS ?) THEN 1 ELSE json('Cost changed during sale; reload') END").bind(order.laptop_id,data.cost_snapshot_vnd)];
}
const cancellationGuards = (db, order) => [...new Set([order.laptop_id, order.requested_laptop_id].filter(Boolean))].map(id =>
  db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM laptops WHERE id=? AND status<>'ignored' AND is_active=1) THEN 1 ELSE json('cancelled laptop cannot be ordered') END").bind(id));
async function orderResult(db,id,previous){const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();const laptop=order?.laptop_id?await db.prepare('SELECT * FROM laptops WHERE id=?').bind(order.laptop_id).first():null;const prior=previous&&previous!==order?.laptop_id?await db.prepare('SELECT * FROM laptops WHERE id=?').bind(previous).first():null;return{order,laptop,previousLaptop:prior};}
export function orderCreationHash(order){
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(order).filter(k=>ORDER_FIELDS.has(k)).sort().map(k=>[k,encoded(k,order[k])])))).digest('hex');
}
export async function createOrderWithInventory(db,{p_order:input,p_recorded_by:actor,p_idempotency_key:inputKey,p_request_hash:requestHash}){
  const o={...input}, key=inputKey||randomUUID(), hash=requestHash||orderCreationHash(o);
  if(typeof key!=='string'||key.length<8||key.length>100)fail('Invalid order idempotency key');
  const existing=await db.prepare('SELECT id,creation_hash FROM orders WHERE creation_key=?').bind(key).first();
  if(existing){if(existing.creation_hash!==hash)fail('Order request key conflict');return orderResult(db,existing.id,null);}
  const sale=Number(o?.sale_price);
  if(!Number.isFinite(sale)||sale<=0)fail('Giá bán không hợp lệ');
  o.amount_paid=0;
  o.deposit_amount=0;
  o.debt_amount=sale;
  o.cod_amount=sale;
  const targetLapId=o.laptop_id||o.requested_laptop_id;
  if(targetLapId&&(!o.requested_configuration||!o.requested_category)){
    const lap=await db.prepare('SELECT name,category FROM laptops WHERE id=?').bind(targetLapId).first();
    if(lap){
      if(!o.requested_configuration)o.requested_configuration=lap.name;
      if(!o.requested_category)o.requested_category=lap.category;
    }
  }
  if(!o.requested_laptop_id&&o.laptop_id)o.requested_laptop_id=o.laptop_id;
  const writeData={...o,...await deriveOrderEconomics(db,o)};
  const fields=Object.keys(writeData).filter(k=>ORDER_SYSTEM_FIELDS.has(k));
  const vals=fields.map(k=>encoded(k,writeData[k]));
  const sql=`INSERT INTO orders(${fields.map(x=>`"${x}"`).join(',')},is_active,creation_key,creation_hash) SELECT ${fields.map(()=>'?').join(',')},1,?,? WHERE NOT EXISTS(SELECT 1 FROM orders WHERE creation_key=?)`;
  const b=await db.batch([
    ...cancellationGuards(db,o),
    db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE creation_key=? AND creation_hash<>?) THEN 1 ELSE json('order request key conflict') END").bind(key,hash),
    ...snapshotCostGuard(db,o,writeData),
    db.prepare(sql).bind(...vals,key,hash,key),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) SELECT 'ORDER',CAST(id AS TEXT),'CREATE',json_object('event','ORDER_CREATED'),? FROM orders WHERE creation_key=? AND changes()=1`).bind(actor||'SYSTEM',key),
    db.prepare('SELECT id FROM orders WHERE creation_key=?').bind(key)
  ]);
  const id=first(b.at(-1)).id;
  return orderResult(db,id,null);
}
export async function updateOrderWithInventory(db,{p_order:o,p_recorded_by:actor}){
  const id=Number(o?.id);
  if(!Number.isSafeInteger(id)||id<=0)fail('Đơn hàng không hợp lệ');
  const old=await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if(!old)fail('Không tìm thấy đơn hàng');
  if ((o.amount_paid !== undefined && Number(o.amount_paid) !== Number(old.amount_paid))
    || (o.deposit_amount !== undefined && Number(o.deposit_amount) !== Number(old.deposit_amount))) fail('Giao dịch vừa thay đổi. Hãy tải lại đơn trước khi lưu.');
  o.amount_paid=old.amount_paid;
  o.deposit_amount=old.deposit_amount;
  o.debt_amount=Math.max(0,Math.round((Number(o.sale_price ?? old.sale_price)-Number(old.amount_paid)-Number(old.trade_in_credit_vnd || 0)/1000000)*1000000)/1000000);
  o.cod_amount=o.debt_amount;
  const targetLapId=o.laptop_id||o.requested_laptop_id||old.laptop_id||old.requested_laptop_id;
  if(targetLapId&&(!o.requested_configuration||!o.requested_category)){
    const lap=await db.prepare('SELECT name,category FROM laptops WHERE id=?').bind(targetLapId).first();
    if(lap){
      if(!o.requested_configuration&&!old.requested_configuration)o.requested_configuration=lap.name;
      if(!o.requested_category&&!old.requested_category)o.requested_category=lap.category;
    }
  }
  if(!o.requested_laptop_id&&!old.requested_laptop_id&&(o.laptop_id||old.laptop_id)){
    o.requested_laptop_id=o.laptop_id||old.laptop_id;
  }
  const writeData={...o,...await deriveOrderEconomics(db,o,old)};
  const fields=Object.keys(writeData).filter(k=>ORDER_SYSTEM_FIELDS.has(k));
  if(!fields.length)return orderResult(db,id,old.laptop_id);
  const vals=fields.map(k=>encoded(k,writeData[k]));
  const auditChanges=orderAuditChanges(old,writeData);
  const auditStatements=Object.keys(auditChanges).length?[db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('ORDER',?,'UPDATE',json(?),?)`).bind(String(id),JSON.stringify(auditChanges),actor||'SYSTEM')]:[];
  await db.batch([
    db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=? AND amount_paid=? AND deposit_amount=? AND updated_at IS ?) THEN 1 ELSE json('Order changed; reload before saving') END").bind(id,old.amount_paid,old.deposit_amount,old.updated_at),
    db.prepare("SELECT CASE WHEN ?=? AND ?=? OR NOT EXISTS(SELECT 1 FROM cod_receivables WHERE order_id=? AND status NOT IN ('PENDING_DELIVERY','CANCELLED','RETURNED')) THEN 1 ELSE json('COD already processed; financial fields cannot change') END").bind(o.sale_price ?? old.sale_price,old.sale_price,o.cod_amount ?? old.cod_amount,old.cod_amount,id),
    ...cancellationGuards(db,{...old,...o}),
    ...snapshotCostGuard(db,{...old,...o},writeData),
    db.prepare(`UPDATE orders SET ${fields.map(k=>`"${k}"=?`).join(',')},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(...vals,id),
    db.prepare("UPDATE cod_receivables SET expected_cod_amount_vnd=CASE WHEN (SELECT cod_amount FROM orders WHERE id=?)>0 THEN round((SELECT cod_amount FROM orders WHERE id=?)*1000000) ELSE expected_cod_amount_vnd END,status=CASE WHEN (SELECT cod_amount FROM orders WHERE id=?)<=0 THEN 'CANCELLED' ELSE status END WHERE order_id=? AND status='PENDING_DELIVERY'").bind(id,id,id,id),
    ...auditStatements
  ]);
  return orderResult(db,id,old.laptop_id);
}
export async function recordOrderPayment(db,p){const id=Number(p.p_order_id),amount=Number(p.p_amount),type=p.p_payment_type;if(!id||!Number.isFinite(amount)||amount<=0||!['deposit','balance','cod','refund','other'].includes(type))fail('Thanh toán không hợp lệ');const order=await db.prepare('SELECT * FROM orders WHERE id=? AND is_active=1').bind(id).first();if(!order)fail('Không tìm thấy đơn');const next=type==='refund'?order.amount_paid-amount:order.amount_paid+amount;if(next<0||next>order.sale_price)fail('Số tiền vượt giới hạn');const b=await db.batch([db.prepare(`INSERT INTO payments(order_id,payment_type,amount,payment_method,payment_date,reference_code,note,recorded_by) VALUES(?,?,?,?,?,?,?,?)`).bind(id,type,amount,p.p_payment_method||'transfer_cash',p.p_payment_date||new Date().toISOString().slice(0,10),p.p_reference_code||null,p.p_note||null,p.p_recorded_by||null),db.prepare(`INSERT INTO financial_records(record_type,category,amount,order_id,payment_id,occurred_on,payment_method,note,recorded_by) VALUES(?,?,?,?,last_insert_rowid(),?,?,?,?)`).bind(type==='refund'?'refund':'income',type,amount,id,p.p_payment_date||new Date().toISOString().slice(0,10),p.p_payment_method||'transfer_cash',p.p_note||null,p.p_recorded_by||null),db.prepare(`UPDATE orders SET amount_paid=?,deposit_amount=CASE WHEN ?='deposit' THEN deposit_amount+? WHEN ?='refund' THEN min(deposit_amount,?) ELSE deposit_amount END,debt_amount=max(sale_price-?-trade_in_credit_vnd/1000000,0),payment_status=CASE WHEN ?=0 THEN CASE WHEN ?='refund' THEN 'refunded' ELSE 'unpaid' END WHEN max(sale_price-?-trade_in_credit_vnd/1000000,0)=0 THEN 'paid' WHEN ?='cod' THEN 'cod' ELSE 'deposited' END WHERE id=?`).bind(next,type,amount,type,next,next,next,type,next,type,id),db.prepare("UPDATE orders SET cod_amount=debt_amount,deposit_amount=min(amount_paid,round(COALESCE((SELECT sum(amount) FROM payments WHERE order_id=orders.id AND payment_type='deposit'),0),6)) WHERE id=?").bind(id),db.prepare('SELECT * FROM orders WHERE id=?').bind(id)]);return{payment:first(b[0]),financial_record:first(b[1]),order:first(b.at(-1)),laptop:null};}
export async function resolveGiftItems(db,o){
  let giftIds=[];
  if(Array.isArray(o?.gift_accessory_ids)){
    giftIds=o.gift_accessory_ids;
  }else if(typeof o?.gift_accessory_ids==='string'&&o.gift_accessory_ids.trim()){
    try{
      const parsed=JSON.parse(o.gift_accessory_ids);
      if(Array.isArray(parsed))giftIds=parsed;
    }catch(_){}
  }
  giftIds=giftIds.map(x=>Number(x)).filter(x=>Number.isSafeInteger(x)&&x>0);
  const giftItems=[];
  if(giftIds.length>0){
    const placeholders=giftIds.map(()=>'?').join(',');
    const accs=await db.prepare(`SELECT * FROM accessories WHERE id IN (${placeholders}) ORDER BY id`).bind(...giftIds).all();
    for(const a of accs?.results||[]){
      giftItems.push({
        kind:'gift',
        id:a.id,
        sku:a.sku||'',
        name:a.name,
        quantity:1,
        price:0,
        total:0,
        serial:'',
        note:a.note||'Quà tặng kèm theo máy'
      });
    }
  }else if(o?.gift_preset&&o.gift_preset!=='none'){
    const presetKinds={
      mouse:['mouse'],
      backpack:['backpack'],
      basic:['mouse','backpack'],
      full:['mouse','backpack','mousepad','sleeve']
    }[o.gift_preset];
    if(presetKinds&&presetKinds.length>0){
      const placeholders=presetKinds.map(()=>'?').join(',');
      const accs=await db.prepare(`SELECT * FROM accessories WHERE kind IN (${placeholders}) AND active=1 ORDER BY id`).bind(...presetKinds).all();
      for(const a of accs?.results||[]){
        giftItems.push({
          kind:'gift',
          id:a.id,
          sku:a.sku||'',
          name:a.name,
          quantity:1,
          price:0,
          total:0,
          serial:'',
          note:a.note||'Quà tặng kèm theo máy'
        });
      }
    }
  }
  return giftItems;
}
export async function issueInvoice(db,{p_order_id:id,p_actor:actor}){
  const existing=await db.prepare('SELECT * FROM invoices WHERE order_id=?').bind(id).first();
  if(existing)return existing;
  const o=await db.prepare("SELECT * FROM orders WHERE id=? AND is_active=1 AND order_status IN ('shipping','done') AND sale_price>0").bind(id).first();
  if(!o||!o.laptop_id||o.amount_paid<=0)fail('Đơn chưa đủ điều kiện xuất hóa đơn');
  if(!o.branch_id||!o.customer_id)fail('Đơn chưa đủ thông tin chi nhánh hoặc khách hàng để xuất hóa đơn');
  const [l,c,b,payments,finance,giftItems]=await Promise.all([
    db.prepare('SELECT * FROM laptops WHERE id=?').bind(o.laptop_id).first(),
    db.prepare('SELECT * FROM customers WHERE id=?').bind(o.customer_id).first(),
    db.prepare('SELECT * FROM branches WHERE id=?').bind(o.branch_id).first(),
    db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY payment_date,id').bind(id).all(),
    db.prepare('SELECT * FROM financial_records WHERE order_id=? ORDER BY occurred_on,id').bind(id).all(),
    resolveGiftItems(db,o)
  ]);
  if(!l||!c||!b||!c.name)fail('Thiếu laptop, khách hàng hoặc chi nhánh');
  const noteParts=[l.condition_note,o.warranty,o.setup_note].filter(Boolean);
  const items=[
    {kind:'laptop',id:l.id,sku:l.sku,name:l.name,quantity:1,price:o.sale_price,total:o.sale_price,serial:l.serial||'',note:noteParts.length?noteParts.join(' · '):''},
    ...giftItems
  ];
  const snapshot={order:o,customer:c,branch:b,items,payments:payments.results,financial_records:finance.results,total:o.sale_price,paid:o.amount_paid,currency:'VND',unit_multiplier:1000000};
  const batch=await db.batch([
    db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM invoices WHERE order_id=?) OR EXISTS(SELECT 1 FROM orders WHERE id=? AND updated_at IS ? AND amount_paid=? AND sale_price=? AND laptop_id=? AND customer_id=? AND branch_id=?) THEN 1 ELSE json('Invoice inputs changed; reload') END").bind(id,id,o.updated_at,o.amount_paid,o.sale_price,l.id,c.id,b.id),
    db.prepare('INSERT INTO invoices(order_id,laptop_id,customer_id,created_by,snapshot) VALUES(?,?,?,?,?) ON CONFLICT(order_id) DO NOTHING').bind(id,l.id,c.id,actor,JSON.stringify(snapshot)),
    db.prepare('SELECT * FROM invoices WHERE order_id=?').bind(id)
  ]);
  return first(batch.at(-1));
}
export async function getManagementDashboard(db){
  const [availableResult,states,transit,qcWaiting,qcProgress,qcFailed,repairs,returns]=await Promise.all([
    db.prepare(`SELECT l.id,l.serial,l.name model,l.location,l.retail_price_vnd,l.available_for_sale_at,
      c.landed_cost_vnd,c.cost_status,
      CASE WHEN l.available_for_sale_at IS NULL THEN NULL ELSE max(CAST(julianday('now')-julianday(l.available_for_sale_at) AS INTEGER),0) END age_days
      FROM laptops l LEFT JOIN laptop_landed_costs c ON c.laptop_id=l.id
      WHERE l.is_active=1 AND l.status='available'`).all(),
    db.prepare('SELECT status,count(*) units FROM laptops WHERE is_active=1 GROUP BY status').all(),
    db.prepare(`SELECT count(*) units,
      COALESCE(sum((purchase_price_rmb+shipping_rmb)*purchase_exchange_rate),0) purchase_value_vnd
      FROM laptops WHERE is_active=1 AND status='in_transit'`).first(),
    db.prepare(`SELECT count(*) units,
      COALESCE(sum(CASE WHEN c.cost_status='COMPLETE' THEN c.landed_cost_vnd ELSE 0 END),0) known_cost_vnd
      FROM laptops l LEFT JOIN laptop_landed_costs c ON c.laptop_id=l.id
      WHERE l.is_active=1 AND l.status='waiting_qc'`).first(),
    db.prepare(`SELECT count(*) units,
      COALESCE(max(max(CAST(julianday('now')-julianday(started_at) AS INTEGER),0)),0) oldest_age
      FROM qc_inspections WHERE status='IN_PROGRESS'`).first(),
    db.prepare(`SELECT count(DISTINCT q.laptop_id) units,
      COALESCE(max(max(CAST(julianday('now')-julianday(q.completed_at) AS INTEGER),0)),0) oldest_age
      FROM qc_inspections q JOIN laptops l ON l.id=q.laptop_id
      WHERE q.status='COMPLETED' AND q.result='FAIL' AND l.status='waiting_qc'`).first(),
    db.prepare(`SELECT count(*) active_jobs,
      count(*) FILTER(WHERE r.status='WAITING_PART') waiting_parts,
      COALESCE(max(max(CAST(julianday('now')-julianday(COALESCE(r.started_at,r.created_at)) AS INTEGER),0)),0) oldest_age,
      COALESCE(sum(r.total_cost_vnd),0) accumulated_cost_vnd,
      COALESCE(sum(CASE WHEN c.cost_status='COMPLETE' THEN c.landed_cost_vnd ELSE 0 END),0) known_laptop_cost_vnd
      FROM repair_jobs r LEFT JOIN laptop_landed_costs c ON c.laptop_id=r.laptop_id
      WHERE r.status NOT IN ('COMPLETED','CANCELLED')`).first(),
    db.prepare(`WITH active AS (
        SELECT r.id,r.status,
          sum(COALESCE(i.agreed_refund_rmb,i.expected_refund_rmb,0)) refundable_rmb,
          sum(CASE WHEN c.cost_status='COMPLETE' THEN c.landed_cost_vnd ELSE 0 END) known_cost_vnd
        FROM supplier_returns r JOIN supplier_return_items i ON i.supplier_return_id=r.id
        LEFT JOIN laptop_landed_costs c ON c.laptop_id=i.laptop_id
        WHERE r.status NOT IN ('REFUNDED','REPLACED','REJECTED','CLOSED','CANCELLED')
        GROUP BY r.id,r.status
      ), refunds AS (SELECT supplier_return_id,sum(amount_rmb) amount_rmb FROM supplier_refunds GROUP BY supplier_return_id)
      SELECT count(*) pending,
        count(*) FILTER(WHERE a.status IN ('SHIPPED','SUPPLIER_RECEIVED')) shipped,
        count(*) FILTER(WHERE a.status IN ('WAITING_REFUND','PARTIALLY_RESOLVED')) waiting_refund,
        count(*) FILTER(WHERE a.status='WAITING_REPLACEMENT') waiting_replacement,
        COALESCE(sum(a.known_cost_vnd),0) known_cost_exposure_vnd,
        COALESCE(sum(max(a.refundable_rmb-COALESCE(r.amount_rmb,0),0)),0) refund_pending_rmb
      FROM active a LEFT JOIN refunds r ON r.supplier_return_id=a.id`).first(),
  ]);
  const availableRows=availableResult.results||[];
  const bucketDefs=[
    ['0_7','0–7 ngày',0,7],['8_15','8–15 ngày',8,15],['16_30','16–30 ngày',16,30],
    ['31_60','31–60 ngày',31,60],['61_90','61–90 ngày',61,90],['90_plus','90+ ngày',91,Infinity],
  ];
  const aging=bucketDefs.map(([bucket_key,bucket_label,min,max],index)=>{
    const rows=availableRows.filter(row=>row.age_days!==null&&Number(row.age_days)>=min&&Number(row.age_days)<=max);
    if(!rows.length)return null;
    const complete=rows.filter(row=>row.cost_status==='COMPLETE');
    return{bucket_key,bucket_label,sort_order:index+1,units:rows.length,
      landed_cost_value:complete.reduce((sum,row)=>sum+Number(row.landed_cost_vnd||0),0),
      average_age:rounded(rows.reduce((sum,row)=>sum+Number(row.age_days||0),0)/rows.length,1)};
  }).filter(Boolean);
  const completeAvailable=availableRows.filter(row=>row.cost_status==='COMPLETE');
  const slow_moving=availableRows.filter(row=>Number(row.age_days)>=30).sort((a,b)=>Number(b.age_days)-Number(a.age_days)||Number(a.id)-Number(b.id)).slice(0,25).map(row=>{
    const selling=rounded(Number(row.retail_price_vnd||0)*1000000);
    return{laptop_id:row.id,serial:row.serial,model:row.model,location:row.location,age_days:row.age_days,
      landed_cost_vnd:Number(row.landed_cost_vnd||0),cost_status:row.cost_status,selling_price_vnd:selling,
      gross_margin_potential_vnd:row.cost_status==='COMPLETE'?rounded(selling-Number(row.landed_cost_vnd||0)):null};
  });
  return{generated_at:new Date().toISOString(),thresholds:{warning_days:30,critical_days:60},
    available:{units:availableRows.length,cost_complete:completeAvailable.length,
      cost_incomplete:availableRows.filter(row=>row.cost_status==='INCOMPLETE').length,legacy:0,
      missing_aging_timestamp:availableRows.filter(row=>row.available_for_sale_at==null).length,
      known_inventory_cost_vnd:completeAvailable.reduce((sum,row)=>sum+Number(row.landed_cost_vnd||0),0)},
    aging,state_summary:Object.fromEntries((states.results||[]).map(x=>[x.status,x.units])),
    transit:{...transit,by_stage:{IN_TRANSIT:Number(transit?.units||0)}},
    qc:{waiting_qc:{units:Number(qcWaiting?.units||0),oldest_age:0},
      qc_in_progress:{units:Number(qcProgress?.units||0),oldest_age:Number(qcProgress?.oldest_age||0)},
      qc_failed:{units:Number(qcFailed?.units||0),oldest_age:Number(qcFailed?.oldest_age||0)},
      known_cost_vnd:Number(qcWaiting?.known_cost_vnd||0)},
    repairs:{active_jobs:Number(repairs?.active_jobs||0),waiting_parts:Number(repairs?.waiting_parts||0),oldest_age:Number(repairs?.oldest_age||0),
      accumulated_cost_vnd:Number(repairs?.accumulated_cost_vnd||0),known_laptop_cost_vnd:Number(repairs?.known_laptop_cost_vnd||0)},
    supplier_returns:{pending:Number(returns?.pending||0),shipped:Number(returns?.shipped||0),waiting_refund:Number(returns?.waiting_refund||0),
      waiting_replacement:Number(returns?.waiting_replacement||0),known_cost_exposure_vnd:Number(returns?.known_cost_exposure_vnd||0),refund_pending_rmb:Number(returns?.refund_pending_rmb||0)},
    slow_moving};
}
