import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const raw=await readFile('.env','utf8');
const env=Object.fromEntries(raw.split(/\r?\n/).filter(x=>x.includes('=')&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const base=env.NEXT_PUBLIC_SUPABASE_URL,anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=env.SUPABASE_SERVICE_ROLE_KEY,app=process.env.APP_URL||'http://localhost:3000';
const stamp=Date.now().toString(36).toUpperCase(),tag=`TEST-COST-${stamp}`,checks=[],accounts=[];
const parse=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return t}};
const ok=(name,value,detail={})=>{checks.push({name,ok:!!value,...detail});assert(value,`${name}: ${JSON.stringify(detail)}`)};
async function login(email,password){const r=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const b=await parse(r);if(!r.ok)throw Error(`Login failed: ${JSON.stringify(b)}`);return b.access_token}
async function api(path,token,method='GET',body){const r=await fetch(app+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{ok:r.ok,status:r.status,body:await parse(r)}}
async function rest(path,method='GET',body,token=service){const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:service,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}),Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});return{ok:r.ok,status:r.status,body:await parse(r)}}
async function rpc(name,body){return rest(`rpc/${name}`,'POST',body)}

const admin=await login(env.ADMIN_EMAIL,env.ADMIN_PASSWORD);
for(const role of ['SALES','TECH','TECHNICAL','STAFF']){
  const password=`Qa!${randomBytes(12).toString('base64url')}9a`,email=`${tag.toLowerCase()}-${role.toLowerCase()}@example.com`;
  const made=await api('/api/users',admin,'POST',{email,password,name:`${tag}-${role}`,role});ok(`create ${role}`,made.ok,{status:made.status,error:made.body?.error});
  accounts.push({role,id:made.body.id,token:await login(email,password)});
}
for(const account of accounts){
  for(const path of ['/api/costs','/api/cost-allocations?shipmentId=1']){const r=await api(path,account.token);ok(`${account.role} ${path} denied`,r.status===403,{status:r.status})}
  for(const table of ['laptop_cost_components','cost_allocations','cost_allocation_items']){const r=await rest(`${table}?select=*&limit=1`,'GET',undefined,account.token);ok(`${account.role} RLS ${table}`,!r.ok,{status:r.status})}
  for(const path of ['/api/inventory',...(account.role==='SALES'?['/api/orders?all=true']:[]),...(['TECH','TECHNICAL'].includes(account.role)?['/api/qc','/api/repairs']:[])]){const r=await api(path,account.token);const text=JSON.stringify(r.body);ok(`${account.role} no Phase 6 leakage via ${path}`,!r.ok||!/purchase_cost_vnd|landed_cost_vnd|cost_snapshot_vnd|gross_profit_snapshot_vnd|cost components|cost_allocations/i.test(text),{status:r.status})}
}
let r=await api('/api/costs',admin);ok('ADMIN cost API',r.ok,{status:r.status,error:r.body?.error});

const supplier=(await rest('suppliers','POST',{code:`TC${stamp}`.slice(0,40),name:`${tag}-SUPPLIER`,created_by:tag})).body[0];
const batch=(await rest('purchase_batches','POST',{batch_code:`${tag}-PO`,supplier_id:supplier.id,purchase_date:new Date().toISOString().slice(0,10),exchange_rate:3500,subtotal_rmb:15000,status:'CONFIRMED',created_by:tag,updated_by:tag})).body[0];
const items=[];for(let i=1;i<=3;i++)items.push((await rest('purchase_items','POST',{purchase_batch_id:batch.id,model:`${tag}-MODEL-${i}`,serial:`${tag}-SER-${i}`,purchase_price_rmb:5000,status:'RECEIVED'})).body[0]);
const laptops=[];for(const [i,item] of items.entries()){const laptop=(await rest('laptops','POST',{serial:item.serial,name:item.model,category:'TEST-COST',location:'BAC_NINH',charger_status:'with_charger',status:'available',price_rmb:5000,exchange_rate:3500,import_price_vnd:17.5,is_locked:false,is_active:true,purchase_item_id:item.id,condition_note:tag})).body[0];laptops.push(laptop);await rest(`purchase_items?id=eq.${item.id}`,'PATCH',{laptop_id:laptop.id})}
const shipment=(await rest('shipments','POST',{shipment_code:`${tag}-SH`,origin_location:'SUPPLIER',destination_location:'BAC_NINH',carrier:'TEST',tracking_number:`${tag}-TRACK`,status:'RECEIVED',shipping_cost_vnd:1000000,notes:tag,created_by:tag,updated_by:tag,received_at:new Date().toISOString()})).body[0];
for(const [i,item] of items.entries())await rest('shipment_items','POST',{shipment_id:shipment.id,purchase_item_id:item.id,laptop_id:laptops[i].id,status:'RECEIVED',received_at:new Date().toISOString()});

