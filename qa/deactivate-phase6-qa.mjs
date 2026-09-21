import { readFile } from 'node:fs/promises';
const raw=await readFile('.env','utf8'),env=Object.fromEntries(raw.split(/\r?\n/).filter(x=>x.includes('=')&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
const query=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?name=like.TEST-COST-*&is_active=eq.true&select=id,name,role`,{headers});const users=await query.json();
for(const user of users){const response=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}`,{method:'PATCH',headers,body:JSON.stringify({is_active:false})});if(!response.ok)throw Error(await response.text())}
console.log(JSON.stringify({deactivated:users.length,users:users.map(x=>({name:x.name,role:x.role}))},null,2));
