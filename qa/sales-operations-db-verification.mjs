import assert from 'node:assert/strict';
import { currentSchema } from './current-schema.mjs';
const db = await currentSchema();
try {
  let checks = 0;
  for (const table of ['reservations', 'trade_ins', 'trade_in_inspections', 'trade_in_check_items', 'commissions']) {
    const { rows } = await db.query(`SELECT relrowsecurity AS rls, has_table_privilege('authenticated',oid,'SELECT') AS readable FROM pg_class WHERE oid=to_regclass($1)`, [`public.${table}`]);
    assert.equal(rows.length, 1); assert.equal(rows[0].rls, true); assert.equal(rows[0].readable, false); checks += 3;
  }
  for (const name of ['reservations_one_active_laptop', 'trade_in_one_open_inspection', 'laptop_cost_components_trade_in_source_unique']) {
    const { rows } = await db.query('SELECT indisunique,indisvalid FROM pg_index WHERE indexrelid=to_regclass($1)', [`public.${name}`]);
    assert.equal(rows[0]?.indisunique, true); assert.equal(rows[0]?.indisvalid, true); checks += 2;
  }
  await assert.rejects(db.query(`SELECT complete_trade_in_inspection('00000000-0000-0000-0000-000000000001','ORIGINAL','','[]','QA','qa-empty-inspection')`)); checks++;
  console.log(`PASS sales operations ${checks}/${checks}: current catalog, access, uniqueness, invalid inspection`);
} finally { await db.close(); }
