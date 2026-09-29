import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';

const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
}));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const app = process.env.APP_URL || 'http://localhost:3000';
if (!base || !anon || !service || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('Missing Phase 8 live QA environment');

const stamp = Date.now().toString(36).toUpperCase();
const tag = `TEST-FIN-${stamp}`;
const today = new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const checks = [];
const qaUsers = [];
const parse = async response => { const text = await response.text(); try { return JSON.parse(text); } catch { return text; } };
const check = (name, pass, detail = {}) => checks.push({ name, pass: Boolean(pass), ...detail });
const must = (name, pass, detail = {}) => { check(name, pass, detail); if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`); };
const login = async (email, password) => {
  const response = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await parse(response);
  must(`login ${email}`, response.ok, { status: response.status, error: body?.error_description });
  return body.access_token;
};
const api = async (path, token, method = 'GET', body) => {
  const response = await fetch(app + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};
const rest = async (path, method = 'GET', body, token = service) => {
  const response = await fetch(`${base}/rest/v1/${path}`, { method, headers: { apikey: service, Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json', Prefer: 'return=representation' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};
const rows = async path => { const result = await rest(path); must(`REST ${path}`, result.ok, { status: result.status, error: result.body }); return result.body; };
const one = async path => (await rows(`${path}${path.includes('?') ? '&' : '?'}limit=1`))[0];
const balance = async id => Number((await one(`cash_account_balances?id=eq.${id}&select=recorded_balance`)).recorded_balance);
const count = async path => (await rows(path)).length;
const post = (path, token, body) => api(path, token, 'POST', body);
const amountEq = (actual, expected) => Math.abs(Number(actual) - Number(expected)) < 0.01;

let admin;
try {
  admin = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  for (const role of ['SALES', 'TECH', 'TECHNICAL', 'STAFF']) {
    const password = `Qa!${randomBytes(12).toString('base64url')}9a`;
    const email = `${tag.toLowerCase()}-${role.toLowerCase()}@example.com`;
    const created = await api('/api/users', admin, 'POST', { email, password, name: `${tag}-${role}`, role });
    must(`create ${role}`, created.ok, { status: created.status, error: created.body?.error });
    qaUsers.push({ role, id: created.body.id, token: await login(email, password) });
  }

  for (const user of qaUsers) {
    for (const endpoint of ['/api/financial-operations', '/api/account-transactions', '/api/account-reconciliations', '/api/receivables', '/api/payables', '/api/cod']) {
      const result = await api(endpoint, user.token);
      check(`${user.role} denied ${endpoint}`, result.status === 403, { status: result.status });
    }
    const accountList = await api('/api/cash-accounts?currency=VND', user.token);
    check(`${user.role} cash account policy`, user.role === 'SALES' ? accountList.ok && accountList.body.every(item => !('recorded_balance' in item)) : accountList.status === 403, { status: accountList.status });
    for (const table of ['cash_accounts', 'account_transactions', 'account_reconciliations', 'cod_receivables', 'cod_settlements']) {
      const direct = await rest(`${table}?select=id&limit=1`, 'GET', undefined, user.token);
      check(`${user.role} RLS ${table}`, !direct.ok, { status: direct.status });
    }
    const rpc = await rest('rpc/get_financial_operations_summary', 'POST', {}, user.token);
    check(`${user.role} direct RPC denied`, !rpc.ok, { status: rpc.status });
  }

  const accountSpecs = [
    ['CASH', 'VND', 100000000], ['BANK', 'VND', 200000000], ['WECHAT', 'CNY', 50000], ['ALIPAY', 'CNY', 30000],
  ];
  const accounts = {};
  for (const [type, currency, opening] of accountSpecs) {
    const code = `${tag}-${type}-${currency}`.slice(0, 40);
    const created = await post('/api/cash-accounts', admin, { code, name: code, accountType: type, currency, openingBalance: opening, openingBalanceAt: `${today}T00:00:00.000Z` });
    must(`create ${type} ${currency}`, created.ok, { status: created.status, error: created.body?.error });
    accounts[`${type}_${currency}`] = created.body;
    check(`${type} opening balance`, amountEq(await balance(created.body.id), opening), { expected: opening });
    check(`${type} account metadata`, created.body.currency === currency && created.body.account_type === type && Boolean(created.body.opening_balance_at));
  }

  const order = (await rest('orders', 'POST', { created_date: today, sale_online: tag, note: tag, order_type: 'retail', order_status: 'done', payment_status: 'partial', payment_method: 'BANK_TRANSFER', delivery_status: 'delivered', shipping_method: 'test', sale_price: 20, deposit_amount: 5, cod_amount: 0, amount_paid: 5, debt_amount: 15, customer_info: tag, tracking_code: `${tag}-ORDER`, is_active: true })).body[0];
  must('create customer receivable fixture', Boolean(order?.id), { body: order });
  let receivable = await one(`customer_receivable_summaries?order_id=eq.${order.id}`);
  check('receivable starts at 15m', amountEq(receivable.debt_amount, 15));
  check('null due date is not overdue', receivable.aging_bucket === 'NO_DUE_DATE', { aging: receivable.aging_bucket });
  const bankStart = await balance(accounts.BANK_VND.id);
  const paymentKey = `${tag}-CUSTOMER-PARTIAL`;
  const paymentBody = { orderId: order.id, amount: 10, paymentType: 'balance', paymentMethod: 'BANK_TRANSFER', paymentDate: today, referenceCode: tag, note: tag, accountId: accounts.BANK_VND.id, idempotencyKey: paymentKey };
  const payment = await post('/api/payments', admin, paymentBody);
  must('customer partial payment', payment.ok, { status: payment.status, error: payment.body?.error });
  check('customer payment cash effect', amountEq(await balance(accounts.BANK_VND.id), bankStart + 10000000));
  check('customer debt after partial', amountEq((await one(`orders?id=eq.${order.id}&select=debt_amount`)).debt_amount, 5));
  const paymentRetry = await post('/api/payments', admin, paymentBody);
  check('customer payment idempotency response', paymentRetry.ok, { status: paymentRetry.status });
  check('customer payment unique ledger', await count(`account_transactions?idempotency_key=eq.${paymentKey}-CASH&select=id`) === 1);
  const concurrencyKey = `${tag}-CUSTOMER-CONCURRENT`;
  const concurrentPayment = { ...paymentBody, amount: 1, idempotencyKey: concurrencyKey };
  await Promise.all([post('/api/payments', admin, concurrentPayment), post('/api/payments', admin, concurrentPayment)]);
  check('customer payment concurrency', await count(`account_transactions?idempotency_key=eq.${concurrencyKey}-CASH&select=id`) === 1);
  const debtAfterConcurrent = Number((await one(`orders?id=eq.${order.id}&select=debt_amount`)).debt_amount);
  const finalPayment = await post('/api/payments', admin, { ...paymentBody, amount: debtAfterConcurrent, idempotencyKey: `${tag}-CUSTOMER-FINAL` });
  check('customer full payment', finalPayment.ok && amountEq((await one(`orders?id=eq.${order.id}&select=debt_amount`)).debt_amount, 0), { status: finalPayment.status });
  check('fully paid absent from receivables', (await rows(`customer_receivable_summaries?order_id=eq.${order.id}`)).length === 0);
  const overBefore = await count(`payments?order_id=eq.${order.id}&select=id`);
  const overpay = await post('/api/payments', admin, { ...paymentBody, amount: 1, idempotencyKey: `${tag}-CUSTOMER-OVER` });
  check('customer overpayment blocked atomically', !overpay.ok && await count(`payments?order_id=eq.${order.id}&select=id`) === overBefore, { status: overpay.status });

  const supplier = (await rest('suppliers', 'POST', { code: `F${stamp}`.slice(0, 40), name: `${tag}-SUPPLIER`, created_by: tag })).body[0];
  const batch = (await rest('purchase_batches', 'POST', { batch_code: `${tag}-PO`, supplier_id: supplier.id, purchase_date: today, exchange_rate: 3500, subtotal_rmb: 20000, status: 'CONFIRMED', created_by: tag, updated_by: tag })).body[0];
  await rest('supplier_payments', 'POST', { supplier_id: supplier.id, purchase_batch_id: batch.id, amount_rmb: 12000, exchange_rate: 3500, amount_vnd: 42000000, payment_method: 'WECHAT', payment_date: today, reference: tag, notes: tag, recorded_by: tag, idempotency_key: `${tag}-SUPPLIER-SEED` });
  check('supplier payable starts at 8k', amountEq((await one(`purchase_batch_summaries?id=eq.${batch.id}`)).debt_rmb, 8000));
  const wechatStart = await balance(accounts.WECHAT_CNY.id);
  const supplierKey = `${tag}-SUPPLIER-PAY`;
  const supplierBody = { purchaseBatchId: batch.id, amountRmb: 5000, exchangeRate: 3500, paymentMethod: 'WECHAT', paymentDate: today, reference: tag, notes: tag, accountId: accounts.WECHAT_CNY.id, idempotencyKey: supplierKey };
  const supplierPayment = await post('/api/supplier-payments', admin, supplierBody);
  must('supplier payment', supplierPayment.ok, { status: supplierPayment.status, error: supplierPayment.body?.error });
  check('supplier payment cash effect', amountEq(await balance(accounts.WECHAT_CNY.id), wechatStart - 5000));
  check('supplier debt after payment', amountEq((await one(`purchase_batch_summaries?id=eq.${batch.id}`)).debt_rmb, 3000));
  await post('/api/supplier-payments', admin, supplierBody);
  check('supplier payment idempotency', await count(`supplier_payments?idempotency_key=eq.${supplierKey}&select=id`) === 1 && await count(`account_transactions?idempotency_key=eq.${supplierKey}-CASH&select=id`) === 1);
  const supplierConcurrentKey = `${tag}-SUPPLIER-CONCURRENT`;
  const supplierConcurrent = { ...supplierBody, amountRmb: 500, idempotencyKey: supplierConcurrentKey };
  await Promise.all([post('/api/supplier-payments', admin, supplierConcurrent), post('/api/supplier-payments', admin, supplierConcurrent)]);
  check('supplier payment concurrency', await count(`supplier_payments?idempotency_key=eq.${supplierConcurrentKey}&select=id`) === 1 && await count(`account_transactions?idempotency_key=eq.${supplierConcurrentKey}-CASH&select=id`) === 1);
  const wrongSupplier = await post('/api/supplier-payments', admin, { ...supplierBody, amountRmb: 100, accountId: accounts.BANK_VND.id, idempotencyKey: `${tag}-SUPPLIER-WRONG-CURRENCY` });
  check('supplier payment currency guard', !wrongSupplier.ok, { status: wrongSupplier.status });

  const itemResult = await rest('purchase_items', 'POST', { purchase_batch_id: batch.id, model: `${tag}-RETURN`, serial: null, purchase_price_rmb: 5000, status: 'CONFIRMED' });
  must('create supplier return purchase item', itemResult.ok && Boolean(itemResult.body?.[0]?.id), { status: itemResult.status, error: itemResult.body });
  const originalItem = itemResult.body[0];
  const laptopResult = await rest('laptops', 'POST', { serial: `${tag}-RETURN`, name: `${tag}-RETURN`, category: 'TEST', location: 'BAC_NINH', charger_status: 'UNKNOWN', status: 'qc_failed', price_rmb: 5000, exchange_rate: 3500, import_price_vnd: 17500000, is_locked: true, is_active: true, purchase_item_id: originalItem.id });
  must('create supplier return laptop', laptopResult.ok && Boolean(laptopResult.body?.[0]?.id), { status: laptopResult.status, error: laptopResult.body });
  const laptop = laptopResult.body[0];
  await rest(`purchase_items?id=eq.${originalItem.id}`, 'PATCH', { laptop_id: laptop.id, status: 'RECEIVED' });
  const returnResult = await rest('supplier_returns', 'POST', { return_code: `${tag}-RT`, supplier_id: supplier.id, status: 'WAITING_REFUND', reason: 'OTHER', resolution_type: 'REFUND', created_by: tag, idempotency_key: `${tag}-RETURN` });
  must('create supplier return', returnResult.ok && Boolean(returnResult.body?.[0]?.id), { status: returnResult.status, error: returnResult.body });
  const supplierReturn = returnResult.body[0];
  const returnItemResult = await rest('supplier_return_items', 'POST', { supplier_return_id: supplierReturn.id, laptop_id: laptop.id, purchase_item_id: originalItem.id, reason: 'OTHER', status: 'ACTIVE', expected_refund_rmb: 5000, agreed_refund_rmb: 5000 });
  must('create supplier return item', returnItemResult.ok, { status: returnItemResult.status, error: returnItemResult.body });
  const alipayStart = await balance(accounts.ALIPAY_CNY.id);
  const refundKey = `${tag}-SUPPLIER-REFUND`;
  const refundBody = { action: 'refund', id: supplierReturn.id, amountRmb: 3000, exchangeRate: 3500, method: 'ALIPAY', reference: tag, receivedAt: now(), accountId: accounts.ALIPAY_CNY.id, idempotencyKey: refundKey };
  const refund = await post('/api/supplier-returns', admin, refundBody);
  must('supplier refund', refund.ok, { status: refund.status, error: refund.body?.error });
  check('supplier refund cash effect', amountEq(await balance(accounts.ALIPAY_CNY.id), alipayStart + 3000));
  await post('/api/supplier-returns', admin, refundBody);
  check('supplier refund idempotency', await count(`supplier_refunds?idempotency_key=eq.${refundKey}&select=id`) === 1 && await count(`account_transactions?idempotency_key=eq.${refundKey}-CASH&select=id`) === 1);
  const overRefund = await post('/api/supplier-returns', admin, { ...refundBody, amountRmb: 2001, idempotencyKey: `${tag}-REFUND-OVER` });
  check('supplier over-refund blocked', !overRefund.ok, { status: overRefund.status });
  const refundConcurrentKey = `${tag}-REFUND-CONCURRENT`;
  const concurrentRefund = { ...refundBody, amountRmb: 500, idempotencyKey: refundConcurrentKey };
  await Promise.all([post('/api/supplier-returns', admin, concurrentRefund), post('/api/supplier-returns', admin, concurrentRefund)]);
  check('supplier refund concurrency', await count(`supplier_refunds?idempotency_key=eq.${refundConcurrentKey}&select=id`) === 1 && await count(`account_transactions?idempotency_key=eq.${refundConcurrentKey}-CASH&select=id`) === 1);
  const wrongRefund = await post('/api/supplier-returns', admin, { ...refundBody, amountRmb: 100, accountId: accounts.CASH_VND.id, idempotencyKey: `${tag}-REFUND-WRONG-CURRENCY` });
  check('supplier refund currency guard', !wrongRefund.ok, { status: wrongRefund.status });

  const vndBefore = await balance(accounts.BANK_VND.id) + await balance(accounts.CASH_VND.id);
  const transferKey = `${tag}-TRANSFER`;
  const transferBody = { action: 'transfer', sourceAccountId: accounts.BANK_VND.id, destinationAccountId: accounts.CASH_VND.id, amount: 20000000, occurredAt: now(), description: tag, idempotencyKey: transferKey };
  const transfer = await post('/api/account-transactions', admin, transferBody);
  must('same-currency transfer', transfer.ok, { status: transfer.status, error: transfer.body?.error });
  await post('/api/account-transactions', admin, transferBody);
  check('transfer idempotency', await count(`account_transactions?idempotency_key=in.(${transferKey}-OUT,${transferKey}-IN)&select=id`) === 2);
  check('transfer total unchanged', amountEq(await balance(accounts.BANK_VND.id) + await balance(accounts.CASH_VND.id), vndBefore));
  const transferConcurrentKey = `${tag}-TRANSFER-CONCURRENT`;
  const concurrentTransfer = { ...transferBody, amount: 100000, idempotencyKey: transferConcurrentKey };
  await Promise.all([post('/api/account-transactions', admin, concurrentTransfer), post('/api/account-transactions', admin, concurrentTransfer)]);
  check('transfer concurrency', await count(`account_transactions?idempotency_key=in.(${transferConcurrentKey}-OUT,${transferConcurrentKey}-IN)&select=id`) === 2);
  const cross = await post('/api/account-transactions', admin, { ...transferBody, destinationAccountId: accounts.WECHAT_CNY.id, idempotencyKey: `${tag}-TRANSFER-CROSS` });
  check('cross-currency transfer explicit block', cross.status === 400, { status: cross.status });
  const manualKey = `${tag}-MANUAL`;
  const manual = await post('/api/account-transactions', admin, { action: 'manual', accountId: accounts.CASH_VND.id, direction: 'OUT', amount: 500000, description: tag, occurredAt: now(), idempotencyKey: manualKey });
  check('manual transaction', manual.ok && await count(`account_transactions?idempotency_key=eq.${manualKey}&select=id`) === 1, { status: manual.status });
  for (const [label, amount, description] of [['zero', 0, tag], ['negative', -1, tag], ['description', 1, '']]) {
    const invalid = await post('/api/account-transactions', admin, { action: 'manual', accountId: accounts.CASH_VND.id, direction: 'OUT', amount, description, occurredAt: now(), idempotencyKey: `${tag}-INVALID-${label}` });
    check(`manual ${label} blocked`, !invalid.ok, { status: invalid.status });
  }
  const recorded = await balance(accounts.CASH_VND.id);
  const reconciliation = await post('/api/account-reconciliations', admin, { accountId: accounts.CASH_VND.id, actualBalance: recorded - 500000, reconciledAt: now(), notes: tag });
  check('reconciliation locking and difference', reconciliation.ok && amountEq(reconciliation.body.difference, -500000), { status: reconciliation.status, error: reconciliation.body?.error });
  check('reconciliation does not adjust ledger', amountEq(await balance(accounts.CASH_VND.id), recorded));

  const codOrder = (await rest('orders', 'POST', { created_date: today, sale_online: tag, note: tag, order_type: 'retail', order_status: 'shipping', payment_status: 'partial', payment_method: 'cod', delivery_status: 'shipping', shipping_method: 'COD', sale_price: 25, deposit_amount: 5, cod_amount: 20, amount_paid: 5, debt_amount: 20, customer_info: tag, tracking_code: `${tag}-COD`, is_active: true })).body[0];
  const codKey = `${tag}-COD-CREATE`;
  const codCreate = await post('/api/cod', admin, { action: 'create', orderId: codOrder.id, carrier: 'TEST', trackingNumber: `${tag}-COD`, notes: tag, idempotencyKey: codKey });
  must('COD creation', codCreate.ok, { status: codCreate.status, error: codCreate.body?.error });
  const codId = codCreate.body.id;
  check('COD expected authoritative', amountEq(codCreate.body.expected_cod_amount_vnd, 20000000));
  const delivered = await post('/api/cod', admin, { action: 'transition', id: codId, target: 'DELIVERED', notes: tag });
  check('COD DELIVERED', delivered.ok && delivered.body.status === 'DELIVERED', { status: delivered.status, error: delivered.body?.error });
  const deliveredOrder = await one(`orders?id=eq.${codOrder.id}&select=debt_amount`);
  const deliveredCod = await one(`cod_receivable_summaries?id=eq.${codId}`);
  check('COD/customer receivable non-double-count', amountEq(deliveredOrder.debt_amount, 0) && amountEq(deliveredCod.outstanding_vnd, 20000000));
  const invalidCod = await post('/api/cod', admin, { action: 'transition', id: codId, target: 'DELIVERED', notes: tag });
  check('invalid COD transition blocked', !invalidCod.ok, { status: invalidCod.status });
  const waiting = await post('/api/cod', admin, { action: 'transition', id: codId, target: 'WAITING_SETTLEMENT', notes: tag });
  check('COD waiting settlement', waiting.ok && waiting.body.status === 'WAITING_SETTLEMENT');
  const settlementKey = `${tag}-COD-PARTIAL`;
  const settlementBody = { action: 'settle', id: codId, amountVnd: 15000000, accountId: accounts.BANK_VND.id, reference: tag, settledAt: now(), idempotencyKey: settlementKey };
  await Promise.all([post('/api/cod', admin, settlementBody), post('/api/cod', admin, settlementBody)]);
  check('COD settlement concurrency/idempotency', await count(`cod_settlements?idempotency_key=eq.${settlementKey}&select=id`) === 1 && await count(`account_transactions?idempotency_key=eq.${settlementKey}-CASH&select=id`) === 1);
  let codSummary = await one(`cod_receivable_summaries?id=eq.${codId}`);
  check('COD partial settlement', codSummary.status === 'PARTIALLY_SETTLED' && amountEq(codSummary.outstanding_vnd, 5000000), { status: codSummary.status, outstanding: codSummary.outstanding_vnd });
  const overSettle = await post('/api/cod', admin, { ...settlementBody, amountVnd: 5100000, idempotencyKey: `${tag}-COD-OVER` });
  check('COD over-settlement blocked', !overSettle.ok, { status: overSettle.status });
  const finalSettle = await post('/api/cod', admin, { ...settlementBody, amountVnd: 5000000, idempotencyKey: `${tag}-COD-FINAL` });
  codSummary = await one(`cod_receivable_summaries?id=eq.${codId}`);
  check('COD full settlement', finalSettle.ok && codSummary.status === 'SETTLED' && amountEq(codSummary.outstanding_vnd, 0));
  const returnOrder = (await rest('orders', 'POST', { created_date: today, sale_online: tag, note: tag, order_type: 'retail', order_status: 'shipping', payment_status: 'unpaid', payment_method: 'cod', delivery_status: 'shipping', shipping_method: 'COD', sale_price: 10, deposit_amount: 0, cod_amount: 10, amount_paid: 0, debt_amount: 10, customer_info: tag, tracking_code: `${tag}-COD-RETURN`, is_active: true })).body[0];
  const returnCod = await post('/api/cod', admin, { action: 'create', orderId: returnOrder.id, carrier: 'TEST', notes: tag, idempotencyKey: `${tag}-COD-RETURN-CREATE` });
  const returned = await post('/api/cod', admin, { action: 'transition', id: returnCod.body.id, target: 'RETURNED', notes: tag });
  check('COD returned without settlement', returned.ok && await count(`cod_settlements?cod_receivable_id=eq.${returnCod.body.id}&select=id`) === 0);
  const disputedOrder = (await rest('orders', 'POST', { created_date: today, sale_online: tag, note: tag, order_type: 'retail', order_status: 'shipping', payment_status: 'unpaid', payment_method: 'cod', delivery_status: 'shipping', shipping_method: 'COD', sale_price: 8, deposit_amount: 0, cod_amount: 8, amount_paid: 0, debt_amount: 8, customer_info: tag, tracking_code: `${tag}-COD-DISPUTE`, is_active: true })).body[0];
  const disputedCod = await post('/api/cod', admin, { action: 'create', orderId: disputedOrder.id, carrier: 'TEST', expectedSettlementAt: null, notes: tag, idempotencyKey: `${tag}-COD-DISPUTE-CREATE` });
  await post('/api/cod', admin, { action: 'transition', id: disputedCod.body.id, target: 'DELIVERED', notes: tag });
  const disputed = await post('/api/cod', admin, { action: 'transition', id: disputedCod.body.id, target: 'DISPUTED', notes: tag });
  check('COD disputed remains outstanding', disputed.ok && disputed.body.status === 'DISPUTED' && amountEq((await one(`cod_receivable_summaries?id=eq.${disputedCod.body.id}`)).outstanding_vnd, 8000000));
  const summary = await post('/api/financial-operations', admin, {});
  check('finance summary API live', summary.status !== 404);
  const directSummary = await rest('rpc/get_financial_operations_summary', 'POST', {});
  check('currency-separated account summary', directSummary.ok && directSummary.body.accounts.some(item => item.currency === 'VND') && directSummary.body.accounts.some(item => item.currency === 'CNY'));
  const ledgerRow = await one(`account_transactions?idempotency_key=eq.${manualKey}`);
  check('account ledger update blocked', !(await rest(`account_transactions?id=eq.${ledgerRow.id}`, 'PATCH', { description: 'MUTATED' })).ok);
  check('account ledger delete blocked', !(await rest(`account_transactions?id=eq.${ledgerRow.id}`, 'DELETE')).ok);
  const settlementRow = await one(`cod_settlements?idempotency_key=eq.${settlementKey}`);
  check('COD settlement update blocked', !(await rest(`cod_settlements?id=eq.${settlementRow.id}`, 'PATCH', { reference: 'MUTATED' })).ok);
  check('COD settlement delete blocked', !(await rest(`cod_settlements?id=eq.${settlementRow.id}`, 'DELETE')).ok);
  for (let index = 0; index < 12; index += 1) {
    await post('/api/account-transactions', admin, { action: 'manual', accountId: accounts.BANK_VND.id, direction: 'IN', amount: 1, description: `${tag}-PAGE-${index}`, occurredAt: now(), idempotencyKey: `${tag}-PAGE-${index}` });
  }
  const page1 = await api(`/api/account-transactions?page=1&limit=10&account=${accounts.BANK_VND.id}`, admin);
  const page2 = await api(`/api/account-transactions?page=2&limit=10&account=${accounts.BANK_VND.id}`, admin);
  const page1Ids = new Set(page1.body?.data?.map(item => item.id) || []);
  check('transaction pagination stable/no duplicates', page1.ok && page2.ok && page1.body.data.length === 10 && page2.body.data.length > 0 && page2.body.data.every(item => !page1Ids.has(item.id)) && page1.body.limit === 10, { page1: page1.status, page2: page2.status });
  const logs = await rows(`activity_logs?user_name=eq.Admin&created_at=gte.${encodeURIComponent(`${today}T00:00:00.000Z`)}&select=entity_type,entity_id,action,changes,user_name`);
  check('Phase 8 activity logs present', logs.some(item => item.entity_id === accounts.CASH_VND.id && item.changes?.event === 'CASH_ACCOUNT_CREATED') && logs.some(item => item.changes?.event === 'ACCOUNT_TRANSFER') && logs.some(item => item.entity_id === accounts.CASH_VND.id && item.changes?.event === 'ACCOUNT_RECONCILED') && logs.some(item => String(item.changes?.event || '').startsWith('COD_')));
} catch (error) {
  check('fatal setup/execution', false, { error: error.message });
} finally {
  if (admin) {
    for (const user of qaUsers) {
      const disabled = await api('/api/users', admin, 'PUT', { id: user.id, is_active: false });
      check(`deactivate ${user.role}`, disabled.ok, { status: disabled.status });
    }
  }
}

const failed = checks.filter(item => !item.pass);
console.log(JSON.stringify({ tag, checksPassed: checks.length - failed.length, failed: failed.length, total: checks.length, qaAccountsDeactivated: qaUsers.length === 4 && qaUsers.every(user => checks.some(item => item.name === `deactivate ${user.role}` && item.pass)), testDataRetained: true, checks }, null, 2));
if (failed.length) process.exitCode = 1;
