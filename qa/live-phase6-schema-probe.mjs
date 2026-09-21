import { readFile } from 'node:fs/promises';
const raw=await readFile('.env','utf8');
const env=Object.fromEntries(raw.split(/\r?\n/).filter(x=>x.includes('=')&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
for(const table of ['laptop_cost_components','cost_allocations','cost_allocation_items','laptop_landed_costs']){
 const response=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}});
 console.log(JSON.stringify({table,status:response.status,ok:response.ok,body:response.ok?undefined:await response.text()}));
}
