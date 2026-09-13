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

async function printModal(page, buttonName) {
  await page.getByRole('button', { name: buttonName }).click();
  const modal = page.locator('.modal-backdrop.active').last();
  await modal.waitFor();
  console.log(`MODAL=${buttonName}`);
  console.log('MODAL_TEXT=', JSON.stringify((await modal.innerText()).slice(0, 3500)));
  console.log('MODAL_INPUTS=', JSON.stringify(await modal.locator('input').evaluateAll(items => items.map((item, index) => ({ index, type: item.type, placeholder: item.placeholder, value: item.value, required: item.required })) )));
  console.log('MODAL_TEXTAREAS=', JSON.stringify(await modal.locator('textarea').evaluateAll(items => items.map((item, index) => ({ index, placeholder: item.placeholder, value: item.value, required: item.required })) )));
  console.log('MODAL_SELECTS=', JSON.stringify(await modal.locator('select').evaluateAll(items => items.map((item, index) => ({ index, value: item.value, options: Array.from(item.options).slice(0, 10).map(option => ({ value: option.value, text: option.text })) })) )));
  await modal.locator('button').filter({ hasText: /Hủy|Hủy bỏ/i }).first().click().catch(() => modal.locator('button').last().click());
}

test('discover CitiLap form controls', async ({ page }) => {
  await login(page);
  await page.goto('http://localhost:3000/inventory', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await printModal(page, /Thêm Máy Mới/);
  await page.goto('http://localhost:3000/customers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await printModal(page, /Thêm Mới/);
  await page.goto('http://localhost:3000/orders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await printModal(page, /Tạo Đơn Hàng Mới/);
});
