import { randomUUID } from 'node:crypto';
import schema from './schema.json' with { type: 'json' };

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
function fail(message) { throw Object.assign(new Error(message), { status: 400 }); }
function key(value) {
  if (typeof value !== 'string' || value.trim().length < 8 || value.length > 100) fail('Mã chống gửi trùng không hợp lệ');
  return value.trim();
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail('Ngày mua không hợp lệ');
  return value;
}
function money(value) {
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0) fail('Giá máy không hợp lệ');
  return Number(value);
}
// json() deliberately raises if a condition fails. Running the guard inside D1.batch
// keeps validation and writes in one transaction, without read/write race windows.
function guard(db, condition, params) {
  return db.prepare(`SELECT CASE WHEN (${condition}) THEN 1 ELSE json('transaction validation failed') END AS valid`).bind(...params);
}
function rowJson(table, alias = '') {
  return `json_object(${schema[table].map(column => {
    const ref = `${alias ? `${alias}.` : ''}"${column.name}"`;
    const value = column.type === 'jsonb' ? `json(${ref})` : column.type === 'boolean'
      ? `json(CASE WHEN ${ref} IS NULL THEN 'null' WHEN ${ref}=1 THEN 'true' ELSE 'false' END)` : ref;
    return `'${column.name}',${value}`;
  }).join(',')})`;
}
const laptopJson = rowJson('laptops');

