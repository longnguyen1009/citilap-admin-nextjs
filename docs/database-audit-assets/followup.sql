SELECT o.id AS order_id,o.laptop_id,o.order_status,o.payment_status,o.laptop_locked,l.status AS laptop_status FROM orders o JOIN laptops l ON l.id=o.laptop_id WHERE o.is_active=1 AND o.order_status IN ('prepared','shipping','done') AND l.status<>'sold';
SELECT count(*) AS orders_with_refund_blocking_deposit FROM orders WHERE deposit_amount>0 AND amount_paid>0;
SELECT sql FROM sqlite_schema WHERE type='table' AND name='orders';
SELECT count(*) AS domestic_unknown_available FROM laptops WHERE source_type='UNKNOWN' AND source_reference_id IS NOT NULL AND status='available';
SELECT count(*) AS committed_orders_without_snapshot_but_with_import_source FROM orders o WHERE order_status IN ('prepared','shipping','done') AND cost_snapshotted_at IS NULL AND EXISTS(SELECT 1 FROM sheet_import_sources s WHERE s.source_key LIKE '%order%');
SELECT count(*) AS missing_payment_idempotency FROM payments WHERE idempotency_key IS NULL;
SELECT count(*) AS refund_rows FROM payments WHERE payment_type='refund';
