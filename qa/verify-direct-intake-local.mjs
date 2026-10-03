import { getPlatformProxy } from 'wrangler';
import { createUser } from '../lib/cloudflare/users.mjs';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
const marker = Date.now().toString(36);
const email = `sales-tech-${marker}@example.test`;
const password = `LocalTest-${marker}-Aa1!`;
const serial = `DIRECT-${marker}`;
let userId;
let laptopId;
let batchId;
let transitLaptopId;

async function platform() {
  return getPlatformProxy({ configPath: 'wrangler.jsonc', persist: true, remoteBindings: false });
}

async function retryLocked(operation, attempts = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= attempts || !/SQLITE_BUSY|database is locked/i.test(error.message || '')) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 150));
    }
  }
}

try {
  let proxy = await platform();
  try {
    const user = await createUser(proxy.env.DB, { email, password, name: 'QA Sale Tech', role: 'SALES_TECH' });
    userId = user.id;
    const supplier = await proxy.env.DB.prepare('SELECT id FROM suppliers WHERE active=1 ORDER BY id LIMIT 1').first();
    if (!supplier) throw new Error('No active supplier available for receiving fixture');
    const batch = await proxy.env.DB.prepare(`INSERT INTO purchase_batches(
      batch_code,supplier_id,purchase_date,exchange_rate,subtotal_rmb,status,created_by,updated_by,idempotency_key,procurement_flow
    ) VALUES (?,?,?,?,?,'IN_TRANSIT_VN','QA','QA',?,'DIRECT') RETURNING id`)
      .bind(`QA-${marker}`, supplier.id, new Date().toISOString().slice(0, 10), 3990, 4567, `qa-batch-${marker}`).first();
    batchId = batch.id;
    const transit = await proxy.env.DB.prepare(`INSERT INTO laptops(
      serial,name,category,status,source_type,source_reference_id,purchase_batch_id,tracking_code_cn,
      purchase_price_rmb,shipping_rmb,purchase_exchange_rate,import_price_vnd,created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
      .bind(`TRANSIT-${marker}`, 'Laptop QA đang vận chuyển', 'dell', 'in_transit', 'SUPPLIER_PURCHASE',
        String(batchId), batchId, `TRACK-${marker}`, 4567, 45, 3990, 18.4, 'QA').first();
    transitLaptopId = transit.id;
  } finally {
    await proxy.dispose();
  }

  const login = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Login failed: ${login.status} ${await login.text()}`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Login did not return a session cookie');

  const create = await fetch(`${baseUrl}/api/inventory?mode=create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin', Cookie: cookie },
    body: JSON.stringify({
      serial,
      name: 'Laptop kiểm thử nhập nội địa',
      category: 'legion_5_23_24',
      location: 'store',
      chargerStatus: 'with_charger',
      importPriceVnd: 12.34,
      priceRmb: 0,
      shippingRmb: 0,
      exchangeRate: 3990,
      warrantySupplier: 'Bao test 7 ngày',
      sourceReferenceId: '1',
      status: 'available',
      monthKey: new Intl.DateTimeFormat('en-GB', { month: '2-digit', year: 'numeric' }).format(new Date()),
    }),
  });
  const created = await create.json();
  if (!create.ok) throw new Error(`Direct create failed: ${create.status} ${JSON.stringify(created)}`);
  laptopId = created.id;
  if (created.importPriceVnd !== undefined) throw new Error('Sensitive import price leaked in non-admin response');
  if (created.domesticSourceName !== 'Nhập thợ VN') throw new Error('Domestic source label missing from response');

  const inventory = await fetch(`${baseUrl}/api/inventory?all=true`, { headers: { Cookie: cookie } });
  const inventoryRows = await inventory.json();
  if (!inventory.ok) throw new Error(`Inventory reload failed: ${inventory.status} ${JSON.stringify(inventoryRows)}`);
  const reloaded = inventoryRows.find(item => String(item.id) === String(laptopId));
  if (!reloaded || !reloaded.domesticSourceName || !reloaded.supplierName || !reloaded.seller) {
    throw new Error(`Domestic source missing after reload: ${JSON.stringify(reloaded)}`);
  }

  const purchases = await fetch(`${baseUrl}/api/purchases`, { headers: { Cookie: cookie } });
  if (purchases.status !== 403) throw new Error(`SALES_TECH unexpectedly accessed purchases: ${purchases.status}`);

  const suppliers = await fetch(`${baseUrl}/api/suppliers`, { headers: { Cookie: cookie } });
  const supplierRows = await suppliers.json();
  if (!suppliers.ok || !Array.isArray(supplierRows) || !supplierRows.length) {
    throw new Error(`Supplier summary list unavailable: ${suppliers.status} ${JSON.stringify(supplierRows)}`);
  }
  if (supplierRows.some(row => row.phone || row.email || row.payment_details)) {
    throw new Error('Supplier detail leaked in non-admin summary list');
  }

  const receiving = await fetch(`${baseUrl}/api/intake?all=true&mode=receiving`, { headers: { Cookie: cookie } });
  const receivingData = await receiving.json();
  if (!receiving.ok) throw new Error(`Receiving list failed: ${receiving.status} ${JSON.stringify(receivingData)}`);
  const transitRow = receivingData.laptops?.find(row => String(row.id) === String(transitLaptopId));
  if (!transitRow) throw new Error('Receiving fixture missing from SALES_TECH response');
  for (const key of ['purchase_price_rmb', 'shipping_rmb', 'purchase_exchange_rate', 'import_price_vnd']) {
    if (Object.hasOwn(transitRow, key)) throw new Error(`Receiving price leaked: ${key}`);
  }
  const receivingBatch = receivingData.batches?.find(row => String(row.id) === String(batchId));
  if (!receivingBatch?.supplier_name || Object.hasOwn(receivingBatch, 'exchange_rate')) {
    throw new Error(`Receiving batch visibility mismatch: ${JSON.stringify(receivingBatch)}`);
  }

  const forbiddenEdit = await fetch(`${baseUrl}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin', Cookie: cookie },
    body: JSON.stringify({ action: 'edit', laptopId: transitLaptopId, data: { name: 'Forbidden' } }),
  });
  if (forbiddenEdit.status !== 403) throw new Error(`SALES_TECH unexpectedly edited procurement: ${forbiddenEdit.status}`);

  const receive = await fetch(`${baseUrl}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin', Cookie: cookie },
    body: JSON.stringify({
      action: 'receive', key: `qa-receive-${marker}`, notes: 'QA receiving permission', unknown: [],
      expected: [{ laptop_id: transitLaptopId, serial: `RECEIVED-${marker}`, tracking_code_cn: `TRACK-${marker}`, notes: 'Đã nhận QA' }],
    }),
  });
  const received = await receive.json();
  if (!receive.ok || received.received_count !== 1) {
    throw new Error(`SALES_TECH receive failed: ${receive.status} ${JSON.stringify(received)}`);
  }

  proxy = await platform();
  try {
    const stored = await proxy.env.DB.prepare(
      'SELECT price_rmb,shipping_rmb,import_price_vnd,source_reference_id,seller FROM laptops WHERE id=?',
    ).bind(laptopId).first();
    if (!stored || Number(stored.price_rmb) !== 0 || Number(stored.shipping_rmb) !== 0
      || Number(stored.import_price_vnd) !== 12.34 || stored.source_reference_id !== '1'
      || stored.seller !== 'Nhập thợ VN') throw new Error(`Stored direct intake mismatch: ${JSON.stringify(stored)}`);
  } finally {
    await proxy.dispose();
  }

  console.log('PASS: SALES_TECH direct intake, supplier visibility, receiving permission, price redaction and purchase denial');
} finally {
  const proxy = await platform();
  try {
    await retryLocked(() => proxy.env.DB.batch([
      proxy.env.DB.prepare('DELETE FROM stock_movements WHERE laptop_id=?').bind(transitLaptopId || -1),
      proxy.env.DB.prepare('DELETE FROM laptops WHERE id IN (?,?)').bind(transitLaptopId || -1, laptopId || -1),
      proxy.env.DB.prepare('DELETE FROM purchase_batches WHERE id=?').bind(batchId || -1),
      proxy.env.DB.prepare('DELETE FROM operation_requests WHERE idempotency_key=?').bind(`qa-receive-${marker}`),
      proxy.env.DB.prepare('DELETE FROM auth_users WHERE id=?').bind(userId || ''),
    ]));
  } finally {
    await proxy.dispose();
  }
}