export async function createPurchaseBatch(db, { p_batch: batch, p_laptops: laptops, p_actor: actor, p_idempotency_key: inputKey }) {
  const operationKey = key(inputKey);
  if (!batch || !Array.isArray(laptops) || laptops.length < 1 || laptops.length > 200) fail('Lô mua phải có từ 1 đến 200 máy');
  const purchaseDate = date(batch.purchase_date);
  const rate = Number(batch.purchase_exchange_rate || batch.exchange_rate);
  if (!Number.isFinite(rate) || rate <= 0) fail('Tỷ giá mua không hợp lệ');
  if (!actor || typeof actor !== 'string') fail('Thiếu người thực hiện');
  const entries = laptops.map(row => {
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.trim().length > 240 || !row.category) fail('Thông tin máy không hợp lệ');
    if (String(row.tracking_code_cn || '').length > 200) fail('Mã vận chuyển quá dài');
    return { name: row.name.trim(), category: String(row.category), serial: clean(row.serial, 100) || null,
      tracking: clean(row.tracking_code_cn, 200), price: money(row.purchase_price_rmb),
      shipping: money(row.shipping_rmb ?? 0), importPrice: money(row.import_price_vnd), notes: clean(row.notes, 2000) };
  });
  const prefix = `PO-${purchaseDate.replaceAll('-', '')}-`;
  const month = `${purchaseDate.slice(5, 7)}/${purchaseDate.slice(0, 4)}`;
  // Use one json_each insert for all machines to stay within D1 query/bind limits.
  const statements = [
    guard(db, `NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=? AND operation<>'CREATE_PURCHASE_BATCH')`, [operationKey]),
    guard(db, `EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?) OR
      (EXISTS(SELECT 1 FROM suppliers WHERE id=? AND active=1) AND NOT EXISTS(
        SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM app_options o
          WHERE o.group_key='category' AND o.option_key=json_extract(e.value,'$.category') AND o.is_active=1)))`,
    [operationKey, batch.supplier_id, JSON.stringify(entries)]),
    db.prepare(`INSERT INTO purchase_batches(batch_code,supplier_id,purchase_date,currency,exchange_rate,
      subtotal_rmb,domestic_shipping_rmb,other_cost_rmb,destination,status,notes,active,created_by,updated_by,idempotency_key,procurement_flow)
      SELECT ? || printf('%03d',COALESCE((SELECT max(CAST(substr(batch_code,13) AS INTEGER)) FROM purchase_batches WHERE batch_code LIKE ?),0)+1),
        ?,?,'CNY',?,0,0,0,'OTHER','CONFIRMED',?,1,?,?,?,'DIRECT'
      WHERE NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)`)
      .bind(prefix, `${prefix}%`, batch.supplier_id, purchaseDate, rate, clean(batch.notes, 3000), actor, actor, operationKey, operationKey),
    db.prepare(`INSERT INTO laptops(name,category,serial,tracking_code_cn,purchase_price_rmb,shipping_rmb,
      purchase_exchange_rate,import_price_vnd,purchase_batch_id,source_type,status,location,charger_status,
      is_active,condition_note,created_by,import_date,month_key,price_rmb,exchange_rate,tracking_code)
      SELECT json_extract(e.value,'$.name'),json_extract(e.value,'$.category'),json_extract(e.value,'$.serial'),
        json_extract(e.value,'$.tracking'),json_extract(e.value,'$.price'),json_extract(e.value,'$.shipping'),
        ?,json_extract(e.value,'$.importPrice'),(SELECT id FROM purchase_batches WHERE idempotency_key=?),'SUPPLIER_PURCHASE','in_transit','wh_cn','unchecked',1,
        json_extract(e.value,'$.notes'),?,?,?,json_extract(e.value,'$.price'),?,json_extract(e.value,'$.tracking')
      FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)`)
      .bind(rate, operationKey, actor, purchaseDate, month, rate, JSON.stringify(entries), operationKey),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'PURCHASE_BATCH',id,'CREATE',json_object('batch_code',batch_code,'laptop_count',?),?
      FROM purchase_batches WHERE idempotency_key=? AND NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)`)
      .bind(entries.length, actor, operationKey, operationKey),
    db.prepare(`INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
      SELECT ?,'CREATE_PURCHASE_BATCH',json_object('batch',${rowJson('purchase_batches', 'b')},
        'laptops',json((SELECT json_group_array(json(item)) FROM
          (SELECT ${laptopJson} AS item FROM laptops WHERE purchase_batch_id=b.id ORDER BY id)))),?
      FROM purchase_batches b WHERE b.idempotency_key=? AND NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)`)
      .bind(operationKey, actor, operationKey, operationKey),
    db.prepare('SELECT result FROM operation_requests WHERE idempotency_key=?').bind(operationKey),
  ];
  const results = await db.batch(statements);
  return JSON.parse(results.at(-1).results[0].result);
}

export async function addLaptopToPurchaseBatch(db, { p_batch_id: batchId, p_laptop: laptop, p_actor: actor, p_idempotency_key: inputKey }) {
  const operationKey = key(inputKey);
  batchId = Number(batchId);
  if (!Number.isSafeInteger(batchId) || batchId <= 0 || !actor || !laptop || typeof laptop !== 'object' || Array.isArray(laptop)
    || typeof laptop.name !== 'string' || !laptop.name.trim() || laptop.name.trim().length > 240 || !laptop.category) fail('Thông tin máy không hợp lệ');
  const price = money(laptop.purchase_price_rmb), shipping = money(laptop.shipping_rmb ?? 0);
  const importPrice = laptop.import_price_vnd === '' || laptop.import_price_vnd == null ? null : money(laptop.import_price_vnd);
  const tracking = clean(laptop.tracking_code_cn,200), serial = clean(laptop.serial,100) || null;
  const results = await db.batch([
    guard(db, `NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=? AND operation<>'ADD_LAPTOP_TO_PURCHASE_BATCH')`, [operationKey]),
    guard(db, `EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?) OR EXISTS(
      SELECT 1 FROM purchase_batches WHERE id=? AND active=1 AND status NOT IN ('CLOSED','CANCELLED'))`, [operationKey,batchId]),
    guard(db, `EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?) OR EXISTS(
      SELECT 1 FROM app_options WHERE group_key='category' AND option_key=? AND is_active=1)`, [operationKey,String(laptop.category)]),
    db.prepare(`INSERT INTO laptops(name,category,serial,tracking_code_cn,tracking_code,purchase_price_rmb,price_rmb,
      shipping_rmb,purchase_exchange_rate,exchange_rate,import_price_vnd,purchase_batch_id,source_type,source_reference_id,
      status,location,charger_status,is_active,condition_note,created_by,import_date,month_key)
      SELECT ?,?,?,?,?,?,?,?,b.exchange_rate,b.exchange_rate,
        COALESCE(?,round(((?+?)*b.exchange_rate+COALESCE((SELECT json_extract(value,'$.shippingVnd') FROM app_settings WHERE key='formula'),400000)),2)
          /COALESCE((SELECT json_extract(value,'$.divisor') FROM app_settings WHERE key='formula'),1000000)),
        b.id,'SUPPLIER_PURCHASE',CAST(b.id AS TEXT),'in_transit','wh_cn','unchecked',1,?,?,b.purchase_date,strftime('%m/%Y',b.purchase_date)
      FROM purchase_batches b WHERE b.id=? AND NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)`)
      .bind(laptop.name.trim(),String(laptop.category),serial,tracking,tracking||null,price,price,shipping,
        importPrice,price,shipping,clean(laptop.notes,2000),actor,batchId,operationKey),
    db.prepare(`INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
      SELECT ?,'ADD_LAPTOP_TO_PURCHASE_BATCH',${laptopJson},? FROM laptops
      WHERE id=last_insert_rowid() AND NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)`)
      .bind(operationKey,actor,operationKey),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'LAPTOP',CAST(json_extract(result,'$.id') AS TEXT),'CREATE',json_object('event','LAPTOP_ADDED_TO_BATCH',
        'purchase_batch_id',?,'batch_code',(SELECT batch_code FROM purchase_batches WHERE id=?)),?
      FROM operation_requests WHERE idempotency_key=? AND changes()=1`).bind(batchId,batchId,actor,operationKey),
    db.prepare('SELECT result FROM operation_requests WHERE idempotency_key=?').bind(operationKey),
  ]);
  return JSON.parse(results.at(-1).results[0].result);
}

