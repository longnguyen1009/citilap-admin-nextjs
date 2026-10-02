import { getPlatformProxy } from 'wrangler';
import { createUser } from '../lib/cloudflare/users.mjs';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
const marker = Date.now().toString(36);
const email = `sales-tech-${marker}@example.test`;
const password = `LocalTest-${marker}-Aa1!`;
const serial = `DIRECT-${marker}`;
let userId;
let laptopId;

async function platform() {
  return getPlatformProxy({ configPath: 'wrangler.jsonc', persist: true, remoteBindings: false });
}

try {
  let proxy = await platform();
  try {
    const user = await createUser(proxy.env.DB, { email, password, name: 'QA Sale Tech', role: 'SALES_TECH' });
    userId = user.id;
  } finally {
    await proxy.dispose();
  }

  const login = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Login failed: ${login.status} ${await login.text()}`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Login did not return a session cookie');

  const create = await fetch(`${baseUrl}/api/inventory?mode=create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin', Cookie: cookie },
    body: JSON.stringify({
      serial,
      name: 'Laptop kiểm thử nhập nội địa',
      category: 'legion_5_23_24',
      location: 'store',
      chargerStatus: 'with_charger',
      importPriceVnd: 12.34,
      priceRmb: 0,
      shippingRmb: 0,
      sourceReferenceId: '1',
      status: 'available',
      monthKey: new Intl.DateTimeFormat('en-GB', { month: '2-digit', year: 'numeric' }).format(new Date()),
    }),
  });
  const created = await create.json();
  if (!create.ok) throw new Error(`Direct create failed: ${create.status} ${JSON.stringify(created)}`);
  laptopId = created.id;
  if (created.importPriceVnd !== undefined) throw new Error('Sensitive import price leaked in non-admin response');
  if (created.domesticSourceName !== 'Nhập thợ VN') throw new Error('Domestic source label missing from response');

  const purchases = await fetch(`${baseUrl}/api/purchases`, { headers: { Cookie: cookie } });
  if (purchases.status !== 403) throw new Error(`SALES_TECH unexpectedly accessed purchases: ${purchases.status}`);

  proxy = await platform();
  try {
    const stored = await proxy.env.DB.prepare(
      'SELECT price_rmb,shipping_rmb,import_price_vnd,source_reference_id,seller FROM laptops WHERE id=?',
    ).bind(laptopId).first();
    if (!stored || Number(stored.price_rmb) !== 0 || Number(stored.shipping_rmb) !== 0
      || Number(stored.import_price_vnd) !== 12.34 || stored.source_reference_id !== '1'
      || stored.seller !== 'Nhập thợ VN') throw new Error(`Stored direct intake mismatch: ${JSON.stringify(stored)}`);
  } finally {
    await proxy.dispose();
  }

  console.log('PASS: SALES_TECH direct intake, redaction and purchase denial');
} finally {
  const proxy = await platform();
  try {
    if (laptopId) await proxy.env.DB.prepare('DELETE FROM laptops WHERE id=?').bind(laptopId).run();
    if (userId) await proxy.env.DB.prepare('DELETE FROM auth_users WHERE id=?').bind(userId).run();
  } finally {
    await proxy.dispose();
  }
}