for(const laptop of laptops){r=await api(`/api/costs?laptopId=${laptop.id}`,admin);ok('purchase cost derived',r.ok&&Number(r.body.summary.purchase_cost_vnd)===17500000,{body:r.body});await api(`/api/costs?laptopId=${laptop.id}`,admin)}
const purchaseRows=(await rest(`laptop_cost_components?laptop_id=in.(${laptops.map(x=>x.id).join(',')})&cost_type=eq.PURCHASE&select=id`)).body;ok('purchase source idempotency',purchaseRows.length===3,{count:purchaseRows.length});
const allocationPayload={shipmentId:shipment.id,costType:'VN_SHIPPING',method:'EQUAL',idempotencyKey:`${tag}-ALLOC-EQUAL`,items:[]};
const concurrent=await Promise.all([api('/api/cost-allocations',admin,'POST',allocationPayload),api('/api/cost-allocations',admin,'POST',allocationPayload)]);ok('allocation concurrent retry authoritative',concurrent.every(x=>x.ok)&&concurrent[0].body.id===concurrent[1].body.id,{statuses:concurrent.map(x=>x.status)});
const allocationId=concurrent[0].body.id,allocated=(await rest(`cost_allocation_items?cost_allocation_id=eq.${allocationId}&select=shipment_item_id,laptop_id,amount_vnd&order=shipment_item_id.asc`)).body;
ok('equal allocation exact sum',allocated.reduce((s,x)=>s+Number(x.amount_vnd),0)===1000000,{amounts:allocated.map(x=>x.amount_vnd)});ok('deterministic remainder',allocated.map(x=>Number(x.amount_vnd)).join(',')==='333334,333333,333333',{amounts:allocated.map(x=>x.amount_vnd)});
const duplicateSource=await api('/api/cost-allocations',admin,'POST',{shipmentId:shipment.id,costType:'CN_SHIPPING',method:'EQUAL',idempotencyKey:`${tag}-ALLOC-SECOND-SOURCE`,items:[]});ok('same shipment source cannot be allocated twice',!duplicateSource.ok,{status:duplicateSource.status,error:duplicateSource.body?.error});

