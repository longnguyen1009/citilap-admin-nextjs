-- Move September-purchased laptops used by October orders into the October operating cohort.
UPDATE laptops SET import_date='2026-09-01',warehouse_date='2026-10-01',month_key='10/2026' WHERE id IN (1347,1559,1588,1599,1635,1648,1685,1755,1757,1767,1770,1801,1831,1843,1857,1889,1892,1893,1908,1915,1916,1928,1934,1937,1950);
UPDATE purchase_batches SET purchase_date='2026-09-01',notes='Mua trong tháng 9; nhập kho và chuyển cohort vận hành tháng 10' WHERE batch_code LIKE 'GS2-2026-09-%';
CREATE TABLE _september_order_laptop_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _september_order_laptop_guard SELECT CASE WHEN
 (SELECT count(*) FROM laptops WHERE id IN (1347,1559,1588,1599,1635,1648,1685,1755,1757,1767,1770,1801,1831,1843,1857,1889,1892,1893,1908,1915,1916,1928,1934,1937,1950) AND import_date='2026-09-01' AND warehouse_date='2026-10-01' AND month_key='10/2026')=25
 AND NOT EXISTS(SELECT 1 FROM orders o LEFT JOIN laptops l ON l.id=COALESCE(o.laptop_id,o.requested_laptop_id) WHERE COALESCE(o.laptop_id,o.requested_laptop_id) IS NOT NULL AND l.id IS NULL)
 THEN 1 ELSE 0 END;
DROP TABLE _september_order_laptop_guard;
