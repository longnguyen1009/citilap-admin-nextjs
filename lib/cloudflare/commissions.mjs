import { randomUUID } from 'node:crypto';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const first = result => result?.results?.[0] || null;
const validKey = key => typeof key === 'string' && key.trim().length >= 8 && key.trim().length <= 100;

export async function generateCommission(db, { p_order_id: orderId, p_data: data, p_actor: actor, p_idempotency_key: key }) {
  const amount = Number(data?.amount_vnd);
  const beneficiaryType = data?.beneficiary_type;
  const commissionType = data?.commission_type || 'FIXED';
  const userId = String(data?.beneficiary_user_id || '').trim() || null;
  const beneficiaryName = String(data?.beneficiary_name || '').trim().slice(0, 200) || null;
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !['EMPLOYEE', 'CTV', 'OTHER'].includes(beneficiaryType)
    || !['FIXED', 'MANUAL'].includes(commissionType) || !Number.isFinite(amount) || amount <= 0
    || (!userId && !beneficiaryName) || !actor || !validKey(key)) fail('Thông tin hoa hồng không hợp lệ');
  const id = randomUUID();
  const batch = await db.batch([
    db.prepare(`SELECT CASE
      WHEN EXISTS(SELECT 1 FROM commissions WHERE idempotency_key=?) THEN
        CASE WHEN EXISTS(SELECT 1 FROM commissions WHERE idempotency_key=? AND order_id=? AND amount_vnd=?) THEN 1 ELSE json('commission key conflict') END
      WHEN EXISTS(SELECT 1 FROM orders WHERE id=? AND order_status IN ('prepared','shipping','done')
        AND cost_snapshotted_at IS NOT NULL AND cost_snapshot_status='COMPLETE')
        AND (? IS NULL OR EXISTS(SELECT 1 FROM user_profiles WHERE id=? AND is_active=1)) THEN 1 ELSE json('invalid commission order') END`)
      .bind(key, key, orderId, amount, orderId, userId, userId),
    db.prepare(`INSERT INTO commissions(id,order_id,laptop_id,beneficiary_type,beneficiary_user_id,beneficiary_name,commission_type,
      amount_vnd,status,calculation_basis,calculation_snapshot_json,earned_at,idempotency_key,notes,created_by)
      SELECT ?,o.id,o.laptop_id,?,?,?,?,?,'PENDING','ORDER_COST_SNAPSHOT',json_object('sale_price_vnd',o.sale_price*1000000,
        'gross_profit_snapshot_vnd',o.gross_profit_snapshot_vnd,'net_contribution_before_commission_vnd',o.net_contribution_snapshot_vnd),
        strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,?,? FROM orders o WHERE o.id=?
        AND NOT EXISTS(SELECT 1 FROM commissions WHERE idempotency_key=?)`).bind(id, beneficiaryType, userId, beneficiaryName,
        commissionType, amount, key.trim(), String(data?.notes || '').slice(0, 2000), actor, orderId, key),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'COMMISSION',id,'CREATE',json_object('event','COMMISSION_CREATED','order_id',order_id,'amount_vnd',amount_vnd),?
      FROM commissions WHERE id=?`).bind(actor, id),
    db.prepare('SELECT * FROM commissions WHERE idempotency_key=?').bind(key),
  ]);
  return first(batch.at(-1));
}

export async function approveCommission(db, { p_id: id, p_actor: actor }) {
  if (!id || !actor) fail('Thông tin duyệt hoa hồng không hợp lệ');
  const batch = await db.batch([
    db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM commissions WHERE id=? AND status='PENDING') THEN 1 ELSE json('commission is not pending') END").bind(id),
    db.prepare(`UPDATE commissions SET status='APPROVED',approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      VALUES('COMMISSION',?,'UPDATE',json_object('event','COMMISSION_APPROVED'),?)`).bind(id, actor),
    db.prepare('SELECT * FROM commissions WHERE id=?').bind(id),
  ]);
  return first(batch.at(-1));
}

export async function payCommission(db, { p_id: id, p_account_id: accountId, p_reference: reference, p_actor: actor, p_idempotency_key: key }) {
  if (!id || !accountId || !actor || !validKey(key)) fail('Thông tin chi hoa hồng không hợp lệ');
  const current = await db.prepare('SELECT * FROM commissions WHERE id=?').bind(id).first();
  if (!current) fail('Không tìm thấy hoa hồng');
  if (current.status === 'PAID') {
    const transaction = await db.prepare("SELECT account_id,idempotency_key FROM account_transactions WHERE reference_type='COMMISSION' AND reference_id=?").bind(id).first();
    if (transaction?.account_id !== accountId || transaction?.idempotency_key !== `${key}-CASH`) fail('Idempotency key hoặc tài khoản chi không khớp');
    return current;
  }
  if (current.status !== 'APPROVED') fail('Hoa hồng chưa được duyệt');
  const transactionId = randomUUID();
  const batch = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM cash_accounts WHERE id=? AND is_active=1 AND currency='VND'
      AND julianday(opening_balance_at)<=julianday('now')) THEN 1 ELSE json('invalid commission account') END`).bind(accountId),
    db.prepare(`INSERT INTO account_transactions(id,account_id,direction,amount,currency,reference_type,reference_id,transaction_type,
      occurred_at,description,idempotency_key,created_by) VALUES(?,?,'OUT',?,'VND','COMMISSION',?,'COMMISSION_PAYMENT',
      strftime('%Y-%m-%dT%H:%M:%fZ','now'),?,?,?)`).bind(transactionId, accountId, current.amount_vnd, id,
        `Chi hoa hồng order #${current.order_id}`, `${key}-CASH`, actor),
    db.prepare(`UPDATE commissions SET status='PAID',paid_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),payment_account_id=?,
      payment_reference=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(accountId, String(reference || '').slice(0, 300), id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES
      ('COMMISSION',?,'UPDATE',json_object('event','COMMISSION_PAID','account_id',?),?)`).bind(id, accountId, actor),
    db.prepare('SELECT * FROM commissions WHERE id=?').bind(id),
  ]);
  return first(batch.at(-1));
}
