import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const requireFromQa = createRequire(path.join(os.tmpdir(), 'citilap-browser-qa', 'package.json'));
const { chromium } = requireFromQa('playwright');
const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
}));
assert(env.ADMIN_EMAIL && env.ADMIN_PASSWORD, 'Thiếu tài khoản ADMIN trong .env');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const origin = process.env.APP_URL || 'http://localhost:3000';
const targetRoute = process.argv[2] || process.env.PILOT_ROUTE || '/orders';
await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
await page.locator('input[type="email"]').fill(env.ADMIN_EMAIL);
await page.locator('input[type="password"]').fill(env.ADMIN_PASSWORD);
await page.getByRole('button', { name: /đăng nhập/i }).click();
await page.waitForURL(url => !url.pathname.endsWith('/login'));

const rows = [];
page.on('response', async response => {
  const url = new URL(response.url());
  if (url.origin !== origin || !url.pathname.startsWith('/api/')) return;
  try {
    const body = await response.body();
    const timing = response.request().timing();
    rows.push({
      path: `${url.pathname}${url.search}`,
      status: response.status(),
      bytes: body.byteLength,
      durationMs: timing.responseEnd >= 0 ? Math.round(timing.responseEnd) : null
    });
  } catch {
    rows.push({ path: `${url.pathname}${url.search}`, status: response.status(), bytes: null, durationMs: null });
  }
});

await page.goto(`${origin}${targetRoute}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
rows.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
const totalBytes = rows.reduce((sum, row) => sum + (row.bytes || 0), 0);
console.log(JSON.stringify({ route: targetRoute, requestCount: rows.length, totalBytes, rows }, null, 2));
await browser.close();
