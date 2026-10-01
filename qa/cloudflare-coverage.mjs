import { readFile, writeFile } from 'node:fs/promises';
import { businessOperations } from '../lib/cloudflare/database.mjs';

// Keep unmigrated operations visible. This is an inventory, not a parity assertion.
const inventory = JSON.parse(await readFile('docs/cloudflare/source-inventory.json', 'utf8'));
const referenced = Object.keys(inventory.references.rpcs).sort();
const implemented = Object.keys(businessOperations).sort();
const pending = referenced.filter(name => !implemented.includes(name));
const report = {
  status: pending.length ? 'incomplete' : 'requires-integration-verification',
  referencedCount: referenced.length,
  registeredReferencedCount: referenced.length - pending.length,
  registeredOperations: implemented,
  pendingOperations: pending,
  note: 'Registered means a D1 implementation exists, not that routes are wired or business parity is proven. Trigger side effects need separate verification.',
};
await writeFile('docs/cloudflare/operation-coverage.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ referenced: referenced.length, registered: referenced.length - pending.length, pending: pending.length }));
if (process.argv.includes('--require-complete') && pending.length) process.exitCode = 1;