export async function startQcInspection(db, { p_laptop_id: laptopId, p_actor: actor, p_idempotency_key: inputKey }) {
  const operationKey = key(inputKey);
  if (!Number.isSafeInteger(laptopId) || laptopId <= 0 || !actor) fail('Yêu cầu bắt đầu QC không hợp lệ');
  const id = randomUUID();
  const statements = [
    guard(db, 'EXISTS(SELECT 1 FROM laptops WHERE id=? AND is_active=1)', [laptopId]),
    guard(db, 'NOT EXISTS(SELECT 1 FROM qc_inspections WHERE idempotency_key=? AND laptop_id<>?)', [operationKey, laptopId]),
    guard(db, `EXISTS(SELECT 1 FROM qc_inspections WHERE idempotency_key=? AND laptop_id=?) OR
      EXISTS(SELECT 1 FROM laptops WHERE id=? AND status='waiting_qc')`, [operationKey, laptopId, laptopId]),
    db.prepare(`INSERT INTO qc_inspections(id,inspection_code,laptop_id,started_by,idempotency_key)
      SELECT ?, 'QC-' || strftime('%Y%m%d','now') || '-' || printf('%03d',
        COALESCE((SELECT max(CAST(substr(inspection_code,13) AS INTEGER)) FROM qc_inspections
        WHERE inspection_code LIKE 'QC-' || strftime('%Y%m%d','now') || '-%'),0)+1),?,?,?
      WHERE NOT EXISTS(SELECT 1 FROM qc_inspections WHERE idempotency_key=? OR (laptop_id=? AND status='IN_PROGRESS'))`)
      .bind(id, laptopId, actor, operationKey, operationKey, laptopId),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'QC_INSPECTION',id,'CREATE',json_object('laptop_id',laptop_id,'inspection_code',inspection_code),?
      FROM qc_inspections WHERE id=?`).bind(actor, id),
    db.prepare(`SELECT * FROM qc_inspections WHERE idempotency_key=? OR (laptop_id=? AND status='IN_PROGRESS')
      ORDER BY CASE WHEN idempotency_key=? THEN 0 ELSE 1 END LIMIT 1`).bind(operationKey, laptopId, operationKey),
  ];
  const result = await db.batch(statements);
  return result.at(-1).results[0];
}

export async function updateIncomingTracking(db, { p_laptop_id: laptopId, p_tracking: tracking, p_actor: actor }) {
  if (!Number.isSafeInteger(laptopId) || laptopId <= 0 || !actor) fail('Máy hoặc người thực hiện không hợp lệ');
  const normalized = clean(tracking, 200);
  const results = await db.batch([
    guard(db, 'EXISTS(SELECT 1 FROM laptops WHERE id=? AND is_active=1)', [laptopId]),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'LAPTOP',CAST(id AS TEXT),'UPDATE',json_object('event','TRACKING_CORRECTED','old',tracking_code_cn,'new',?),?
      FROM laptops WHERE id=?`).bind(normalized, actor, laptopId),
    db.prepare(`UPDATE laptops SET tracking_code_cn=?,tracking_code=nullif(?,''),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(normalized, normalized, laptopId),
    db.prepare(`SELECT ${laptopJson} AS result FROM laptops WHERE id=?`).bind(laptopId),
  ]);
  return JSON.parse(results.at(-1).results[0].result);
}

export async function ignoreIncomingLaptop(db, { p_laptop_id: laptopId, p_reason: reason, p_actor: actor }) {
  if (!Number.isSafeInteger(laptopId) || laptopId <= 0 || !actor || !clean(reason, 1000)) fail('Cần nhập máy, người thực hiện và lý do bỏ qua');
  const results = await db.batch([
    guard(db, "EXISTS(SELECT 1 FROM laptops WHERE id=? AND status='in_transit')", [laptopId]),
    db.prepare(`UPDATE laptops SET status='ignored',ignored_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      ignored_by=?,ignore_reason=?,is_active=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
      .bind(actor, clean(reason, 1000), laptopId),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'LAPTOP',CAST(id AS TEXT),'UPDATE',json_object('event','INCOMING_LAPTOP_IGNORED','reason',ignore_reason),?
      FROM laptops WHERE id=?`).bind(actor, laptopId),
    db.prepare(`SELECT ${laptopJson} AS result FROM laptops WHERE id=?`).bind(laptopId),
  ]);
  return JSON.parse(results.at(-1).results[0].result);
}

export async function updateLaptopProcurement(db, { p_laptop_id: laptopId, p_data: data, p_actor: actor }) {
  if (!Number.isSafeInteger(laptopId) || laptopId <= 0 || !actor || !data || typeof data !== 'object' || Array.isArray(data)) fail('Dữ liệu mua hàng không hợp lệ');
  const updates = {};
  if ('name' in data) {
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 240) fail('Tên máy không hợp lệ');
    updates.name = data.name.trim();
  }
  if ('category' in data) updates.category = String(data.category);
  if ('serial' in data) updates.serial = clean(data.serial, 100) || null;
  if ('tracking_code_cn' in data) {
    updates.tracking_code_cn = clean(data.tracking_code_cn, 200);
    updates.tracking_code = updates.tracking_code_cn || null;
  }
  if ('purchase_price_rmb' in data) updates.price_rmb = updates.purchase_price_rmb = money(data.purchase_price_rmb);
  if ('shipping_rmb' in data) updates.shipping_rmb = money(data.shipping_rmb || 0);
  if ('import_price_vnd' in data && data.import_price_vnd !== '' && data.import_price_vnd !== null) updates.import_price_vnd = money(data.import_price_vnd);
  if ('notes' in data) updates.condition_note = String(data.notes ?? '').slice(0, 2000);
  const statements = [
    guard(db, `EXISTS(SELECT 1 FROM laptops WHERE id=? AND is_active=1
      AND status IN ('in_transit','waiting_qc','repair','available','reserved','supplier_return'))`, [laptopId]),
    guard(db, `NOT EXISTS(SELECT 1 FROM laptops l JOIN supplier_return_items i ON i.laptop_id=l.id
      JOIN supplier_refunds r ON r.supplier_return_id=i.supplier_return_id WHERE l.id=? AND l.status='supplier_return')`, [laptopId]),
  ];
  if ('category' in updates) statements.push(guard(db,
    "EXISTS(SELECT 1 FROM app_options WHERE group_key='category' AND option_key=? AND is_active=1)", [updates.category]));
  const sets = Object.keys(updates).map(column => `"${column}"=?`);
  const values = Object.values(updates);
  if ('purchase_batch_id' in data) {
    const batchId = Number(data.purchase_batch_id);
    if (!Number.isSafeInteger(batchId) || batchId <= 0) fail('Lô mua không hợp lệ');
    statements.push(guard(db, 'EXISTS(SELECT 1 FROM purchase_batches WHERE id=? AND active=1)', [batchId]));
    statements.push(guard(db, `NOT EXISTS(SELECT 1 FROM laptops l JOIN supplier_payments p ON p.purchase_batch_id=l.purchase_batch_id
      WHERE l.id=? AND l.purchase_batch_id<>?)`, [laptopId, batchId]));
    sets.push('purchase_batch_id=?'); values.push(batchId);
    for (const column of ['purchase_exchange_rate', 'exchange_rate']) {
      sets.push(`${column}=(SELECT exchange_rate FROM purchase_batches WHERE id=?)`); values.push(batchId);
    }
    sets.push('import_date=(SELECT purchase_date FROM purchase_batches WHERE id=?)'); values.push(batchId);
    sets.push("month_key=(SELECT strftime('%m/%Y',purchase_date) FROM purchase_batches WHERE id=?)"); values.push(batchId);
  }
  // Preserve tracking field synchronization even when the payload edits another field.
  if (!('tracking_code_cn' in updates)) sets.push("tracking_code=nullif(tracking_code_cn,'')");
  sets.push("updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  statements.push(db.prepare(`UPDATE laptops SET ${sets.join(',')} WHERE id=?`).bind(...values, laptopId));
  statements.push(db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
    VALUES ('LAPTOP',?,'UPDATE',json_object('event','PROCUREMENT_CORRECTED','fields',json(?)),?)`)
    .bind(String(laptopId), JSON.stringify(data), actor));
  statements.push(db.prepare(`SELECT ${laptopJson} AS result FROM laptops WHERE id=?`).bind(laptopId));
  const results = await db.batch(statements);
  return JSON.parse(results.at(-1).results[0].result);
}

