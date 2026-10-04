const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };

export async function allocateOrderLaptop(db, {
  p_order_id: orderId, p_laptop_id: laptopId, p_expected_owner: expectedOwner, p_actor: actor,
}) {
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || (laptopId != null && (!Number.isSafeInteger(laptopId) || laptopId <= 0))
    || (expectedOwner != null && (!Number.isSafeInteger(expectedOwner) || expectedOwner <= 0)) || !actor) fail('Dữ liệu phân máy không hợp lệ');
  const current = await db.prepare('SELECT laptop_id, requested_laptop_id, requested_configuration, requested_category FROM orders WHERE id=?').bind(orderId).first();
  if (!current) fail('Không tìm thấy đơn hàng');
  const previousId = current.laptop_id;
  const ownerPredicate = `is_active=1 AND order_status NOT IN ('cancelled','returned') AND payment_status<>'refunded'
    AND (laptop_locked=1 OR amount_paid>0 OR order_status IN ('prepared','shipping','done'))`;
  const targetMachine = laptopId != null ? await db.prepare('SELECT id, name, category, import_price_vnd FROM laptops WHERE id=?').bind(laptopId).first() : null;
  const previousMachine = previousId != null ? await db.prepare('SELECT id, name, category FROM laptops WHERE id=?').bind(previousId).first() : null;
  const previousOwner = laptopId == null ? null : await db.prepare(
    `SELECT id, requested_laptop_id, requested_configuration, requested_category FROM orders WHERE laptop_id=? AND id<>? AND ${ownerPredicate} ORDER BY id LIMIT 1`
  ).bind(laptopId, orderId).first();
  const previousOwnerId = previousOwner?.id ?? expectedOwner ?? null;

  const batch = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=? AND is_active=1
      AND order_status NOT IN ('prepared','shipping','done','cancelled','returned') AND payment_status<>'refunded')
      THEN 1 ELSE json('order cannot be allocated') END`).bind(orderId),
    ...(laptopId == null ? [] : [
      db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM laptops WHERE id=? AND is_active=1 AND status IN ('available','reserved'))
        THEN 1 ELSE json('laptop is not available') END`).bind(laptopId),
      db.prepare(`SELECT CASE WHEN
        (SELECT id FROM orders WHERE laptop_id=? AND id<>? AND ${ownerPredicate} ORDER BY id LIMIT 1) IS ?
        THEN 1 ELSE json('laptop owner changed') END`).bind(laptopId, orderId, expectedOwner ?? null),
      db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE laptop_id=? AND id<>? AND ${ownerPredicate}
        AND order_status IN ('prepared','shipping','done')) THEN 1 ELSE json('committed laptop cannot be transferred') END`).bind(laptopId, orderId),
      db.prepare(`UPDATE orders SET
        requested_laptop_id = COALESCE(requested_laptop_id, ?),
        requested_configuration = COALESCE(NULLIF(requested_configuration, ''), ?),
        requested_category = COALESCE(NULLIF(requested_category, ''), ?),
        laptop_id = NULL,
        laptop_locked = 0,
        profit_vnd = 0,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE laptop_id=? AND id<>? AND ${ownerPredicate}`).bind(
          laptopId, targetMachine?.name ?? null, targetMachine?.category ?? null, laptopId, orderId
        ),
    ]),
    db.prepare(`UPDATE orders SET
      requested_laptop_id = ?,
      requested_configuration = COALESCE(?, requested_configuration),
      requested_category = COALESCE(?, requested_category),
      laptop_id = ?,
      laptop_locked = ?,
      profit_vnd = CASE
        WHEN ? IS NULL THEN 0
        ELSE round(sale_price - ?, 4)
      END,
      reservation_expires_at = NULL,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?`).bind(
        laptopId ?? (previousId ?? current.requested_laptop_id ?? null),
        targetMachine?.name ?? (previousMachine?.name ?? current.requested_configuration ?? null),
        targetMachine?.category ?? (previousMachine?.category ?? current.requested_category ?? null),
        laptopId ?? null,
        laptopId == null ? 0 : 1,
        laptopId ?? null,
        targetMachine?.import_price_vnd ?? 0,
        orderId
      ),
    ...(previousId == null ? [] : [db.prepare(`UPDATE laptops SET status=CASE
      WHEN EXISTS(SELECT 1 FROM orders WHERE laptop_id=? AND ${ownerPredicate} AND order_status IN ('prepared','shipping','done')) THEN 'sold'
      WHEN EXISTS(SELECT 1 FROM orders WHERE laptop_id=? AND ${ownerPredicate}) THEN 'reserved' ELSE 'available' END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(previousId, previousId, previousId)]),
    ...(laptopId == null || laptopId === previousId ? [] : [db.prepare(`UPDATE laptops SET status=CASE
      WHEN EXISTS(SELECT 1 FROM orders WHERE laptop_id=? AND ${ownerPredicate} AND order_status IN ('prepared','shipping','done')) THEN 'sold'
      WHEN EXISTS(SELECT 1 FROM orders WHERE laptop_id=? AND ${ownerPredicate}) THEN 'reserved' ELSE 'available' END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(laptopId, laptopId, laptopId)]),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES
      ('ORDER',?,'UPDATE',json_object('event','LAPTOP_ALLOCATION','previous_laptop_id',?,'laptop_id',?,'previous_order_id',?),?)`)
      .bind(String(orderId), previousId ?? null, laptopId ?? null, previousOwnerId, actor),
    ...(previousOwnerId == null ? [] : [db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES
      ('ORDER',?,'UPDATE',json_object('event','LAPTOP_TRANSFERRED','laptop_id',?,'target_order_id',?),?)`)
      .bind(String(previousOwnerId), laptopId, orderId, actor)]),
    db.prepare(`SELECT json_object('order_id',id,'laptop_id',laptop_id,'previous_owner_id',?) AS result FROM orders WHERE id=?`)
      .bind(previousOwnerId, orderId),
  ]);
  return JSON.parse(batch.at(-1).results[0].result);
}
