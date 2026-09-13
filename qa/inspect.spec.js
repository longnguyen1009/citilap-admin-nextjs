const { test } = require('@playwright/test');
const fs = require('node:fs');

function loadEnv() {
  const values = {};
  const text = fs.readFileSync('.env', 'utf8');
  text.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
  return values;
}

test('inspect CitiLap flows', async ({ page }) => {
  const env = loadEnv();
  const errors = [];
  const responses = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', request => responses.push(`FAILED ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', response => {
    if (response.url().includes('/auth/') || response.url().includes('/api/')) {
      responses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'qa/inspect-login.png', fullPage: true });
  console.log('LOGIN_TITLE=', await page.title());
  console.log('LOGIN_TEXT=', (await page.locator('body').innerText()).slice(0, 1000));
  console.log('LOGIN_INPUTS=', await page.locator('input').count());

  await page.locator('input[type="email"]').fill(env.ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(env.ADMIN_PASSWORD);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'qa/inspect-home.png', fullPage: true });
  console.log('AFTER_LOGIN_URL=', page.url());
  console.log('HOME_TEXT=', (await page.locator('body').innerText()).slice(0, 1500));
  console.log('LOCAL_STORAGE_KEYS=', await page.evaluate(() => Object.keys(localStorage)));
  console.log('RESPONSES=', JSON.stringify(responses));
  console.log('HOME_ERRORS=', JSON.stringify(errors));
});
