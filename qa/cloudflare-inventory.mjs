import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
async function files(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const name = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(name) : [name];
  }))).flat();
}
const sources = (await Promise.all(['app', 'lib', 'context', 'components'].map(files))).flat()
  .filter(file => /\.(?:js|jsx|ts|tsx)$/.test(file));
const references = { tables: {}, rpcs: {}, dynamicRpcCalls: [], providerFiles: [] };
function record(group, name, file) {
  (group[name] ??= []).push(file);
  group[name] = [...new Set(group[name])];
}
for (const file of sources) {
  const source = await readFile(path.join(root, file), 'utf8');
  for (const match of source.matchAll(/\.from\(\s*['"]([^'"]+)['"]/g)) record(references.tables, match[1], file);
  for (const match of source.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)) record(references.rpcs, match[1], file);
  for (const match of source.matchAll(/\.rpc\(\s*([a-zA-Z_$][\w$]*)/g)) references.dynamicRpcCalls.push({ file, expression: match[1] });
  if (/supabase|vercel/i.test(source)) references.providerFiles.push(file);
}
// These names are selected dynamically by recordOrderPayment in dbService.
for (const name of ['record_order_payment', 'record_order_payment_with_account']) {
  record(references.rpcs, name, 'lib/services/dbService.js');
}
const sql = await readFile(path.join(root, 'init_full_db.sql'), 'utf8');
function names(pattern) {
  return [...new Set([...sql.matchAll(pattern)].map(match => match[1]))].sort();
}
const catalog = {
  tables: names(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?(\w+)"?/gi),
  functions: names(/CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?"?(\w+)"?/gi),
  triggers: names(/CREATE (?:OR REPLACE )?TRIGGER "?(\w+)"?/gi),
  views: names(/CREATE (?:OR REPLACE )?VIEW (?:public\.)?"?(\w+)"?/gi),
};
const routes = sources.filter(file => /^app\/api\/.*\/route\.[jt]s$/.test(file));
const result = {
  scope: 'Static source inventory; not proof of runtime coverage or live database schema. SQL names include historical definitions and must be reconciled against the final catalog.',
  routes,
  catalog,
  references,
};
await mkdir(path.join(root, 'docs/cloudflare'), { recursive: true });
await writeFile(path.join(root, 'docs/cloudflare/source-inventory.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ apiRoutes: routes.length, referencedTables: Object.keys(references.tables).length, referencedRpcs: Object.keys(references.rpcs).length, dynamicRpcCalls: references.dynamicRpcCalls.length, sqlDefinitions: Object.fromEntries(Object.entries(catalog).map(([key, values]) => [key, values.length])) }, null, 2));
