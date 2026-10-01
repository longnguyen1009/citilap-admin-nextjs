export async function getFinancialOperationsSummary(db) {
  const [receivables, aging, cod, payable, refund, accounts, reconciliation] = await Promise.all([
    db.prepare(`SELECT COALESCE(sum(debt_amount),0)*1000000 AS amount,
      count(*) AS orders FROM customer_receivable_summaries`).first(),
    db.prepare(`SELECT aging_bucket,count(*) AS orders,COALESCE(sum(debt_amount),0)*1000000 AS amount_vnd
      FROM customer_receivable_summaries GROUP BY aging_bucket`).all(),
    db.prepare(`SELECT
      COALESCE(sum(CASE WHEN status IN ('WAITING_SETTLEMENT','PARTIALLY_SETTLED','DISPUTED') THEN outstanding_vnd ELSE 0 END),0) AS outstanding_vnd,
      COALESCE(sum(CASE WHEN status='PENDING_DELIVERY' THEN expected_cod_amount_vnd ELSE 0 END),0) AS in_transit_vnd,
      COALESCE(sum(CASE WHEN status IN ('WAITING_SETTLEMENT','PARTIALLY_SETTLED','DISPUTED') AND julianday(expected_settlement_at)<julianday('now') THEN outstanding_vnd ELSE 0 END),0) AS overdue_vnd,
      count(*) FILTER (WHERE status='DISPUTED') AS disputed FROM cod_receivable_summaries`).first(),
    db.prepare(`SELECT COALESCE(sum(debt_rmb),0) AS amount FROM purchase_batch_summaries
      WHERE status NOT IN ('DRAFT','CANCELLED','CLOSED')`).first(),
    db.prepare(`SELECT COALESCE(sum(max(d.expected-COALESCE(p.paid,0),0)),0) AS amount FROM
      (SELECT r.id,sum(COALESCE(i.agreed_refund_rmb,i.expected_refund_rmb,0)) AS expected
       FROM supplier_returns r JOIN supplier_return_items i ON i.supplier_return_id=r.id
       AND i.status NOT IN ('CANCELLED','REFUNDED','REPLACED','REJECTED')
       WHERE r.status IN ('WAITING_REFUND','PARTIALLY_RESOLVED') GROUP BY r.id) d
      LEFT JOIN (SELECT supplier_return_id,sum(amount_rmb) AS paid FROM supplier_refunds GROUP BY supplier_return_id) p
      ON p.supplier_return_id=d.id`).first(),
    db.prepare(`SELECT * FROM cash_account_balances WHERE is_active=1 ORDER BY currency,code`).all(),
    db.prepare(`SELECT count(*) AS total FROM cash_account_balances
      WHERE is_active=1 AND COALESCE(last_difference,0)<>0`).first(),
  ]);
  const receivableAging = Object.fromEntries((aging.results || []).map(row => [row.aging_bucket, {
    orders: row.orders,
    amount_vnd: row.amount_vnd,
  }]));
  return {
    generated_at: new Date().toISOString(),
    customer_receivable_vnd: receivables.amount,
    customer_receivable_orders: receivables.orders,
    receivable_aging: receivableAging,
    cod,
    supplier_payable_cny: payable.amount,
    supplier_refund_pending_cny: refund.amount,
    accounts: accounts.results || [],
    reconciliation_differences: reconciliation.total,
  };
}

export async function createFinancialRecord(db, input, actor) {
  const allowed = new Set(['income', 'expense', 'refund', 'adjustment']);
  const amount = Number(input.amount);
  if (!allowed.has(input.recordType) || !String(input.category || '').trim() || !Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Loại, danh mục hoặc số tiền không hợp lệ'), { status: 400 });
  }
  const statements = [];
  if (input.orderId) statements.push(db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=?) THEN 1 ELSE json('order not found') END").bind(input.orderId));
  if (input.laptopId) statements.push(db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM laptops WHERE id=?) THEN 1 ELSE json('laptop not found') END").bind(input.laptopId));
  statements.push(
    db.prepare(`INSERT INTO financial_records(record_type,category,amount,order_id,laptop_id,occurred_on,payment_method,note,recorded_by)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(input.recordType, String(input.category).trim().slice(0, 100), amount,
      input.orderId || null, input.laptopId || null, input.occurredOn, input.paymentMethod || null,
      input.note || null, actor),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'FINANCIAL_RECORD',CAST(last_insert_rowid() AS TEXT),'CREATE',
        json_object('record_type',?,'category',?,'amount',?),?`).bind(input.recordType, String(input.category).trim().slice(0, 100), amount, actor),
    db.prepare(`SELECT * FROM financial_records WHERE id=(SELECT CAST(entity_id AS INTEGER)
      FROM activity_logs WHERE id=last_insert_rowid())`),
  );
  const result = await db.batch(statements);
  return result.at(-1).results[0];
}
