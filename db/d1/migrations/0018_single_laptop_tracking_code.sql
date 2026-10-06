-- Laptop procurement has one canonical China-to-Vietnam tracking field.
-- orders.tracking_code remains unchanged because it is the customer-delivery code.

UPDATE laptops
SET tracking_code_cn = coalesce(nullif(trim(tracking_code_cn), ''), trim(tracking_code), '')
WHERE trim(coalesce(tracking_code_cn, '')) = ''
  AND trim(coalesce(tracking_code, '')) <> '';

DROP VIEW laptop_landed_costs;

ALTER TABLE laptops DROP COLUMN tracking_code;

CREATE VIEW laptop_landed_costs AS
WITH component_sums AS (
  SELECT laptop_id,
    sum(amount_vnd) FILTER (WHERE cost_type = 'TRADE_IN_ACQUISITION') AS trade_in_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type = 'VN_SHIPPING') AS vn_shipping_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type = 'REPAIR') AS repair_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type IN ('RAM_UPGRADE', 'SSD_UPGRADE')) AS upgrade_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type = 'ACCESSORY') AS accessory_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type IN ('CLEANING', 'OTHER', 'PAYMENT_FEE')) AS other_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type = 'REFUND_CREDIT') AS refund_credit_vnd
  FROM laptop_cost_components
  WHERE voided_at IS NULL
  GROUP BY laptop_id
), calculated AS (
  SELECT l.id, l.source_type, l.purchase_batch_id, l.purchase_exchange_rate,
    CASE
      WHEN l.source_type = 'TRADE_IN' THEN coalesce(c.trade_in_cost_vnd, 0)
      WHEN l.purchase_exchange_rate IS NOT NULL THEN round(l.purchase_price_rmb * l.purchase_exchange_rate, 2)
      ELSE 0
    END AS purchase_cost_vnd,
    CASE WHEN l.purchase_exchange_rate IS NOT NULL
      THEN round(l.shipping_rmb * l.purchase_exchange_rate, 2) ELSE 0 END AS cn_shipping_vnd,
    c.vn_shipping_vnd, c.repair_cost_vnd, c.upgrade_cost_vnd,
    c.accessory_cost_vnd, c.other_cost_vnd, c.refund_credit_vnd,
    CASE
      WHEN l.source_type = 'UNKNOWN' THEN 'INCOMPLETE'
      WHEN l.source_type IN ('SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT')
        AND (l.purchase_batch_id IS NULL OR l.purchase_exchange_rate IS NULL) THEN 'INCOMPLETE'
      WHEN l.source_type = 'TRADE_IN' AND coalesce(c.trade_in_cost_vnd, 0) <= 0 THEN 'INCOMPLETE'
      WHEN EXISTS (SELECT 1 FROM repair_jobs r WHERE r.laptop_id = l.id
        AND r.status NOT IN ('COMPLETED', 'CANCELLED')) THEN 'INCOMPLETE'
      ELSE 'COMPLETE'
    END AS cost_status
  FROM laptops l
  LEFT JOIN component_sums c ON c.laptop_id = l.id
)
SELECT id AS laptop_id,
  coalesce(purchase_cost_vnd, 0) AS purchase_cost_vnd,
  coalesce(cn_shipping_vnd, 0) AS cn_shipping_vnd,
  coalesce(vn_shipping_vnd, 0) AS vn_shipping_vnd,
  coalesce(repair_cost_vnd, 0) AS repair_cost_vnd,
  coalesce(upgrade_cost_vnd, 0) AS upgrade_cost_vnd,
  coalesce(accessory_cost_vnd, 0) AS accessory_cost_vnd,
  coalesce(other_cost_vnd, 0) AS other_cost_vnd,
  coalesce(refund_credit_vnd, 0) AS refund_credit_vnd,
  max(coalesce(purchase_cost_vnd, 0) + coalesce(cn_shipping_vnd, 0)
    + coalesce(vn_shipping_vnd, 0) + coalesce(repair_cost_vnd, 0)
    + coalesce(upgrade_cost_vnd, 0) + coalesce(accessory_cost_vnd, 0)
    + coalesce(other_cost_vnd, 0) - coalesce(refund_credit_vnd, 0), 0) AS landed_cost_vnd,
  cost_status,
  (SELECT json_group_array(value) FROM json_each(json_array(
    CASE WHEN source_type = 'UNKNOWN' THEN 'UNKNOWN_SOURCE' END,
    CASE WHEN source_type IN ('SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT')
      AND purchase_batch_id IS NULL THEN 'MISSING_PURCHASE_BATCH' END,
    CASE WHEN source_type IN ('SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT')
      AND purchase_exchange_rate IS NULL THEN 'MISSING_EXCHANGE_RATE' END,
    CASE WHEN source_type = 'TRADE_IN' AND purchase_cost_vnd <= 0
      THEN 'MISSING_TRADE_IN_ACQUISITION' END,
    CASE WHEN EXISTS (SELECT 1 FROM repair_jobs r WHERE r.laptop_id = calculated.id
      AND r.status NOT IN ('COMPLETED', 'CANCELLED')) THEN 'ACTIVE_REPAIR_COST_PENDING' END
  )) WHERE value IS NOT NULL) AS reasons
FROM calculated;

CREATE TABLE _single_laptop_tracking_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO _single_laptop_tracking_guard
SELECT CASE WHEN
  (SELECT count(*) FROM pragma_table_info('laptops') WHERE name = 'tracking_code') = 0
  AND (SELECT count(*) FROM pragma_table_info('laptops') WHERE name = 'tracking_code_cn') = 1
  AND (SELECT count(*) FROM pragma_table_info('orders') WHERE name = 'tracking_code') = 1
THEN 1 ELSE 0 END;

DROP TABLE _single_laptop_tracking_guard;
