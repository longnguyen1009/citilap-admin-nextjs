import { readFile } from 'node:fs/promises';

const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
}));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const app = process.env.APP_URL || 'http://localhost:3000';
if (!base || !anon || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('Missing live regression environment');
const parse = async response => { const text = await response.text(); try { return JSON.parse(text); } catch { return text; } };
const login = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
const session = await parse(login);
if (!login.ok) throw new Error(`ADMIN login failed: ${JSON.stringify(session)}`);
const headers = { Authorization: `Bearer ${session.access_token}` };
const checks = [];
for (const path of [
  '/api/inventory?all=true&limit=20', '/api/intake', '/api/qc', '/api/repairs',
  '/api/supplier-returns', '/api/costs', '/api/orders?all=true', '/api/customers',
  '/api/financial-operations', '/api/sales-operations?type=reservations',
  '/api/sales-operations?type=trade-ins', '/api/sales-operations?type=commissions',
]) {
  const response = await fetch(app + path, { headers });
  const body = await parse(response);
  checks.push({ path, pass: response.ok });
  console.log(response.ok ? 'PASS' : 'FAIL', path, response.status);
  if (!response.ok) console.error(body);
}
const profile = await fetch(app + '/api/users', { headers });
checks.push({ path: '/api/users', pass: profile.ok });
console.log(profile.ok ? 'PASS' : 'FAIL', '/api/users', profile.status);
const passed = checks.filter(check => check.pass).length;
console.log(`LIVE FULL REGRESSION READ GATE: PASS ${passed}/${checks.length}`);
if (passed !== checks.length) process.exitCode = 1;
