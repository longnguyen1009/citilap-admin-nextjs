import { randomUUID } from 'node:crypto';

const reasons = new Set(['MAINBOARD_REPAIRED','WRONG_CONFIGURATION','HARDWARE_FAULT','SCREEN_FAULT','GPU_FAULT',
  'FUNCTIONAL_FAILURE','PHYSICAL_DAMAGE','MISSING_ACCESSORY','SUPPLIER_AGREEMENT','OTHER']);
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };

export async function createSupplierReturn(db, { p_data: data, p_items: items, p_actor: actor, p_idempotency_key: key }) {
  if (!data || !actor || typeof key !== 'string' || key.trim().length < 8 || key.length > 100
    || !Array.isArray(items) || items.length < 1 || items.length > 100 || !reasons.has(data.reason)) invalid('Yêu cầu tạo phiếu trả không hợp lệ');
  const normalized = items.map(item => {
    const laptopId = Number(item.laptop_id);
    const expected = item.expected_refund_rmb == null || item.expected_refund_rmb === '' ? null : Number(item.expected_refund_rmb);
    const agreed = item.agreed_refund_rmb == null || item.agreed_refund_rmb === '' ? null : Number(item.agreed_refund_rmb);
    if (!Number.isSafeInteger(laptopId) || laptopId <= 0 || !reasons.has(item.reason)
      || (expected !== null && (!Number.isFinite(expected) || expected < 0))
      || (agreed !== null && (!Number.isFinite(agreed) || agreed < 0))) invalid('Laptop trả nhà cung cấp không hợp lệ');
    return { laptopId, repairId: item.repair_job_id || null, qcId: item.qc_inspection_id || null, reason: item.reason,
      notes: String(item.condition_notes ?? '').slice(0,3000), expected, agreed };
  });
  if (new Set(normalized.map(item => item.laptopId)).size !== normalized.length) invalid('Danh sách trả có laptop bị trùng');
  const id = randomUUID(), payload = JSON.stringify(normalized);
  const replay = 'EXISTS(SELECT 1 FROM supplier_returns WHERE idempotency_key=?)';
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN ${replay} OR (NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(
      SELECT 1 FROM laptops l JOIN purchase_batches b ON b.id=l.purchase_batch_id AND b.active=1
      WHERE l.id=json_extract(e.value,'$.laptopId') AND l.is_active=1 AND l.status IN ('waiting_qc','repair','available')
        AND l.source_type<>'UNKNOWN' AND NOT EXISTS(SELECT 1 FROM repair_jobs r WHERE r.laptop_id=l.id
          AND r.status NOT IN ('COMPLETED','CANCELLED')))) AND
      (SELECT count(DISTINCT b.supplier_id) FROM json_each(?) e JOIN laptops l ON l.id=json_extract(e.value,'$.laptopId')
        JOIN purchase_batches b ON b.id=l.purchase_batch_id)=1)
      THEN 1 ELSE json('supplier return validation failed') END`).bind(key,payload,payload),
    db.prepare(`INSERT INTO supplier_returns(id,return_code,supplier_id,reason,reason_notes,notes,created_by,idempotency_key)
      SELECT ?,'SR-'||strftime('%Y%m%d','now')||'-'||printf('%03d',COALESCE((SELECT max(CAST(substr(return_code,13) AS INTEGER))
        FROM supplier_returns WHERE return_code LIKE 'SR-'||strftime('%Y%m%d','now')||'-%'),0)+1),
        b.supplier_id,?,?,?,?,? FROM json_each(?) e JOIN laptops l ON l.id=json_extract(e.value,'$.laptopId')
        JOIN purchase_batches b ON b.id=l.purchase_batch_id LIMIT 1
      ON CONFLICT(idempotency_key) DO NOTHING`).bind(id,data.reason,String(data.reason_notes ?? '').slice(0,3000),
        String(data.notes ?? '').slice(0,3000),actor,key,payload),
    db.prepare(`INSERT INTO supplier_return_items(supplier_return_id,laptop_id,repair_job_id,qc_inspection_id,reason,
      condition_notes,expected_refund_rmb,agreed_refund_rmb,previous_laptop_status)
      SELECT r.id,json_extract(e.value,'$.laptopId'),json_extract(e.value,'$.repairId'),json_extract(e.value,'$.qcId'),
        json_extract(e.value,'$.reason'),json_extract(e.value,'$.notes'),json_extract(e.value,'$.expected'),json_extract(e.value,'$.agreed'),l.status
      FROM supplier_returns r,json_each(?) e JOIN laptops l ON l.id=json_extract(e.value,'$.laptopId')
      WHERE r.idempotency_key=? AND r.id=?`).bind(payload,key,id),
    db.prepare(`UPDATE laptops SET status='supplier_return',available_for_sale_at=NULL,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (SELECT json_extract(value,'$.laptopId') FROM json_each(?))
      AND EXISTS(SELECT 1 FROM supplier_returns WHERE id=?)`).bind(payload,id),
    db.prepare(`INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by)
      SELECT id,'CREATED',json_object('item_count',?,'supplier_derived',json('true')),? FROM supplier_returns WHERE id=?`)
      .bind(normalized.length,actor,id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'SUPPLIER_RETURN',id,'CREATE',json_object('event','SUPPLIER_RETURN_CREATED','supplier_id',supplier_id,'item_count',?),?
      FROM supplier_returns WHERE id=?`).bind(normalized.length,actor,id),
    db.prepare('SELECT * FROM supplier_returns WHERE idempotency_key=?').bind(key),
  ]);
  return results.at(-1).results[0];
}

