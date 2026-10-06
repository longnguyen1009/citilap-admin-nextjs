import { randomUUID } from 'node:crypto';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const validKey = key => typeof key === 'string' && key.trim().length >= 8 && key.trim().length <= 90;
const validDateTime = value => typeof value === 'string' && value.trim() && Number.isFinite(new Date(value).valueOf());
const rowFrom = result => result?.results?.[0] || null;

export async function createCodReceivable(db, {
  p_order_id: orderId, p_carrier: carrier, p_tracking: tracking,
  p_expected_settlement_at: expectedAt, p_notes: notes, p_actor: actor,
  p_idempotency_key: key,
}) {
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !actor || !validKey(key)
    || (expectedAt && !validDateTime(expectedAt))) fail('Thông tin khoản COD không hợp lệ');
  const id = randomUUID();
  const batch = await db.batch([
    db.prepare(`SELECT CASE
      WHEN EXISTS(SELECT 1 FROM cod_receivables WHERE idempotency_key=?)
        THEN CASE WHEN EXISTS(SELECT 1 FROM cod_receivables WHERE idempotency_key=? AND order_id=?) THEN 1 ELSE json('cod key conflict') END
      WHEN EXISTS(SELECT 1 FROM orders o WHERE o.id=? AND o.is_active=1 AND COALESCE(o.cod_amount,0)>0
        AND min(COALESCE(o.cod_amount,0),COALESCE(o.debt_amount,0))>0)
        AND NOT EXISTS(SELECT 1 FROM cod_receivables WHERE order_id=?) THEN 1
      ELSE json('invalid cod order') END`).bind(key, key, orderId, orderId, orderId),
    db.prepare(`INSERT INTO cod_receivables(id,order_id,carrier,tracking_number,expected_cod_amount_vnd,shipped_at,
      expected_settlement_at,notes,idempotency_key,created_by)
      SELECT ?,o.id,?,?,round(min(o.cod_amount,o.debt_amount)*1000000,0),
        CASE WHEN o.order_status IN ('shipping','done') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END,?,?,?,?
      FROM orders o WHERE o.id=? AND NOT EXISTS(SELECT 1 FROM cod_receivables WHERE idempotency_key=?)`)
      .bind(id, String(carrier ?? '').slice(0, 160), String(tracking ?? '').slice(0, 200), expectedAt || null,
        String(notes ?? '').slice(0, 2000), key.trim(), actor, orderId, key),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'COD_RECEIVABLE',id,'CREATE',json_object('event','COD_CREATED','order_id',order_id,'expected_vnd',expected_cod_amount_vnd),?
      FROM cod_receivables WHERE id=?`).bind(actor, id),
    db.prepare('SELECT * FROM cod_receivables WHERE idempotency_key=?').bind(key),
  ]);
  return rowFrom(batch.at(-1));
}

export async function transitionCodReceivable(db, {
  p_id: id, p_target: target, p_expected_settlement_at: expectedAt, p_notes: notes, p_actor: actor,
}) {
  const transitions = {
    DELIVERED: ['PENDING_DELIVERY'],
    WAITING_SETTLEMENT: ['DELIVERED'],
    DISPUTED: ['DELIVERED', 'WAITING_SETTLEMENT', 'PARTIALLY_SETTLED'],
    RETURNED: ['PENDING_DELIVERY'],
    CANCELLED: ['PENDING_DELIVERY'],
  };
  if (!id || !transitions[target] || !actor || (expectedAt && !validDateTime(expectedAt))) {
    fail('Chuyển trạng thái COD không hợp lệ');
  }
  const allowed = transitions[target];
  const paymentKey = `cod-delivered-${id}`;
  const placeholders = allowed.map(() => '?').join(',');
  const batch = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM cod_receivables WHERE id=? AND status IN (${placeholders}))
      THEN 1 ELSE json('invalid cod transition') END`).bind(id, ...allowed),
    db.prepare(`INSERT INTO payments(order_id,payment_type,amount,payment_method,payment_date,reference_code,note,recorded_by,idempotency_key)
      SELECT order_id,'cod',expected_cod_amount_vnd/1000000,'cod',date('now'),tracking_number,
        'COD đã giao - chuyển nghĩa vụ phải thu sang đơn vị vận chuyển',?,?
      FROM cod_receivables WHERE id=? AND status='PENDING_DELIVERY' AND ?='DELIVERED'`)
      .bind(actor, paymentKey, id, target),
    db.prepare(`INSERT INTO financial_records(record_type,category,amount,order_id,payment_id,occurred_on,payment_method,note,recorded_by)
      SELECT 'income','cod',p.amount,p.order_id,p.id,p.payment_date,p.payment_method,p.note,p.recorded_by
      FROM payments p WHERE p.idempotency_key=? AND ?='DELIVERED'`).bind(paymentKey, target),
    db.prepare(`UPDATE orders SET amount_paid=amount_paid+(SELECT expected_cod_amount_vnd/1000000 FROM cod_receivables WHERE id=?),
      debt_amount=max(sale_price-(amount_paid+(SELECT expected_cod_amount_vnd/1000000 FROM cod_receivables WHERE id=?))-trade_in_credit_vnd/1000000,0),
      payment_status='cod',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=(SELECT order_id FROM cod_receivables WHERE id=? AND status='PENDING_DELIVERY') AND ?='DELIVERED'`)
      .bind(id, id, id, target),
    db.prepare(`UPDATE orders SET cod_amount=debt_amount WHERE id=(SELECT order_id FROM cod_receivables WHERE id=?) AND ?='DELIVERED'`).bind(id,target),
    db.prepare(`UPDATE cod_receivables SET status=?,
      delivered_at=CASE WHEN ?='DELIVERED' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE delivered_at END,
      expected_settlement_at=COALESCE(?,expected_settlement_at),notes=COALESCE(?,notes),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(target, target, expectedAt || null,
        notes == null || notes === '' ? null : String(notes).slice(0, 2000), id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      VALUES('COD_RECEIVABLE',?,'UPDATE',json_object('event','COD_'||?,'status',?),?)`).bind(id, target, target, actor),
    db.prepare('SELECT * FROM cod_receivables WHERE id=?').bind(id),
  ]);
  return rowFrom(batch.at(-1));
}

