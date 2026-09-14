const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

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
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('http://localhost:3000/', { timeout: 20000 });
}

function expectNoErrors(page) {
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/api/')) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return failures;
}

async function waitApi(page, path, action) {
  const responsePromise = page.waitForResponse(response => (
    response.url().includes(path) && response.request().method() === 'POST'
  ), { timeout: 20000 });
  await action();
  const response = await responsePromise;
  const body = await response.json().catch(() => ({}));
  return { status: response.status(), body };
}

async function createProduct(page, prefix) {
  await page.goto('http://localhost:3000/inventory', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="product-add-button"]').click();
  const modal = page.locator('.modal-backdrop.active').last();
  await modal.locator('[data-testid="product-serial-input"]').fill(`${prefix}-SERIAL`);
  await modal.locator('[data-testid="product-name-input"]').fill(`${prefix} Product`);
  await modal.locator('[data-testid="product-price-rmb-input"]').fill('4200');
  await modal.locator('[data-testid="product-shipping-rmb-input"]').fill('50');
  await modal.locator('[data-testid="product-wholesale-price-input"]').fill('23.5');
  await modal.locator('[data-testid="product-retail-price-input"]').fill('25.5');
  await modal.locator('[data-testid="product-condition-input"]').fill(`${prefix} condition`);
  const result = await waitApi(page, '/api/inventory', () => modal.locator('[data-testid="product-save-button"]').click());
  expect(result.status).toBe(200);
  expect(result.body.id).toBeTruthy();
  expect(result.body.retailPriceVnd).toBe(25.5);
  return result.body;
}

async function editProduct(page, product, prefix) {
  await page.goto('http://localhost:3000/inventory', { waitUntil: 'networkidle' });
  await page.locator(`[data-testid="product-edit-button-${product.id}"]`).first().click();
  const modal = page.locator('.modal-backdrop.active').last();
  await expect(modal.locator('[data-testid="product-name-input"]')).toHaveValue(`${prefix} Product`);
  await modal.locator('[data-testid="product-retail-price-input"]').fill('24.7');
  const result = await waitApi(page, '/api/inventory', () => modal.locator('[data-testid="product-save-button"]').click());
  expect(result.status).toBe(200);
  expect(result.body.retailPriceVnd).toBe(24.7);
  return result.body;
}

async function createCustomer(page, prefix) {
  await page.goto('http://localhost:3000/customers', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="customer-add-button"]').click();
  const modal = page.locator('.modal-backdrop.active').last();
  await modal.locator('[data-testid="customer-name-input"]').fill(`${prefix} Customer`);
  await modal.locator('[data-testid="customer-phone-input"]').fill(`0999${String(Date.now()).slice(-7)}`);
  await modal.locator('[data-testid="customer-address-input"]').fill(`${prefix} address`);
  const result = await waitApi(page, '/api/customers', () => modal.locator('[data-testid="customer-save-button"]').click());
  expect(result.status).toBe(200);
  expect(result.body.id).toBeTruthy();
  return result.body;
}

async function createOrder(page, prefix, product, customer) {
  await page.goto('http://localhost:3000/orders', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="order-add-button"]').click();
  const modal = page.locator('.modal-backdrop.active').last();
  await modal.locator('[data-testid="order-note-input"]').fill(`${prefix} order`);
  await modal.locator('[data-testid="order-cod-amount-input"]').fill('24.5');
  await modal.locator('[data-testid="order-laptop-select"]').selectOption(String(product.id));
  await modal.locator('[data-testid="order-customer-select"]').selectOption(String(customer.id));
  const result = await waitApi(page, '/api/orders', () => modal.locator('[data-testid="order-save-button"]').click());
  expect(result.status).toBe(200);
  const order = result.body.order || result.body;
  expect(order.id).toBeTruthy();
  expect(order.salePrice).toBe(24.5);
  expect(order.codAmount).toBe(24.5);
  return order;
}

async function updateOrderStatus(page, order, optionIndex, expectedKey) {
  const row = page.locator(`[data-testid="order-row-${order.id}"]`);
  const selector = row.locator(`[data-testid="order-status-cell-${order.id}"]`);
  const result = await waitApi(page, '/api/orders', () => selector.selectOption(optionIndex === 3 ? { label: '\u0110\u00c3 THANH TO\u00c1N' } : { index: optionIndex }));
  expect(result.status).toBe(200);
  expect((result.body.order || result.body).orderStatus).toBe(expectedKey);
  return result.body.order || result.body;
}

