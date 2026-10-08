-- Incremental integrity protections. No historical cost is reconstructed.
CREATE UNIQUE INDEX orders_one_physical_owner ON orders(laptop_id)
WHERE laptop_id IS NOT NULL AND is_active=1 AND order_status NOT IN ('cancelled','returned');

CREATE TRIGGER orders_allocate_insert BEFORE INSERT ON orders
WHEN NEW.laptop_id IS NOT NULL AND NEW.is_active=1 AND NEW.order_status NOT IN ('cancelled','returned')
BEGIN
 SELECT RAISE(ABORT,'Laptop unavailable or reserved by another operation')
 WHERE NOT EXISTS(SELECT 1 FROM laptops WHERE id=NEW.laptop_id AND is_active=1 AND status='available' AND acquisition_closed=0)
 OR EXISTS(SELECT 1 FROM reservations WHERE laptop_id=NEW.laptop_id AND status='ACTIVE' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND order_id IS NOT NEW.id);
END;

CREATE TRIGGER orders_allocate_update BEFORE UPDATE OF laptop_id,order_status,is_active ON orders
WHEN NEW.laptop_id IS NOT NULL AND NEW.is_active=1 AND NEW.order_status NOT IN ('cancelled','returned')
 AND (NEW.laptop_id IS NOT OLD.laptop_id OR OLD.is_active<>1 OR OLD.order_status IN ('cancelled','returned'))
BEGIN
 SELECT RAISE(ABORT,'Laptop unavailable or reserved by another operation')
 WHERE NOT EXISTS(SELECT 1 FROM laptops WHERE id=NEW.laptop_id AND is_active=1 AND status IN ('available','reserved') AND acquisition_closed=0)
 OR EXISTS(SELECT 1 FROM reservations WHERE laptop_id=NEW.laptop_id AND status='ACTIVE' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND order_id IS NOT NEW.id);
END;

CREATE TRIGGER orders_sync_laptop_insert AFTER INSERT ON orders
WHEN NEW.laptop_id IS NOT NULL AND NEW.is_active=1 AND NEW.order_status NOT IN ('cancelled','returned')
BEGIN
 UPDATE laptops SET status=IIF(NEW.order_status IN ('prepared','shipping','done'),'sold','reserved'),
 sold_at=IIF(NEW.order_status IN ('prepared','shipping','done'),COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),NULL),
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.laptop_id;
END;

CREATE TRIGGER orders_sync_laptop_update AFTER UPDATE OF laptop_id,order_status,is_active ON orders
BEGIN
 UPDATE laptops SET status='available',sold_at=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id=OLD.laptop_id AND acquisition_closed=0 AND status IN ('reserved','sold')
 AND NOT EXISTS(SELECT 1 FROM orders WHERE laptop_id=OLD.laptop_id AND is_active=1 AND order_status NOT IN ('cancelled','returned'));
END;

CREATE TRIGGER orders_sync_laptop_reallocate AFTER UPDATE OF laptop_id,order_status,is_active ON orders
BEGIN
 UPDATE laptops SET status=IIF(NEW.order_status IN ('prepared','shipping','done'),'sold','reserved'),
 sold_at=IIF(NEW.order_status IN ('prepared','shipping','done'),COALESCE(sold_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),NULL),
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id=NEW.laptop_id AND acquisition_closed=0 AND NEW.is_active=1 AND NEW.order_status NOT IN ('cancelled','returned');
END;

CREATE TRIGGER orders_cogs_snapshot_immutable BEFORE UPDATE ON orders
WHEN OLD.cost_snapshotted_at IS NOT NULL AND (
 NEW.cost_snapshot_vnd IS NOT OLD.cost_snapshot_vnd OR NEW.gross_profit_snapshot_vnd IS NOT OLD.gross_profit_snapshot_vnd
 OR NEW.direct_cost_snapshot_vnd IS NOT OLD.direct_cost_snapshot_vnd OR NEW.net_contribution_snapshot_vnd IS NOT OLD.net_contribution_snapshot_vnd
 OR NEW.cost_snapshotted_at IS NOT OLD.cost_snapshotted_at OR NEW.cost_snapshot_status IS NOT OLD.cost_snapshot_status
 OR NEW.cost_snapshot_reasons IS NOT OLD.cost_snapshot_reasons OR NEW.sale_price IS NOT OLD.sale_price
 OR NEW.credit_card_fee IS NOT OLD.credit_card_fee OR NEW.laptop_id IS NOT OLD.laptop_id)
BEGIN SELECT RAISE(ABORT,'Posted sale snapshot is immutable; use a separate correction workflow'); END;

CREATE TRIGGER invoices_snapshot_immutable BEFORE UPDATE ON invoices
WHEN NEW.snapshot IS NOT OLD.snapshot OR NEW.order_id IS NOT OLD.order_id OR NEW.laptop_id IS NOT OLD.laptop_id OR NEW.customer_id IS NOT OLD.customer_id
BEGIN SELECT RAISE(ABORT,'Issued invoice is immutable'); END;

ALTER TABLE orders ADD COLUMN creation_key TEXT;
ALTER TABLE orders ADD COLUMN creation_hash TEXT;
CREATE UNIQUE INDEX orders_creation_key_unique ON orders(creation_key) WHERE creation_key IS NOT NULL;
