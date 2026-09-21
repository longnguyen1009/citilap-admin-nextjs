import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const raw=await readFile('.env','utf8');
const env=Object.fromEntries(raw.split(/\r?\n/).filter(x=>x.includes('=')&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] }));
const base=env.NEXT_PUBLIC_SUPABASE_URL,anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=env.SUPABASE_SERVICE_ROLE_KEY,app=process.env.APP_URL||'http://localhost:3000';
const stamp=Date.now().toString(36).toUpperCase(),tag=`TEST-AGING-${stamp}`,checks=[],accounts=[];
const parse=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return t}};
const ok=(name,value,detail={})=>{checks.push({name,ok:!!value,...detail});assert(value,`${name}: ${JSON.stringify(detail)}`)};
async function login(email,password){const r=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const b=await parse(r);if(!r.ok)throw Error(`Login failed: ${JSON.stringify(b)}`);return b.access_token}
async function api(path,token){const r=await fetch(app+path,{headers:{Authorization:`Bearer ${token}`}});return{ok:r.ok,status:r.status,body:await parse(r)}}
async function rest(path,method='GET',body,token=service){const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:service,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}),Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});return{ok:r.ok,status:r.status,body:await parse(r)}}
const bucket=(data,key)=>data.aging.find(x=>x.bucket_key===key)?.units||0;
const daysAgo=days=>new Date(Date.now()-days*86400000).toISOString();

const admin=await login(env.ADMIN_EMAIL,env.ADMIN_PASSWORD);
const beforeApi=await api('/api/management-dashboard',admin);ok('ADMIN management API',beforeApi.ok,{status:beforeApi.status,error:beforeApi.body?.error});
const before=beforeApi.body;ok('dashboard contract',before.available&&before.transit&&before.qc&&before.repairs&&before.supplier_returns&&Array.isArray(before.aging)&&Array.isArray(before.slow_moving),{keys:Object.keys(before)});
ok('thresholds centralized',before.thresholds.warning_days===30&&before.thresholds.critical_days===60,{thresholds:before.thresholds});

for(const role of ['SALES','TECH','TECHNICAL','STAFF']){
  const password=`Qa!${randomBytes(12).toString('base64url')}9a`,email=`${tag.toLowerCase()}-${role.toLowerCase()}@example.com`;
  const made=await fetch(app+'/api/users',{method:'POST',headers:{Authorization:`Bearer ${admin}`,'Content-Type':'application/json'},body:JSON.stringify({email,password,name:`${tag}-${role}`,role})});const body=await parse(made);ok(`create ${role}`,made.ok,{status:made.status,error:body?.error});
  const token=await login(email,password);accounts.push({id:body.id,role,token});
  const denied=await api('/api/management-dashboard',token);ok(`${role} management API denied`,denied.status===403,{status:denied.status});
  const rpc=await rest('rpc/get_management_dashboard','POST',{},token);ok(`${role} direct RPC denied`,!rpc.ok,{status:rpc.status});
}

const supplier=(await rest('suppliers','POST',{code:`TA${stamp}`.slice(0,40),name:`${tag}-SUPPLIER`,created_by:tag})).body[0];
const batch=(await rest('purchase_batches','POST',{batch_code:`${tag}-PO`,supplier_id:supplier.id,purchase_date:new Date().toISOString().slice(0,10),exchange_rate:3500,subtotal_rmb:4000,status:'CONFIRMED',created_by:tag,updated_by:tag})).body[0];
const fixtures=[{age:5,status:'available'},{age:35,status:'available'},{age:70,status:'available'},{age:70,status:'waiting_qc'}],laptops=[];
for(const [i,fixture] of fixtures.entries()){
  const item=(await rest('purchase_items','POST',{purchase_batch_id:batch.id,model:`${tag}-MODEL-${i+1}`,serial:`${tag}-SER-${i+1}`,purchase_price_rmb:1000,status:'RECEIVED'})).body[0];
  const laptop=(await rest('laptops','POST',{serial:item.serial,name:item.model,category:'TEST-AGING',location:'BAC_NINH',charger_status:'with_charger',status:fixture.status,price_rmb:1000,exchange_rate:3500,retail_price_vnd:5,is_locked:fixture.status!=='available',is_active:true,purchase_item_id:item.id,available_for_sale_at:fixture.status==='available'?daysAgo(fixture.age):null,condition_note:tag})).body[0];
  await rest(`purchase_items?id=eq.${item.id}`,'PATCH',{laptop_id:laptop.id});laptops.push(laptop);
  const synced=await api(`/api/costs?laptopId=${laptop.id}`,admin);ok(`sync cost fixture ${i+1}`,synced.ok&&synced.body.summary.cost_status==='COMPLETE',{status:synced.status,summary:synced.body?.summary});
}

const after=(await api('/api/management-dashboard',admin)).body;
ok('5-day bucket authoritative',bucket(after,'0_7')===bucket(before,'0_7')+1,{before:bucket(before,'0_7'),after:bucket(after,'0_7')});
ok('35-day bucket authoritative',bucket(after,'31_60')===bucket(before,'31_60')+1,{before:bucket(before,'31_60'),after:bucket(after,'31_60')});
ok('70-day bucket authoritative',bucket(after,'61_90')===bucket(before,'61_90')+1,{before:bucket(before,'61_90'),after:bucket(after,'61_90')});
ok('waiting QC excluded from available aging',Number(after.available.units)===Number(before.available.units)+3,{before:before.available.units,after:after.available.units});
ok('known available capital excludes QC',Number(after.available.known_inventory_cost_vnd)===Number(before.available.known_inventory_cost_vnd)+10500000,{before:before.available.known_inventory_cost_vnd,after:after.available.known_inventory_cost_vnd});
ok('QC exposure includes waiting laptop',Number(after.qc.waiting_qc.units)===Number(before.qc.waiting_qc.units)+1,{before:before.qc.waiting_qc.units,after:after.qc.waiting_qc.units});
ok('slow-moving drill-down',after.slow_moving.some(x=>x.serial===`${tag}-SER-3`&&x.age_days>=69&&Number(x.gross_margin_potential_vnd)===1500000),{rows:after.slow_moving.filter(x=>String(x.serial).includes(tag))});
ok('no cash accounting metric',!('cash' in after)&&!('bank' in after)&&!('cash_available' in after),{keys:Object.keys(after)});

for(const account of accounts)await fetch(app+'/api/users',{method:'POST',headers:{Authorization:`Bearer ${admin}`,'Content-Type':'application/json'},body:JSON.stringify({id:account.id,isActive:false})});
console.log(JSON.stringify({tag,checksPassed:checks.length,checks,ids:{supplier:supplier.id,batch:batch.id,laptops:laptops.map(x=>x.id)}},null,2));
