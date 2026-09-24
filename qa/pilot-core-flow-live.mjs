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

const tag = `PILOT-CORE-${Date.now().toString(36).toUpperCase()}`;
const checks = [];
const check = (name, pass, detail = {}) => {
  checks.push({ name, pass: Boolean(pass), ...detail });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`);
};
const parse = async response => {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
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

const today = new Date().toISOString().slice(0, 10);
const abandoned = await rest('orders?note=like.PILOT-CORE-*&payment_status=eq.unpaid&amount_paid=eq.0&select=id,laptop_id,customer_id');
if (abandoned.ok) {
  for (const row of abandoned.body) {
    await rest(`orders?id=eq.${row.id}`, 'DELETE');
    if (row.laptop_id) await rest(`laptops?id=eq.${row.laptop_id}`, 'DELETE');
    if (row.customer_id) await rest(`customers?id=eq.${row.customer_id}`, 'DELETE');
  }
}
const [branchResult, accountResult] = await Promise.all([
  rest('branches?select=id&order=id&limit=1'),
  rest('cash_accounts?code=eq.PILOT_BANK_VND&is_active=eq.true&select=id'),
]);
check('pilot branch available', branchResult.ok && branchResult.body.length === 1);
check('pilot VND account available', accountResult.ok && accountResult.body.length === 1);
const branchId = branchResult.body[0].id;
const accountId = accountResult.body[0].id;

const customerResult = await rest('customers', 'POST', { name: `${tag} Customer`, phone: `09${Date.now().toString().slice(-8)}`, address: 'Dữ liệu chạy thử' });
check('create pilot customer', customerResult.ok, { status: customerResult.status, error: customerResult.body });
const customer = customerResult.body[0];
const laptopResult = await rest('laptops', 'POST', {
  serial: `${tag}-SERIAL`, name: `${tag} Laptop`, category: 'PILOT', location: 'store', charger_status: 'with_charger',
  status: 'available', price_rmb: 2000, shipping_rmb: 50, exchange_rate: 3500, import_price_vnd: 7.175,
  wholesale_price_vnd: 11, retail_price_vnd: 12.5, is_locked: false, is_active: true,
  available_for_sale_at: new Date().toISOString(), import_date: today, warehouse_date: today, condition_note: tag,
});
check('create pilot laptop', laptopResult.ok, { status: laptopResult.status, error: laptopResult.body });
const laptop = laptopResult.body[0];

const created = await api('/api/orders', 'POST', {
  createdDate: today, orderType: 'retail', orderStatus: 'new', paymentStatus: 'unpaid', salePrice: 12.5,
  laptopId: laptop.id, requestedLaptopId: laptop.id, customerId: customer.id, branchId, customerInfo: customer.name,
  customerAddress: customer.address, warranty: '6 tháng', setupNote: tag, note: tag, isActive: true,
});
check('create order through Orders API', created.ok, { status: created.status, error: created.body?.error });
const order = created.body.order || created.body;
check('new order starts unpaid', order.paymentStatus === 'unpaid' && Number(order.amountPaid) === 0 && Number(order.debtAmount) === 12.5, { order });

const deposit = await api('/api/payments', 'POST', { orderId: order.id, amount: 2, paymentType: 'deposit', paymentMethod: 'transfer_cash', paymentDate: today, accountId, referenceCode: tag, note: tag, idempotencyKey: randomUUID() });
check('record deposit through Payments API', deposit.ok, { status: deposit.status, error: deposit.body?.error });
const balance = await api('/api/payments', 'POST', { orderId: order.id, amount: 10.5, paymentType: 'balance', paymentMethod: 'transfer_cash', paymentDate: today, accountId, referenceCode: tag, note: tag, idempotencyKey: randomUUID() });
check('record remaining balance', balance.ok, { status: balance.status, error: balance.body?.error });

for (const orderStatus of ['prepared', 'shipping']) {
  const updated = await api('/api/orders', 'POST', { id: order.id, createdDate: today, orderType: 'retail', orderStatus, salePrice: 12.5, laptopId: laptop.id, requestedLaptopId: laptop.id, customerId: customer.id, branchId, note: tag });
  check(`transition order to ${orderStatus}`, updated.ok, { status: updated.status, error: updated.body?.error });
}
const invoiceResult = await api('/api/invoices', 'POST', { orderId: order.id });
check('issue invoice', invoiceResult.ok, { status: invoiceResult.status, error: invoiceResult.body?.error });

const [persistedOrder, persistedLaptop, payments, invoice, account] = await Promise.all([
  rest(`orders?id=eq.${order.id}&select=id,order_status,payment_status,amount_paid,debt_amount,laptop_id`),
  rest(`laptops?id=eq.${laptop.id}&select=id,status,is_locked`),
  rest(`payments?order_id=eq.${order.id}&select=id,amount,payment_type`),
  rest(`invoices?order_id=eq.${order.id}&select=id,snapshot`),
  rest(`cash_account_balances?id=eq.${accountId}&select=recorded_balance,last_difference`),
]);
const finalOrder = persistedOrder.body[0];
check('order remains paid after reload', persistedOrder.ok && finalOrder.payment_status === 'paid' && Number(finalOrder.amount_paid) === 12.5 && Number(finalOrder.debt_amount) === 0, { order: finalOrder });
check('sold laptop remains locked', persistedLaptop.ok && persistedLaptop.body[0].status === 'sold' && persistedLaptop.body[0].is_locked === true, { laptop: persistedLaptop.body[0] });
check('exactly two payment rows', payments.ok && payments.body.length === 2 && payments.body.reduce((total, row) => total + Number(row.amount), 0) === 12.5, { payments: payments.body });
check('invoice snapshot is settled', invoice.ok && invoice.body.length === 1 && Number(invoice.body[0].snapshot?.paid) === 12.5 && Number(invoice.body[0].snapshot?.order?.debt_amount) === 0, { invoice: invoice.body[0]?.id });
check('pilot bank balance increased once', account.ok && Number(account.body[0].recorded_balance) === 12500000 && Number(account.body[0].last_difference || 0) === 0, { account: account.body[0] });

console.log(JSON.stringify({ tag, checksPassed: checks.length, orderId: order.id, laptopId: laptop.id, invoiceId: invoice.body[0].id, checks }, null, 2));
