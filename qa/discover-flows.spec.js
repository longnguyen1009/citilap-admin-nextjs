const { test } = require('@playwright/test');
const fs = require('node:fs');

function loadEnv() {
  const values = {};
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
  return values;
}

async function login(page) {
  const env = loadEnv();
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(env.ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(env.ADMIN_PASSWORD);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL('http://localhost:3000/', { timeout: 15000 });
}

test('discover CitiLap flow selectors', async ({ page }) => {
  await login(page);
  for (const path of ['/settings', '/inventory', '/customers', '/orders']) {
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    console.log(`PATH=${path}`);
    console.log('BODY=', JSON.stringify((await page.locator('body').innerText()).slice(0, 2200)));
    console.log('BUTTONS=', JSON.stringify(await page.locator('button').allTextContents()));
    console.log('LABELS=', JSON.stringify(await page.locator('label').allTextContents()));
    console.log('INPUTS=', JSON.stringify(await page.locator('input').evaluateAll(items => items.map(item => ({ type: item.type, placeholder: item.placeholder, value: item.value })) )));
    console.log('SELECTS=', JSON.stringify(await page.locator('select').evaluateAll(items => items.map(item => ({ value: item.value, options: Array.from(item.options).slice(0, 8).map(option => ({ value: option.value, text: option.text })) })) )));
  }
});
