import { readFile } from 'node:fs/promises';

if (!process.argv.includes('--apply')) throw new Error('Use --apply to prepare the current seed database');
const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/)
  .filter(line => line.includes('=') && !line.trim().startsWith('#'))
  .map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
  }));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !service) throw new Error('Missing Supabase environment');

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path}: ${data?.message || response.status}`);
  return data;
}

const existing = await request('cash_accounts?select=id,code,is_active');
const testAccounts = existing.filter(row => row.is_active && String(row.code).startsWith('TEST-'));
if (testAccounts.length) {
  await request('cash_accounts?code=like.TEST-*', { method: 'PATCH', body: { is_active: false } });
}

const pilotAccounts = [
  { code: 'PILOT_CASH_VND', name: 'Tiền mặt pilot', account_type: 'CASH', currency: 'VND' },
  { code: 'PILOT_BANK_VND', name: 'Ngân hàng pilot', account_type: 'BANK', currency: 'VND' },
  { code: 'PILOT_WECHAT_CNY', name: 'WeChat pilot', account_type: 'WECHAT', currency: 'CNY' },
  { code: 'PILOT_ALIPAY_CNY', name: 'Alipay pilot', account_type: 'ALIPAY', currency: 'CNY' },
];
const pilotOpeningBalanceAt = '2026-01-01T00:00:00.000Z';
const results = [];
for (const account of pilotAccounts) {
  const found = existing.find(row => row.code === account.code);
  if (found) {
    await request(`cash_accounts?id=eq.${found.id}`, { method: 'PATCH', body: { is_active: true, name: account.name, opening_balance_at: pilotOpeningBalanceAt } });
    results.push({ code: account.code, action: 'reactivated' });
  } else {
    await request('rpc/create_cash_account', {
      method: 'POST',
      body: {
        p_data: { ...account, opening_balance: 0, opening_balance_at: pilotOpeningBalanceAt },
        p_actor: 'PILOT_SETUP',
      },
    });
    results.push({ code: account.code, action: 'created' });
  }
}

console.log(JSON.stringify({ deactivatedTestAccounts: testAccounts.length, pilotAccounts: results }, null, 2));
