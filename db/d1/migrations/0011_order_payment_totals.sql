-- Reconcile existing order summaries with the payment ledger. No rows deleted.
-- Deposit is the sum of all recorded deposits. Refunds reduce net paid.
UPDATE orders SET
  deposit_amount = round(COALESCE((SELECT sum(amount) FROM payments WHERE order_id=orders.id AND payment_type='deposit'),0),6),
  amount_paid = round(COALESCE((SELECT sum(CASE WHEN payment_type='refund' THEN -amount ELSE amount END) FROM payments WHERE order_id=orders.id),0),6);

UPDATE orders SET
  debt_amount = max(0,round(sale_price-amount_paid-COALESCE(trade_in_credit_vnd,0)/1000000,6)),
  cod_amount = max(0,round(sale_price-amount_paid-COALESCE(trade_in_credit_vnd,0)/1000000,6));
