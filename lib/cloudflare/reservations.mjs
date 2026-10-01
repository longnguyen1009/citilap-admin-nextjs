import { randomUUID } from 'node:crypto';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const validKey = key => typeof key === 'string' && key.trim().length >= 8 && key.trim().length <= 100;
const validFuture = value => typeof value === 'string' && Number.isFinite(new Date(value).valueOf()) && new Date(value) > new Date();
const first = result => result?.results?.[0] || null;

export async function expireReservations(db, { p_actor: actor }) {
  if (!actor) fail('Thiếu người thực hiện');
  const due = await db.prepare("SELECT count(*) AS n FROM reservations WHERE status='ACTIVE' AND julianday(expires_at)<=julianday('now')").first();
  if (!due.n) return 0;
  await db.batch([
    db.prepare(`UPDATE reservations SET status='EXPIRED',expired_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='ACTIVE' AND julianday(expires_at)<=julianday('now')`),
    db.prepare(`UPDATE laptops SET status='available',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='reserved'
      AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.laptop_id=laptops.id AND r.status='ACTIVE' AND julianday(r.expires_at)>julianday('now'))
      AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.laptop_id=laptops.id AND o.is_active=1 AND o.order_status NOT IN ('cancelled','returned')
        AND o.payment_status<>'refunded' AND (o.laptop_locked=1 OR o.amount_paid>0 OR o.order_status IN ('prepared','shipping','done')))`),
  ]);
  return due.n;
}

export async function createReservation(db, {
  p_laptop_id: laptopId, p_customer_id: customerId, p_order_id: orderId, p_expires_at: expiresAt,
  p_deposit_payment_id: paymentId, p_notes: notes, p_user_id: userId, p_actor: actor, p_idempotency_key: key,
}) {
  if (!Number.isSafeInteger(laptopId) || laptopId <= 0 || !validFuture(expiresAt) || !validKey(key) || !actor) {
    fail('Thông tin giữ máy không hợp lệ');
  }
  const id = randomUUID();
  const batch = await db.batch([
    db.prepare(`UPDATE reservations SET status='EXPIRED',expired_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE status='ACTIVE' AND julianday(expires_at)<=julianday('now')`),
    db.prepare(`SELECT CASE
      WHEN EXISTS(SELECT 1 FROM reservations WHERE idempotency_key=?) THEN
        CASE WHEN EXISTS(SELECT 1 FROM reservations WHERE idempotency_key=? AND laptop_id=?) THEN 1 ELSE json('reservation key conflict') END
      WHEN EXISTS(SELECT 1 FROM laptops WHERE id=? AND is_active=1 AND status='available')
        AND NOT EXISTS(SELECT 1 FROM reservations WHERE laptop_id=? AND status='ACTIVE')
        AND (? IS NULL OR EXISTS(SELECT 1 FROM customers WHERE id=?))
        AND (? IS NULL OR EXISTS(SELECT 1 FROM orders WHERE id=? AND is_active=1))
        AND (? IS NULL OR EXISTS(SELECT 1 FROM payments WHERE id=? AND order_id IS ? AND payment_type<>'refund' AND amount>0))
      THEN 1 ELSE json('invalid reservation') END`).bind(key, key, laptopId, laptopId, laptopId,
        customerId ?? null, customerId ?? null, orderId ?? null, orderId ?? null,
        paymentId ?? null, paymentId ?? null, orderId ?? null),
    db.prepare(`INSERT INTO reservations(id,reservation_code,laptop_id,customer_id,order_id,status,reserved_by,expires_at,
      deposit_payment_id,notes,idempotency_key,created_by)
      SELECT ?,'RSV-'||strftime('%Y%m%d','now')||'-'||printf('%03d',COALESCE((SELECT max(CAST(substr(reservation_code,-3) AS INTEGER))
        FROM reservations WHERE reservation_code LIKE 'RSV-'||strftime('%Y%m%d','now')||'-%'),0)+1),?,?,?,?,?,?,?,?,?,?
      WHERE NOT EXISTS(SELECT 1 FROM reservations WHERE idempotency_key=?)`).bind(id, laptopId, customerId ?? null,
        orderId ?? null, 'ACTIVE', userId ?? null, expiresAt, paymentId ?? null, String(notes ?? '').slice(0, 2000), key.trim(), actor, key),
    db.prepare(`UPDATE laptops SET status='reserved',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND EXISTS(SELECT 1 FROM reservations WHERE id=?)`).bind(laptopId, id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'RESERVATION',id,'CREATE',json_object('event','RESERVATION_CREATED','laptop_id',laptop_id),?
      FROM reservations WHERE id=?`).bind(actor, id),
    db.prepare('SELECT * FROM reservations WHERE idempotency_key=?').bind(key),
  ]);
  return first(batch.at(-1));
}

export async function cancelReservation(db, { p_id: id, p_actor: actor, p_idempotency_key: key }) {
  if (!id || !actor || !validKey(key)) fail('Thông tin hủy reservation không hợp lệ');
  const current = await db.prepare('SELECT status,laptop_id FROM reservations WHERE id=?').bind(id).first();
  if (!current) fail('Không tìm thấy reservation');
  if (current.status === 'CANCELLED') return db.prepare('SELECT * FROM reservations WHERE id=?').bind(id).first();
  if (current.status !== 'ACTIVE') fail('Chỉ reservation ACTIVE được hủy');
  const batch = await db.batch([
    db.prepare(`UPDATE reservations SET status='CANCELLED',cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='ACTIVE'`).bind(id),
    db.prepare(`UPDATE laptops SET status='available',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='reserved'
      AND NOT EXISTS(SELECT 1 FROM reservations WHERE laptop_id=? AND status='ACTIVE' AND julianday(expires_at)>julianday('now'))`).bind(current.laptop_id, current.laptop_id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      VALUES('RESERVATION',?,'UPDATE',json_object('event','RESERVATION_CANCELLED','idempotency_key',?),?)`).bind(id, key, actor),
    db.prepare('SELECT * FROM reservations WHERE id=?').bind(id),
  ]);
  return first(batch.at(-1));
}