const transitions = {
  DRAFT: ['APPROVED', 'CANCELLED'], APPROVED: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED', 'CANCELLED'], SHIPPED: ['SUPPLIER_RECEIVED'],
  SUPPLIER_RECEIVED: ['WAITING_REFUND', 'WAITING_REPLACEMENT', 'REJECTED'],
  REFUNDED: ['CLOSED'], REPLACED: ['CLOSED'], REJECTED: ['CLOSED'],
};
const resolutions = new Set(['REFUND', 'REPLACEMENT', 'PARTIAL_REFUND', 'SUPPLIER_REPAIR', 'OTHER']);

export async function transitionSupplierReturn(db, { p_id: id, p_target: target, p_data: data = {}, p_actor: actor }) {
  const carrier = String(data?.carrier ?? '').trim().slice(0, 160);
  const tracking = String(data?.tracking_number ?? '').trim().slice(0, 200);
  const resolution = data?.resolution_type || null;
  if (!id || !actor || !Object.values(transitions).some(values => values.includes(target))
    || (resolution !== null && !resolutions.has(resolution))) invalid('Chuyển trạng thái trả nhà cung cấp không hợp lệ');
  const allowed = Object.entries(transitions).filter(([, values]) => values.includes(target)).map(([status]) => status);
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM supplier_returns WHERE id=?
      AND status IN (SELECT value FROM json_each(?))
      AND (?<>'SHIPPED' OR (length(trim(COALESCE(nullif(?,''),return_carrier)))>0
        AND length(trim(COALESCE(nullif(?,''),return_tracking_number)))>0)))
      THEN 1 ELSE json('supplier return transition rejected') END`).bind(id,JSON.stringify(allowed),target,carrier,tracking),
    db.prepare(`UPDATE supplier_returns SET status=?,resolution_type=COALESCE(?,resolution_type),
      return_carrier=COALESCE(nullif(?,''),return_carrier),return_tracking_number=COALESCE(nullif(?,''),return_tracking_number),
      approved_by=CASE WHEN ?='APPROVED' THEN ? ELSE approved_by END,
      approved_at=CASE WHEN ?='APPROVED' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE approved_at END,
      shipped_at=CASE WHEN ?='SHIPPED' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE shipped_at END,
      supplier_received_at=CASE WHEN ?='SUPPLIER_RECEIVED' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE supplier_received_at END,
      closed_at=CASE WHEN ? IN ('CLOSED','CANCELLED') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE closed_at END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
      .bind(target,resolution,carrier,tracking,target,actor,target,target,target,target,id),
    db.prepare(`UPDATE laptops SET status='supplier_return',available_for_sale_at=NULL,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN
      (SELECT laptop_id FROM supplier_return_items WHERE supplier_return_id=?)
      AND ? IN ('APPROVED','READY_TO_SHIP','SHIPPED','SUPPLIER_RECEIVED','WAITING_REFUND','WAITING_REPLACEMENT')`).bind(id,target),
    db.prepare(`UPDATE laptops SET status=COALESCE((SELECT previous_laptop_status FROM supplier_return_items
      WHERE supplier_return_id=? AND laptop_id=laptops.id),'waiting_qc'),available_for_sale_at=NULL,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ?='CANCELLED'
      AND id IN (SELECT laptop_id FROM supplier_return_items WHERE supplier_return_id=?)`).bind(id,target,id),
    db.prepare(`UPDATE supplier_return_items SET status=CASE ? WHEN 'CANCELLED' THEN 'CANCELLED'
      WHEN 'SHIPPED' THEN 'SHIPPED' WHEN 'SUPPLIER_RECEIVED' THEN 'SUPPLIER_RECEIVED' ELSE status END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE supplier_return_id=?
      AND ? IN ('CANCELLED','SHIPPED','SUPPLIER_RECEIVED')`).bind(target,id,target),
    db.prepare(`INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by)
      SELECT id,?,json_object('resolution_type',resolution_type),? FROM supplier_returns WHERE id=?`).bind(target,actor,id),
    db.prepare('SELECT * FROM supplier_returns WHERE id=?').bind(id),
  ]);
  return results.at(-1).results[0];
}

