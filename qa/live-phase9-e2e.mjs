import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';

const raw=await readFile('.env','utf8');
const env=Object.fromEntries(raw.split(/\r?\n/).filter(line=>line.includes('=')&&!line.trim().startsWith('#')).map(line=>{const i=line.indexOf('=');return[line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^["']|["']$/g,'')]}));
const base=env.NEXT_PUBLIC_SUPABASE_URL,anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=env.SUPABASE_SERVICE_ROLE_KEY,app=process.env.APP_URL||'http://localhost:3000';
if(!base||!anon||!service||!env.ADMIN_EMAIL||!env.ADMIN_PASSWORD)throw new Error('Missing Phase 9 live QA environment');
const tag=`TEST-SALESOPS-${Date.now().toString(36).toUpperCase()}`,checks=[],qaUsers=[];
const parse=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return t}};
const check=(name,pass,detail={})=>{checks.push({name,pass:Boolean(pass),...detail});if(!pass)console.error('FAIL',name,detail)};
const must=(name,pass,detail={})=>{check(name,pass,detail);if(!pass)throw new Error(`${name}: ${JSON.stringify(detail)}`)};
const login=async(email,password)=>{const r=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const b=await parse(r);must(`login ${email}`,r.ok,{status:r.status,error:b?.error_description});return b.access_token};
const api=async(path,token,method='GET',body)=>{const r=await fetch(app+path,{method,headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return{ok:r.ok,status:r.status,body:await parse(r)}};
const rest=async(path,method='GET',body,token=service)=>{const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:service,Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json',Prefer:'return=representation'})},body:body===undefined?undefined:JSON.stringify(body)});return{ok:r.ok,status:r.status,body:await parse(r)}};
const post=(action,token,data={})=>api('/api/sales-operations',token,'POST',{action,...data,idempotencyKey:data.idempotencyKey||randomUUID()});
const one=async path=>{const r=await rest(path);must(`REST ${path}`,r.ok,{status:r.status,error:r.body});return r.body[0]};

let admin;
try{
 admin=await login(env.ADMIN_EMAIL,env.ADMIN_PASSWORD);
 for(const role of ['SALES','TECH','TECHNICAL','STAFF']){const password=`Qa!${randomBytes(12).toString('base64url')}9a`,email=`${tag.toLowerCase()}-${role.toLowerCase()}@example.com`;const created=await api('/api/users',admin,'POST',{email,password,name:`${tag}-${role}`,role});must(`create ${role}`,created.ok,{status:created.status,error:created.body?.error});qaUsers.push({role,id:created.body.id,token:await login(email,password)})}
 const byRole=Object.fromEntries(qaUsers.map(user=>[user.role,user]));
 for(const user of qaUsers){for(const table of ['reservations','trade_ins','trade_in_inspections','trade_in_check_items','commissions']){const direct=await rest(`${table}?select=id&limit=1`,'GET',undefined,user.token);check(`${user.role} direct RLS ${table}`,!direct.ok,{status:direct.status})}}
 check('STAFF Phase 9 API denied',(await api('/api/sales-operations?type=trade-ins',byRole.STAFF.token)).status===403);
 check('TECH reservations denied',(await api('/api/sales-operations?type=reservations',byRole.TECH.token)).status===403);
 check('SALES commissions denied',(await api('/api/sales-operations?type=commissions',byRole.SALES.token)).status===403);

 const laptopPayload={serial:`${tag}-RSV`,name:`${tag}-RSV`,category:'TEST-SALESOPS',location:'BAC_NINH',charger_status:'TEST',status:'available',price_rmb:1,exchange_rate:1,import_price_vnd:1,is_locked:false,is_active:true,available_for_sale_at:new Date().toISOString(),condition_note:tag};
 const laptopResult=await rest('laptops','POST',laptopPayload);must('seed sale-ready laptop',laptopResult.ok,{error:laptopResult.body});const laptop=laptopResult.body[0];
 const expiresAt=new Date(Date.now()+86400000).toISOString(),raceKeyA=randomUUID(),raceKeyB=randomUUID();
 const race=await Promise.all([post('createReservation',admin,{laptopId:laptop.id,expiresAt,idempotencyKey:raceKeyA,notes:tag}),post('createReservation',byRole.SALES.token,{laptopId:laptop.id,expiresAt,idempotencyKey:raceKeyB,notes:tag})]);
 check('reservation race exactly one success',race.filter(x=>x.ok).length===1,{statuses:race.map(x=>x.status)});const reservation=race.find(x=>x.ok).body;
 const retry=await post('createReservation',admin,{laptopId:laptop.id,expiresAt,idempotencyKey:reservation.idempotency_key,notes:tag});check('reservation idempotency',retry.ok&&retry.body.id===reservation.id);
 const activeRows=await rest(`reservations?laptop_id=eq.${laptop.id}&status=eq.ACTIVE&select=id`);check('one active reservation',activeRows.ok&&activeRows.body.length===1);
 const competingOrder=await rest('orders','POST',{created_date:new Date().toISOString().slice(0,10),order_status:'pending',payment_status:'unpaid',laptop_id:laptop.id,requested_laptop_id:laptop.id,sale_price:30,debt_amount:30,is_active:true,customer_info:tag});check('active reservation blocks competing order',!competingOrder.ok,{status:competingOrder.status});
 const requestedOnlyOrder=await rest('orders','POST',{created_date:new Date().toISOString().slice(0,10),order_status:'pending',payment_status:'unpaid',requested_laptop_id:laptop.id,sale_price:30,debt_amount:30,is_active:true,customer_info:`${tag}-REQUESTED-ONLY`});check('active reservation blocks requested-only order',!requestedOnlyOrder.ok,{status:requestedOnlyOrder.status,error:requestedOnlyOrder.body});
 const cancelled=await post('cancelReservation',admin,{id:reservation.id});check('reservation cancellation',cancelled.ok&&cancelled.body.status==='CANCELLED');const cancelledRetry=await post('cancelReservation',admin,{id:reservation.id});check('reservation cancel retry safe',cancelledRetry.ok&&cancelledRetry.body.id===reservation.id);

 const account=await one('cash_accounts?is_active=eq.true&currency=eq.VND&select=id&limit=1');
 const depositOrders=await rest('orders','POST',[
  {created_date:new Date().toISOString().slice(0,10),order_status:'pending',payment_status:'unpaid',sale_price:10,amount_paid:0,debt_amount:10,is_active:true,customer_info:`${tag}-PAYMENT-SOURCE`},
  {created_date:new Date().toISOString().slice(0,10),order_status:'pending',payment_status:'unpaid',sale_price:10,amount_paid:0,debt_amount:10,is_active:true,customer_info:`${tag}-RESERVATION-TARGET`}
 ]);must('seed reservation payment orders',depositOrders.ok&&depositOrders.body.length===2,{status:depositOrders.status,error:depositOrders.body});
 const depositPayment=await api('/api/payments',admin,'POST',{orderId:depositOrders.body[0].id,amount:1,paymentType:'deposit',paymentMethod:'transfer_cash',paymentDate:new Date().toISOString().slice(0,10),accountId:account.id,idempotencyKey:randomUUID(),note:tag});must('seed reservation deposit payment',depositPayment.ok,{status:depositPayment.status,error:depositPayment.body});
 const paymentId=depositPayment.body.payment?.id||depositPayment.body.id;
 must('reservation deposit payment has id',Number.isFinite(Number(paymentId)),{body:depositPayment.body});
 const paymentLaptopResult=await rest('laptops','POST',{...laptopPayload,serial:`${tag}-RSV-PAYMENT`,name:`${tag}-RSV-PAYMENT`});must('seed payment integrity laptop',paymentLaptopResult.ok,{error:paymentLaptopResult.body});
 const mismatchedDeposit=await rest('rpc/create_reservation','POST',{p_laptop_id:paymentLaptopResult.body[0].id,p_customer_id:null,p_order_id:depositOrders.body[1].id,p_expires_at:expiresAt,p_deposit_payment_id:paymentId,p_notes:tag,p_user_id:null,p_actor:tag,p_idempotency_key:randomUUID()});check('reservation rejects payment from another order',!mismatchedDeposit.ok,{status:mismatchedDeposit.status,error:mismatchedDeposit.body});

 const createdTrade=await post('createTradeIn',byRole.SALES.token,{brand:'Lenovo',model:tag,serial:`${tag}-TI`,cpu:'i7',ram:'16GB',ssd:'512GB',reportedCondition:'QA live'});must('SALES create trade-in',createdTrade.ok,{status:createdTrade.status,error:createdTrade.body});const trade=createdTrade.body;
 check('SALES cannot inspect', (await post('startInspection',byRole.SALES.token,{id:trade.id})).status===403);
 const started=await post('startInspection',byRole.TECH.token,{id:trade.id,mainboardStatus:'ORIGINAL',findings:'QA'});must('TECH start inspection',started.ok,{error:started.body});
 const empty=await post('completeInspection',byRole.TECH.token,{id:started.body.id,mainboardStatus:'ORIGINAL',findings:'QA',checks:[]});check('empty inspection blocked',!empty.ok,{status:empty.status});
 const checkKeys=['MAINBOARD','DISPLAY','KEYBOARD','BATTERY','SSD','CHARGER','COSMETIC'];
 const completed=await post('completeInspection',byRole.TECHNICAL.token,{id:started.body.id,mainboardStatus:'REPAIRED',findings:'Snapshot QA',checks:checkKeys.map(check_key=>({check_key,result:'PASS',notes:tag}))});check('TECHNICAL complete inspection',completed.ok&&completed.body.status==='COMPLETED',{error:completed.body});
 const technicalView=await api('/api/sales-operations?type=trade-ins',byRole.TECH.token);check('TECH response no financial leakage',technicalView.ok&&!JSON.stringify(technicalView.body).match(/gross_profit|landed_cost|cash_account|commission/i));

 const orderResult=await rest('orders','POST',{created_date:new Date().toISOString().slice(0,10),order_status:'pending',payment_status:'unpaid',sale_price:30,amount_paid:0,debt_amount:30,is_active:true,customer_info:tag});must('seed trade-in order',orderResult.ok,{error:orderResult.body});const order=orderResult.body[0];
 const invalid=await post('acceptTradeIn',admin,{id:trade.id,orderId:order.id,estimatedValueVnd:13000000,agreedValueVnd:0});check('zero agreed value blocked',!invalid.ok);
 const accepted=await post('acceptTradeIn',admin,{id:trade.id,orderId:order.id,estimatedValueVnd:13000000,agreedValueVnd:12000000});must('accept trade-in',accepted.ok,{error:accepted.body});
 const settledOrder=await one(`orders?id=eq.${order.id}&select=sale_price,debt_amount,trade_in_credit_vnd`);check('trade-in credit reduces obligation once',Number(settledOrder.trade_in_credit_vnd)===12000000&&Number(settledOrder.debt_amount)===18);
 const ordinaryEdit=await api('/api/orders',admin,'POST',{id:order.id,createdDate:new Date().toLocaleDateString('en-GB'),orderStatus:'pending',paymentStatus:'paid',salePrice:30,amountPaid:30,debtAmount:0,note:`${tag}-EDIT`});must('ordinary order edit after trade-in',ordinaryEdit.ok,{status:ordinaryEdit.status,error:ordinaryEdit.body});
 const protectedOrder=await one(`orders?id=eq.${order.id}&select=payment_status,amount_paid,debt_amount,trade_in_credit_vnd,note`);check('ordinary edit preserves ledger-owned obligation',protectedOrder.payment_status==='unpaid'&&Number(protectedOrder.amount_paid)===0&&Number(protectedOrder.debt_amount)===18&&Number(protectedOrder.trade_in_credit_vnd)===12000000&&protectedOrder.note===`${tag}-EDIT`,{order:protectedOrder});
 const paid=await api('/api/payments',admin,'POST',{orderId:order.id,amount:5,paymentType:'balance',paymentMethod:'transfer_cash',paymentDate:new Date().toISOString().slice(0,10),accountId:account.id,idempotencyKey:randomUUID(),note:tag});must('payment after trade-in credit',paid.ok,{status:paid.status,error:paid.body});
 const partiallyPaid=await one(`orders?id=eq.${order.id}&select=payment_status,amount_paid,debt_amount,trade_in_credit_vnd`);check('payment reduces only remaining cash obligation',partiallyPaid.payment_status==='deposited'&&Number(partiallyPaid.amount_paid)===5&&Number(partiallyPaid.debt_amount)===13&&Number(partiallyPaid.trade_in_credit_vnd)===12000000,{order:partiallyPaid});
 const cashLeak=await rest(`account_transactions?reference_type=eq.TRADE_IN&select=id`);check('trade-in creates no cash inflow',!cashLeak.ok||cashLeak.body.length===0);
 const mutate=await rest(`trade_ins?id=eq.${trade.id}`,'PATCH',{agreed_value_vnd:10000000});check('agreed value immutable',!mutate.ok,{status:mutate.status});
 const received=await post('receiveTradeIn',admin,{id:trade.id});must('receive trade-in',received.ok&&received.body.status==='RECEIVED',{error:received.body});
 const conversions=await Promise.all([post('convertTradeIn',admin,{id:trade.id,category:'TEST-SALESOPS',location:'BAC_NINH'}),post('convertTradeIn',admin,{id:trade.id,category:'TEST-SALESOPS',location:'BAC_NINH'})]);
 check('conversion concurrency authoritative',conversions.every(x=>x.ok)&&new Set(conversions.map(x=>x.body.id)).size===1,{statuses:conversions.map(x=>x.status)});const inventory=conversions.find(x=>x.ok)?.body;
 if(inventory){check('trade-in inventory locked for QC',inventory.status==='waiting_qc'&&inventory.is_locked===true&&inventory.available_for_sale_at==null);const costs=await rest(`laptop_cost_components?laptop_id=eq.${inventory.id}&cost_type=eq.TRADE_IN_ACQUISITION&select=amount_vnd,source_id`);check('one authoritative acquisition cost',costs.ok&&costs.body.length===1&&Number(costs.body[0].amount_vnd)===12000000);const movement=await rest(`stock_movements?laptop_id=eq.${inventory.id}&movement_type=eq.TRADE_IN_RECEIVE&select=id`);check('one trade-in stock movement',movement.ok&&movement.body.length===1)}

 const passed=checks.filter(x=>x.pass).length;console.log(`PHASE 9 LIVE E2E: PASS ${passed}/${checks.length}`);for(const item of checks)console.log(item.pass?'PASS':'FAIL',item.name,item.status||'');if(passed!==checks.length)process.exitCode=1;
}finally{
 if(admin)for(const user of qaUsers){const result=await api('/api/users',admin,'PUT',{id:user.id,is_active:false});console.log('QA deactivate',user.role,result.status)}
}