const manualBatch=(await rest('purchase_batches','POST',{batch_code:`${tag}-MANUAL-PO`,supplier_id:supplier.id,purchase_date:new Date().toISOString().slice(0,10),exchange_rate:3500,subtotal_rmb:3000,status:'CONFIRMED',created_by:tag,updated_by:tag})).body[0];
const manualItems=[],manualLaptops=[];
for(let i=1;i<=3;i++){
  const item=(await rest('purchase_items','POST',{purchase_batch_id:manualBatch.id,model:`${tag}-MANUAL-${i}`,serial:`${tag}-MANUAL-SER-${i}`,purchase_price_rmb:1000,status:'RECEIVED'})).body[0];manualItems.push(item);
  const laptop=(await rest('laptops','POST',{serial:item.serial,name:item.model,category:'TEST-COST',location:'BAC_NINH',charger_status:'with_charger',status:'waiting_qc',price_rmb:1000,exchange_rate:3500,import_price_vnd:3.5,is_locked:true,is_active:true,purchase_item_id:item.id,condition_note:tag})).body[0];manualLaptops.push(laptop);await rest(`purchase_items?id=eq.${item.id}`,'PATCH',{laptop_id:laptop.id});
}
const manualShipment=(await rest('shipments','POST',{shipment_code:`${tag}-MANUAL-SH`,origin_location:'SUPPLIER',destination_location:'BAC_NINH',status:'RECEIVED',shipping_cost_vnd:1000000,notes:tag,created_by:tag,updated_by:tag,received_at:new Date().toISOString()})).body[0];
for(const [i,item] of manualItems.entries())await rest('shipment_items','POST',{shipment_id:manualShipment.id,purchase_item_id:item.id,laptop_id:manualLaptops[i].id,status:'RECEIVED',received_at:new Date().toISOString()});
const shipItems=(await rest(`shipment_items?shipment_id=eq.${manualShipment.id}&select=id,laptop_id&order=id.asc`)).body;
const invalid=await api('/api/cost-allocations',admin,'POST',{shipmentId:manualShipment.id,costType:'CN_SHIPPING',method:'MANUAL',idempotencyKey:`${tag}-ALLOC-BAD`,items:shipItems.map((x,i)=>({shipmentItemId:x.id,laptopId:x.laptop_id,amountVnd:[500000,300000,100000][i]}))});ok('invalid manual total blocked',!invalid.ok,{status:invalid.status,error:invalid.body?.error});
const manual=await api('/api/cost-allocations',admin,'POST',{shipmentId:manualShipment.id,costType:'CN_SHIPPING',method:'MANUAL',idempotencyKey:`${tag}-ALLOC-MANUAL`,items:shipItems.map((x,i)=>({shipmentItemId:x.id,laptopId:x.laptop_id,amountVnd:[500000,300000,200000][i]}))});ok('manual allocation exact',manual.ok,{status:manual.status,error:manual.body?.error});
const mutateAllocation=await rest(`cost_allocations?id=eq.${allocationId}`,'PATCH',{source_amount_vnd:1});ok('allocation immutable',!mutateAllocation.ok,{status:mutateAllocation.status});
const mutateShipment=await rest(`shipments?id=eq.${shipment.id}`,'PATCH',{shipping_cost_vnd:2});ok('shipment source immutable',!mutateShipment.ok,{status:mutateShipment.status,error:mutateShipment.body});

const repair=(await rest('repair_jobs','POST',{repair_code:`${tag}-REP`,laptop_id:laptops[0].id,source_type:'INTERNAL',status:'COMPLETED',reported_issue:tag,diagnosis:tag,repair_plan:tag,resolution:tag,priority:'NORMAL',completed_at:new Date().toISOString(),labor_cost_vnd:700000,parts_cost_vnd:0,requires_re_qc:true,idempotency_key:`${tag}-REP-START`,completion_idempotency_key:`${tag}-REP-DONE`,created_by:tag,outcome:'REPAIRED',recommended_action:'RE_QC'})).body[0];
await api(`/api/costs?laptopId=${laptops[0].id}`,admin);await api(`/api/costs?laptopId=${laptops[0].id}`,admin);
const repairComponents=(await rest(`laptop_cost_components?laptop_id=eq.${laptops[0].id}&source_type=eq.REPAIR_JOB&source_id=eq.${repair.id}&select=amount_vnd`)).body;ok('repair sync idempotent',repairComponents.length===1&&Number(repairComponents[0].amount_vnd)===700000,{repairComponents});
const add={action:'add',laptopId:laptops[0].id,costType:'RAM_UPGRADE',amountVnd:500000,description:tag,idempotencyKey:`${tag}-RAM`};const added=await api('/api/costs',admin,'POST',add),addedRetry=await api('/api/costs',admin,'POST',add);ok('manual component idempotent',added.ok&&added.body.id===addedRetry.body.id,{status:added.status});
const negative=await api('/api/costs',admin,'POST',{...add,amountVnd:-1,idempotencyKey:`${tag}-NEG`});ok('negative manual cost blocked',!negative.ok,{status:negative.status});
r=await api(`/api/costs?laptopId=${laptops[0].id}`,admin);const componentTotal=r.body.components.filter(x=>!x.voided_at).reduce((s,x)=>s+(x.cost_type==='REFUND_CREDIT'?-1:1)*Number(x.amount_vnd),0);ok('breakdown reconciles landed cost',componentTotal===Number(r.body.summary.landed_cost_vnd),{componentTotal,landed:r.body.summary.landed_cost_vnd});ok('cost complete',r.body.summary.cost_status==='COMPLETE',{summary:r.body.summary});

