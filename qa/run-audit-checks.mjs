import { spawnSync } from 'node:child_process';
const scripts = [
  'audit-api-security-verification', 'audit-route-verification', 'paged-list-verification',
  'list-scope-verification', 'clean-schema-db-verification', 'order-allocation-verification',
  'trade-in-obligation-db-verification', 'financial-operations-db-verification',
  'sales-operations-db-verification', 'validate-db-reset',
  'export-verification', 'message-verification', 'purchase-inline-db-verification',
];
let failed = 0;
for (const script of scripts) {
  const result = spawnSync(process.execPath, [`qa/${script}.mjs`], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    failed++;
    console.error(`FAIL ${script}: ${result.error?.message || `exit ${result.status}`}`);
  }
}
console.log(`Audit local suites: ${scripts.length - failed}/${scripts.length} passed; no live database writes.`);
process.exitCode = failed ? 1 : 0;
