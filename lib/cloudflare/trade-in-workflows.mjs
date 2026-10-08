import { createHash, randomUUID } from 'node:crypto';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const today = "date('now','+7 hours')";
const month = "strftime('%m/%Y','now','+7 hours')";

export async function receiveCustomerLaptop(db, profile, input) {
  // Receiving stock and settling an exchange retain existing ADMIN authority.
  if (profile.role !== 'ADMIN') fail('Chỉ quản trị viên được xác nhận thu máy và thu tiền', 403);
  const d = {
    workflow: text(input.workflow), sellerName: text(input.sellerName), sellerPhone: text(input.sellerPhone, 30),
    name: text(input.name), category: text(input.category, 100), serial: text(input.serial, 160),
    orderId: Number(input.orderId || 0), laptopId: Number(input.laptopId || 0),
    agreedVnd: Number(input.agreedVnd || 0), saleVnd: Number(input.saleVnd || 0), accountId: text(input.accountId, 100),
  };
  const key = text(input.idempotencyKey, 101);
  if (key.length < 8 || key.length > 100 || !['WALK_IN', 'BUYBACK', 'EXCHANGE'].includes(d.workflow)) fail('Yêu cầu thu máy không hợp lệ');
  const hash = createHash('sha256').update(JSON.stringify(d)).digest('hex');
  const existing = await db.prepare('SELECT * FROM trade_ins WHERE idempotency_key=?').bind(key).first();
  if (existing) {
    if (existing.request_hash !== hash) fail('Mã giao dịch đã dùng cho thông tin khác. Hãy tải lại hồ sơ.', 409);
    return existing;
  }
  let old = null, laptop = null, next = null;
  if (d.workflow !== 'WALK_IN') {
    old = await db.prepare('SELECT * FROM orders WHERE id=?').bind(d.orderId).first();
    if (!old || !old.is_active || !['done', 'shipping', 'prepared'].includes(old.order_status)) fail('Chọn một đơn đã bán còn hiệu lực');
    laptop = await db.prepare('SELECT * FROM laptops WHERE id=?').bind(old.laptop_id).first();
    if (!laptop || laptop.status !== 'sold' || laptop.acquisition_closed) fail('Máy của đơn cũ không còn ở trạng thái đã bán hoặc đã được thu lại');
    d.name = laptop.name; d.serial = laptop.serial; d.category = laptop.category;
  }
  if (d.workflow !== 'EXCHANGE' && (!d.sellerName || !d.name || !d.category || !d.serial)) fail('Điền họ tên người bán, tên máy, phân loại và Serial');
  if (d.workflow === 'BUYBACK' && !d.sellerPhone) fail('Điền số điện thoại người bán');
  let difference = 0;
  if (d.workflow === 'EXCHANGE') {
    if (!Number.isSafeInteger(d.agreedVnd) || d.agreedVnd <= 0 || !Number.isSafeInteger(d.saleVnd) || d.saleVnd < d.agreedVnd) fail('Giá bán phải từ giá thu lại trở lên; luồng này chỉ hỗ trợ thu bù hoặc đổi ngang');
    if (Number(old.debt_amount) > 0) fail('Đơn cũ còn công nợ. Cần xử lý công nợ trước khi đổi hàng');
    difference = d.saleVnd - d.agreedVnd;
    next = await db.prepare("SELECT * FROM laptops WHERE id=? AND status='available' AND is_active=1 AND acquisition_closed=0").bind(d.laptopId).first();
    if (!next || next.id === laptop.id) fail('Chọn máy khác đang sẵn hàng trong kho');
    if (difference && !d.accountId) fail('Chọn tài khoản nhận tiền bù');
    const customer = old.customer_id ? await db.prepare('SELECT name,phone FROM customers WHERE id=?').bind(old.customer_id).first() : null;
    d.sellerName = customer?.name || old.customer_info || '';
    d.sellerPhone = customer?.phone || '';
  }
  const id = randomUUID(), actor = profile.name || 'ADMIN';
  const stmts = [], add = (sql, ...args) => stmts.push(db.prepare(sql).bind(...args));
  const pending = 'EXISTS(SELECT 1 FROM trade_ins WHERE id=?)';
  const replay = 'EXISTS(SELECT 1 FROM trade_ins WHERE idempotency_key=?)';
  add(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM trade_ins WHERE idempotency_key=? AND request_hash IS NOT ?) THEN 1 ELSE json('trade-in key conflict') END`, key, hash);
  if (d.workflow === 'WALK_IN') add(`SELECT CASE WHEN ${replay} OR EXISTS(SELECT 1 FROM app_options WHERE group_key='category' AND option_key=? AND is_active=1) THEN 1 ELSE json('invalid laptop category') END`, key, d.category);
  if (old) {
    add(`SELECT CASE WHEN ${replay} OR EXISTS(SELECT 1 FROM orders o JOIN laptops l ON l.id=o.laptop_id
      WHERE o.id=? AND o.updated_at IS ? AND o.order_status=? AND o.is_active=1 AND l.id=? AND l.updated_at IS ?
      AND l.status='sold' AND l.acquisition_closed=0 AND NOT EXISTS(SELECT 1 FROM trade_ins t WHERE t.order_id=o.id)
      AND NOT EXISTS(SELECT 1 FROM orders other WHERE other.laptop_id=l.id AND other.id<>o.id AND other.is_active=1 AND other.order_status NOT IN ('done','cancelled','returned')))
      THEN 1 ELSE json('old order changed or already received') END`, key, old.id, old.updated_at, old.order_status, laptop.id, laptop.updated_at);
  }
  if (next) {
    add(`SELECT CASE WHEN ${replay} OR EXISTS(SELECT 1 FROM laptops l WHERE l.id=? AND l.updated_at IS ? AND l.status='available' AND l.is_active=1 AND l.acquisition_closed=0
      AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.laptop_id=l.id AND o.is_active=1 AND o.order_status NOT IN ('cancelled','returned'))
      AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.laptop_id=l.id AND r.status='ACTIVE')) THEN 1 ELSE json('replacement laptop unavailable') END`, key, next.id, next.updated_at);
    if (difference) add(`SELECT CASE WHEN ${replay} OR EXISTS(SELECT 1 FROM cash_accounts WHERE id=? AND is_active=1 AND currency='VND' AND date(opening_balance_at)<=${today}) THEN 1 ELSE json('cash account unavailable') END`, key, d.accountId);
  }
  add(`INSERT INTO trade_ins(id,trade_in_code,workflow,seller_name,seller_phone,category,original_laptop_id,order_id,customer_id,
    brand,model,serial,status,agreed_value_vnd,received_at,idempotency_key,created_by,request_hash,notes)
    SELECT ?,?,?,?,?,?,?,?,?, '',?,?,'CONVERTED_TO_INVENTORY',?,${now},?,?,?,?
    WHERE NOT EXISTS(SELECT 1 FROM trade_ins WHERE idempotency_key=?)`,
  id, `TI-${id.slice(0, 8).toUpperCase()}`, d.workflow, d.sellerName || old?.customer_info || '', d.sellerPhone,
  d.category, laptop?.id || null, old?.id || null, old?.customer_id || null, d.name, d.serial,
  d.workflow === 'EXCHANGE' ? d.agreedVnd : null, key, actor, hash,
  d.workflow === 'EXCHANGE' ? 'ĐỔI HÀNG' : 'Thu lại khách lẻ · chưa ghi nhận giá vốn', key);

  if (d.workflow !== 'EXCHANGE') {
    if (laptop) add(`UPDATE laptops SET acquisition_closed=1,updated_at=${now} WHERE id=? AND ${pending}`, laptop.id, id);
    add(`INSERT INTO laptops(serial,name,category,status,location,seller,is_active,source_type,source_reference_id,
      received_at,warehouse_date,import_date,month_key,created_by,previous_laptop_id,import_price_vnd,condition_note,battery_health,charger_status,qc_details)
      SELECT ?,?,?,'waiting_qc',?,'Thu lại khách lẻ',1,'TRADE_IN',?,${now},${today},${today},${month},?,?,NULL,?,?,?,'{}' WHERE ${pending}`,
    d.serial, d.name, d.category, laptop?.location || 'store', id, actor, laptop?.id || null,
    laptop?.condition_note || '', laptop?.battery_health || null, laptop?.charger_status || null, id);
    add(`UPDATE trade_ins SET inventory_laptop_id=(SELECT id FROM laptops WHERE source_type='TRADE_IN' AND source_reference_id=?) WHERE id=?`, id, id);
  } else {
    add(`UPDATE orders SET order_status='cancelled',cancel_reason='ĐỔI HÀNG',cancelled_at=${now},laptop_locked=0,reservation_expires_at=NULL,updated_at=${now} WHERE id=? AND ${pending}`, old.id, id);
    add(`UPDATE cod_receivables SET status='CANCELLED' WHERE order_id=? AND status='PENDING_DELIVERY' AND ${pending}`, old.id, id);
    add(`UPDATE reservations SET status='CANCELLED' WHERE order_id=? AND status='ACTIVE' AND ${pending}`, old.id, id);
    add(`INSERT INTO orders(created_date,month_key,customer_id,customer_info,customer_address,branch_id,sale_online,sale_offline,
      order_type,laptop_id,requested_laptop_id,sale_price,amount_paid,debt_amount,cod_amount,trade_in_credit_vnd,trade_in_laptop_id,
      order_status,payment_status,payment_method,laptop_locked,note,profit_vnd)
      SELECT ${today},${month},customer_id,customer_info,customer_address,branch_id,sale_online,sale_offline,order_type,?,?,?, ?,0,0,?,?,'new','paid','transfer_cash',1,?, ?
      FROM orders WHERE id=? AND ${pending}`, next.id, next.id, d.saleVnd / 1e6, difference / 1e6, d.agreedVnd, laptop.id,
    `Đổi hàng từ đơn #${old.id}`, next.import_price_vnd == null ? 0 : d.saleVnd / 1e6 - Number(next.import_price_vnd), old.id, id);
    add(`UPDATE trade_ins SET new_order_id=last_insert_rowid() WHERE id=?`, id);
    add(`UPDATE laptops SET status='available',sold_at=NULL,month_key=${month},warehouse_date=${today},available_for_sale_at=${now},updated_at=${now} WHERE id=? AND ${pending}`, laptop.id, id);
    add(`UPDATE laptops SET status='reserved',updated_at=${now} WHERE id=? AND ${pending}`, next.id, id);
    if (difference) {
      add(`INSERT INTO payments(order_id,payment_type,amount,payment_method,payment_date,note,recorded_by,account_id,idempotency_key)
        SELECT new_order_id,'balance',?,'transfer_cash',${today},'Thu bù đổi hàng',?,?,? FROM trade_ins WHERE id=?`, difference / 1e6, actor, d.accountId, key, id);
      add(`INSERT INTO financial_records(record_type,category,amount,order_id,payment_id,occurred_on,payment_method,note,recorded_by)
        SELECT 'income',p.payment_type,p.amount,p.order_id,p.id,p.payment_date,p.payment_method,p.note,p.recorded_by FROM payments p JOIN trade_ins t ON t.new_order_id=p.order_id WHERE t.id=? AND p.idempotency_key=?`, id, key);
      add(`INSERT INTO account_transactions(id,account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,description,idempotency_key,created_by)
        SELECT ?,p.account_id,'IN',round(p.amount*1000000),'VND','PAYMENT',CAST(p.id AS TEXT),'CUSTOMER_PAYMENT',p.payment_date,'Thu bù đổi hàng',?,?
        FROM payments p JOIN trade_ins t ON t.new_order_id=p.order_id WHERE t.id=? AND p.idempotency_key=?`, randomUUID(), `${key}-CASH`, actor, id, key);
    }
    add(`INSERT INTO stock_movements(laptop_id,order_id,movement_type,note,performed_by,reference_type,reference_id)
      SELECT ?,new_order_id,'RESERVED','Máy mới đổi hàng',?,'TRADE_IN',id FROM trade_ins WHERE id=?`, next.id, actor, id);
    add(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'ORDER',CAST(order_id AS TEXT),'UPDATE',json_object('order_status','cancelled','cancel_reason','ĐỔI HÀNG','new_order_id',new_order_id),? FROM trade_ins WHERE id=?`, actor, id);
  }
  add(`INSERT INTO stock_movements(laptop_id,order_id,movement_type,note,performed_by,reference_type,reference_id)
    SELECT COALESCE(inventory_laptop_id,original_laptop_id),order_id,?,'Thu lại khách lẻ',?,'TRADE_IN',id FROM trade_ins WHERE id=?`, d.workflow === 'EXCHANGE' ? 'RELEASED' : 'RECEIVED', actor, id);
  add(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
    SELECT 'TRADE_IN',id,'CREATE',json_object('workflow',workflow,'laptop_id',inventory_laptop_id,'old_order_id',order_id,'new_order_id',new_order_id),? FROM trade_ins WHERE id=?`, actor, id);
  add('SELECT * FROM trade_ins WHERE idempotency_key=?', key);
  try { return (await db.batch(stmts)).at(-1).results[0]; }
  catch (error) {
    if (/constraint|malformed JSON|json|unavailable|changed/i.test(error.message)) fail('Dữ liệu đã thay đổi, Serial trùng hoặc hồ sơ đã được thu lại. Tải lại và kiểm tra đơn, máy, tài khoản.', 409);
    throw error;
  }
}
