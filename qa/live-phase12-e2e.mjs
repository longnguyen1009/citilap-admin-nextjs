import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const envText=await readFile('.env','utf8');
const env=Object.fromEntries(envText.split(/\r?\n/).filter(x=>x&&!x.trim().startsWith('#')&&x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const supa=env.NEXT_PUBLIC_SUPABASE_URL, anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service=env.SUPABASE_SERVICE_ROLE_KEY, app='http://localhost:3000';
if(!supa||!anon||!service||!env.ADMIN_EMAIL||!env.ADMIN_PASSWORD) throw new Error('Missing live environment settings');
const stamp=Date.now().toString(36).toUpperCase(), tag=`TEST-LIVE-${stamp}`;
const report={tag,checks:[],ids:{},cleanup:{}};
const check=(name,ok,detail={})=>{report.checks.push({name,ok:Boolean(ok),...detail});if(!ok)throw new Error(`CHECK FAILED: ${name} ${JSON.stringify(detail)}`)};
const parse=async r=>{const t=await r.text();try{return t?JSON.parse(t):null}catch{return t}};
async function login(email,password){const r=await fetch(`${supa}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const b=await parse(r);if(!r.ok)throw new Error(`Login ${r.status}: ${JSON.stringify(b)}`);return b.access_token}
async function api(path,token,{method='GET',body}={}){const r=await fetch(app+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,ok:r.ok,body:await parse(r)}}
async function rest(path,{method='GET',body,prefer='return=representation'}={}){const r=await fetch(`${supa}/rest/v1/${path}`,{method,headers:{apikey:service,Authorization:`Bearer ${service}`,...(body?{'Content-Type':'application/json'}:{}),Prefer:prefer},body:body?JSON.stringify(body):undefined});return {status:r.status,ok:r.ok,body:await parse(r),range:r.headers.get('content-range')}}

const admin=await login(env.ADMIN_EMAIL,env.ADMIN_PASSWORD); check('ADMIN real login',true);
const roles=['SALES','TECH','TECHNICAL','STAFF'], accounts=[];
for(const role of roles){const password=`Qa!${randomBytes(12).toString('base64url')}9a`;const email=`test-live-${role.toLowerCase()}-${stamp.toLowerCase()}@example.com`;const made=await api('/api/users',admin,{method:'POST',body:{email,password,name:`${tag}-${role}`,role}});check(`create ${role} auth account`,made.status===200||made.status===201,{status:made.status,error:made.body?.error});const token=await login(email,password);accounts.push({role,id:made.body.id,email,password,token});const denied=await api('/api/suppliers',token);check(`${role} procurement denied server-side`,denied.status===403,{status:denied.status});const spoof=await api('/api/suppliers',token,{method:'POST',body:{role:'ADMIN',code:`${tag}-${role}`.slice(0,40),name:'spoof'}});check(`${role} cannot self-elevate payload`,spoof.status===403,{status:spoof.status});}

const supplierBase={code:`TL${stamp}`.slice(0,40),name:`${tag}-SUPPLIER-A`,display_name:tag,preferred_shipping_destination:'YUNNAN',notes:`${tag} live E2E`,active:true};
let x=await api('/api/suppliers',admin,{method:'POST',body:supplierBase});check('supplier create',x.status===201,{status:x.status,error:x.body?.error});const supplierA=x.body;report.ids.supplierA=supplierA.id;
x=await api('/api/suppliers',admin,{method:'POST',body:{...supplierBase,id:supplierA.id,name:`${tag}-SUPPLIER-A-EDIT`,active:false}});check('supplier edit/deactivate',x.ok&&!x.body.active,{status:x.status});
x=await api('/api/suppliers',admin,{method:'POST',body:{...supplierBase,id:supplierA.id,name:`${tag}-SUPPLIER-A-EDIT`,active:true}});check('supplier reactivate',x.ok&&x.body.active,{status:x.status});
x=await api('/api/suppliers',admin);check('supplier read/search source',x.ok&&x.body.some(s=>s.id===supplierA.id&&s.name.includes(tag)),{status:x.status});
x=await api('/api/suppliers',admin,{method:'POST',body:{...supplierBase,code:`TB${stamp}`.slice(0,40),name:`${tag}-SUPPLIER-B`}});check('supplier B create',x.status===201,{status:x.status});const supplierB=x.body;report.ids.supplierB=supplierB.id;

const purchaseDate=new Date().toISOString().slice(0,10), idemPurchase=`${tag}-PURCHASE`;
const items=[1,2,3,4].map(n=>({brand:'TEST',model:`${tag}-MODEL-${n}`,serial:n===1?`${tag}-SERIAL-1`:'',purchase_price_rmb:5000,condition:'TEST',notes:tag}));
const batch={supplier_id:supplierA.id,purchase_date:purchaseDate,exchange_rate:3600,domestic_shipping_rmb:0,other_cost_rmb:0,destination:'YUNNAN',notes:tag};
x=await api('/api/purchases',admin,{method:'POST',body:{action:'create',batch,items,idempotencyKey:idemPurchase}});check('purchase draft create',x.status===201,{status:x.status,error:x.body?.error});const purchase=x.body;report.ids.purchase=purchase.id;
const replay=await api('/api/purchases',admin,{method:'POST',body:{action:'create',batch,items,idempotencyKey:idemPurchase}});check('purchase create idempotency',replay.ok&&replay.body.id===purchase.id,{status:replay.status});
let detail=await api(`/api/purchases?id=${purchase.id}`,admin);check('purchase exactly four items',detail.ok&&detail.body.items.length===4,{count:detail.body?.items?.length});
const three=items.slice(0,3);x=await api('/api/purchases',admin,{method:'POST',body:{action:'update',id:purchase.id,batch,items:three}});check('draft remove item',x.ok);
x=await api('/api/purchases',admin,{method:'POST',body:{action:'update',id:purchase.id,batch,items}});check('draft re-add item',x.ok);
const dupItems=items.map((v,i)=>({...v,serial:i<2?`${tag}-DUP`:v.serial}));x=await api('/api/purchases',admin,{method:'POST',body:{action:'update',id:purchase.id,batch,items:dupItems}});check('duplicate serial blocked',!x.ok,{status:x.status});
detail=await api(`/api/purchases?id=${purchase.id}`,admin);check('failed duplicate update rolled back',detail.body.items.length===4&&detail.body.items[0].serial===`${tag}-SERIAL-1`);
x=await api('/api/purchases',admin,{method:'POST',body:{action:'confirm',id:purchase.id}});check('purchase confirm',x.ok&&x.body.status==='CONFIRMED',{status:x.status,error:x.body?.error});
detail=await api(`/api/purchases?id=${purchase.id}`,admin);const pitems=detail.body.items;report.ids.purchaseItems=pitems.map(i=>i.id);
x=await rest(`purchase_items?id=eq.${pitems[0].id}`,{method:'PATCH',body:{purchase_price_rmb:4999}});check('confirmed item price immutable in DB',!x.ok,{status:x.status});
x=await rest(`purchase_batches?id=eq.${purchase.id}`,{method:'PATCH',body:{domestic_shipping_rmb:1}});check('confirmed batch cost immutable in DB',!x.ok,{status:x.status});

const finBefore=await rest('financial_records?select=id');
const pay=(amount,key,method)=>api('/api/supplier-payments',admin,{method:'POST',body:{purchaseBatchId:purchase.id,amountRmb:amount,exchangeRate:3600,paymentMethod:method,paymentDate:purchaseDate,reference:tag,notes:tag,idempotencyKey:key}});
const pay1=await pay(8000,`${tag}-PAY-1`,'WECHAT');check('supplier payment 8000',pay1.status===201,{status:pay1.status,error:pay1.body?.error});
const pay2=await pay(4000,`${tag}-PAY-2`,'ALIPAY');check('supplier payment 4000',pay2.status===201,{status:pay2.status,error:pay2.body?.error});
const pay2Again=await pay(4000,`${tag}-PAY-2`,'ALIPAY');check('payment idempotency',pay2Again.ok&&pay2Again.body.id===pay2.body.id,{status:pay2Again.status});
detail=await api(`/api/purchases?id=${purchase.id}`,admin);check('paid/debt derived by DB',Number(detail.body.batch.paid_rmb)===12000&&Number(detail.body.batch.debt_rmb)===8000,{paid:detail.body.batch.paid_rmb,debt:detail.body.batch.debt_rmb});
const over=await pay(9000,`${tag}-OVERPAY`,'BANK_TRANSFER');check('overpayment blocked',!over.ok,{status:over.status});
const mismatch=await rest('supplier_payments',{method:'POST',body:{supplier_id:supplierB.id,purchase_batch_id:purchase.id,amount_rmb:1,amount_vnd:3600,exchange_rate:3600,payment_method:'CASH',reference:tag,payment_date:purchaseDate,notes:tag,recorded_by:tag,idempotency_key:`${tag}-MISMATCH`}});check('supplier mismatch blocked by DB',!mismatch.ok,{status:mismatch.status});
const mutatePay=await rest(`supplier_payments?id=eq.${pay1.body.id}`,{method:'PATCH',body:{amount_rmb:1}});check('supplier ledger UPDATE blocked',!mutatePay.ok,{status:mutatePay.status});
const deletePay=await rest(`supplier_payments?id=eq.${pay1.body.id}`,{method:'DELETE'});check('supplier ledger DELETE blocked',!deletePay.ok,{status:deletePay.status});
const finAfter=await rest('financial_records?select=id');check('supplier payments create no financial_records side effect',finAfter.body.length===finBefore.body.length,{before:finBefore.body.length,after:finAfter.body.length});

const shipmentBody={origin_location:'TEST-LIVE-SUPPLIER',destination_location:'BAC_NINH',carrier:'TEST-LIVE-CARRIER',tracking_number:`${tag}-TRACK`,expected_arrival_at:purchaseDate,shipping_cost_rmb:10,shipping_cost_vnd:36000,notes:tag};
x=await api('/api/shipments',admin,{method:'POST',body:{action:'create',shipment:shipmentBody,purchaseItemIds:pitems.slice(0,2).map(i=>i.id),idempotencyKey:`${tag}-SHIP-A`}});check('shipment create',x.status===201,{status:x.status,error:x.body?.error});const shipment=x.body;report.ids.shipment=shipment.id;
const shipReplay=await api('/api/shipments',admin,{method:'POST',body:{action:'create',shipment:shipmentBody,purchaseItemIds:pitems.slice(0,2).map(i=>i.id),idempotencyKey:`${tag}-SHIP-A`}});check('shipment create idempotency',shipReplay.ok&&shipReplay.body.id===shipment.id);
const conflict=await api('/api/shipments',admin,{method:'POST',body:{action:'create',shipment:{...shipmentBody,tracking_number:`${tag}-CONFLICT`},purchaseItemIds:[pitems[0].id],idempotencyKey:`${tag}-SHIP-CONFLICT`}});check('purchase item cannot be in two active shipments',!conflict.ok,{status:conflict.status});
for(const target of ['READY','IN_TRANSIT','AT_CHINA_WAREHOUSE','IN_TRANSIT_VN']){x=await api('/api/shipments',admin,{method:'POST',body:{action:'transition',id:shipment.id,target}});check(`shipment transition ${target}`,x.ok&&x.body.status===target,{status:x.status,error:x.body?.error})}
const search=await api(`/api/shipments?search=${encodeURIComponent(`${tag}-TRACK`)}`,admin);check('tracking search',search.ok&&search.body.some(s=>s.id===shipment.id));
const receiveKey=`${tag}-RECEIVE-1`;const receiveBody={action:'receive',shipmentId:shipment.id,idempotencyKey:receiveKey,notes:tag,items:[{purchase_item_id:pitems[0].id,received:true,actual_serial:`${tag}-ACTUAL-1`,actual_model:`${tag}-WRONG-MODEL`,physical_condition:'damaged package',charger_present:false},{purchase_item_id:pitems[1].id,received:false,actual_serial:'',actual_model:pitems[1].model,physical_condition:'',charger_present:true}],exceptions:[{type:'DAMAGED_PACKAGE',purchase_item_id:pitems[0].id,description:tag}]};
x=await api('/api/receiving',admin,{method:'POST',body:receiveBody});check('partial receiving',x.status===201,{status:x.status,error:x.body?.error});const session1=x.body;report.ids.receiving1=session1.id;
const receiveReplay=await api('/api/receiving',admin,{method:'POST',body:receiveBody});check('receiving idempotency',receiveReplay.ok&&receiveReplay.body.id===session1.id);
let shipDetail=await api(`/api/shipments?id=${shipment.id}`,admin);check('shipment partially received',shipDetail.body.shipment.status==='PARTIALLY_RECEIVED'&&Number(shipDetail.body.shipment.received_quantity)===1,{status:shipDetail.body.shipment.status});
x=await api('/api/receiving',admin,{method:'POST',body:{action:'receive',shipmentId:shipment.id,idempotencyKey:`${tag}-RECEIVE-2`,notes:tag,items:[{purchase_item_id:pitems[1].id,received:true,actual_serial:`${tag}-ACTUAL-2`,actual_model:pitems[1].model,physical_condition:'received',charger_present:true}],exceptions:[]}});check('receive remaining item',x.status===201,{status:x.status,error:x.body?.error});
shipDetail=await api(`/api/shipments?id=${shipment.id}`,admin);check('shipment fully received',shipDetail.body.shipment.status==='RECEIVED'&&Number(shipDetail.body.shipment.received_quantity)===2,{status:shipDetail.body.shipment.status});
const duplicateReceive=await api('/api/receiving',admin,{method:'POST',body:{...receiveBody,idempotencyKey:`${tag}-RECEIVE-DUP`,items:[receiveBody.items[0]]}});check('double receive with new key blocked',!duplicateReceive.ok,{status:duplicateReceive.status});
const receivedItems=await rest(`purchase_items?id=in.(${pitems[0].id},${pitems[1].id})&select=id,laptop_id,status`);const laptopIds=receivedItems.body.map(i=>i.laptop_id);check('purchase lineage linked to laptops',receivedItems.body.length===2&&laptopIds.every(Boolean)&&receivedItems.body.every(i=>i.status==='RECEIVED'));
const laptops=await rest(`laptops?id=in.(${laptopIds.join(',')})&select=id,status,is_locked,purchase_item_id`);check('received laptops wait for QC',laptops.body.length===2&&laptops.body.every(l=>l.status==='waiting_qc'&&l.is_locked));
const movements=await rest(`stock_movements?reference_type=eq.RECEIVING_SESSION&reference_id=in.(${session1.id},${x.body.id})&select=id,laptop_id,movement_type`);check('receiving creates one stock movement per laptop',movements.body.length===2&&movements.body.every(m=>m.movement_type==='PURCHASE_RECEIVE'),{count:movements.body.length});
const blockedApi=await api('/api/orders',admin,{method:'POST',body:{monthKey:'09/2026',createdDate:'20/09/2026',orderType:'retail',orderStatus:'new',paymentStatus:'unpaid',salePrice:1,laptopId:laptopIds[0],requestedLaptopId:laptopIds[0],isActive:true}});check('Orders API blocks waiting_qc laptop',blockedApi.status===409,{status:blockedApi.status,error:blockedApi.body?.error});
const blockedDb=await rest('orders',{method:'POST',body:{month_key:'09/2026',created_date:purchaseDate,order_type:'retail',order_status:'new',payment_status:'unpaid',sale_price:1,laptop_id:laptopIds[0],requested_laptop_id:laptopIds[0],is_active:true}});check('DB trigger blocks waiting_qc API bypass',!blockedDb.ok&&JSON.stringify(blockedDb.body).includes('chưa sẵn sàng'),{status:blockedDb.status,error:blockedDb.body?.message});
const openException=shipDetail.body.exceptions.find(e=>e.status==='OPEN');if(openException){x=await api('/api/receiving',admin,{method:'POST',body:{action:'resolve',exceptionId:openException.id,status:'RESOLVED'}});check('resolve receiving exception',x.ok&&x.body.status==='RESOLVED',{status:x.status})}
const logs=await rest('activity_logs?select=entity_type,entity_id,action,user_name&order=created_at.desc&limit=1000');
const expectedAudit=new Map([['SUPPLIER',String(supplierA.id)],['SUPPLIER_PAYMENT',String(pay1.body.id)],['SHIPMENT',String(shipment.id)],['RECEIVING_SESSION',String(session1.id)]]);
const matchedAudit=[...expectedAudit].filter(([type,id])=>logs.body.some(l=>l.entity_type===type&&String(l.entity_id)===id));
check('activity audit rows exist',logs.ok&&matchedAudit.length===expectedAudit.size,{matched:matchedAudit.map(([type])=>type),expected:[...expectedAudit.keys()]});

for(const account of accounts){const off=await api('/api/users',admin,{method:'PUT',body:{id:account.id,is_active:false}});check(`deactivate ${account.role} QA account`,off.ok,{status:off.status});const inactive=await api('/api/suppliers',account.token);check(`${account.role} inactive token rejected`,inactive.status===401,{status:inactive.status});report.cleanup[account.role]='deactivated'}
report.summary={passed:report.checks.filter(c=>c.ok).length,failed:report.checks.filter(c=>!c.ok).length,supplierPaymentLedgerEntries:2,financialRecordSideEffects:0,testDataRetained:true};
console.log(JSON.stringify(report,null,2));
