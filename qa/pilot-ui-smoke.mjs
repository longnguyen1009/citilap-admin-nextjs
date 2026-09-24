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
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

await page.goto(process.env.APP_URL || 'http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.locator('input[type="email"]').fill(env.ADMIN_EMAIL);
await page.locator('input[type="password"]').fill(env.ADMIN_PASSWORD);
await page.getByRole('button', { name: /đăng nhập/i }).click();
await page.waitForURL(url => !url.pathname.endsWith('/login'));

const checks = [];
await page.goto(new URL('/', page.url()).toString(), { waitUntil: 'networkidle' });
for (const label of ['TOÀN CẢNH VẬN HÀNH', 'Máy cần QC', 'Phiếu sửa đang mở', 'Máy chậm bán cần xử lý']) {
  await page.getByText(label, { exact: false }).first().waitFor();
}
assert.equal(await page.getByText(/COD_DISPUTED|TRADE_IN_WAITING_INSPECTION|OPERATIONAL CAPITAL VIEW/).count(), 0, 'Dashboard không được hiển thị mã kỹ thuật cho người vận hành');
checks.push('dashboard:operator-language');
await page.getByRole('heading', { name: 'KHO CITILAP' }).waitFor();
checks.push('sidebar:warehouse-name');
await page.getByLabel('Database đã kết nối').waitFor();
checks.push('sidebar:database-connected');
assert.equal(await page.getByText('Supabase Cloud', { exact: true }).count(), 0, 'Sidebar không còn ô Supabase Cloud riêng');
checks.push('sidebar:compact-database-status');
for (const [route, visibleText] of [
  ['/inventory', /thêm máy mới/i],
  ['/orders', /tạo đơn hàng mới/i],
  ['/payments', /thu tiền đơn hàng/i],
  ['/invoices', /quản lý hóa đơn/i],
  ['/warranty', /bảo hành & đổi trả/i]
]) {
  await page.goto(new URL(route, page.url()).toString(), { waitUntil: 'networkidle' });
  await page.getByText(visibleText).first().waitFor();
  checks.push(route);
}

await page.goto(new URL('/orders', page.url()).toString(), { waitUntil: 'networkidle' });
const paymentStatus = page.locator('[data-testid^="order-payment-cell-"]').first();
await paymentStatus.waitFor();
assert.equal(await paymentStatus.evaluate(element => element.tagName), 'SPAN', 'Trạng thái thanh toán của order phải chỉ đọc');
checks.push('orders:payment-status-readonly');
const paymentLink = page.locator('a[href^="/payments?orderId="]').first();
await paymentLink.waitFor();
await paymentLink.click();
await page.waitForURL(url => url.pathname === '/payments' && Boolean(url.searchParams.get('orderId')));
await page.locator('[role="dialog"]').waitFor();
await page.waitForFunction(() => document.querySelectorAll('#payment-order option').length > 1);
assert(await page.locator('#payment-order').inputValue(), 'Form thu tiền phải chọn sẵn order');
await page.waitForFunction(() => document.querySelectorAll('[data-testid="payment-account-select"] option').length === 3);
const paymentAccountOptions = await page.locator('[data-testid="payment-account-select"] option').allTextContents();
assert(paymentAccountOptions.some(text => text.includes('PILOT_CASH_VND')));
assert(paymentAccountOptions.some(text => text.includes('PILOT_BANK_VND')));
assert.equal(paymentAccountOptions.some(text => text.includes('TEST-')), false, 'Tài khoản fixture không được xuất hiện trong form thu tiền');
checks.push('orders:payment-deeplink');
checks.push('payments:clean-pilot-accounts');

await page.goto(new URL('/orders', page.url()).toString(), { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /tạo đơn hàng mới/i }).click();
await page.locator('[data-testid="order-payment-status-readonly"]').waitFor();
assert.equal(await page.locator('[data-testid="order-payment-status-select"]').count(), 0, 'Đơn mới không được nhập trạng thái thanh toán');
assert.equal(await page.locator('[data-testid="order-deposit-amount-input"]').count(), 0, 'Đơn mới không được nhập tiền cọc ngoài sổ tiền');
assert.equal(await page.locator('[data-testid="order-deposit-note-input"]').count(), 0, 'Đơn mới không được nhập ghi chú cọc ngoài sổ tiền');
assert.equal(await page.locator('[data-testid="order-sale-price-input"]').getAttribute('min'), '0.01');
assert.equal(await page.locator('[data-testid="order-status-select"] option').filter({ hasText: /đã cọc/i }).count(), 0, 'Đơn mới không được tự đặt trạng thái Đã cọc');
assert.equal(await page.locator('[data-testid="order-type-select"] option').filter({ hasText: /thu cũ/i }).count(), 0, 'Đơn mới không được dùng luồng thu cũ legacy');
assert.equal(await page.locator('[data-testid="order-trade-in-workflow-link"]').getAttribute('href'), '/trade-ins');
checks.push('orders:new-order-finance-guard');
checks.push('orders:trade-in-authoritative-workflow');
await page.getByRole('button', { name: /hủy bỏ/i }).click();

await page.goto(new URL('/inventory', page.url()).toString(), { waitUntil: 'networkidle' });
for (const label of ['Giá mua (RMB)', 'Phí nội địa (RMB)', 'Tỷ giá (VNĐ/RMB)', 'Giá nhập (triệu VNĐ)']) {
  await page.getByRole('columnheader', { name: new RegExp(label.replace(/[()\/]/g, '\\$&'), 'i') }).waitFor();
}
assert.equal(await page.locator('#inventory-field-2').getAttribute('aria-label'), null);
assert.equal(await page.getByRole('combobox', { name: /^vị trí kho$/i }).count(), 1);
assert.equal(await page.getByRole('button', { name: /^phân loại máy/i }).count(), 1);
checks.push('inventory:list-money-units');
checks.push('inventory:location-filter-label');
await page.getByRole('button', { name: /thêm máy mới/i }).click();
for (const label of ['Giá mua (RMB)', 'Phí vận chuyển nội địa (RMB)', 'Tỷ giá (VNĐ / RMB)', 'Giá nhập (triệu VNĐ)', 'Giá bán sỉ (triệu VNĐ)', 'Giá bán lẻ (triệu VNĐ)']) {
  await page.getByText(label, { exact: false }).first().waitFor();
}
assert.equal(await page.locator('[data-testid="product-exchange-rate-input"]').getAttribute('min'), '1');
checks.push('inventory:money-units');
await page.getByRole('button', { name: /^hủy$/i }).click();

await page.goto(new URL('/payments', page.url()).toString(), { waitUntil: 'networkidle' });
await page.getByRole('columnheader', { name: /số tiền.*triệu vnđ/i }).waitFor();
assert.equal(await page.getByRole('button', { name: /khoản thu\/chi/i }).count(), 0, 'Không được ghi thu/chi qua financial_records legacy');
assert.equal(await page.getByRole('main').getByRole('link', { name: /đối soát tài chính/i }).getAttribute('href'), '/finance/transactions');
checks.push('payments:authoritative-finance-link');

await page.goto(new URL('/finance', page.url()).toString(), { waitUntil: 'networkidle' });
await page.getByText('Số dư ghi sổ VND', { exact: true }).waitFor();
await page.getByText('Số dư tài khoản', { exact: true }).waitFor();
assert.equal(await page.getByText(/Recorded cash|Account balances|WAITING_SETTLEMENT|OVERDUE_\d|MANUAL_(IN|OUT)/).count(), 0, 'Màn tài chính không được lộ nhãn hoặc mã kỹ thuật');
checks.push('finance:operator-language');

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(new URL('/payments', page.url()).toString(), { waitUntil: 'networkidle' });
for (const section of ['Vận hành kho', 'Nhập hàng', 'Bán hàng', 'Tài chính & chứng từ', 'Hậu mãi', 'Quản trị']) {
  await page.locator('.nav-section-label', { hasText: section }).waitFor();
  checks.push(`sidebar:${section}`);
}

await page.setViewportSize({ width: 390, height: 844 });
for (const label of ['Kho laptop', 'Đơn hàng', 'Thu tiền', 'Bảo hành']) {
  await page.locator('.mobile-navigation').getByText(label, { exact: true }).waitFor();
  checks.push(`mobile:${label}`);
}
assert(await page.locator('.mobile-navigation').getByRole('button', { name: 'Đăng xuất' }).isVisible());
checks.push('mobile:Đăng xuất');

assert.equal(errors.length, 0, `Có lỗi trình duyệt: ${errors.join(' | ')}`);
console.log(JSON.stringify({ checksPassed: checks.length, routes: checks }, null, 2));
await browser.close();
