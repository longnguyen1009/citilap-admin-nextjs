const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };

export async function addManualLaptopCost(db, {
  p_laptop_id: laptopId, p_cost_type: costType, p_amount_vnd: amount,
  p_description: description, p_occurred_at: occurredAt, p_actor: actor,
  p_idempotency_key: key,
}) {
  laptopId = Number(laptopId);
  amount = Number(amount);
  description = String(description ?? '').trim();
  const occurred = occurredAt == null || occurredAt === '' ? null : String(occurredAt);
  if (!Number.isSafeInteger(laptopId) || laptopId <= 0 || !actor
    || !['RAM_UPGRADE','SSD_UPGRADE','ACCESSORY','CLEANING','OTHER'].includes(costType)
    || !Number.isSafeInteger(amount) || amount <= 0 || !description
    || typeof key !== 'string' || key.trim().length < 8 || key.length > 100
    || (occurred !== null && !Number.isFinite(Date.parse(occurred)))) invalid('Chi phí thủ công không hợp lệ');
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM laptops WHERE id=?)
      THEN 1 ELSE json('laptop not found') END`).bind(laptopId),
    db.prepare(`INSERT INTO laptop_cost_components
      (laptop_id,cost_type,amount_vnd,source_type,source_id,description,occurred_at,created_by)
      SELECT ?,?,?,'MANUAL',?,?,COALESCE(?,strftime('%Y-%m-%dT%H:%M:%fZ','now')),?
      WHERE NOT EXISTS(SELECT 1 FROM laptop_cost_components WHERE laptop_id=? AND source_type='MANUAL'
        AND source_id=? AND cost_type=? AND voided_at IS NULL)`)
      .bind(laptopId,costType,amount,key,description.slice(0,1000),occurred,actor,laptopId,key,costType),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'LAPTOP_COST',id,'CREATE',json_object('event','COST_COMPONENT_ADDED','laptop_id',laptop_id,
        'cost_type',cost_type,'amount_vnd',amount_vnd),? FROM laptop_cost_components
      WHERE laptop_id=? AND source_type='MANUAL' AND source_id=? AND cost_type=? AND voided_at IS NULL
        AND changes()=1`).bind(actor,laptopId,key,costType),
    db.prepare(`SELECT * FROM laptop_cost_components WHERE laptop_id=? AND source_type='MANUAL'
      AND source_id=? AND cost_type=? AND voided_at IS NULL`).bind(laptopId,key,costType),
  ]);
  return results.at(-1).results[0];
}

export async function voidManualLaptopCost(db, { p_id: id, p_reason: reason, p_actor: actor }) {
  reason = String(reason ?? '').trim();
  if (!id || !actor || !reason) invalid('Cần nhập lý do void chi phí');
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM laptop_cost_components
      WHERE id=? AND source_type='MANUAL' AND voided_at IS NULL)
      THEN 1 ELSE json('manual cost is missing or already voided') END`).bind(id),
    db.prepare(`UPDATE laptop_cost_components SET voided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      voided_by=?,void_reason=? WHERE id=? AND source_type='MANUAL' AND voided_at IS NULL RETURNING *`)
      .bind(actor,reason.slice(0,1000),id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      VALUES ('LAPTOP_COST',?,'UPDATE',json_object('event','COST_COMPONENT_VOIDED','reason',?),?)`)
      .bind(id,reason.slice(0,1000),actor),
  ]);
  return results[1].results[0];
}