export async function receivePurchaseLaptops(db, { p_items: items, p_notes: notes, p_actor: actor, p_idempotency_key: inputKey }) {
  const operationKey = key(inputKey);
  if (!actor || !Array.isArray(items) || items.length < 1 || items.length > 200) fail('Đợt nhận hàng không hợp lệ');
  const entries = items.map(item => {
    const id = Number(item.laptop_id);
    if (!Number.isSafeInteger(id) || id <= 0) fail('Mã máy không hợp lệ');
    return { id, received: date(item.received_at || new Date().toISOString().slice(0, 10)),
      serial: clean(item.serial, 100) || null, tracking: clean(item.tracking_code_cn, 200) || null,
      charger: item.charger_status || null, notes: String(item.notes ?? '') };
  });
  if (new Set(entries.map(item => item.id)).size !== entries.length) fail('Danh sách nhận hàng có máy bị trùng');
  const payload = JSON.stringify(entries);
  const replay = 'EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)';
  const entry = "(SELECT e.value FROM json_each(?) e WHERE json_extract(e.value,'$.id')=laptops.id)";
  const statements = [
    guard(db, "NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=? AND operation<>'RECEIVE_PURCHASE_LAPTOPS')", [operationKey]),
    guard(db, `${replay} OR NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(
      SELECT 1 FROM laptops l WHERE l.id=json_extract(e.value,'$.id') AND l.status='in_transit'
      AND l.source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')))`, [operationKey, payload]),
    db.prepare(`UPDATE laptops SET status='waiting_qc',location='store',
      received_at=json_extract(${entry},'$.received') || 'T00:00:00.000Z',
      warehouse_date=json_extract(${entry},'$.received'),
      serial=COALESCE(json_extract(${entry},'$.serial'),serial),
      tracking_code_cn=COALESCE(json_extract(${entry},'$.tracking'),tracking_code_cn),
      tracking_code=COALESCE(json_extract(${entry},'$.tracking'),tracking_code),
      charger_status=COALESCE(json_extract(${entry},'$.charger'),charger_status),
      condition_note=substr(trim(COALESCE(condition_note,'') || char(10) || COALESCE(json_extract(${entry},'$.notes'),'') || char(10) || ?,char(10)),1,2000),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND NOT ${replay}`)
      .bind(payload, payload, payload, payload, payload, payload, payload, String(notes ?? ''), payload, operationKey),
    db.prepare(`INSERT INTO stock_movements(laptop_id,movement_type,from_location,to_location,note,performed_by,reference_type,reference_id)
      SELECT id,'PURCHASE_RECEIVE','IN_TRANSIT',location,'Nhận hàng từ lô ' || COALESCE(CAST(purchase_batch_id AS TEXT),''),?,'PURCHASE_BATCH',CAST(purchase_batch_id AS TEXT)
      FROM laptops WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND NOT ${replay}`)
      .bind(actor, payload, operationKey),
    db.prepare(`INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
      SELECT ?,'RECEIVE_PURCHASE_LAPTOPS',json_object('laptops',json((SELECT json_group_array(json(item)) FROM
        (SELECT ${laptopJson} AS item FROM laptops WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) ORDER BY id))),
        'received_count',?),? WHERE NOT ${replay}`).bind(operationKey, payload, entries.length, actor, operationKey),
    db.prepare('SELECT result FROM operation_requests WHERE idempotency_key=?').bind(operationKey),
  ];
  const results = await db.batch(statements);
  return JSON.parse(results.at(-1).results[0].result);
}

