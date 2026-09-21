import { readFile } from 'node:fs/promises';

const envText = await readFile('.env', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.trim().startsWith('#') && line.includes('=')).map(line => {
  const at=line.indexOf('='); return [line.slice(0,at).trim(),line.slice(at+1).trim().replace(/^['"]|['"]$/g,'')];
}));
const base=env.NEXT_PUBLIC_SUPABASE_URL; const service=env.SUPABASE_SERVICE_ROLE_KEY; const anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!base||!service||!anon)throw new Error('Missing Supabase environment configuration');
const tables=['suppliers','purchase_batches','purchase_items','supplier_payments','shipments','shipment_items','receiving_sessions','receiving_items','receiving_exceptions','shipment_summaries','qc_inspections','qc_check_items'];
const probe=async(table,key,select='*')=>{const res=await fetch(`${base}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});const body=await res.text();return {status:res.status,ok:res.ok,code:(()=>{try{return JSON.parse(body).code||null}catch{return null}})()};};
const result={projectHost:new URL(base).host,tables:{},anonDirect:{},columns:{},adminCredentialConfigured:Boolean(env.ADMIN_EMAIL&&env.ADMIN_PASSWORD)};
for(const table of tables){result.tables[table]=await probe(table,service);result.anonDirect[table]=await probe(table,anon);}
result.columns.laptops=await probe('laptops',service,'purchase_item_id');
result.columns.stock_movements=await probe('stock_movements',service,'reference_type,reference_id');
const specRes=await fetch(`${base}/rest/v1/`,{headers:{apikey:service,Authorization:`Bearer ${service}`}});const spec=await specRes.json();
const wantedRpc=['create_purchase_batch','update_purchase_draft','transition_purchase_batch','record_supplier_payment','create_shipment','transition_shipment','receive_shipment_items','resolve_receiving_exception','next_shipment_code'];
result.rpc=Object.fromEntries(wantedRpc.map(name=>[name,Object.keys(spec.paths||{}).some(path=>path===`/rpc/${name}`)]));
const rpcCall=async key=>{const res=await fetch(`${base}/rest/v1/rpc/next_shipment_code`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({p_date:'2026-09-20'})});return {status:res.status,ok:res.ok};};
result.rpcPrivilege={anon:await rpcCall(anon),service:await rpcCall(service)};
const profileRes=await fetch(`${base}/rest/v1/user_profiles?select=role,is_active`,{headers:{apikey:service,Authorization:`Bearer ${service}`}});const profiles=profileRes.ok?await profileRes.json():[];
result.roleInventory=profiles.reduce((acc,row)=>{const key=`${row.role}:${row.is_active?'active':'inactive'}`;acc[key]=(acc[key]||0)+1;return acc;},{});
result.tableCounts={};result.testLiveCounts={};
for(const table of ['suppliers','purchase_batches','purchase_items','supplier_payments','shipments','shipment_items','receiving_sessions','receiving_items','receiving_exceptions']){
  const countRes=await fetch(`${base}/rest/v1/${table}?select=id`,{headers:{apikey:service,Authorization:`Bearer ${service}`,Prefer:'count=exact'},method:'HEAD'});
  result.tableCounts[table]=countRes.headers.get('content-range')?.split('/')?.[1]??null;
}
for(const [table,column] of [['suppliers','code'],['purchase_batches','batch_code'],['shipments','shipment_code']]){
  const countRes=await fetch(`${base}/rest/v1/${table}?select=id&${column}=like.TEST-LIVE-*`,{headers:{apikey:service,Authorization:`Bearer ${service}`,Prefer:'count=exact'},method:'HEAD'});
  result.testLiveCounts[table]=countRes.headers.get('content-range')?.split('/')?.[1]??null;
}
if(result.adminCredentialConfigured){
  const login=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})});
  result.adminLogin={status:login.status,ok:login.ok};
  if(login.ok){
    const session=await login.json();const direct=await fetch(`${base}/rest/v1/suppliers?select=id&limit=0`,{headers:{apikey:anon,Authorization:`Bearer ${session.access_token}`}});result.authenticatedDirectSupplier={status:direct.status,ok:direct.ok,code:direct.ok?null:(await direct.json()).code};
    result.rpcPrivilege.authenticatedAdmin=await rpcCall(session.access_token);
    result.adminApi={};
    for(const endpoint of ['/api/suppliers','/api/purchases','/api/supplier-payments','/api/shipments','/api/receiving']){
      try{const apiRes=await fetch(`http://localhost:3000${endpoint}`,{headers:{Authorization:`Bearer ${session.access_token}`}});result.adminApi[endpoint]={status:apiRes.status,ok:apiRes.ok};}catch{result.adminApi[endpoint]={status:null,ok:false};}
    }
  }
}
console.log(JSON.stringify(result,null,2));