async function updatePaymentStatus(page, order, optionIndex, expectedKey) {
  const row = page.locator(`[data-testid="order-row-${order.id}"]`);
  const selector = row.locator(`[data-testid="order-payment-cell-${order.id}"]`);
  const result = await waitApi(page, '/api/orders', () => selector.selectOption({ index: optionIndex }));
  expect(result.status).toBe(200);
  const body = result.body.order || result.body;
  expect(body.paymentStatus).toBe(expectedKey);
  return body;
}

async function addSettingOption(page, groupKey, optionKey) {
  await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle' });
  await page.locator(`[data-testid="option-collapse-toggle-${groupKey}"]`).click();
  await page.locator(`[data-testid="option-add-toggle-${groupKey}"]`).click();
  await page.locator('[data-testid="option-key-input"]').fill(optionKey);
  await page.locator('[data-testid="option-label-input"]').fill(optionKey);
  const result = await waitApi(page, '/api/options', () =>
    page.locator('[data-testid="option-submit-button"]').click()
  );
  expect(result.status).toBe(200);
  expect(result.body.option_key).toBe(optionKey);
  await expect(page.locator(`[data-testid="option-row-${optionKey}"]`)).toBeVisible();
}

async function cleanupIteration(prefix, optionKey) {
  const env = loadEnv();
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: laptops } = await client.from('laptops').select('id').like('serial', `${prefix}-%`);
  const laptopIds = (laptops || []).map(item => item.id);
  const { data: orders } = await client.from('orders').select('id').in('laptop_id', laptopIds);
  const orderIds = (orders || []).map(item => item.id);

  if (laptopIds.length) await client.from('financial_records').delete().in('laptop_id', laptopIds);
  if (orderIds.length) await client.from('financial_records').delete().in('order_id', orderIds);
  if (orderIds.length) await client.from('payments').delete().in('order_id', orderIds);
  if (orderIds.length) await client.from('stock_movements').delete().in('order_id', orderIds);
  if (orderIds.length) await client.from('orders').delete().in('id', orderIds);
  if (laptopIds.length) await client.from('stock_movements').delete().in('laptop_id', laptopIds);
  if (laptopIds.length) await client.from('laptops').delete().in('id', laptopIds);

  const { data: customers } = await client.from('customers').select('id').like('name', `${prefix} Customer`);
  const customerIds = (customers || []).map(item => item.id);
  if (customerIds.length) await client.from('customers').delete().in('id', customerIds);

  await client.from('app_options').delete().eq('option_key', optionKey);
}

test('run CitiLap full flow iteration', async ({ page }) => {
  test.setTimeout(45000);
  const iteration = Number(process.env.QA_ITERATION || '1');
  const prefix = `QA50-${Date.now()}-${iteration}`;
  const failures = expectNoErrors(page);

  await login(page);

  const optionKey = `qa_${Date.now()}_${iteration}`;
  try {
    await addSettingOption(page, 'laptopStatus', optionKey);

    const product = await createProduct(page, prefix);
    const editedProduct = await editProduct(page, product, prefix);
    const customer = await createCustomer(page, prefix);
    const order = await createOrder(page, prefix, editedProduct, customer);

    const prepared = await updateOrderStatus(page, order, 2, 'prepared');
    expect(prepared.laptopLocked).toBe(true);
    const paid = await updatePaymentStatus(page, prepared, 3, 'paid');
    // Payment status is user-selected; changing it does not fabricate a payment.
    expect(paid.paymentStatus).toBe('paid');
    expect(paid.amountPaid).toBe(prepared.amountPaid ?? 0);
    expect(paid.debtAmount).toBe(prepared.debtAmount ?? paid.salePrice);

    await page.goto('http://localhost:3000/orders', { waitUntil: 'networkidle' });
    await expect(page.locator(`[data-testid="order-row-${order.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="order-payment-cell-${order.id}"]`)).toHaveValue('\u0110\u00c3 THANH TO\u00c1N');
    expect(failures).toEqual([]);
  } finally {
    await cleanupIteration(prefix, optionKey);
  }
});
