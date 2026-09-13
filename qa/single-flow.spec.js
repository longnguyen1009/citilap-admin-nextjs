const { test, expect } = require('@playwright/test');
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

async function waitApi(page, path, method, action) {
  const responsePromise = page.waitForResponse(response => (
    response.url().includes(path) && response.request().method() === method
  ), { timeout: 15000 });
  await action();
  const response = await responsePromise;
  let body = {};
  try { body = await response.json(); } catch {}
  return { status: response.status(), body };
}

test('single CitiLap product and order flow', async ({ page }) => {
  const prefix = `QA-SINGLE-${Date.now()}`;
  const dialogs = [];
  const failures = [];
  page.on('dialog', async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.status() >= 400 && (response.url().includes('/api/') || response.url().includes('/auth/'))) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await login(page);

  await page.goto('http://localhost:3000/inventory', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="product-add-button"]').click();
  const productModal = page.locator('.modal-backdrop.active').last();
  await productModal.locator('[data-testid="product-serial-input"]').fill(`${prefix}-SERIAL`);
  await productModal.locator('[data-testid="product-name-input"]').fill(`${prefix} Lenovo ThinkPad T14 Gen 3`);
  await productModal.locator('[data-testid="product-price-rmb-input"]').fill('4200');
  await productModal.locator('[data-testid="product-shipping-rmb-input"]').fill('50');
  await productModal.locator('[data-testid="product-wholesale-price-input"]').fill('23.5');
  await productModal.locator('[data-testid="product-retail-price-input"]').fill('25.5');
  await productModal.locator('[data-testid="product-condition-input"]').fill('QA product created through browser');
  const productResult = await waitApi(page, '/api/inventory', 'POST', () => productModal.locator('[data-testid="product-save-button"]').click());
  console.log('PRODUCT_RESULT=', JSON.stringify(productResult));
  expect(productResult.status).toBe(200);
  const product = productResult.body;
  expect(product.id).toBeTruthy();
  expect(product.retailPriceVnd).toBe(25.5);
  console.log('PRODUCT_STATUS_WITHOUT_TOUCH=', product.status);

  await page.goto('http://localhost:3000/customers', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="customer-add-button"]').click();
  const customerModal = page.locator('.modal-backdrop.active').last();
  await customerModal.locator('[data-testid="customer-name-input"]').fill(`${prefix} Customer`);
  await customerModal.locator('[data-testid="customer-phone-input"]').fill('0999000111');
  await customerModal.locator('[data-testid="customer-address-input"]').fill('QA address');
  const customerResult = await waitApi(page, '/api/customers', 'POST', () => customerModal.locator('[data-testid="customer-save-button"]').click());
  console.log('CUSTOMER_RESULT=', JSON.stringify(customerResult));
  expect(customerResult.status).toBe(200);
  const customer = customerResult.body;
  expect(customer.id).toBeTruthy();

  await page.goto('http://localhost:3000/orders', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="order-add-button"]').click();
  const orderModal = page.locator('.modal-backdrop.active').last();
  await orderModal.locator('[data-testid="order-sale-price-input"]').fill('25.5');
  await orderModal.locator('[data-testid="order-note-input"]').fill(`${prefix} order`);
  await orderModal.locator('[data-testid="order-laptop-select"]').selectOption(String(product.id));
  await orderModal.locator('[data-testid="order-customer-select"]').selectOption(String(customer.id));
  const orderResult = await waitApi(page, '/api/orders', 'POST', () => orderModal.locator('[data-testid="order-save-button"]').click());
  console.log('ORDER_RESULT=', JSON.stringify(orderResult));
  expect(orderResult.status).toBe(200);
  const order = orderResult.body.order || orderResult.body;
  expect(order.id).toBeTruthy();
  console.log('ORDER_FINANCIALS=', JSON.stringify({ orderStatus: order.order_status, paymentStatus: order.payment_status, amountPaid: order.amount_paid, debtAmount: order.debt_amount, laptopLocked: order.laptop_locked }));

  await page.waitForTimeout(1000);
  const row = page.locator('[data-testid="order-row-' + order.id + '"]');
  await expect(row).toBeVisible({ timeout: 15000 });
  const preparedResult = await waitApi(page, '/api/orders', 'POST', () => row.locator('[data-testid="order-status-cell-' + order.id + '"]').selectOption({ index: 2 }));
  console.log('PREPARED_RESULT=', JSON.stringify(preparedResult));
  await page.waitForTimeout(1200);
  const paidResult = await waitApi(page, '/api/orders', 'POST', () => row.locator('[data-testid="order-payment-cell-' + order.id + '"]').selectOption({ index: 3 }));
  console.log('PAID_RESULT=', JSON.stringify(paidResult));
  await page.waitForTimeout(1500);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const persistedRow = page.locator('[data-testid="order-row-' + order.id + '"]');
  console.log('PERSISTED_ROW=', JSON.stringify(await persistedRow.innerText().catch(() => 'missing')));
  console.log('DIALOGS=', JSON.stringify(dialogs));
  console.log('FAILURES=', JSON.stringify(failures));
});
