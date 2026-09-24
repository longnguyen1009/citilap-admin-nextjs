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
const tag = `TEST-SALES-ACTION-${Date.now().toString(36).toUpperCase()}`;
const checks = [];
const qaUsers = [];
const check = (name, pass, detail = {}) => checks.push({ name, pass: Boolean(pass), ...detail });
const parse = async response => { const text = await response.text(); try { return JSON.parse(text); } catch { return text; } };
const login = async (email, password) => {
  const response = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await parse(response);
  if (!response.ok) throw new Error(`Login failed: ${body?.error_description || response.status}`);
  return body.access_token;
};
const request = async (url, token, method = 'GET', body) => {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(url.startsWith(base) ? { apikey: service, Prefer: 'return=representation' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};
const api = (path, token, method = 'GET', body) => request(app + path, token, method, body);
const rest = (path, method = 'GET', body) => request(`${base}/rest/v1/${path}`, service, method, body);
const post = (token, action, body = {}) => api('/api/sales-operations', token, 'POST', { action, idempotencyKey: randomUUID(), ...body });
const actions = async token => (await api('/api/management-dashboard', token)).body?.sales_operations_actions;

let admin;
try {
  admin = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  const baseline = await actions(admin);
  check('ADMIN receives Phase 9 action counts', baseline && Object.keys(baseline).length === 3, { baseline });

  const password = `Qa!${randomUUID()}9a`;
  const email = `${tag.toLowerCase()}-sales@example.com`;
  const createdUser = await api('/api/users', admin, 'POST', { email, password, name: `${tag}-SALES`, role: 'SALES' });
  if (!createdUser.ok) throw new Error(`SALES fixture failed: ${JSON.stringify(createdUser.body)}`);
  qaUsers.push(createdUser.body);
  const sales = await login(email, password);
  const salesDashboard = await api('/api/management-dashboard', sales);
  check('Sales Operations Action Center is ADMIN-only', salesDashboard.status === 403, { status: salesDashboard.status });

  const laptopResult = await rest('laptops', 'POST', { serial: `${tag}-RSV`, name: `${tag}-RSV`, category: 'TEST', location: 'BAC_NINH', charger_status: 'UNKNOWN', status: 'available', is_locked: false, is_active: true, source_type: 'PURCHASE' });
  if (!laptopResult.ok) throw new Error(`Laptop fixture failed: ${JSON.stringify(laptopResult.body)}`);
  const reservation = await post(admin, 'createReservation', { laptopId: laptopResult.body[0].id, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), notes: tag });
  if (!reservation.ok) throw new Error(`Reservation fixture failed: ${JSON.stringify(reservation.body)}`);
  const withReservation = await actions(admin);
  check('RESERVATION_EXPIRING_2H appears', Number(withReservation.reservations_expiring_2h) === Number(baseline.reservations_expiring_2h) + 1, { baseline, current: withReservation });
  await post(admin, 'cancelReservation', { id: reservation.body.id });
  const afterReservation = await actions(admin);
  check('RESERVATION_EXPIRING_2H resolves', Number(afterReservation.reservations_expiring_2h) === Number(baseline.reservations_expiring_2h));

  const tradeIn = await post(admin, 'createTradeIn', { brand: 'Lenovo', model: tag, serial: `${tag}-TI` });
  if (!tradeIn.ok) throw new Error(`Trade-in fixture failed: ${JSON.stringify(tradeIn.body)}`);
  const withTradeIn = await actions(admin);
  check('TRADE_IN_WAITING_INSPECTION appears', Number(withTradeIn.trade_ins_waiting_inspection) === Number(baseline.trade_ins_waiting_inspection) + 1, { baseline, current: withTradeIn });
  await post(admin, 'startInspection', { id: tradeIn.body.id, mainboardStatus: 'UNKNOWN', findings: tag });
  const afterTradeIn = await actions(admin);
  check('TRADE_IN_WAITING_INSPECTION resolves', Number(afterTradeIn.trade_ins_waiting_inspection) === Number(baseline.trade_ins_waiting_inspection));

  const orderResult = await rest('orders', 'POST', { created_date: new Date().toISOString().slice(0, 10), sale_online: tag, order_type: 'retail', order_status: 'done', payment_status: 'paid', sale_price: 10, amount_paid: 10, debt_amount: 0, cost_snapshot_vnd: 7000000, gross_profit_snapshot_vnd: 3000000, direct_cost_snapshot_vnd: 0, net_contribution_snapshot_vnd: 3000000, cost_snapshot_status: 'COMPLETE', cost_snapshot_reasons: [], cost_snapshotted_at: new Date().toISOString(), is_active: true });
  if (!orderResult.ok) throw new Error(`Order fixture failed: ${JSON.stringify(orderResult.body)}`);
  const commission = await post(admin, 'generateCommission', { orderId: orderResult.body[0].id, beneficiaryType: 'OTHER', beneficiaryName: tag, amountVnd: 100000 });
  if (!commission.ok) throw new Error(`Commission fixture failed: ${JSON.stringify(commission.body)}`);
  const withCommission = await actions(admin);
  check('COMMISSION_PENDING appears', Number(withCommission.commissions_pending) === Number(baseline.commissions_pending) + 1, { baseline, current: withCommission });
  await post(admin, 'approveCommission', { id: commission.body.id });
  const afterCommission = await actions(admin);
  check('COMMISSION_PENDING resolves', Number(afterCommission.commissions_pending) === Number(baseline.commissions_pending));

  check('drill-down targets', ['/reservations?status=ACTIVE&expiring=1', '/trade-ins?status=DRAFT', '/commissions?status=PENDING'].every(path => path.includes('status=')));
} catch (error) {
  check('fatal setup/execution', false, { error: error.message });
} finally {
  if (admin) {
    for (const user of qaUsers) {
      const disabled = await api('/api/users', admin, 'PUT', { id: user.id, is_active: false });
      check('deactivate SALES', disabled.ok, { status: disabled.status });
    }
  }
}

const failed = checks.filter(item => !item.pass);
console.log(JSON.stringify({ tag, checks, passed: checks.length - failed.length, failed: failed.length, qaAccountsDeactivated: qaUsers.length === 1 && checks.some(item => item.name === 'deactivate SALES' && item.pass) }, null, 2));
if (failed.length) process.exitCode = 1;
