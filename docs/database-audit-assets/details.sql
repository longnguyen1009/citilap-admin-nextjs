SELECT o.id AS order_id,o.laptop_id,o.order_status,o.payment_status,o.laptop_locked,l.status AS laptop_status FROM orders o JOIN laptops l ON l.id=o.laptop_id WHERE o.is_active=1 AND o.order_status IN ('prepared','shipping','done') AND l.status<>'sold';
SELECT order_status,count(*) AS orders,count(cost_snapshotted_at) AS snapshotted FROM orders GROUP BY order_status;
SELECT b.id,b.status AS stored_status,v.status AS summary_status,b.active FROM purchase_batches b JOIN purchase_batch_summaries v ON v.id=b.id WHERE b.status<>v.status;
SELECT name,sql FROM sqlite_schema WHERE type='index' AND tbl_name IN ('orders','repair_actions','repair_parts','commissions','purchase_batches');
SELECT o.order_status,o.payment_status,count(*) AS n FROM orders o GROUP BY o.order_status,o.payment_status;
SELECT typeof(amount) AS storage_type,count(*) AS n FROM payments GROUP BY typeof(amount);
SELECT count(*) AS n,sum(CASE WHEN detail_snapshot IS NOT NULL THEN 1 ELSE 0 END) AS snapshots,sum(CASE WHEN overall_notes<>'' THEN 1 ELSE 0 END) AS notes FROM qc_inspections;
SELECT '2026-10-07'>='2026-10-07T00:00:00.000Z' AS lexical_included,julianday('2026-10-07')>=julianday('2026-10-07T00:00:00.000Z') AS temporal_included;
