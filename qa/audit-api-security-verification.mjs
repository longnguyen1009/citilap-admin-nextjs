import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const sourceModule = async (file, transform = source => source) => {
  const source = transform(await readFile(file, 'utf8'));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
const dtoSource = await readFile('lib/responseVisibility.js', 'utf8');
const dtoUrl = `data:text/javascript;base64,${Buffer.from(dtoSource).toString('base64')}`;
const visibility = await import(dtoUrl);
const auth = await sourceModule('lib/apiAuth.js', source => source.replace(/^import .*supabaseAdmin.*;\r?\n/m, '').replace("'./responseVisibility'", JSON.stringify(dtoUrl)));
const audit = await sourceModule('lib/auditVisibility.js');
const dates = await sourceModule('lib/listScope.js');
const landing = await sourceModule('lib/authLanding.js');
const invoiceSnapshot = await sourceModule('lib/invoiceSnapshot.js');
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
check('sales invoice projection excludes current and future cost fields at every level', () => {
  const result = visibility.publicInvoice({
    id: 7, invoice_number: 'HD000007', created_at: '2026-09-30', internal_margin: 99,
    snapshot: {
      currency: 'VND', total: 30000000, future_finance: 1,
      order: { id: 3, salePrice: 30, sale_online: 'online-1', sale_offline: 'offline-1', payment_method: 'transfer_cash', profit_vnd: 8, cost_snapshot_vnd: 22000000, futureProfit: 9 },
      items: [{ name: 'Laptop', price: 30000000, cost: 22000000, futureCost: 1 }],
      payments: [{ id: 4, amount: 30000000, payment_method: 'CASH', account_balance: 10 }],
      financial_records: [
        { id: 5, payment_id: 4, amount: 30000000, internal_cost: 7 },
        { id: 6, payment_id: null, amount: 22000000, category: 'COGS' },
      ],
    },
  });
  assert.deepEqual(result, {
    id: 7, invoice_number: 'HD000007', created_at: '2026-09-30',
    snapshot: {
      currency: 'VND', unit_multiplier: undefined, total: 30000000, paid: undefined,
      customer: undefined, branch: undefined,
      order: { id: 3, salePrice: 30, sale_online: 'online-1', sale_offline: 'offline-1', payment_method: 'transfer_cash' },
      items: [{ name: 'Laptop', price: 30000000 }],
      payments: [{ id: 4, amount: 30000000, payment_method: 'CASH' }],
      financial_records: [{ id: 5, payment_id: 4, amount: 30000000 }],
    },
  });
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
check('all non-admin roles land on the laptop list after login', () => {
  assert.equal(landing.defaultLandingPath('ADMIN'), '/');
  for (const role of ['SALES', 'TECH', 'TECHNICAL', 'STAFF', undefined]) {
    assert.equal(landing.defaultLandingPath(role), '/inventory');
  }
});
check('invoice employee supports database and client field names with issuer fallback', () => {
  assert.equal(invoiceSnapshot.invoiceEmployee({ sale_offline:'Thắng', sale_online:'Hoàng' }, 'Long'), 'Thắng');
  assert.equal(invoiceSnapshot.invoiceEmployee({ saleOnline:'Hoàng' }, 'Long'), 'Hoàng');
  assert.equal(invoiceSnapshot.invoiceEmployee({}, 'Long'), 'Long');
  assert.equal(invoiceSnapshot.invoiceOrderValue({ paymentMethod:'cash' }, 'payment_method', 'paymentMethod'), 'cash');
});
console.log(`PASS API security helpers ${passed}/${passed} (local, no live writes)`);
