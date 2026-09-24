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

const origin = process.env.APP_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let inFlight = 0;
let maxConcurrentApiRequests = 0;
const requests = [];
const startedAt = new Map();

const isLocalApi = request => {
  const url = new URL(request.url());
  return url.origin === origin && url.pathname.startsWith('/api/');
};
page.on('request', request => {
  if (!isLocalApi(request)) return;
  inFlight += 1;
  maxConcurrentApiRequests = Math.max(maxConcurrentApiRequests, inFlight);
  startedAt.set(request, Date.now());
});
const finish = request => {
  if (!isLocalApi(request)) return;
  inFlight = Math.max(0, inFlight - 1);
  requests.push({
    path: new URL(request.url()).pathname,
    durationMs: Date.now() - (startedAt.get(request) || Date.now())
  });
  startedAt.delete(request);
};
page.on('requestfinished', finish);
page.on('requestfailed', finish);

await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').fill(env.ADMIN_EMAIL);
await page.locator('input[type="password"]').fill(env.ADMIN_PASSWORD);
const loginStartedAt = Date.now();
await page.getByRole('button', { name: /đăng nhập/i }).click();
await page.waitForURL(url => !url.pathname.endsWith('/login'));
const navigationReadyMs = Date.now() - loginStartedAt;
await page.getByText('TOÀN CẢNH VẬN HÀNH').waitFor({ timeout: 60_000 });
await page.locator('.route-loading-overlay').waitFor({ state: 'detached', timeout: 60_000 });
const dashboardReadyMs = Date.now() - loginStartedAt;

console.log(JSON.stringify({
  navigationReadyMs,
  dashboardReadyMs,
  maxConcurrentApiRequests,
  requests
}, null, 2));
assert(maxConcurrentApiRequests <= 2, `Có ${maxConcurrentApiRequests} API chạy đồng thời, vượt giới hạn 2`);
await browser.close();
