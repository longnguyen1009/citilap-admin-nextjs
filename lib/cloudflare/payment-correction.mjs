// Amount corrections are admin-only and atomically update every linked ledger.
export async function correctPayment(db, profile, { id, amount, expectedAmount, reason }) {
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  if (profile?.role !== 'ADMIN') fail('Chỉ admin được sửa giao dịch.', 403);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(amount) || amount <= 0
    || !Number.isFinite(expectedAmount) || typeof reason !== 'string' || !reason.trim() || reason.length > 1000) fail('Nhập số tiền hợp lệ và lý do sửa.');
  const payment = await db.prepare('SELECT * FROM payments WHERE id=?').bind(id).first();
  if (!payment) fail('Không tìm thấy giao dịch.', 404);
  if (Number(payment.amount) !== expectedAmount) fail('Giao dịch đã thay đổi. Hãy tải lại.', 409);
  if (payment.payment_type === 'refund') fail('Giao dịch hoàn tiền cần xử lý qua quy trình hoàn tiền, không sửa trực tiếp.');
  const reconciled = payment.account_id && await db.prepare('SELECT id FROM account_reconciliations WHERE account_id=? AND date(reconciled_at)>=date(?) LIMIT 1').bind(payment.account_id, payment.payment_date).first();
  if (reconciled) fail('Giao dịch thuộc kỳ đã đối soát; không thể sửa trực tiếp.');
  const order = await db.prepare('SELECT * FROM orders WHERE id=?').bind(payment.order_id).first();
  if (!order || !order.is_active || ['cancelled','returned'].includes(order.order_status)) fail('Không thể sửa giao dịch của đơn đã hủy/trả.');
  const paid = Math.round((Number(order.amount_paid) + (amount - expectedAmount) * (payment.payment_type === 'refund' ? -1 : 1)) * 1e6) / 1e6;
  const debt = Math.round((Number(order.sale_price) - paid - Number(order.trade_in_credit_vnd || 0) / 1e6) * 1e6) / 1e6;
  if (paid < 0 || debt < 0) fail('Số tiền sửa làm tổng thu âm hoặc vượt giá bán.');
  const deposit = Math.max(0, Number(order.deposit_amount) + (payment.payment_type === 'deposit' ? amount - expectedAmount : 0));
  const cod = debt;
  const status = debt === 0 ? 'paid' : order.payment_status === 'cod' ? 'cod' : paid > 0 ? 'deposited' : 'unpaid';
  const guard = (sql, args) => db.prepare(`SELECT CASE WHEN ${sql} THEN 1 ELSE json('Payment changed or COD already processed; reload') END`).bind(...args);
  await db.batch([
    guard('EXISTS(SELECT 1 FROM payments WHERE id=? AND amount=?)', [id, expectedAmount]),
    guard('EXISTS(SELECT 1 FROM orders WHERE id=? AND amount_paid=? AND sale_price=? AND deposit_amount=? AND cod_amount=? AND updated_at IS ?)',
      [order.id, order.amount_paid, order.sale_price, order.deposit_amount, order.cod_amount, order.updated_at]),
    guard("NOT EXISTS(SELECT 1 FROM cod_receivables WHERE order_id=? AND status NOT IN ('PENDING_DELIVERY','CANCELLED','RETURNED'))", [order.id]),
    guard('NOT EXISTS(SELECT 1 FROM account_reconciliations WHERE account_id=? AND date(reconciled_at)>=date(?))', [payment.account_id, payment.payment_date]),
    db.prepare('UPDATE payments SET amount=? WHERE id=?').bind(amount, id),
    db.prepare('UPDATE financial_records SET amount=? WHERE payment_id=?').bind(amount, id),
    db.prepare("UPDATE account_transactions SET amount=? WHERE reference_type='PAYMENT' AND reference_id=? AND transaction_type='CUSTOMER_PAYMENT'").bind(Math.round(amount * 1e6), String(id)),
    db.prepare("UPDATE orders SET amount_paid=?,deposit_amount=?,debt_amount=?,cod_amount=?,payment_status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
      .bind(paid, deposit, debt, cod, status, order.id),
    db.prepare("UPDATE cod_receivables SET expected_cod_amount_vnd=CASE WHEN ?>0 THEN ? ELSE expected_cod_amount_vnd END,status=CASE WHEN ?=0 THEN 'CANCELLED' ELSE status END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE order_id=? AND status='PENDING_DELIVERY'")
      .bind(debt, Math.round(debt * 1e6), debt, order.id),
    db.prepare("INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('PAYMENT',?,'UPDATE',?,?)")
      .bind(String(id), JSON.stringify({ event: 'AMOUNT_CORRECTION', order_id: order.id, before: expectedAmount, after: amount, reason: reason.trim(), actor_id: profile.id }), profile.name || profile.id),
    db.prepare("INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('ORDER',?,'UPDATE',?,?)")
      .bind(String(order.id), JSON.stringify({ event: 'PAYMENT_CORRECTION', payment_id: id, amount_paid: paid, debt_amount: debt, deposit_amount: deposit, cod_amount: cod }), profile.name || profile.id),
  ]);
  return {
    payment: await db.prepare('SELECT * FROM payments WHERE id=?').bind(id).first(),
    order: await db.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first(),
  };
}
