import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const sourceModule = async (file, transform = source => source) => {
  const source = transform(await readFile(file, 'utf8'));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
const dtoSource = await readFile('lib/responseVisibility.js', 'utf8');
const dtoUrl = `data:text/javascript;base64,${Buffer.from(dtoSource).toString('base64')}`;
const auth = await sourceModule('lib/apiAuth.js', source => source.replace(/^import .*supabaseAdmin.*;\r?\n/m, '').replace("'./responseVisibility'", JSON.stringify(dtoUrl)));
const audit = await sourceModule('lib/auditVisibility.js');
const dates = await sourceModule('lib/listScope.js');
let passed = 0;
function check(name, run) { run(); passed++; console.log(`PASS ${passed}: ${name}`); }
check('new procurement columns do not survive laptop filtering', () => {
  const [row] = auth.filterSensitiveFields([{ id: 2, serial: 'X', purchasePriceRmb: 5000, purchaseExchangeRate: 3550, importPriceVnd: 20 }], auth.SENSITIVE_LAPTOP_KEYS);
  assert.deepEqual(row, { id: 2, serial: 'X' });
});
check('new schema fields are private by default and nested QC is projected', () => {
  const [row] = auth.filterSensitiveFields([{ id: 1, futureCost: 100, qcDetails: { screen: { result: 'PASS', secretCost: 100 }, futureCost: { result: 'FAIL' } } }], auth.SENSITIVE_LAPTOP_KEYS);
  assert.deepEqual(row, { id: 1, qcDetails: { screen: { result: 'PASS' } } });
  const [order] = auth.filterSensitiveFields([{ id: 2, salePrice: 30, futureProfit: 10, customerInfo: { cost: 10 } }], auth.SENSITIVE_ORDER_KEYS);
  assert.deepEqual(order, { id: 2, salePrice: 30 });
});
check('redacted empty financial inputs cannot erase stored costs', () => {
  for (const value of [null, '', undefined]) {
    assert.deepEqual(auth.sanitizePayload({ id: 1, import_price_vnd: value }, auth.LAPTOP_PAYLOAD_KEYS, auth.SENSITIVE_LAPTOP_KEYS, false), { id: 1 });
  }
  assert.throws(() => auth.sanitizePayload({ import_price_vnd: 0 }, auth.LAPTOP_PAYLOAD_KEYS, auth.SENSITIVE_LAPTOP_KEYS, false), error => error.status === 403);
});
check('all non-admin audit roles redact financial old/new values', () => {
  for (const role of ['SALES', 'TECH', 'TECHNICAL', 'STAFF']) {
    const result = audit.visibleAuditChanges({ purchase_price_rmb: { old: 1, new: 2 }, serial: { old: 'A', new: 'B' }, unknownFinancialField: 99 }, role);
    assert.deepEqual(result, { serial: { old: 'A', new: 'B' } });
  }
});
check('nested audit objects cannot smuggle new financial fields', () => {
  assert.deepEqual(audit.visibleAuditChanges({ status: { old: { purchasePriceRmb: 300, status: 'available' }, new: 'sold' } }, 'STAFF'), { status: { old: { status: 'available' }, new: 'sold' } });
});
check('technical roles cannot inspect sales or finance histories', () => {
  for (const role of ['TECH', 'TECHNICAL', 'STAFF']) {
    for (const entity of ['ORDER', 'CUSTOMER', 'PAYMENT', 'FINANCIAL_RECORD', 'SETTING']) assert.equal(audit.canReadAudit(role, entity), false);
    assert.equal(audit.canReadAudit(role, 'LAPTOP'), true);
  }
  assert.equal(audit.canReadAudit('SALES', 'ORDER'), true);
  assert.equal(audit.canReadAudit('SALES', 'FINANCIAL_RECORD'), false);
});
check('admin retains complete audit evidence', () => {
  const changes = { purchasePriceRmb: { old: 5, new: 6 } };
  assert.equal(audit.visibleAuditChanges(changes, 'ADMIN'), changes);
});
check('business month follows Vietnam at the UTC boundary', () => {
  assert.equal(dates.businessMonthKey(new Date('2026-08-31T16:59:59Z')), '08/2026');
  assert.equal(dates.businessMonthKey(new Date('2026-08-31T17:00:00Z')), '09/2026');
});
check('calendar validation rejects overflow and preserves leap days', () => {
  for (const date of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', 'x']) assert.equal(dates.isCalendarDate(date), false);
  assert.equal(dates.isCalendarDate('2028-02-29'), true);
});
console.log(`PASS API security helpers ${passed}/${passed} (local, no live writes)`);
