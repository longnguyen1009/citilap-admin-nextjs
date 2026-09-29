import { readFile, writeFile, readdir } from 'node:fs/promises';

// Only repair SQL string literals that round-trip through the Windows-1252
// mistake. Never rewrite identifiers, business logic, or already valid Unicode.
const decoder = new TextDecoder('windows-1252');
const reverse = new Map();
for (let byte = 0; byte < 256; byte++) reverse.set(decoder.decode(Uint8Array.of(byte)), byte);
const utf8 = new TextDecoder('utf-8', { fatal: true });
const suspicious = text => (text.match(/[ÃÂÄÆá][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u2010-\u203a\u20ac\u2122]/g) || []).length;
function repair(text) {
  for (let depth = 0; depth < 3 && suspicious(text); depth++) {
    const bytes = [...text].map(char => reverse.get(char) ?? (char.charCodeAt(0) < 256 ? char.charCodeAt(0) : undefined));
    if (bytes.includes(undefined)) break;
    let fixed;
    try { fixed = utf8.decode(Uint8Array.from(bytes)); } catch { break; }
    if (suspicious(fixed) >= suspicious(text)) break;
    text = fixed;
  }
  return text;
}

const target = process.argv[2];
if (!target || !target.startsWith('supabase/migrations/')) throw new Error('Pass the CLI-created migration path');
const previous = await readFile(target, 'utf8');
if (!previous.startsWith('-- Repair encoding in effective RPC messages only;')) throw new Error('Expected generated, unapplied repair migration');
const names = [...previous.matchAll(/^-- ([a-z_]+)$/gm)].map(match => match[1]);
const replacements = new Map();
for (const dir of ['db/migrations', 'supabase/migrations']) for (const file of (await readdir(dir)).filter(file => file.endsWith('.sql'))) {
  if (dir + '/' + file === target) continue;
  const sql = await readFile(dir + '/' + file, 'utf8');
  for (const [literal] of sql.matchAll(/'(?:[^']|'')*'/g)) {
    const fixed = repair(literal);
    if (fixed !== literal) replacements.set(literal, fixed);
  }
}
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const values = [...replacements].map(([broken, fixed]) => '(' + quote(broken) + ',' + quote(fixed) + ')').join(',\n');
const sql = '-- Repair encoding in effective RPC messages only; preserve logic and permissions.\n' + names.map(name => '-- ' + name).join('\n') + '\nBEGIN;\nDO $repair$\nDECLARE fn record; mapping record; original text; repaired text;\nBEGIN\n  FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=\'public\' AND p.prokind=\'f\' LOOP\n    original := pg_get_functiondef(fn.oid);\n    repaired := original;\n    FOR mapping IN SELECT * FROM (VALUES\n' + values + '\n) AS messages(broken,fixed) LOOP\n      repaired := replace(repaired, mapping.broken, mapping.fixed);\n    END LOOP;\n    IF repaired IS DISTINCT FROM original THEN EXECUTE repaired; END IF;\n  END LOOP;\nEND $repair$;\nCOMMIT;\n';
await writeFile(target, sql);
console.log(JSON.stringify({ exactLiteralReplacements: replacements.size }));
