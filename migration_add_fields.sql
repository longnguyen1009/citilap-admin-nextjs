-- =========================================================================================
-- SCRIPT BỔ SUNG CÁC TRƯỜNG MỚI (Laptops và Orders) CHO CITILAP
-- =========================================================================================

-- Thêm các trường cấu hình và thông tin vào bảng laptops
ALTER TABLE laptops ADD COLUMN cycle_count INTEGER DEFAULT 0;
ALTER TABLE laptops ADD COLUMN warranty_supplier TEXT;

-- Thêm các trường tiền giảm giá và ghi chú khách hàng vào bảng orders
ALTER TABLE orders ADD COLUMN discount_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN customer_note TEXT;
