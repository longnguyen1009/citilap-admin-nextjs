-- 0. Xóa dữ liệu cũ (TÙY CHỌN, cẩn thận trên production)
DELETE FROM stock_movements;
DELETE FROM warranty_cases;
DELETE FROM orders;
DELETE FROM laptops;
DELETE FROM customers;
DELETE FROM app_settings;

-- =========================================================================================
-- SCRIPT CHÈN DỮ LIỆU MẪU (SEED DATA) ĐỂ TEST ỨNG DỤNG
-- (Lưu ý: Chỉ chạy script này SAU KHI đã chạy file init_full_db.sql để khởi tạo bảng)
-- =========================================================================================

-- 1. Chèn cài đặt công thức vào app_settings
INSERT INTO app_settings (key, value) VALUES 
('formula', '{"shippingVnd": 400000, "divisor": 1000000, "defaultRate": 3550}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Chèn 3 khách hàng mẫu
INSERT INTO customers (name, phone, address) VALUES
('Nguyễn Văn Khách', '0987654321', '123 Đường Láng, Đống Đa, Hà Nội'),
('Trần Thị Mua', '0912345678', '456 Lê Lợi, Quận 1, TP. HCM'),
('Lê Đại Gia', '0909090909', '789 Trần Hưng Đạo, Sơn Trà, Đà Nẵng');

-- 3. Chèn 3 Laptop mẫu vào kho
INSERT INTO laptops (
  serial, name, category, import_date, warehouse_date, 
  location, charger_status, status, seller,
  price_rmb, shipping_rmb, exchange_rate, import_price_vnd, 
  condition_note, is_active,
  cycle_count, warranty_supplier
) VALUES 
(
  'SN-LEGION-001', 'Lenovo Legion 5 Pro 2023 (R7 7745HX/16GB/1TB/RTX4060)', 
  '6',
  '2026-08-01', '2026-08-05',
  'store',
  'with_charger',
  'available',
  'guangzhou',
  6000, 50, 3550, 21700000, 'Máy đẹp như mới, pin 100%', true,
  0, ''
),
(
  'SN-ROG-002', 'ASUS ROG Zephyrus G14 2022 (R9 6900HS/16GB/512GB/RX6700S)', 
  '4',
  '2026-08-10', NULL,
  'wh_cn',
  'no_charger',
  'not_imported',
  'shenzhen',
  4500, 40, 3550, 16375000, 'Xước nhẹ mặt A', true,
  0, ''
),
(
  'SN-TUF-003', 'ASUS TUF Gaming A15 (R7 5800H/8GB/512GB/RTX3050Ti)', 
  '8',
  '2026-07-20', '2026-07-25',
  'store',
  'with_charger',
  'sold',
  'xiao',
  3000, 30, 3550, 11050000, 'Móp góc trái nhẹ', true,
  0, ''
);

-- 4. Chèn 1 Đơn hàng mẫu (đã bán máy SN-TUF-003)
INSERT INTO orders (
  created_date, laptop_id, customer_id, sale_online, note, order_type, order_status, 
  payment_status, payment_method, delivery_status, shipping_method, 
  sale_price, deposit_amount, deposit_note, cod_amount, credit_card_fee, 
  profit_vnd, tracking_code, ship_date, setup_note, warranty, gifts
) VALUES 
(
  '2026-08-15', 
  (SELECT id FROM laptops WHERE serial = 'SN-TUF-003'),
  (SELECT id FROM customers WHERE phone = '0987654321'),
  '1',
  'Khách mua online',
  'retail',
  'done',
  'paid',
  'cash',
  'delivered',
  'direct_store',
  13000000, 5000000, 'Cọc qua BIDV', 8000000, 0,
  1200000, 'TRACK-12345', '2026-07-26', 'Cài sẵn Office 2021', '6 tháng',
  'basic_gift'
);

-- 5. Chèn 1 Lịch sử kho mẫu
INSERT INTO stock_movements (
  laptop_id, movement_type, from_location, to_location, note, performed_by
) VALUES 
(
  (SELECT id FROM laptops WHERE serial = 'SN-LEGION-001'),
  'NHẬP KHO', 'KHO TQ', 'CH', 'Hàng về chuyến 05/08', 'Quản Trị Viên'
);