export async function recordCodSettlement(db, {
  p_cod_id: codId, p_amount_vnd: amount, p_account_id: accountId, p_reference: reference,
  p_settled_at: settledAt, p_actor: actor, p_idempotency_key: key,
}) {
  if (!codId || !accountId || !Number.isFinite(amount) || amount <= 0 || !actor || !validKey(key)
    || !validDateTime(settledAt)) fail('Thông tin đối soát COD không hợp lệ');
  const id = randomUUID(), transactionId = randomUUID();
  const pending = 'NOT EXISTS(SELECT 1 FROM cod_settlements WHERE idempotency_key=?)';
  const batch = await db.batch([
    db.prepare(`SELECT CASE
      WHEN EXISTS(SELECT 1 FROM cod_settlements WHERE idempotency_key=?) THEN
        CASE WHEN EXISTS(SELECT 1 FROM cod_settlements WHERE idempotency_key=? AND cod_receivable_id=? AND account_id=? AND amount_vnd=?)
          THEN 1 ELSE json('cod settlement key conflict') END
      WHEN EXISTS(SELECT 1 FROM cod_receivables c WHERE c.id=? AND c.status IN ('WAITING_SETTLEMENT','PARTIALLY_SETTLED','DISPUTED')
        AND ?<=c.expected_cod_amount_vnd-COALESCE((SELECT sum(amount_vnd) FROM cod_settlements WHERE cod_receivable_id=c.id),0)
        AND EXISTS(SELECT 1 FROM cash_accounts a WHERE a.id=? AND a.is_active=1 AND a.currency='VND'
          AND date(a.opening_balance_at)<=date(?))) THEN 1 ELSE json('invalid cod settlement') END`)
      .bind(key, key, codId, accountId, amount, codId, amount, accountId, settledAt),
    db.prepare(`INSERT INTO cod_settlements(id,cod_receivable_id,amount_vnd,account_id,reference,settled_at,idempotency_key,created_by)
      SELECT ?,?,?,?,?,?,?,? WHERE ${pending}`).bind(id, codId, amount, accountId, String(reference ?? '').slice(0, 300),
        settledAt, key.trim(), actor, key),
    db.prepare(`INSERT INTO account_transactions(id,account_id,direction,amount,currency,reference_type,reference_id,transaction_type,
      occurred_at,description,idempotency_key,created_by)
      SELECT ?,account_id,'IN',amount_vnd,'VND','COD_SETTLEMENT',id,'COD_SETTLEMENT',settled_at,
        'COD order #'||(SELECT order_id FROM cod_receivables WHERE id=cod_receivable_id),?||'-CASH',created_by
      FROM cod_settlements WHERE id=?`).bind(transactionId, key, id),
    db.prepare(`UPDATE cod_receivables SET
      status=CASE WHEN (SELECT COALESCE(sum(amount_vnd),0) FROM cod_settlements WHERE cod_receivable_id=cod_receivables.id)>=expected_cod_amount_vnd
        THEN 'SETTLED' ELSE 'PARTIALLY_SETTLED' END,
      settled_at=CASE WHEN (SELECT COALESCE(sum(amount_vnd),0) FROM cod_settlements WHERE cod_receivable_id=cod_receivables.id)>=expected_cod_amount_vnd
        THEN ? ELSE NULL END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND EXISTS(SELECT 1 FROM cod_settlements WHERE id=?)`).bind(settledAt, codId, id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'COD_SETTLEMENT',s.id,'CREATE',json_object('event',CASE WHEN c.status='SETTLED' THEN 'COD_SETTLED' ELSE 'COD_SETTLEMENT_RECORDED' END,
        'cod_id',c.id,'amount_vnd',s.amount_vnd),? FROM cod_settlements s JOIN cod_receivables c ON c.id=s.cod_receivable_id WHERE s.id=?`)
      .bind(actor, id),
    db.prepare('SELECT * FROM cod_settlements WHERE idempotency_key=?').bind(key),
  ]);
  return rowFrom(batch.at(-1));
}