const replacementBatch=(await rest('purchase_batches','POST',{batch_code:`${tag}-REPL-PO`,supplier_id:supplier.id,purchase_date:new Date().toISOString().slice(0,10),exchange_rate:3500,subtotal_rmb:0,status:'CONFIRMED',created_by:tag,updated_by:tag})).body[0];
const replacementItem=(await rest('purchase_items','POST',{purchase_batch_id:replacementBatch.id,model:`${tag}-REPLACEMENT`,serial:`${tag}-REPL-SER`,purchase_price_rmb:0,status:'RECEIVED'})).body[0];
const replacement=(await rest('laptops','POST',{serial:replacementItem.serial,name:replacementItem.model,category:'TEST-COST',location:'BAC_NINH',charger_status:'with_charger',status:'available',price_rmb:0,exchange_rate:3500,import_price_vnd:0,is_locked:false,is_active:true,purchase_item_id:replacementItem.id,condition_note:tag})).body[0];await rest(`purchase_items?id=eq.${replacementItem.id}`,'PATCH',{laptop_id:replacement.id});
const replacementShipment=(await rest('shipments','POST',{shipment_code:`${tag}-REPL-SH`,origin_location:'SUPPLIER',destination_location:'BAC_NINH',status:'RECEIVED',shipping_cost_vnd:250000,notes:tag,created_by:tag,updated_by:tag,received_at:new Date().toISOString()})).body[0];
await rest('shipment_items','POST',{shipment_id:replacementShipment.id,purchase_item_id:replacementItem.id,laptop_id:replacement.id,status:'RECEIVED',received_at:new Date().toISOString()});
await api('/api/cost-allocations',admin,'POST',{shipmentId:replacementShipment.id,costType:'VN_SHIPPING',method:'EQUAL',idempotencyKey:`${tag}-REPL-ALLOC`,items:[]});
await rest('repair_jobs','POST',{repair_code:`${tag}-REPL-REP`,laptop_id:replacement.id,source_type:'INTERNAL',status:'COMPLETED',reported_issue:tag,resolution:tag,priority:'NORMAL',completed_at:new Date().toISOString(),labor_cost_vnd:300000,parts_cost_vnd:0,requires_re_qc:true,idempotency_key:`${tag}-REPL-REP-S`,completion_idempotency_key:`${tag}-REPL-REP-C`,created_by:tag,outcome:'REPAIRED',recommended_action:'RE_QC'});
r=await api(`/api/costs?laptopId=${replacement.id}`,admin);ok('replacement no original-cost duplication',Number(r.body.summary.purchase_cost_vnd)===0&&Number(r.body.summary.landed_cost_vnd)===550000,{summary:r.body.summary});

