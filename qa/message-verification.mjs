import assert from 'node:assert/strict';
import { currentSchema } from './current-schema.mjs';
import { readFile } from 'node:fs/promises';
import { repairMojibake } from '../lib/textEncoding.js';
const legacyDecoder = new TextDecoder('windows-1252');
for (const message of ['Chỉ có thể hoàn tất phiếu đang TESTING', 'Không tìm thấy máy', 'Đã cập nhật dữ liệu']) {
  assert.equal(repairMojibake(message), message);
  const broken = legacyDecoder.decode(new TextEncoder().encode(message));
  assert.equal(repairMojibake(broken), message);
  assert.equal(repairMojibake(`Đúng: ${broken}`), `Đúng: ${message}`);
}
const db = await currentSchema();
try {
  const result = await db.query(`SELECT p.proname, pg_get_functiondef(p.oid) AS definition,
    md5(regexp_replace(pg_get_functiondef(p.oid), $rx$'(?:[^']|'')*'$rx$, '', 'g')) AS logic_hash
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY proname,p.oid`);
  const migration = await readFile('supabase/migrations/20260929180409_repair_remaining_vietnamese_messages.sql', 'utf8');
  const names = [...migration.matchAll(/^-- ([a-z_]+)$/gm)].map(match => match[1]);
  const functions = result.rows.filter(row => names.includes(row.proname));
  assert.equal(functions.length, 65);
  assert.ok(result.rows.find(row => row.proname === 'complete_repair_job').definition.includes('Chỉ có thể hoàn tất phiếu đang TESTING'));
  for (const row of result.rows) assert.ok(!/[ÃÂÄÆá][\u0080-\u00bf\u2010-\u203a\u20ac\u2122]/.test(row.definition), `Remaining encoding issue: ${row.proname}`);
  if (process.argv.includes('--fingerprints')) console.log(JSON.stringify(functions.map(({ proname, logic_hash }) => ({ proname, logic_hash }))));
  else console.log(`PASS UTF-8 RPC messages: ${functions.length} repaired functions, ${result.rows.length} effective functions scanned`);
} finally { await db.close(); }
