-- A physical serial can have multiple acquisition histories, only one current.
ALTER TABLE laptops ADD COLUMN acquisition_closed INTEGER NOT NULL DEFAULT 0 CHECK(acquisition_closed IN (0,1));
ALTER TABLE laptops ADD COLUMN previous_laptop_id INTEGER REFERENCES laptops(id) ON DELETE RESTRICT;
DROP INDEX laptops_serial_unique_ci_idx;
CREATE UNIQUE INDEX laptops_serial_unique_ci_idx ON laptops(lower(trim(serial)))
WHERE serial IS NOT NULL AND trim(serial)<>'' AND acquisition_closed=0;
CREATE UNIQUE INDEX laptops_previous_acquisition_idx ON laptops(previous_laptop_id) WHERE previous_laptop_id IS NOT NULL;
CREATE TRIGGER laptops_closed_acquisition_guard BEFORE UPDATE ON laptops
WHEN OLD.acquisition_closed=1 AND (NEW.acquisition_closed<>1 OR NEW.status IS NOT OLD.status OR NEW.serial IS NOT OLD.serial)
BEGIN SELECT RAISE(ABORT,'Lần nhập này đã được thu lại; sử dụng laptop của lần nhập mới'); END;

ALTER TABLE trade_ins ADD COLUMN workflow TEXT CHECK(workflow IN ('WALK_IN','BUYBACK','EXCHANGE'));
ALTER TABLE trade_ins ADD COLUMN seller_name TEXT;
ALTER TABLE trade_ins ADD COLUMN seller_phone TEXT;
ALTER TABLE trade_ins ADD COLUMN category TEXT;
ALTER TABLE trade_ins ADD COLUMN original_laptop_id INTEGER REFERENCES laptops(id) ON DELETE RESTRICT;
ALTER TABLE trade_ins ADD COLUMN new_order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT;
ALTER TABLE trade_ins ADD COLUMN request_hash TEXT;

-- Historical orders cannot re-allocate a physical machine after reacquisition.
CREATE TRIGGER orders_reacquired_laptop_guard BEFORE UPDATE ON orders
WHEN EXISTS(SELECT 1 FROM laptops WHERE id=OLD.laptop_id AND acquisition_closed=1)
BEGIN SELECT RAISE(ABORT,'Máy đã được thu lại; giữ nguyên đơn bán lịch sử'); END;

CREATE TRIGGER orders_exchanged_history_guard BEFORE UPDATE ON orders
WHEN EXISTS(SELECT 1 FROM trade_ins WHERE order_id=OLD.id AND workflow='EXCHANGE' AND new_order_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Đơn đã ĐỔI HÀNG; thao tác trên đơn mới'); END;

CREATE TRIGGER payments_exchanged_order_guard BEFORE INSERT ON payments
WHEN EXISTS(SELECT 1 FROM trade_ins WHERE order_id=NEW.order_id AND workflow='EXCHANGE' AND new_order_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Đơn đã ĐỔI HÀNG; thu tiền trên đơn mới'); END;

CREATE TRIGGER orders_closed_acquisition_insert BEFORE INSERT ON orders
WHEN EXISTS(SELECT 1 FROM laptops WHERE id IN (NEW.laptop_id,NEW.requested_laptop_id) AND acquisition_closed=1)
BEGIN SELECT RAISE(ABORT,'Chọn laptop của lần nhập mới'); END;

CREATE TRIGGER orders_closed_acquisition_allocate BEFORE UPDATE OF laptop_id,requested_laptop_id ON orders
WHEN (NEW.laptop_id IS NOT OLD.laptop_id OR NEW.requested_laptop_id IS NOT OLD.requested_laptop_id)
 AND EXISTS(SELECT 1 FROM laptops WHERE id IN (NEW.laptop_id,NEW.requested_laptop_id) AND acquisition_closed=1)
BEGIN SELECT RAISE(ABORT,'Chọn laptop của lần nhập mới'); END;