const legacy=(await rest('laptops','POST',{serial:`${tag}-LEGACY`,name:`${tag}-LEGACY`,category:'TEST-COST',location:'store',charger_status:'with_charger',status:'available',price_rmb:0,exchange_rate:1,import_price_vnd:0,is_locked:false,is_active:true,condition_note:tag})).body[0];
r=await api(`/api/costs?laptopId=${legacy.id}`,admin);ok('legacy handled',r.ok&&r.body.summary.cost_status==='LEGACY',{summary:r.body.summary});
const malicious=await api('/api/orders',admin,'POST',{monthKey:'09/2026',createdDate:'21/09/2026',orderType:'retail',orderStatus:'new',paymentStatus:'unpaid',salePrice:22,laptopId:laptops[0].id,requestedLaptopId:laptops[0].id,isActive:true,costSnapshotVnd:1,grossProfitSnapshotVnd:1});ok('client snapshot tampering blocked',malicious.status===400,{status:malicious.status,error:malicious.body?.error});
const orderCreate=await api('/api/orders',admin,'POST',{monthKey:'09/2026',createdDate:'21/09/2026',orderType:'retail',orderStatus:'new',paymentStatus:'unpaid',salePrice:22,creditCardFee:.5,laptopId:laptops[0].id,requestedLaptopId:laptops[0].id,isActive:true});ok('available sale starts',orderCreate.ok,{status:orderCreate.status,error:orderCreate.body?.error});
const order=orderCreate.body.order||orderCreate.body;const commit=await api('/api/orders',admin,'POST',{...order,id:order.id,orderStatus:'prepared',salePrice:22,creditCardFee:.5,laptopId:laptops[0].id,requestedLaptopId:laptops[0].id,isActive:true});ok('sale commitment',commit.ok,{status:commit.status,error:commit.body?.error});
const snapshot=(await rest(`orders?id=eq.${order.id}&select=cost_snapshot_vnd,gross_profit_snapshot_vnd,direct_cost_snapshot_vnd,net_contribution_snapshot_vnd,cost_snapshot_status,profit_vnd`)).body[0];ok('sale snapshot derived',Number(snapshot.gross_profit_snapshot_vnd)===22000000-Number(snapshot.cost_snapshot_vnd)&&Number(snapshot.direct_cost_snapshot_vnd)===500000,{snapshot});
await api('/api/costs',admin,'POST',{action:'add',laptopId:laptops[0].id,costType:'CLEANING',amountVnd:100000,description:`${tag}-AFTER-SALE`,idempotencyKey:`${tag}-AFTER-SALE`});
const frozen=(await rest(`orders?id=eq.${order.id}&select=cost_snapshot_vnd,gross_profit_snapshot_vnd`)).body[0];ok('historical snapshot frozen',String(frozen.cost_snapshot_vnd)===String(snapshot.cost_snapshot_vnd)&&String(frozen.gross_profit_snapshot_vnd)===String(snapshot.gross_profit_snapshot_vnd),{snapshot,frozen});
const directSnapshot=await rest(`orders?id=eq.${order.id}`,'PATCH',{cost_snapshot_vnd:1});ok('snapshot DB immutable',!directSnapshot.ok,{status:directSnapshot.status});
const salesOrders=await api('/api/orders?all=true',accounts.find(x=>x.role==='SALES').token);ok('SALES order response sanitized',salesOrders.ok&&!/costSnapshot|grossProfit|netContribution|cost_snapshot|gross_profit|net_contribution/i.test(JSON.stringify(salesOrders.body)),{status:salesOrders.status});
const logs=(await rest(`activity_logs?or=(entity_type.eq.LAPTOP_COST,entity_type.eq.COST_ALLOCATION,entity_type.eq.ORDER)&select=entity_type,entity_id,action,changes,user_name&order=created_at.desc&limit=200`)).body.filter(x=>JSON.stringify(x).includes(tag)||Number(x.changes?.laptop_id)===Number(laptops[0].id)||Number(x.changes?.shipment_id)===Number(shipment.id)||x.entity_id===allocationId);
ok('cost activity logs',logs.some(x=>x.changes?.event==='COST_COMPONENT_ADDED')&&logs.some(x=>x.changes?.event==='COST_ALLOCATION_FINALIZED')&&logs.some(x=>x.changes?.event==='COST_SNAPSHOT_CREATED'),{events:logs.map(x=>x.changes?.event).filter(Boolean)});
for(const account of accounts)await api('/api/users',admin,'POST',{id:account.id,isActive:false});
console.log(JSON.stringify({tag,checksPassed:checks.length,checks,ids:{supplier:supplier.id,batch:batch.id,shipment:shipment.id,laptops:laptops.map(x=>x.id),replacement:replacement.id,order:order.id}},null,2));
