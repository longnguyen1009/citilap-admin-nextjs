import { randomUUID } from 'node:crypto';

export async function recordSupplierPaymentWithAccount(db, {
  p_batch_id: batchId, p_amount_rmb: amount, p_exchange_rate: rate, p_method: method,
  p_reference: reference = '', p_date: date, p_notes: notes = '', p_actor: actor,
  p_account_id: accountId, p_idempotency_key: key,
}) {
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isSafeInteger(batchId) || batchId <= 0 || !Number.isFinite(amount) || amount <= 0
    || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(amount * rate)
    || !['WECHAT','ALIPAY','BANK_TRANSFER','CASH','OTHER'].includes(method)
    || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.valueOf())
    || parsedDate.toISOString().slice(0,10) !== date || !actor || !accountId
    || typeof key !== 'string' || key.trim().length < 8 || key.length > 90) {
    throw Object.assign(new Error('Thông tin thanh toán không hợp lệ'), { status: 400 });
  }
  const txId = randomUUID();
  const result = await db.batch([
    db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM supplier_payments WHERE idempotency_key=?
      AND (account_id IS NOT ? OR purchase_batch_id<>? OR amount_rmb<>? OR exchange_rate<>?))
      THEN 1 ELSE json('payment key conflict') END`).bind(key,accountId,batchId,amount,rate),
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM supplier_payments WHERE idempotency_key=?) OR
      (EXISTS(SELECT 1 FROM cash_accounts WHERE id=? AND is_active=1 AND currency='CNY'
        AND julianday(opening_balance_at)<=julianday(?))
       AND EXISTS(SELECT 1 FROM purchase_batches b WHERE id=? AND active=1 AND status<>'CANCELLED'
         AND ?<=COALESCE((SELECT sum(purchase_price_rmb) FROM laptops WHERE purchase_batch_id=b.id AND status<>'ignored'),0)
          -COALESCE((SELECT sum(amount_rmb) FROM supplier_payments WHERE purchase_batch_id=b.id),0)))
      THEN 1 ELSE json('supplier payment validation failed') END`).bind(key,accountId,date,batchId,amount),
    db.prepare(`INSERT INTO supplier_payments(supplier_id,purchase_batch_id,amount_rmb,amount_vnd,exchange_rate,
      payment_method,reference,payment_date,notes,recorded_by,idempotency_key,account_id)
      SELECT supplier_id,id,?,round(?*?,2),?,?,?,?,?,?,?,? FROM purchase_batches WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM supplier_payments WHERE idempotency_key=?)`)
      .bind(amount,amount,rate,rate,method,String(reference).slice(0,200),date,String(notes).slice(0,2000),actor,key,accountId,batchId,key),
    db.prepare(`INSERT INTO account_transactions(id,account_id,direction,amount,currency,reference_type,reference_id,
      transaction_type,occurred_at,description,idempotency_key,created_by)
      SELECT ?,account_id,'OUT',amount_rmb,'CNY','SUPPLIER_PAYMENT',CAST(id AS TEXT),'SUPPLIER_PAYMENT',?,substr(notes,1,1000),?||'-CASH',?
      FROM supplier_payments WHERE idempotency_key=? AND changes()=1`).bind(txId,parsedDate.toISOString(),key,actor,key),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'SUPPLIER_PAYMENT',CAST(id AS TEXT),'CREATE',json_object('supplier_id',supplier_id,'purchase_batch_id',purchase_batch_id,
        'amount_rmb',amount_rmb,'amount_vnd',amount_vnd,'exchange_rate',exchange_rate,'payment_method',payment_method,
        'reference',reference,'payment_date',payment_date),? FROM supplier_payments WHERE idempotency_key=?
      AND EXISTS(SELECT 1 FROM account_transactions WHERE id=?)`).bind(actor,key,txId),
    db.prepare('SELECT * FROM supplier_payments WHERE idempotency_key=?').bind(key),
  ]);
  return result.at(-1).results[0];
}
