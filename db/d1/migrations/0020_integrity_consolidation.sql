-- Consolidate duplicated compatibility values around canonical procurement fields and roles.

INSERT INTO app_options(group_key, option_key, label, is_active, sort_order)
VALUES ('laptopLocation', 'wh_cn', 'KHO TQ', 1, 2)
ON CONFLICT(group_key, option_key) DO UPDATE SET
  label=excluded.label,
  is_active=1,
  sort_order=excluded.sort_order,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');

UPDATE app_options SET sort_order=3 WHERE group_key='laptopLocation' AND option_key='media';
UPDATE app_options SET sort_order=4 WHERE group_key='laptopLocation' AND option_key='repair';
UPDATE app_options SET sort_order=5 WHERE group_key='laptopLocation' AND option_key='other';

UPDATE user_profiles SET role='TECHNICAL', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE role='TECH';

-- purchase_* is the procurement source of truth. price_rmb/exchange_rate remain compatibility aliases.
UPDATE laptops
SET price_rmb=purchase_price_rmb,
    exchange_rate=purchase_exchange_rate,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')
  AND (price_rmb IS NOT purchase_price_rmb OR exchange_rate IS NOT purchase_exchange_rate);

DROP TRIGGER IF EXISTS laptops_sync_procurement_aliases_insert;
CREATE TRIGGER laptops_sync_procurement_aliases_insert
AFTER INSERT ON laptops
WHEN NEW.source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')
  AND (NEW.price_rmb IS NOT NEW.purchase_price_rmb OR NEW.exchange_rate IS NOT NEW.purchase_exchange_rate)
BEGIN
  UPDATE laptops
  SET price_rmb=NEW.purchase_price_rmb, exchange_rate=NEW.purchase_exchange_rate
  WHERE id=NEW.id;
END;

DROP TRIGGER IF EXISTS laptops_sync_procurement_aliases_canonical;
CREATE TRIGGER laptops_sync_procurement_aliases_canonical
AFTER UPDATE OF purchase_price_rmb, purchase_exchange_rate ON laptops
WHEN NEW.source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')
  AND (NEW.price_rmb IS NOT NEW.purchase_price_rmb OR NEW.exchange_rate IS NOT NEW.purchase_exchange_rate)
BEGIN
  UPDATE laptops
  SET price_rmb=NEW.purchase_price_rmb, exchange_rate=NEW.purchase_exchange_rate
  WHERE id=NEW.id;
END;

DROP TRIGGER IF EXISTS laptops_reject_procurement_alias_drift;
CREATE TRIGGER laptops_reject_procurement_alias_drift
AFTER UPDATE OF price_rmb, exchange_rate ON laptops
WHEN NEW.source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')
  AND (NEW.price_rmb IS NOT NEW.purchase_price_rmb OR NEW.exchange_rate IS NOT NEW.purchase_exchange_rate)
BEGIN
  UPDATE laptops
  SET price_rmb=NEW.purchase_price_rmb, exchange_rate=NEW.purchase_exchange_rate
  WHERE id=NEW.id;
END;
