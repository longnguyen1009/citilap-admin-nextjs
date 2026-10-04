const fail=m=>{throw Object.assign(new Error(m),{status:400});};
const first=r=>r?.results?.[0]||null;
const ORDER_FIELDS=new Set(['created_date','sale_online','sale_offline','note','order_type','order_status','payment_status','payment_method','delivery_status','shipping_method','laptop_id','requested_laptop_id','sale_price','deposit_amount','deposit_note','cod_amount','amount_paid','debt_amount','credit_card_fee','profit_vnd','trade_in_laptop_id','customer_id','customer_info','customer_address','tracking_code','ship_date','setup_note','warranty','month_key','branch_id','gift_preset','gift_accessory_ids','reservation_expires_at','cancel_reason','cancelled_at','returned_at','return_reason','payment_due_at','requested_configuration','requested_category']);
const encoded=(k,v)=>k==='gift_accessory_ids'&&Array.isArray(v)?JSON.stringify(v):(v===undefined?null:v);
async function orderResult(db,id,previous){const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();const laptop=order?.laptop_id?await db.prepare('SELECT * FROM laptops WHERE id=?').bind(order.laptop_id).first():null;const prior=previous&&previous!==order?.laptop_id?await db.prepare('SELECT * FROM laptops WHERE id=?').bind(previous).first():null;return{order,laptop,previousLaptop:prior};}
export async function createOrderWithInventory(db,{p_order:o,p_recorded_by:actor}){
  const sale=Number(o?.sale_price);
  if(!Number.isFinite(sale)||sale<=0)fail('Giá bán không hợp lệ');
  const targetLapId=o.laptop_id||o.requested_laptop_id;
  if(targetLapId&&(!o.requested_configuration||!o.requested_category)){
    const lap=await db.prepare('SELECT name,category FROM laptops WHERE id=?').bind(targetLapId).first();
    if(lap){
      if(!o.requested_configuration)o.requested_configuration=lap.name;
      if(!o.requested_category)o.requested_category=lap.category;
    }
  }
  if(!o.requested_laptop_id&&o.laptop_id)o.requested_laptop_id=o.laptop_id;
  const fields=Object.keys(o).filter(k=>ORDER_FIELDS.has(k));
  const vals=fields.map(k=>encoded(k,o[k]));
  const sql=`INSERT INTO orders(${fields.map(x=>`"${x}"`).join(',')},is_active) VALUES(${fields.map(()=>'?').join(',')},1)`;
  const b=await db.batch([
    db.prepare(sql).bind(...vals),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('ORDER',CAST(last_insert_rowid() AS TEXT),'CREATE',json_object('event','ORDER_CREATED'),?)`).bind(actor||'SYSTEM'),
    db.prepare("SELECT CAST(entity_id AS INTEGER) AS id FROM activity_logs WHERE id=last_insert_rowid()")
  ]);
  const id=first(b.at(-1)).id;
  if(o.laptop_id)await db.prepare("UPDATE laptops SET status='reserved',sold_at=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='available'").bind(o.laptop_id).run();
  return orderResult(db,id,null);
}
export async function updateOrderWithInventory(db,{p_order:o,p_recorded_by:actor}){
  const id=Number(o?.id);
  if(!Number.isSafeInteger(id)||id<=0)fail('Đơn hàng không hợp lệ');
  const old=await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if(!old)fail('Không tìm thấy đơn hàng');
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
  const fields=Object.keys(o).filter(k=>ORDER_FIELDS.has(k));
  if(!fields.length)return orderResult(db,id,old.laptop_id);
  const vals=fields.map(k=>encoded(k,o[k]));
  await db.batch([
    db.prepare(`UPDATE orders SET ${fields.map(k=>`"${k}"=?`).join(',')},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(...vals,id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('ORDER',?,'UPDATE',json_object('event','ORDER_UPDATED'),?)`).bind(String(id),actor||'SYSTEM')
  ]);
  const next=o.laptop_id===undefined?old.laptop_id:o.laptop_id;
  if(old.laptop_id&&old.laptop_id!==next)await db.prepare(`UPDATE laptops SET status='available',sold_at=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status IN ('reserved','sold') AND NOT EXISTS(SELECT 1 FROM orders WHERE laptop_id=? AND id<>? AND is_active=1 AND order_status IN ('prepared','shipping','done'))`).bind(old.laptop_id,old.laptop_id,id).run();
  if(next){
    const status=o.order_status||old.order_status;
    await db.prepare("UPDATE laptops SET status=CASE WHEN ? IN ('prepared','shipping','done') THEN 'sold' ELSE 'reserved' END,sold_at=CASE WHEN ?='done' THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHEN ? NOT IN ('prepared','shipping','done') THEN NULL ELSE sold_at END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(status,status,status,next).run();
  }
  return orderResult(db,id,old.laptop_id);
}
export async function recordOrderPayment(db,p){const id=Number(p.p_order_id),amount=Number(p.p_amount),type=p.p_payment_type;if(!id||!Number.isFinite(amount)||amount<=0||!['deposit','balance','cod','refund','other'].includes(type))fail('Thanh toán không hợp lệ');const order=await db.prepare('SELECT * FROM orders WHERE id=? AND is_active=1').bind(id).first();if(!order)fail('Không tìm thấy đơn');const next=type==='refund'?order.amount_paid-amount:order.amount_paid+amount;if(next<0||next>order.sale_price)fail('Số tiền vượt giới hạn');const b=await db.batch([db.prepare(`INSERT INTO payments(order_id,payment_type,amount,payment_method,payment_date,reference_code,note,recorded_by) VALUES(?,?,?,?,?,?,?,?)`).bind(id,type,amount,p.p_payment_method||'transfer_cash',p.p_payment_date||new Date().toISOString().slice(0,10),p.p_reference_code||null,p.p_note||null,p.p_recorded_by||null),db.prepare(`INSERT INTO financial_records(record_type,category,amount,order_id,payment_id,occurred_on,payment_method,note,recorded_by) VALUES(?,?,?,?,last_insert_rowid(),?,?,?,?)`).bind(type==='refund'?'refund':'income',type,amount,id,p.p_payment_date||new Date().toISOString().slice(0,10),p.p_payment_method||'transfer_cash',p.p_note||null,p.p_recorded_by||null),db.prepare(`UPDATE orders SET amount_paid=?,deposit_amount=CASE WHEN ?='deposit' THEN deposit_amount+? WHEN ?='refund' THEN min(deposit_amount,?) ELSE deposit_amount END,debt_amount=max(sale_price-?-trade_in_credit_vnd/1000000,0),payment_status=CASE WHEN ?=0 THEN CASE WHEN ?='refund' THEN 'refunded' ELSE 'unpaid' END WHEN max(sale_price-?-trade_in_credit_vnd/1000000,0)=0 THEN 'paid' WHEN ?='cod' THEN 'cod' ELSE 'deposited' END WHERE id=?`).bind(next,type,amount,type,next,next,next,type,next,type,id),db.prepare('SELECT * FROM orders WHERE id=?').bind(id)]);return{payment:first(b[0]),financial_record:first(b[1]),order:first(b.at(-1)),laptop:null};}
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
  if(existing){
    let snap=typeof existing.snapshot==='string'?JSON.parse(existing.snapshot):existing.snapshot;
    if(snap&&Array.isArray(snap.items)&&!snap.items.some(it=>it.kind==='gift')){
      const giftItems=await resolveGiftItems(db,snap.order||{});
      if(giftItems.length>0){
        snap.items=[...snap.items,...giftItems];
        await db.prepare('UPDATE invoices SET snapshot=? WHERE id=?').bind(JSON.stringify(snap),existing.id).run();
        existing.snapshot=typeof existing.snapshot==='string'?JSON.stringify(snap):snap;
      }
    }
    return existing;
  }
  const o=await db.prepare("SELECT * FROM orders WHERE id=? AND is_active=1 AND order_status IN ('shipping','done') AND sale_price>0").bind(id).first();
  if(!o||!o.laptop_id||o.amount_paid<=0)fail('Đơn chưa đủ điều kiện xuất hóa đơn');
  if(!o.branch_id){
    const branch=await db.prepare('SELECT id FROM branches WHERE active=1 ORDER BY id LIMIT 1').first();
    if(branch?.id){
      o.branch_id=branch.id;
      await db.prepare('UPDATE orders SET branch_id=? WHERE id=?').bind(branch.id,id).run();
    }
  }
  if(!o.customer_id&&o.customer_info){
    const raw=String(o.customer_info).trim();
    const match=raw.match(/(?:(?:\+84|0)[3|5|7|8|9][0-9]{8})/);
    const phone=match?match[0]:'0900000000';
    const name=match?raw.replace(match[0],'').replace(/[-–—,]/g,'').trim()||raw:raw;
    const address=o.customer_address||'';
    let cust=await db.prepare('SELECT id,name,phone,address FROM customers WHERE phone=? LIMIT 1').bind(phone).first();
    if(!cust){
      const ins=await db.prepare('INSERT INTO customers(name,phone,address) VALUES(?,?,?) RETURNING id').bind(name,phone,address).first();
      o.customer_id=ins.id;
    }else{
      o.customer_id=cust.id;
    }
    await db.prepare('UPDATE orders SET customer_id=? WHERE id=?').bind(o.customer_id,id).run();
  }
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
    db.prepare('INSERT INTO invoices(order_id,laptop_id,customer_id,created_by,snapshot) VALUES(?,?,?,?,?)').bind(id,l.id,c.id,actor,JSON.stringify(snapshot)),
    db.prepare('SELECT * FROM invoices WHERE id=last_insert_rowid()')
  ]);
  return first(batch.at(-1));
}
export async function getManagementDashboard(db){const [available,states,transit,qc,repairs,returns,slow]=await Promise.all([db.prepare("SELECT count(*) units,count(*) FILTER(WHERE available_for_sale_at IS NULL) missing FROM laptops WHERE is_active=1 AND status='available'").first(),db.prepare('SELECT status,count(*) units FROM laptops WHERE is_active=1 GROUP BY status').all(),db.prepare("SELECT count(*) units,COALESCE(sum((purchase_price_rmb+shipping_rmb)*purchase_exchange_rate),0) purchase_value_vnd FROM laptops WHERE status='in_transit'").first(),db.prepare("SELECT count(*) FILTER(WHERE status='waiting_qc') waiting_qc FROM laptops").first(),db.prepare("SELECT count(*) active_jobs,COALESCE(sum(total_cost_vnd),0) accumulated_cost_vnd FROM repair_jobs WHERE status NOT IN ('COMPLETED','CANCELLED')").first(),db.prepare("SELECT count(*) pending FROM supplier_returns WHERE status NOT IN ('REFUNDED','REPLACED','REJECTED','CLOSED','CANCELLED')").first(),db.prepare("SELECT id laptop_id,serial,name model,location,CAST(julianday('now')-julianday(available_for_sale_at) AS INTEGER) age_days FROM laptops WHERE status='available' AND available_for_sale_at IS NOT NULL AND julianday('now')-julianday(available_for_sale_at)>=30 ORDER BY age_days DESC LIMIT 25").all()]);return{generated_at:new Date().toISOString(),thresholds:{warning_days:30,critical_days:60},available:{units:available.units,cost_complete:0,cost_incomplete:0,legacy:0,missing_aging_timestamp:available.missing,known_inventory_cost_vnd:0},aging:[],state_summary:Object.fromEntries(states.results.map(x=>[x.status,x.units])),transit,qc:{waiting_qc:{units:qc.waiting_qc,oldest_age:0},qc_in_progress:{units:0,oldest_age:0},qc_failed:{units:0,oldest_age:0},known_cost_vnd:0},repairs, supplier_returns:returns,slow_moving:slow.results};}
