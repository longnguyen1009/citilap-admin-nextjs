import { readFile } from 'node:fs/promises';
const text=await readFile('.env','utf8');
const env=Object.fromEntries(text.split(/\r?\n/).filter(x=>x&&!x.startsWith('#')&&x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const base=env.NEXT_PUBLIC_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY,anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY,app='http://localhost:3000';
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'};
const call=async(path,options={})=>{const r=await fetch(`${base}/rest/v1/${path}`,{headers,...options});const t=await r.text();let body;try{body=JSON.parse(t)}catch{body=t}return {ok:r.ok,status:r.status,body}};
const login=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})});const token=(await login.json()).access_token;
const api=async(path,options={})=>{const r=await fetch(app+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});const t=await r.text();let body;try{body=JSON.parse(t)}catch{body=t}return {ok:r.ok,status:r.status,body}};
const stamp=Date.now().toString(36).toUpperCase(), serial=`TEST-LIVE-GATE-${stamp}`;
const laptop=await call('laptops',{method:'POST',body:JSON.stringify({serial,name:serial,category:'TEST-LIVE',location:'BAC_NINH',charger_status:'TEST',status:'waiting_qc',price_rmb:1,exchange_rate:1,import_price_vnd:1,condition_note:'TEST-LIVE migration gate probe',is_locked:true,is_active:true,import_date:new Date().toISOString().slice(0,10),warehouse_date:new Date().toISOString().slice(0,10)})});
if(!laptop.ok)throw new Error(JSON.stringify(laptop));const id=laptop.body[0].id;
const apiAttempt=await api('/api/orders',{method:'POST',body:JSON.stringify({monthKey:'09/2026',createdDate:'20/09/2026',orderType:'retail',orderStatus:'new',paymentStatus:'unpaid',salePrice:1,laptopId:id,requestedLaptopId:id,isActive:true})});
const dbAttempt=await call('orders',{method:'POST',body:JSON.stringify({month_key:'09/2026',created_date:new Date().toISOString().slice(0,10),order_type:'retail',order_status:'new',payment_status:'unpaid',sale_price:1,laptop_id:id,requested_laptop_id:id,is_active:true})});
await call(`laptops?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({is_active:false,condition_note:'TEST-LIVE gate probe inactive'})});
const users=await api('/api/users');const cleanup=[];
for(const u of users.body||[]){if(String(u.name).startsWith('TEST-LIVE-')&&u.is_active){const off=await api('/api/users',{method:'PUT',body:JSON.stringify({id:u.id,is_active:false})});cleanup.push({id:u.id,role:u.role,status:off.status})}}
console.log(JSON.stringify({waitingQcLaptopId:id,ordersApi:{status:apiAttempt.status,error:apiAttempt.body?.error},databaseBypass:{status:dbAttempt.status,error:dbAttempt.body?.message},cleanup},null,2));
