import { randomUUID } from 'node:crypto';

const types=new Set(['deposit','balance','cod','refund','other']);
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export async function recordOrderPaymentWithAccount(db,{p_order_id:orderId,p_amount:amount,p_payment_type:type,
  p_payment_method:method='transfer_cash',p_payment_date:date,p_reference_code:reference,p_note:note,
  p_recorded_by:actor,p_account_id:account,p_idempotency_key:key}) {
  const parsed=new Date(`${date}T00:00:00Z`), txId=randomUUID();
  if(!Number.isSafeInteger(orderId)||orderId<=0||!Number.isFinite(amount)||amount<=0||!types.has(type)||!actor||!account
    ||typeof key!=='string'||key.trim().length<8||key.length>90||!/^\d{4}-\d{2}-\d{2}$/.test(date)
    ||!Number.isFinite(parsed.valueOf())||parsed.toISOString().slice(0,10)!==date) fail('Thông tin thanh toán không hợp lệ');
  const pending=`NOT EXISTS(SELECT 1 FROM account_transactions WHERE idempotency_key=?||'-CASH')`;
  const batch=await db.batch([
    db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payments WHERE idempotency_key=?
      AND (account_id IS NOT ? OR order_id<>? OR amount<>? OR payment_type<>?)) THEN 1 ELSE json('payment key conflict') END`)
      .bind(key,account,orderId,amount,type),
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM payments WHERE idempotency_key=?) OR
      (EXISTS(SELECT 1 FROM cash_accounts WHERE id=? AND is_active=1 AND currency='VND' AND julianday(opening_balance_at)<=julianday(?))
       AND EXISTS(SELECT 1 FROM orders WHERE id=? AND is_active=1 AND
         CASE WHEN ?='refund' THEN ?>0 AND ?<=amount_paid ELSE ?>0 AND amount_paid+?+trade_in_credit_vnd/1000000<=sale_price+0.000001 END))
      THEN 1 ELSE json('order payment validation failed') END`).bind(key,account,date,orderId,type,amount,amount,amount,amount),
    db.prepare(`INSERT INTO payments(order_id,payment_type,amount,payment_method,payment_date,reference_code,note,recorded_by,account_id,idempotency_key)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM payments WHERE idempotency_key=?)`)
      .bind(orderId,type,amount,String(method||'transfer_cash').trim()||'transfer_cash',date,String(reference??'').slice(0,160)||null,
        String(note??'').slice(0,1000)||null,actor,account,key,key),
    db.prepare(`INSERT INTO financial_records(record_type,category,amount,order_id,payment_id,occurred_on,payment_method,note,recorded_by)
      SELECT CASE WHEN payment_type='refund' THEN 'refund' ELSE 'income' END,payment_type,amount,order_id,id,payment_date,payment_method,note,recorded_by
      FROM payments WHERE idempotency_key=? AND ${pending}`).bind(key,key),
    db.prepare(`UPDATE orders SET
      amount_paid=CASE WHEN ?='refund' THEN max(amount_paid-?,0) ELSE amount_paid+? END,
      deposit_amount=CASE WHEN ?='refund' THEN min(deposit_amount,max(amount_paid-?,0)) WHEN ?='deposit' THEN deposit_amount+? ELSE deposit_amount END,
      debt_amount=max(sale_price-(CASE WHEN ?='refund' THEN max(amount_paid-?,0) ELSE amount_paid+? END)-trade_in_credit_vnd/1000000,0),
      payment_status=CASE WHEN ?='refund' AND amount_paid-?<=0 THEN 'refunded' WHEN ?='cod' THEN 'cod'
        WHEN max(sale_price-(CASE WHEN ?='refund' THEN max(amount_paid-?,0) ELSE amount_paid+? END)-trade_in_credit_vnd/1000000,0)=0 THEN 'paid'
        WHEN (CASE WHEN ?='refund' THEN max(amount_paid-?,0) ELSE amount_paid+? END)>0 THEN 'deposited' ELSE 'unpaid' END,
      laptop_locked=CASE WHEN laptop_id IS NOT NULL AND is_active=1 AND order_status NOT IN ('cancelled','returned')
        AND NOT (?='refund' AND amount_paid-?<=0) THEN 1 ELSE 0 END,
      reservation_expires_at=CASE WHEN ?='deposit' AND laptop_id IS NOT NULL AND reservation_expires_at IS NULL
        THEN strftime('%Y-%m-%dT%H:%M:%fZ','now','+48 hours') ELSE reservation_expires_at END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND ${pending}`)
      .bind(type,amount,amount,type,amount,type,amount,type,amount,amount,type,amount,type,type,amount,amount,type,amount,amount,type,amount,
        type,orderId,key),
    db.prepare(`INSERT INTO stock_movements(laptop_id,order_id,movement_type,note,performed_by,reference_type,reference_id)
      SELECT l.id,o.id,CASE WHEN o.laptop_locked=0 THEN 'RELEASED' WHEN o.order_status IN ('prepared','shipping','done') THEN 'SOLD' ELSE 'RESERVED' END,
        'Laptop state synchronized by payment',?,'PAYMENT',CAST(p.id AS TEXT)
      FROM orders o JOIN laptops l ON l.id=o.laptop_id JOIN payments p ON p.idempotency_key=?
      WHERE o.id=? AND ${pending} AND l.status<>CASE WHEN o.laptop_locked=0 THEN 'available'
        WHEN o.order_status IN ('prepared','shipping','done') THEN 'sold' ELSE 'reserved' END`).bind(actor,key,orderId,key),
    db.prepare(`UPDATE laptops SET status=(SELECT CASE WHEN o.laptop_locked=0 THEN 'available'
      WHEN o.order_status IN ('prepared','shipping','done') THEN 'sold' ELSE 'reserved' END FROM orders o WHERE o.id=?),
      sold_at=CASE WHEN (SELECT order_status FROM orders WHERE id=?) IN ('prepared','shipping','done') THEN COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE sold_at END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=(SELECT laptop_id FROM orders WHERE id=?)
      AND status IN ('available','reserved','sold') AND ${pending}`).bind(orderId,orderId,orderId,key),
    db.prepare(`INSERT INTO account_transactions(id,account_id,direction,amount,currency,reference_type,reference_id,transaction_type,
      occurred_at,description,idempotency_key,created_by) SELECT ?,account_id,CASE WHEN payment_type='refund' THEN 'OUT' ELSE 'IN' END,
      round(amount*1000000,0),'VND','PAYMENT',CAST(id AS TEXT),'CUSTOMER_PAYMENT',payment_date,substr(COALESCE(note,'Thanh toán đơn #'||order_id),1,1000),?||'-CASH',?
      FROM payments WHERE idempotency_key=? AND ${pending}`).bind(txId,key,actor,key,key),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'PAYMENT',CAST(id AS TEXT),'CREATE',json_object('order_id',order_id,'payment_type',payment_type,'amount',amount),?
      FROM payments WHERE idempotency_key=? AND EXISTS(SELECT 1 FROM account_transactions WHERE id=?)`).bind(actor,key,txId),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'ORDER',CAST(id AS TEXT),'UPDATE',json_object('payment_status',payment_status,'amount_paid',amount_paid,'debt_amount',debt_amount),?
      FROM orders WHERE id=? AND EXISTS(SELECT 1 FROM account_transactions WHERE id=?)`).bind(actor,orderId,txId),
    db.prepare(`SELECT json_object('payment',json((SELECT json_object('id',p.id,'order_id',p.order_id,'payment_type',p.payment_type,'amount',p.amount,
      'payment_method',p.payment_method,'payment_date',p.payment_date,'reference_code',p.reference_code,'note',p.note,'recorded_by',p.recorded_by,'created_at',p.created_at,
      'account_id',p.account_id,'idempotency_key',p.idempotency_key) FROM payments p WHERE p.idempotency_key=?)),
      'order',json((SELECT json_object('id',o.id,'payment_status',o.payment_status,'amount_paid',o.amount_paid,'debt_amount',o.debt_amount,'deposit_amount',o.deposit_amount,
        'laptop_id',o.laptop_id,'sale_price',o.sale_price,'is_active',json(CASE WHEN o.is_active=1 THEN 'true' ELSE 'false' END)) FROM orders o WHERE o.id=?)),
      'laptop',json((SELECT CASE WHEN o.laptop_id IS NULL THEN 'null' ELSE json_object('id',l.id,'status',l.status,'sold_at',l.sold_at) END
        FROM orders o LEFT JOIN laptops l ON l.id=o.laptop_id WHERE o.id=?)),
      'account_transaction',json((SELECT json_object('id',x.id,'direction',x.direction,'amount',x.amount,'currency',x.currency) FROM account_transactions x
        JOIN payments p ON p.id=CAST(x.reference_id AS INTEGER) WHERE p.idempotency_key=? AND x.reference_type='PAYMENT')) ) AS result`)
      .bind(key,orderId,orderId,key),
  ]);
  return JSON.parse(batch.at(-1).results[0].result);
}