export async function extendReservation(db, { p_id: id, p_expires_at: expiresAt, p_actor: actor, p_idempotency_key: key }) {
  if (!id || !validFuture(expiresAt) || !actor || !validKey(key)) fail('Thông tin gia hạn không hợp lệ');
  const current = await db.prepare('SELECT status,expires_at FROM reservations WHERE id=?').bind(id).first();
  if (!current || current.status !== 'ACTIVE' || new Date(current.expires_at) <= new Date()) fail('Không thể gia hạn reservation');
  if (current.expires_at === expiresAt) return db.prepare('SELECT * FROM reservations WHERE id=?').bind(id).first();
  if (new Date(expiresAt) <= new Date(current.expires_at)) fail('Thời hạn mới phải muộn hơn thời hạn hiện tại');
  const batch = await db.batch([
    db.prepare(`UPDATE reservations SET expires_at=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(expiresAt, id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES
      ('RESERVATION',?,'UPDATE',json_object('event','RESERVATION_EXTENDED','expires_at',?,'idempotency_key',?),?)`)
      .bind(id, expiresAt, key, actor),
    db.prepare('SELECT * FROM reservations WHERE id=?').bind(id),
  ]);
  return first(batch.at(-1));
}

export async function convertReservationToOrder(db, { p_id: id, p_order_id: requestedOrderId, p_actor: actor, p_idempotency_key: key }) {
  if (!id || !Number.isSafeInteger(requestedOrderId) || requestedOrderId <= 0 || !actor || !validKey(key)) fail('Thông tin chuyển đổi không hợp lệ');
  const reservation = await db.prepare('SELECT * FROM reservations WHERE id=?').bind(id).first();
  if (!reservation) fail('Không tìm thấy reservation');
  if (reservation.status === 'CONVERTED') return reservation;
  const orderId = requestedOrderId || reservation.order_id;
  const batch = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM reservations r JOIN laptops l ON l.id=r.laptop_id
      WHERE r.id=? AND r.status='ACTIVE' AND julianday(r.expires_at)>julianday('now') AND l.status='reserved')
      AND EXISTS(SELECT 1 FROM orders WHERE id=? AND is_active=1 AND order_status NOT IN ('cancelled','returned','prepared','shipping','done'))
      THEN 1 ELSE json('reservation cannot be converted') END`).bind(id, orderId),
    db.prepare(`UPDATE orders SET laptop_id=?,requested_laptop_id=?,reservation_expires_at=?,laptop_locked=1,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(reservation.laptop_id, reservation.laptop_id, reservation.expires_at, orderId),
    db.prepare(`UPDATE reservations SET status='CONVERTED',order_id=?,converted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(orderId, id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES
      ('RESERVATION',?,'UPDATE',json_object('event','RESERVATION_CONVERTED','order_id',?,'idempotency_key',?),?)`)
      .bind(id, orderId, key, actor),
    db.prepare('SELECT * FROM reservations WHERE id=?').bind(id),
  ]);
  return first(batch.at(-1));
}
