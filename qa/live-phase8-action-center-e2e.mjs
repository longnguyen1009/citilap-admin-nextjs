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
const tag = `TEST-ACTION-${Date.now().toString(36).toUpperCase()}`;
const today = new Date().toISOString().slice(0, 10);
const past = new Date(Date.now() - 3 * 86400000).toISOString();
const checks = [];
const check = (name, pass, detail = {}) => checks.push({ name, pass: Boolean(pass), ...detail });
const parse = async response => { const text = await response.text(); try { return JSON.parse(text); } catch { return text; } };
const request = async (url, token, method = 'GET', body) => {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(url.startsWith(base) ? { apikey: service, Prefer: 'return=representation' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};
const api = (path, token, method = 'GET', body) => request(app + path, token, method, body);
const rest = (path, method = 'GET', body) => request(`${base}/rest/v1/${path}`, service, method, body);
const summary = async token => (await api('/api/financial-operations', token)).body;
const overdueOrders = value => Object.entries(value.receivable_aging || {}).filter(([key]) => key.startsWith('OVERDUE_')).reduce((sum, [, bucket]) => sum + Number(bucket.orders || 0), 0);

const loginResponse = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
const login = await parse(loginResponse);
if (!loginResponse.ok) throw new Error(`Admin login failed: ${login?.error_description || loginResponse.status}`);
const admin = login.access_token;

const accountResult = await api('/api/cash-accounts', admin, 'POST', { code: `${tag}-VND`.slice(0, 40), name: tag, accountType: 'BANK', currency: 'VND', openingBalance: 100000000, openingBalanceAt: `${today}T00:00:00.000Z` });
if (!accountResult.ok) throw new Error(`Account fixture failed: ${JSON.stringify(accountResult.body)}`);
const account = accountResult.body;
const baseline = await summary(admin);

const createOrder = async values => {
  const result = await rest('orders', 'POST', { created_date: today, sale_online: tag, note: tag, order_type: 'retail', order_status: 'done', payment_status: 'partial', payment_method: 'BANK_TRANSFER', delivery_status: 'delivered', shipping_method: 'test', sale_price: 10, deposit_amount: 0, cod_amount: 0, amount_paid: 0, debt_amount: 10, customer_info: tag, tracking_code: `${tag}-${randomUUID()}`, is_active: true, ...values });
  if (!result.ok) throw new Error(`Order fixture failed: ${JSON.stringify(result.body)}`);
  return result.body[0];
};
const payOrder = order => api('/api/payments', admin, 'POST', { orderId: order.id, amount: 10, paymentType: 'balance', paymentMethod: 'BANK_TRANSFER', paymentDate: today, referenceCode: tag, note: tag, accountId: account.id, idempotencyKey: `${tag}-PAY-${order.id}` });

const nullDueOrder = await createOrder({ payment_due_at: null });
const afterNullDue = await summary(admin);
check('null payment_due_at is not overdue', overdueOrders(afterNullDue) === overdueOrders(baseline));
await payOrder(nullDueOrder);

const overdueOrder = await createOrder({ payment_due_at: past });
const withOverdueOrder = await summary(admin);
check('OVERDUE_CUSTOMER_RECEIVABLE appears', overdueOrders(withOverdueOrder) === overdueOrders(baseline) + 1);
await payOrder(overdueOrder);
const afterOverduePaid = await summary(admin);
check('OVERDUE_CUSTOMER_RECEIVABLE resolves', overdueOrders(afterOverduePaid) === overdueOrders(baseline));

const createCod = async expectedSettlementAt => {
  const order = await createOrder({ order_status: 'shipping', payment_method: 'cod', delivery_status: 'shipping', shipping_method: 'COD', cod_amount: 10 });
  const created = await api('/api/cod', admin, 'POST', { action: 'create', orderId: order.id, carrier: 'TEST', trackingNumber: order.tracking_code, expectedSettlementAt, notes: tag, idempotencyKey: `${tag}-COD-${order.id}` });
  if (!created.ok) throw new Error(`COD fixture failed: ${JSON.stringify(created.body)}`);
  await api('/api/cod', admin, 'POST', { action: 'transition', id: created.body.id, target: 'DELIVERED', expectedSettlementAt, notes: tag });
  await api('/api/cod', admin, 'POST', { action: 'transition', id: created.body.id, target: 'WAITING_SETTLEMENT', expectedSettlementAt, notes: tag });
  return created.body.id;
};
const settleCod = id => api('/api/cod', admin, 'POST', { action: 'settle', id, amountVnd: 10000000, accountId: account.id, reference: tag, settledAt: new Date().toISOString(), idempotencyKey: `${tag}-SETTLE-${id}` });

const nullDueCod = await createCod(null);
const afterNullCod = await summary(admin);
check('null expected_settlement_at is not overdue', Number(afterNullCod.cod.overdue_vnd) === Number(baseline.cod.overdue_vnd));
await settleCod(nullDueCod);

const overdueCod = await createCod(past);
const withOverdueCod = await summary(admin);
check('OVERDUE_COD appears', Number(withOverdueCod.cod.overdue_vnd) === Number(baseline.cod.overdue_vnd) + 10000000);
await settleCod(overdueCod);
const afterOverdueCod = await summary(admin);
check('OVERDUE_COD resolves', Number(afterOverdueCod.cod.overdue_vnd) === Number(baseline.cod.overdue_vnd));

const disputedCod = await createCod(null);
await api('/api/cod', admin, 'POST', { action: 'transition', id: disputedCod, target: 'DISPUTED', notes: tag });
const withDispute = await summary(admin);
check('COD_DISPUTED appears', Number(withDispute.cod.disputed) === Number(baseline.cod.disputed) + 1);
await settleCod(disputedCod);
const afterDispute = await summary(admin);
check('COD_DISPUTED resolves', Number(afterDispute.cod.disputed) === Number(baseline.cod.disputed));

const balanceRow = (await rest(`cash_account_balances?id=eq.${account.id}&select=recorded_balance`)).body[0];
await api('/api/account-reconciliations', admin, 'POST', { accountId: account.id, actualBalance: Number(balanceRow.recorded_balance) - 1, notes: tag });
const withDifference = await summary(admin);
check('ACCOUNT_RECONCILIATION_DIFFERENCE appears', Number(withDifference.reconciliation_differences) === Number(baseline.reconciliation_differences) + 1);
const latestBalance = (await rest(`cash_account_balances?id=eq.${account.id}&select=recorded_balance`)).body[0];
await api('/api/account-reconciliations', admin, 'POST', { accountId: account.id, actualBalance: Number(latestBalance.recorded_balance), notes: `${tag}-RESOLVED` });
const afterDifference = await summary(admin);
check('ACCOUNT_RECONCILIATION_DIFFERENCE resolves', Number(afterDifference.reconciliation_differences) === Number(baseline.reconciliation_differences));

check('drill-down targets', ['/finance/receivables', '/finance/cod', '/finance/accounts'].every(path => path.startsWith('/finance/')));
const failed = checks.filter(item => !item.pass);
console.log(JSON.stringify({ tag, checks, passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
