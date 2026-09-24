import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
}));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const app = process.env.APP_URL || 'http://localhost:3000';
if (!base || !anon || !service || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('Missing pilot environment');

const tag = `PILOT-COD-${Date.now().toString(36).toUpperCase()}`;
const checks = [];
const parse = async response => { const value = await response.text(); try { return JSON.parse(value); } catch { return value; } };
const check = (name, pass, detail = {}) => {
  checks.push({ name, pass: Boolean(pass), ...detail });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`);
};
const rest = async (path, method = 'GET', body) => {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: { apikey: service, Authorization: `Bearer ${service}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json', Prefer: 'return=representation' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};
const loginResponse = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
});
const login = await parse(loginResponse);
check('admin login', loginResponse.ok, { status: loginResponse.status });
const api = async (path, method = 'GET', body) => {
  const response = await fetch(`${app}${path}`, {
    method,
    headers: { Authorization: `Bearer ${login.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};
const amountEq = (actual, expected) => Math.abs(Number(actual) - Number(expected)) < 0.01;
const today = new Date().toISOString().slice(0, 10);

const [branchResult, accountResult] = await Promise.all([
  rest('branches?select=id&order=id&limit=1'),
  rest('cash_account_balances?code=eq.PILOT_BANK_VND&is_active=eq.true&select=id,recorded_balance'),
]);
check('pilot branch available', branchResult.ok && branchResult.body.length === 1);
check('pilot bank account available', accountResult.ok && accountResult.body.length === 1);
const branchId = branchResult.body[0].id;
const accountId = accountResult.body[0].id;
const openingBalance = Number(accountResult.body[0].recorded_balance);

const customerResult = await rest('customers', 'POST', { name: `${tag} Customer`, phone: `08${Date.now().toString().slice(-8)}`, address: 'Dữ liệu chạy thử COD' });
check('create pilot customer', customerResult.ok, { status: customerResult.status, error: customerResult.body });
const customer = customerResult.body[0];
const laptopResult = await rest('laptops', 'POST', {
  serial: `${tag}-SERIAL`, name: `${tag} Laptop`, category: 'PILOT', location: 'store', charger_status: 'with_charger',
  status: 'available', price_rmb: 2400, shipping_rmb: 50, exchange_rate: 3500, import_price_vnd: 8.575,
  wholesale_price_vnd: 13, retail_price_vnd: 15, is_locked: false, is_active: true,
  available_for_sale_at: new Date().toISOString(), import_date: today, warehouse_date: today, condition_note: tag,
});
check('create pilot laptop', laptopResult.ok, { status: laptopResult.status, error: laptopResult.body });
const laptop = laptopResult.body[0];

const orderPayload = {
  createdDate: today, orderType: 'retail', paymentStatus: 'cod', paymentMethod: 'cod', salePrice: 15, codAmount: 15,
  laptopId: laptop.id, requestedLaptopId: laptop.id, customerId: customer.id, branchId, customerInfo: customer.name,
  customerAddress: customer.address, shippingMethod: 'COD', trackingCode: `${tag}-TRACK`, note: tag, isActive: true,
};
const created = await api('/api/orders', 'POST', { ...orderPayload, orderStatus: 'new' });
check('create COD order through Orders API', created.ok, { status: created.status, error: created.body?.error });
const order = created.body.order || created.body;
check('COD order starts fully outstanding', order.paymentStatus === 'cod' && Number(order.amountPaid) === 0 && Number(order.debtAmount) === 15, { order });
for (const orderStatus of ['prepared', 'shipping']) {
  const updated = await api('/api/orders', 'POST', { ...orderPayload, id: order.id, orderStatus });
  check(`transition order to ${orderStatus}`, updated.ok, { status: updated.status, error: updated.body?.error });
}

const codCreate = await api('/api/cod', 'POST', {
  action: 'create', orderId: order.id, carrier: 'PILOT CARRIER', trackingNumber: `${tag}-TRACK`,
  expectedSettlementAt: new Date(Date.now() + 2 * 86400000).toISOString(), notes: tag, idempotencyKey: randomUUID(),
});
check('create COD receivable', codCreate.ok, { status: codCreate.status, error: codCreate.body?.error });
const codId = codCreate.body.id;
check('COD amount comes from order', amountEq(codCreate.body.expected_cod_amount_vnd, 15000000), { amount: codCreate.body.expected_cod_amount_vnd });

const delivered = await api('/api/cod', 'POST', { action: 'transition', id: codId, target: 'DELIVERED', notes: tag });
check('mark COD delivered', delivered.ok && delivered.body.status === 'DELIVERED', { status: delivered.status, error: delivered.body?.error });
const [deliveredOrderResult, deliveredSummaryResult, balanceAfterDelivery] = await Promise.all([
  rest(`orders?id=eq.${order.id}&select=id,payment_status,amount_paid,debt_amount`),
  rest(`cod_receivable_summaries?id=eq.${codId}&select=id,status,outstanding_vnd`),
  rest(`cash_account_balances?id=eq.${accountId}&select=recorded_balance`),
]);
const deliveredOrder = deliveredOrderResult.body[0];
check('delivery transfers customer debt to carrier', amountEq(deliveredOrder.debt_amount, 0) && amountEq(deliveredOrder.amount_paid, 15) && deliveredSummaryResult.body[0].status === 'DELIVERED' && amountEq(deliveredSummaryResult.body[0].outstanding_vnd, 15000000), { order: deliveredOrder, cod: deliveredSummaryResult.body[0] });
check('delivery does not move bank cash', amountEq(balanceAfterDelivery.body[0].recorded_balance, openingBalance), { balance: balanceAfterDelivery.body[0] });
const duplicateDelivery = await api('/api/cod', 'POST', { action: 'transition', id: codId, target: 'DELIVERED', notes: tag });
check('invalid repeated delivery blocked', !duplicateDelivery.ok, { status: duplicateDelivery.status });

const waiting = await api('/api/cod', 'POST', { action: 'transition', id: codId, target: 'WAITING_SETTLEMENT', notes: tag });
check('move COD to waiting settlement', waiting.ok && waiting.body.status === 'WAITING_SETTLEMENT', { status: waiting.status });
const partialKey = randomUUID();
const partialBody = { action: 'settle', id: codId, amountVnd: 10000000, accountId, reference: tag, settledAt: new Date().toISOString(), idempotencyKey: partialKey };
const partialResponses = await Promise.all([api('/api/cod', 'POST', partialBody), api('/api/cod', 'POST', partialBody)]);
check('concurrent settlement retries succeed', partialResponses.every(result => result.ok), { statuses: partialResponses.map(result => result.status) });
const [partialSummary, partialSettlements, partialCash, partialBalance] = await Promise.all([
  rest(`cod_receivable_summaries?id=eq.${codId}&select=status,settled_vnd,outstanding_vnd`),
  rest(`cod_settlements?idempotency_key=eq.${partialKey}&select=id,amount_vnd`),
  rest(`account_transactions?idempotency_key=eq.${partialKey}-CASH&select=id,amount,direction`),
  rest(`cash_account_balances?id=eq.${accountId}&select=recorded_balance`),
]);
check('partial settlement recorded exactly once', partialSettlements.body.length === 1 && partialCash.body.length === 1 && partialCash.body[0].direction === 'IN', { settlements: partialSettlements.body, cash: partialCash.body });
check('partial COD remains 5m outstanding', partialSummary.body[0].status === 'PARTIALLY_SETTLED' && amountEq(partialSummary.body[0].settled_vnd, 10000000) && amountEq(partialSummary.body[0].outstanding_vnd, 5000000), { summary: partialSummary.body[0] });
check('partial settlement increases bank once', amountEq(partialBalance.body[0].recorded_balance, openingBalance + 10000000), { balance: partialBalance.body[0] });

const overSettle = await api('/api/cod', 'POST', { ...partialBody, amountVnd: 5000001, idempotencyKey: randomUUID() });
check('over-settlement blocked', !overSettle.ok, { status: overSettle.status });
const finalKey = randomUUID();
const finalSettle = await api('/api/cod', 'POST', { ...partialBody, amountVnd: 5000000, idempotencyKey: finalKey });
check('final settlement accepted', finalSettle.ok, { status: finalSettle.status, error: finalSettle.body?.error });
const [finalSummary, finalBalance, allSettlements, receivableRows, paymentRows] = await Promise.all([
  rest(`cod_receivable_summaries?id=eq.${codId}&select=status,settled_vnd,outstanding_vnd`),
  rest(`cash_account_balances?id=eq.${accountId}&select=recorded_balance,last_difference`),
  rest(`cod_settlements?cod_receivable_id=eq.${codId}&select=id,amount_vnd`),
  rest(`customer_receivable_summaries?order_id=eq.${order.id}&select=order_id`),
  rest(`payments?order_id=eq.${order.id}&select=id,amount,payment_type`),
]);
check('COD is fully settled', finalSummary.body[0].status === 'SETTLED' && amountEq(finalSummary.body[0].settled_vnd, 15000000) && amountEq(finalSummary.body[0].outstanding_vnd, 0), { summary: finalSummary.body[0] });
check('two settlement rows total 15m', allSettlements.body.length === 2 && amountEq(allSettlements.body.reduce((sum, row) => sum + Number(row.amount_vnd), 0), 15000000), { settlements: allSettlements.body });
check('bank receives exactly 15m with no difference', amountEq(finalBalance.body[0].recorded_balance, openingBalance + 15000000) && amountEq(finalBalance.body[0].last_difference || 0, 0), { openingBalance, final: finalBalance.body[0] });
check('customer receivable is not double counted', receivableRows.body.length === 0, { rows: receivableRows.body });
check('delivery created one non-cash COD payment', paymentRows.body.length === 1 && paymentRows.body[0].payment_type === 'cod' && amountEq(paymentRows.body[0].amount, 15), { payments: paymentRows.body });

console.log(JSON.stringify({ tag, checksPassed: checks.length, orderId: order.id, laptopId: laptop.id, codId, openingBalance, finalBalance: Number(finalBalance.body[0].recorded_balance), checks }, null, 2));