export async function receiveInventory(db, { p_expected: expected = [], p_unknown: unknown = [], p_notes: notes, p_actor: actor, p_idempotency_key: inputKey }) {
  const operationKey = key(inputKey);
  if (operationKey.length > 80 || !actor || !Array.isArray(expected) || !Array.isArray(unknown)
    || expected.length + unknown.length < 1 || expected.length + unknown.length > 200) fail('Đợt nhận hàng không hợp lệ');
  const known = expected.map(item => {
    const id = Number(item.laptop_id);
    if (!Number.isSafeInteger(id) || id <= 0) fail('Mã máy không hợp lệ');
    return { id, received: date(item.received_at || new Date().toISOString().slice(0,10)),
      serial: clean(item.serial,100) || null, tracking: clean(item.tracking_code_cn,200) || null,
      charger: item.charger_status || null, notes: String(item.notes ?? '').slice(0,2000) };
  });
  if (new Set(known.map(item => item.id)).size !== known.length) fail('Danh sách nhận hàng có máy bị trùng');
  const fresh = unknown.map((item,index) => {
    const name = clean(item.name,240);
    if (!name) fail('Tên máy không hợp lệ');
    return { name, serial: clean(item.serial,100) || null, tracking: clean(item.tracking_code_cn,200),
      charger: item.charger_status || 'unchecked', notes: String(item.notes ?? '').slice(0,2000),
      received: date(item.received_at || new Date().toISOString().slice(0,10)), reference: `${operationKey}-unknown-${index+1}` };
  });
  const knownJson = JSON.stringify(known), unknownJson = JSON.stringify(fresh);
  const replay = 'EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)';
  const entry = "(SELECT e.value FROM json_each(?) e WHERE json_extract(e.value,'$.id')=laptops.id)";
  const results = await db.batch([
    guard(db, `NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=? AND operation<>'RECEIVE_INVENTORY')`, [operationKey]),
    guard(db, `${replay} OR NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM laptops l
      WHERE l.id=json_extract(e.value,'$.id') AND l.status='in_transit'
      AND l.source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')))`, [operationKey,knownJson]),
    db.prepare(`UPDATE laptops SET status='waiting_qc',location='store',received_at=json_extract(${entry},'$.received')||'T00:00:00.000Z',
      warehouse_date=json_extract(${entry},'$.received'),serial=COALESCE(json_extract(${entry},'$.serial'),serial),
      tracking_code_cn=COALESCE(json_extract(${entry},'$.tracking'),tracking_code_cn),
      tracking_code=COALESCE(json_extract(${entry},'$.tracking'),tracking_code),charger_status=COALESCE(json_extract(${entry},'$.charger'),charger_status),
      condition_note=json_extract(${entry},'$.notes'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND NOT ${replay}`)
      .bind(knownJson,knownJson,knownJson,knownJson,knownJson,knownJson,knownJson,knownJson,operationKey),
    db.prepare(`INSERT INTO stock_movements(laptop_id,movement_type,from_location,to_location,note,performed_by,reference_type,reference_id)
      SELECT id,'PURCHASE_RECEIVE','IN_TRANSIT',location,'Nhận hàng từ lô '||COALESCE(CAST(purchase_batch_id AS TEXT),''),?,'PURCHASE_BATCH',CAST(purchase_batch_id AS TEXT)
      FROM laptops WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND NOT ${replay}`).bind(actor,knownJson,operationKey),
    db.prepare(`INSERT INTO laptops(name,serial,tracking_code_cn,tracking_code,source_type,source_reference_id,status,location,
      charger_status,is_active,condition_note,received_at,warehouse_date,created_by)
      SELECT json_extract(value,'$.name'),json_extract(value,'$.serial'),json_extract(value,'$.tracking'),json_extract(value,'$.tracking'),
        'UNKNOWN',json_extract(value,'$.reference'),'waiting_qc','store',json_extract(value,'$.charger'),1,json_extract(value,'$.notes'),
        json_extract(value,'$.received')||'T00:00:00.000Z',json_extract(value,'$.received'),?
      FROM json_each(?) WHERE NOT ${replay}`).bind(actor,unknownJson,operationKey),
    db.prepare(`INSERT INTO stock_movements(laptop_id,movement_type,to_location,note,performed_by,reference_type,reference_id)
      SELECT id,'PURCHASE_RECEIVE',location,'Nhận máy chưa rõ nguồn',?,'UNKNOWN_INTAKE',source_reference_id
      FROM laptops WHERE source_type='UNKNOWN' AND source_reference_id IN
        (SELECT json_extract(value,'$.reference') FROM json_each(?)) AND NOT ${replay}`).bind(actor,unknownJson,operationKey),
    db.prepare(`INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
      SELECT ?,'RECEIVE_INVENTORY',json_object(
        'expected',json((SELECT json_group_array(json(item)) FROM (SELECT ${laptopJson} AS item FROM laptops
          WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) ORDER BY id))),
        'unknown',json((SELECT json_group_array(json(item)) FROM (SELECT ${laptopJson} AS item FROM laptops
          WHERE source_type='UNKNOWN' AND source_reference_id IN (SELECT json_extract(value,'$.reference') FROM json_each(?)) ORDER BY id))),
        'received_count',?),? WHERE NOT ${replay}`)
      .bind(operationKey,knownJson,unknownJson,known.length+fresh.length,actor,operationKey),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'RECEIVING',?,'CREATE',json_object('received_count',?,'notes',?),? WHERE changes()=1`)
      .bind(operationKey,known.length+fresh.length,String(notes ?? '').slice(0,1000),actor),
    db.prepare('SELECT result FROM operation_requests WHERE idempotency_key=?').bind(operationKey),
  ]);
  return JSON.parse(results.at(-1).results[0].result);
}

export async function reconcileUnknownLaptop(db, {
  p_unknown_laptop_id: unknownId, p_expected_laptop_id: expectedId, p_actor: actor, p_idempotency_key: inputKey,
}) {
  const operationKey = key(inputKey);
  unknownId = Number(unknownId); expectedId = Number(expectedId);
  if (!actor || !Number.isSafeInteger(unknownId) || !Number.isSafeInteger(expectedId)
    || unknownId <= 0 || expectedId <= 0 || unknownId === expectedId) fail('Hai laptop phải khác nhau');
  const stagingKey = randomUUID();
  const replay = 'EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)';
  const results = await db.batch([
    guard(db, `NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=? AND operation<>'RECONCILE_UNKNOWN_LAPTOP')`, [operationKey]),
    guard(db, `${replay} OR EXISTS(SELECT 1 FROM laptops WHERE id=? AND source_type='UNKNOWN' AND status='waiting_qc')`, [operationKey,unknownId]),
    guard(db, `${replay} OR EXISTS(SELECT 1 FROM laptops WHERE id=? AND status='in_transit'
      AND source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT'))`, [operationKey,expectedId]),
    guard(db, `${replay} OR NOT EXISTS(
      SELECT 1 FROM qc_inspections WHERE laptop_id=? UNION ALL SELECT 1 FROM repair_jobs WHERE laptop_id=?
      UNION ALL SELECT 1 FROM orders WHERE laptop_id=? OR requested_laptop_id=?
      UNION ALL SELECT 1 FROM reservations WHERE laptop_id=? UNION ALL SELECT 1 FROM stock_movements WHERE laptop_id=?)`,
    [operationKey,expectedId,expectedId,expectedId,expectedId,expectedId,expectedId]),
    db.prepare(`INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
      SELECT ?,'RECONCILE_SOURCE',${laptopJson},? FROM laptops WHERE id=? AND NOT ${replay}`)
      .bind(stagingKey,actor,expectedId,operationKey),
    db.prepare(`UPDATE laptops SET serial=NULL WHERE id=? AND NOT ${replay}`).bind(expectedId,operationKey),
    db.prepare(`UPDATE laptops SET
      purchase_batch_id=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.purchase_batch_id'),
      source_type=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.source_type'),
      purchase_price_rmb=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.purchase_price_rmb'),
      shipping_rmb=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.shipping_rmb'),
      purchase_exchange_rate=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.purchase_exchange_rate'),
      price_rmb=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.purchase_price_rmb'),
      exchange_rate=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.purchase_exchange_rate'),
      tracking_code_cn=COALESCE(NULLIF(json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.tracking_code_cn'),''),tracking_code_cn),
      tracking_code=COALESCE(NULLIF(json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.tracking_code_cn'),''),tracking_code),
      name=COALESCE(NULLIF(name,''),json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.name')),
      serial=COALESCE(serial,json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.serial')),
      import_date=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.import_date'),
      month_key=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.month_key'),
      source_reference_id=json_extract((SELECT result FROM operation_requests WHERE idempotency_key=?),'$.source_reference_id'),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND NOT ${replay}`)
      .bind(stagingKey,stagingKey,stagingKey,stagingKey,stagingKey,stagingKey,stagingKey,stagingKey,stagingKey,
        stagingKey,stagingKey,stagingKey,stagingKey,stagingKey,unknownId,operationKey),
    db.prepare(`DELETE FROM laptops WHERE id=? AND NOT ${replay}`).bind(expectedId,operationKey),
    db.prepare(`UPDATE operation_requests SET idempotency_key=?,operation='RECONCILE_UNKNOWN_LAPTOP',
      result=(SELECT ${laptopJson} FROM laptops WHERE id=?),created_by=? WHERE idempotency_key=? AND NOT ${replay}`)
      .bind(operationKey,unknownId,actor,stagingKey,operationKey),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'LAPTOP',CAST(? AS TEXT),'UPDATE',json_object('event','UNKNOWN_SOURCE_RECONCILED',
        'deleted_expected_laptop_id',?,'purchase_batch_id',json_extract(result,'$.purchase_batch_id')),?
      FROM operation_requests WHERE idempotency_key=? AND changes()=1`).bind(unknownId,expectedId,actor,operationKey),
    db.prepare('SELECT result FROM operation_requests WHERE idempotency_key=?').bind(operationKey),
  ]);
  return JSON.parse(results.at(-1).results[0].result);
}