export async function recordSupplierRefundWithAccount(db, {
  p_return_id: returnId, p_amount_rmb: amountInput, p_exchange_rate: rateInput, p_method: method,
  p_reference: reference, p_received_at: receivedInput, p_actor: actor, p_account_id: accountId,
  p_idempotency_key: inputKey,
}) {
  const amount = Number(amountInput), rate = rateInput == null ? null : Number(rateInput);
  const key = typeof inputKey === 'string' ? inputKey.trim() : '';
  const received = receivedInput ? new Date(receivedInput) : new Date();
  if (!returnId || !accountId || !actor || !Number.isFinite(amount) || amount <= 0
    || (rate !== null && (!Number.isFinite(rate) || rate <= 0)) || !['WECHAT','ALIPAY','BANK_TRANSFER','OFFSET','OTHER'].includes(method)
    || key.length < 8 || key.length > 90 || Number.isNaN(received.valueOf())) invalid('Thông tin hoàn tiền không hợp lệ');
  const occurred = received.toISOString(), refundTxId = randomUUID();
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM supplier_refunds WHERE idempotency_key=?
      AND (account_id IS NOT ? OR supplier_return_id<>? OR amount_rmb<>?))
      THEN 1 ELSE json('refund key belongs to another request') END`).bind(key,accountId,returnId,amount),
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM supplier_refunds WHERE idempotency_key=? AND account_id=?) OR
      (EXISTS(SELECT 1 FROM cash_accounts WHERE id=? AND is_active=1 AND currency='CNY' AND date(opening_balance_at)<=date(?))
       AND EXISTS(SELECT 1 FROM supplier_returns r WHERE r.id=? AND r.status IN ('WAITING_REFUND','PARTIALLY_RESOLVED')
         AND ?>0 AND ?<=COALESCE((SELECT sum(COALESCE(agreed_refund_rmb,expected_refund_rmb)) FROM supplier_return_items
           WHERE supplier_return_id=r.id AND status<>'CANCELLED'),0)-
           COALESCE((SELECT sum(amount_rmb) FROM supplier_refunds WHERE supplier_return_id=r.id),0)))
      THEN 1 ELSE json('supplier refund validation failed') END`)
      .bind(key,accountId,accountId,occurred,returnId,amount,amount),
    db.prepare(`INSERT INTO supplier_refunds(supplier_id,supplier_return_id,amount_rmb,amount_vnd,exchange_rate,
      refund_method,reference,received_at,idempotency_key,created_by,account_id)
      SELECT supplier_id,id,?,CASE WHEN ? IS NULL THEN NULL ELSE round(?*?,2) END,?,?,?,?,?,?,?
      FROM supplier_returns WHERE id=? AND NOT EXISTS(SELECT 1 FROM supplier_refunds WHERE idempotency_key=?)`)
      .bind(amount,rate,amount,rate,rate,method,String(reference ?? '').slice(0,300),occurred,key,actor,accountId,returnId,key),
    db.prepare(`INSERT INTO account_transactions(id,account_id,direction,amount,currency,reference_type,reference_id,
      transaction_type,occurred_at,description,idempotency_key,created_by)
      SELECT ?,?,'IN',amount_rmb,'CNY','SUPPLIER_REFUND',CAST(id AS TEXT),'SUPPLIER_REFUND',received_at,
        substr(COALESCE(nullif(reference,''),'Hoàn tiền nhà cung cấp'),1,1000),?||'-CASH',?
      FROM supplier_refunds WHERE idempotency_key=? AND changes()=1`)
      .bind(refundTxId,accountId,key,actor,key),
    db.prepare(`UPDATE supplier_returns SET status=CASE WHEN
      COALESCE((SELECT sum(amount_rmb) FROM supplier_refunds WHERE supplier_return_id=supplier_returns.id),0)>=
      COALESCE((SELECT sum(COALESCE(agreed_refund_rmb,expected_refund_rmb)) FROM supplier_return_items
        WHERE supplier_return_id=supplier_returns.id AND status<>'CANCELLED'),0)
      THEN 'REFUNDED' ELSE 'PARTIALLY_RESOLVED' END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?
      AND EXISTS(SELECT 1 FROM account_transactions WHERE id=?)`).bind(returnId,refundTxId),
    db.prepare(`UPDATE supplier_return_items SET status='REFUNDED',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE supplier_return_id=? AND status<>'CANCELLED' AND EXISTS(SELECT 1 FROM supplier_returns WHERE id=? AND status='REFUNDED')
      AND EXISTS(SELECT 1 FROM account_transactions WHERE id=?)`).bind(returnId,returnId,refundTxId),
    db.prepare(`INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by)
      SELECT ?, 'REFUND_RECEIVED',json_object('amount_rmb',?,'refunded_rmb',(SELECT sum(amount_rmb) FROM supplier_refunds WHERE supplier_return_id=?),
        'remaining_rmb',max((SELECT sum(COALESCE(agreed_refund_rmb,expected_refund_rmb)) FROM supplier_return_items WHERE supplier_return_id=? AND status<>'CANCELLED')-
          (SELECT sum(amount_rmb) FROM supplier_refunds WHERE supplier_return_id=?),0),'idempotency_key',?),?
      WHERE EXISTS(SELECT 1 FROM account_transactions WHERE id=?)`).bind(returnId,amount,returnId,returnId,returnId,key,actor,refundTxId),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'SUPPLIER_REFUND',CAST(id AS TEXT),'CREATE',json_object('supplier_return_id',supplier_return_id,'amount_rmb',amount_rmb),?
      FROM supplier_refunds r WHERE idempotency_key=? AND EXISTS(SELECT 1 FROM account_transactions WHERE id=?)`).bind(actor,key,refundTxId),
    db.prepare('SELECT * FROM supplier_refunds WHERE idempotency_key=?').bind(key),
  ]);
  return results.at(-1).results[0];
}

export async function linkSupplierReplacement(db, { p_item_id: itemIdInput, p_replacement_laptop_id: laptopIdInput, p_actor: actor }) {
  const itemId = Number(itemIdInput), laptopId = Number(laptopIdInput);
  if (!Number.isSafeInteger(itemId) || itemId <= 0 || !Number.isSafeInteger(laptopId) || laptopId <= 0 || !actor) {
    invalid('Laptop thay thế không hợp lệ');
  }
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM supplier_return_items i JOIN supplier_returns r ON r.id=i.supplier_return_id
      JOIN laptops l ON l.id=? JOIN purchase_batches b ON b.id=l.purchase_batch_id
      WHERE i.id=? AND i.replacement_laptop_id IS NULL AND r.status='WAITING_REPLACEMENT'
        AND l.source_type='SUPPLIER_REPLACEMENT' AND l.status IN ('in_transit','waiting_qc')
        AND b.supplier_id=r.supplier_id AND NOT EXISTS(SELECT 1 FROM supplier_return_items WHERE replacement_laptop_id=l.id))
      THEN 1 ELSE json('supplier replacement validation failed') END`).bind(laptopId,itemId),
    db.prepare(`UPDATE supplier_return_items SET replacement_laptop_id=?,status='REPLACED',
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(laptopId,itemId),
    db.prepare(`UPDATE supplier_returns SET status='REPLACED',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=(SELECT supplier_return_id FROM supplier_return_items WHERE id=?) AND NOT EXISTS(
        SELECT 1 FROM supplier_return_items WHERE supplier_return_id=(SELECT supplier_return_id FROM supplier_return_items WHERE id=?)
          AND status NOT IN ('REPLACED','CANCELLED'))`).bind(itemId,itemId),
    db.prepare(`INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by)
      SELECT supplier_return_id,'REPLACEMENT_LINKED',json_object('item_id',id,'replacement_laptop_id',replacement_laptop_id),?
      FROM supplier_return_items WHERE id=?`).bind(actor,itemId),
    db.prepare('SELECT * FROM supplier_return_items WHERE id=?').bind(itemId),
  ]);
  return results.at(-1).results[0];
}
