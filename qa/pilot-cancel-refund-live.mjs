import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const base = env.NEXT_PUBLIC_SUPABASE_URL, anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service = env.SUPABASE_SERVICE_ROLE_KEY, app = process.env.APP_URL || 'http://localhost:3000';
if (!base || !anon || !service || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('Missing pilot environment');
const tag = `PILOT-REFUND-${Date.now().toString(36).toUpperCase()}`, checks = [];
const parse = async r => { const text = await r.text(); try { return JSON.parse(text); } catch { return text; } };
const check = (name, pass, detail = {}) => { checks.push({ name, pass: Boolean(pass), ...detail }); if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`); };
const rest = async (path, method = 'GET', body) => { const r = await fetch(`${base}/rest/v1/${path}`, { method, headers: { apikey: service, Authorization: `Bearer ${service}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json', Prefer: 'return=representation' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { ok: r.ok, status: r.status, body: await parse(r) }; };
const loginResponse = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
const login = await parse(loginResponse); check('admin login', loginResponse.ok);
const api = async (path, method = 'GET', body) => { const r = await fetch(`${app}${path}`, { method, headers: { Authorization: `Bearer ${login.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { ok: r.ok, status: r.status, body: await parse(r) }; };
const today = new Date().toISOString().slice(0, 10);
const [branchResult, accountResult] = await Promise.all([rest('branches?select=id&order=id&limit=1'), rest('cash_account_balances?code=eq.PILOT_CASH_VND&select=id,recorded_balance')]);
check('pilot prerequisites', branchResult.ok && branchResult.body.length === 1 && accountResult.ok && accountResult.body.length === 1);
const branchId = branchResult.body[0].id, accountId = accountResult.body[0].id, openingBalance = Number(accountResult.body[0].recorded_balance);
const customerResult = await rest('customers', 'POST', { name: `${tag} Customer`, phone: `08${Date.now().toString().slice(-8)}`, address: 'Dữ liệu hoàn tiền' });
check('create customer', customerResult.ok, { error: customerResult.body }); const customer = customerResult.body[0];
const laptopResult = await rest('laptops', 'POST', { serial: `${tag}-SERIAL`, name: `${tag} Laptop`, category: 'PILOT', location: 'store', charger_status: 'with_charger', status: 'available', price_rmb: 1000, shipping_rmb: 0, exchange_rate: 3500, import_price_vnd: 3.5, wholesale_price_vnd: 7, retail_price_vnd: 8, is_locked: false, is_active: true, available_for_sale_at: new Date().toISOString(), import_date: today, warehouse_date: today, condition_note: tag });
check('create laptop', laptopResult.ok, { error: laptopResult.body }); const laptop = laptopResult.body[0];
const created = await api('/api/orders', 'POST', { createdDate: today, orderType: 'retail', orderStatus: 'new', paymentStatus: 'unpaid', salePrice: 8, laptopId: laptop.id, requestedLaptopId: laptop.id, customerId: customer.id, branchId, note: tag, isActive: true });
check('create order', created.ok, { status: created.status, error: created.body?.error }); const order = created.body.order || created.body;
const deposit = await api('/api/payments', 'POST', { orderId: order.id, amount: 2, paymentType: 'deposit', paymentMethod: 'transfer_cash', paymentDate: today, accountId, referenceCode: tag, note: tag, idempotencyKey: randomUUID() });
check('record deposit', deposit.ok, { status: deposit.status, error: deposit.body?.error });
const refundKey = randomUUID();
const refund = await api('/api/payments', 'POST', { orderId: order.id, amount: 2, paymentType: 'refund', paymentMethod: 'transfer_cash', paymentDate: today, accountId, referenceCode: tag, note: `${tag} refund`, idempotencyKey: refundKey });
check('refund full deposit', refund.ok, { status: refund.status, error: refund.body?.error });
const refundRetry = await api('/api/payments', 'POST', { orderId: order.id, amount: 2, paymentType: 'refund', paymentMethod: 'transfer_cash', paymentDate: today, accountId, referenceCode: tag, note: `${tag} refund`, idempotencyKey: refundKey });
check('refund retry is idempotent', refundRetry.ok && (refundRetry.body.payment?.id || refundRetry.body.id) === (refund.body.payment?.id || refund.body.id), { status: refundRetry.status });
const overRefund = await api('/api/payments', 'POST', { orderId: order.id, amount: 0.01, paymentType: 'refund', paymentMethod: 'transfer_cash', paymentDate: today, accountId, referenceCode: tag, note: tag, idempotencyKey: randomUUID() });
check('refund above paid amount blocked', !overRefund.ok, { status: overRefund.status });
const cancelled = await api('/api/orders', 'POST', { id: order.id, createdDate: today, orderType: 'retail', orderStatus: 'cancelled', deliveryStatus: 'returned', salePrice: 8, laptopId: laptop.id, requestedLaptopId: laptop.id, customerId: customer.id, branchId, cancelReason: tag, cancelledAt: new Date().toISOString(), note: tag });
check('cancel refunded order', cancelled.ok, { status: cancelled.status, error: cancelled.body?.error });
const [finalOrderResult, finalLaptopResult, ledgerResult, accountAfterResult, receivableResult, invoiceAttempt] = await Promise.all([
  rest(`orders?id=eq.${order.id}&select=id,order_status,payment_status,amount_paid,debt_amount,is_active`),
  rest(`laptops?id=eq.${laptop.id}&select=id,status,is_locked`),
  rest(`account_transactions?reference_type=eq.PAYMENT&select=direction,amount,reference_id&reference_id=in.(${deposit.body.payment.id},${refund.body.payment.id})`),
  rest(`cash_account_balances?id=eq.${accountId}&select=recorded_balance,last_difference`),
  rest(`customer_receivable_summaries?order_id=eq.${order.id}&select=order_id`),
  api('/api/invoices', 'POST', { orderId: order.id }),
]);
const finalOrder = finalOrderResult.body[0], finalLaptop = finalLaptopResult.body[0];
check('cancelled order retains refund audit state', finalOrder.order_status === 'cancelled' && finalOrder.payment_status === 'refunded' && Number(finalOrder.amount_paid) === 0, { order: finalOrder });
check('cancelled order releases laptop', finalLaptop.status === 'available' && finalLaptop.is_locked === false, { laptop: finalLaptop });
check('cash ledger has one IN and one OUT', ledgerResult.ok && ledgerResult.body.length === 2 && new Set(ledgerResult.body.map(row => row.direction)).size === 2, { ledger: ledgerResult.body });
check('cash account returns to opening balance', Number(accountAfterResult.body[0].recorded_balance) === openingBalance && Number(accountAfterResult.body[0].last_difference || 0) === 0, { account: accountAfterResult.body[0] });
check('cancelled order excluded from receivables', receivableResult.ok && receivableResult.body.length === 0, { receivable: receivableResult.body });
check('cancelled order cannot issue invoice', !invoiceAttempt.ok, { status: invoiceAttempt.status });
console.log(JSON.stringify({ tag, checksPassed: checks.length, orderId: order.id, laptopId: laptop.id, checks }, null, 2));
