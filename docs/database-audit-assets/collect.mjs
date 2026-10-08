// Read-only audit collector. Never applies migrations or executes DDL/DML.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const out=resolve('docs/database-audit-assets');
mkdirSync(out,{recursive:true});
const run=(sql)=>{
  if(!/^(SELECT|PRAGMA (foreign_key_check|table_xinfo|index_list|index_xinfo|foreign_key_list)|EXPLAIN QUERY PLAN)\b/i.test(sql.trim()))throw Error('Read-only queries required');
  const raw=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--remote','--command',sql,'--json'],{encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,WRANGLER_LOG_PATH:resolve(process.env.TEMP,'citilap-database-audit.log')}});
  const data=JSON.parse(raw);
  if(data.some(r=>!r.success||r.meta?.rows_written>0||r.meta?.changed_db))throw Error('Unexpected read-only result');
  return data;
};
const mode=process.argv[2]||'catalog';
if(mode==='catalog'){
  const catalog=run("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name");
  writeFileSync(`${out}/remote-schema.json`,JSON.stringify(catalog,null,2));
  const tables=catalog[0].results.filter(x=>x.type==='table'&&!x.name.startsWith('sqlite_')&&!x.name.startsWith('_cf_'));
  const grouped=(queries)=>{const result=[];for(let i=0;i<queries.length;i+=10)result.push(...run(queries.slice(i,i+10).join(' UNION ALL ')));return result;};
  writeFileSync(`${out}/remote-columns.json`,JSON.stringify(run("SELECT s.name AS table_name,p.* FROM sqlite_schema s JOIN pragma_table_xinfo(s.name) p WHERE s.type='table' AND s.name NOT LIKE 'sqlite_%' AND s.name NOT LIKE '_cf_%'"),null,2));
  writeFileSync(`${out}/remote-counts.json`,JSON.stringify(run('SELECT '+tables.filter(t=>t.name!=='d1_migrations').map(t=>`(SELECT count(*) FROM "${t.name}") AS "${t.name}"`).join(',')),null,2));
  writeFileSync(`${out}/remote-migrations.json`,JSON.stringify(run('SELECT name,applied_at FROM d1_migrations ORDER BY id'),null,2));
  writeFileSync(`${out}/remote-fk-check.json`,JSON.stringify(run('PRAGMA foreign_key_check'),null,2));
  console.log(JSON.stringify({tables:tables.length,objects:catalog[0].results.length}));
}else{
  const sql=readFileSync(`${out}/${mode}.sql`,'utf8');
  const queries=sql.split(';').map(x=>x.trim()).filter(Boolean);
  const result=[];
  for(const query of queries){try{result.push({query,result:run(query)});}catch(error){result.push({query,error:String(error.stdout||error.message)});}writeFileSync(`${out}/${mode}.json`,JSON.stringify(result,null,2));}
  writeFileSync(`${out}/${mode}.json`,JSON.stringify(result,null,2));
  console.log(`${mode}: ${result.length} read-only queries captured`);
}
