import {readFileSync,writeFileSync} from 'node:fs';
const p='docs/database-audit-assets/';
const cols=JSON.parse(readFileSync(p+'remote-columns.json'))[0].results.filter(c=>c.table_name!=='d1_migrations');
const tables=[...new Set(cols.map(c=>c.table_name))];
writeFileSync(p+'profiles.sql',tables.map(t=>'SELECT '+cols.filter(c=>c.table_name===t).map(c=>`json_object('nulls',sum("${c.name}" IS NULL),'distinct',count(DISTINCT "${c.name}"),'nonempty',sum("${c.name}" IS NOT NULL AND CAST("${c.name}" AS TEXT)<>'')) AS "${c.name}"`).join(',')+` FROM "${t}";`).join('\n'));
console.log('profiles',tables.length);
const retry=[];
for(const t of ['laptops','orders']){const group=cols.filter(c=>c.table_name===t);for(let i=0;i<group.length;i+=20)retry.push('SELECT '+group.slice(i,i+20).map(c=>`json_object('nulls',sum("${c.name}" IS NULL),'distinct',count(DISTINCT "${c.name}"),'nonempty',sum("${c.name}" IS NOT NULL AND CAST("${c.name}" AS TEXT)<>'')) AS "${c.name}"`).join(',')+` FROM "${t}";`);}
writeFileSync(p+'profiles-retry.sql',retry.join('\n'));
