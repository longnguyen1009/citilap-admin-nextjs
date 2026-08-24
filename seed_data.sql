-- =========================================================================================
-- SCRIPT CHÈN DỮ LIỆU MẪU (SEED DATA) ĐỂ TEST ỨNG DỤNG
-- (Lưu ý: Chỉ chạy script này SAU KHI đã chạy file init_full_db.sql để khởi tạo bảng)
-- =========================================================================================

-- 1. Chèn cài đặt công thức và danh mục vào app_settings
INSERT INTO app_settings (key, value) VALUES 
('formula', '{"shippingVnd": 400000, "divisor": 1000000, "defaultRate": 3550}'::jsonb),
('categories', '["LEGION 5 2023", "ROG G513 2021", "ROG G513 2022", "ROG Scar 2022", "ROG G713 2022", "ROG M16 21-22-23", "ROG G16-G18", "Asus Zephyrus G14", "ROG FLOW", "ASUS TUF", "ASUS", "LEGION 5 2021", "LEGION 5 2022", "LEGION 5 Pro 2021", "LEGION 5 Pro 2022", "LEGION 5 Pro 2023 - 2024", "Legion 7 21-22-23", "LEGION Slim 7 21-22-23", "ACER", "ACER Nitro 5"]'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Chèn 3 khách hàng mẫu
INSERT INTO customers (name, phone, address) VALUES
('Nguyễn Văn Khách', '0987654321', '123 Đường Láng, Đống Đa, Hà Nội'),
('Trần Thị Mua', '0912345678', '456 Lê Lợi, Quận 1, TP. HCM'),
('Lê Đại Gia', '0909090909', '789 Trần Hưng Đạo, Sơn Trà, Đà Nẵng');

-- 3. Chèn 3 Laptop mẫu vào kho
INSERT INTO laptops (
  serial, name, category_id, import_date, warehouse_date, 
  location_id, charger_status_id, status_id, seller_id,
  price_rmb, shipping_rmb, exchange_rate, import_price_vnd, 
  wholesale_price_vnd, retail_price_vnd, condition_note, is_active
) VALUES 
(
  'SN-LEGION-001', 'Lenovo Legion 5 Pro 2023 (R7 7745HX/16GB/1TB/RTX4060)', 
  (SELECT id FROM app_options WHERE group_key = 'category' AND option_key = '6'),
  '2026-08-01', '2026-08-05',
  (SELECT id FROM app_options WHERE group_key = 'laptopLocation' AND option_key = 'store'),
  (SELECT id FROM app_options WHERE group_key = 'chargerStatus' AND option_key = 'with_charger'),
  (SELECT id FROM app_options WHERE group_key = 'laptopStatus' AND option_key = 'available'),
  (SELECT id FROM app_options WHERE group_key = 'seller' AND option_key = 'guangzhou'),
  6000, 50, 3550, 21700000, 22500000, 23500000, 'Máy đẹp như mới, pin 100%', true
),
(
  'SN-ROG-002', 'ASUS ROG Zephyrus G14 2022 (R9 6900HS/16GB/512GB/RX6700S)', 
  (SELECT id FROM app_options WHERE group_key = 'category' AND option_key = '4'),
  '2026-08-10', NULL,
  (SELECT id FROM app_options WHERE group_key = 'laptopLocation' AND option_key = 'wh_cn'),
  (SELECT id FROM app_options WHERE group_key = 'chargerStatus' AND option_key = 'no_charger'),
  (SELECT id FROM app_options WHERE group_key = 'laptopStatus' AND option_key = 'not_imported'),
  (SELECT id FROM app_options WHERE group_key = 'seller' AND option_key = 'shenzhen'),
  4500, 40, 3550, 16375000, 17500000, 18500000, 'Xước nhẹ mặt A', true
),
(
  'SN-TUF-003', 'ASUS TUF Gaming A15 (R7 5800H/8GB/512GB/RTX3050Ti)', 
  (SELECT id FROM app_options WHERE group_key = 'category' AND option_key = '8'),
  '2026-07-20', '2026-07-25',
  (SELECT id FROM app_options WHERE group_key = 'laptopLocation' AND option_key = 'store'),
  (SELECT id FROM app_options WHERE group_key = 'chargerStatus' AND option_key = 'with_charger'),
  (SELECT id FROM app_options WHERE group_key = 'laptopStatus' AND option_key = 'sold'),
  (SELECT id FROM app_options WHERE group_key = 'seller' AND option_key = 'xiao'),
  3000, 30, 3550, 11050000, 11800000, 12500000, 'Móp góc trái nhẹ', true
);

-- 4. Chèn 1 Đơn hàng mẫu (đã bán máy SN-TUF-003)
INSERT INTO orders (
  created_date, laptop_id, customer_id, sale_online_id, 
  order_type_id, order_status_id, payment_status_id, delivery_status_id, shipping_method_id,
  sale_price, deposit_amount, cod_amount, profit_vnd, note, gifts_id
) VALUES 
(
  '2026-08-15', 
  (SELECT id FROM laptops WHERE serial = 'SN-TUF-003'),
  (SELECT id FROM customers WHERE phone = '0987654321'),
  (SELECT id FROM app_options WHERE group_key = 'saleOnline' AND option_key = '1'),
  (SELECT id FROM app_options WHERE group_key = 'orderType' AND option_key = 'retail'),
  (SELECT id FROM app_options WHERE group_key = 'orderStatus' AND option_key = 'done'),
  (SELECT id FROM app_options WHERE group_key = 'paymentStatus' AND option_key = 'paid'),
  (SELECT id FROM app_options WHERE group_key = 'deliveryStatus' AND option_key = 'delivered'),
  (SELECT id FROM app_options WHERE group_key = 'shippingMethod' AND option_key = 'direct_store'),
  12500000, 1000000, 0, 1450000, 'Khách đến tận nơi lấy', 
  (SELECT id FROM app_options WHERE group_key = 'giftOptions' AND option_key = 'basic_gift')
);

-- 5. Chèn 1 Lịch sử kho mẫu
INSERT INTO stock_movements (
  laptop_id, movement_type, from_location, to_location, note, performed_by
) VALUES 
(
  (SELECT id FROM laptops WHERE serial = 'SN-LEGION-001'),
  'NHẬP KHO', 'KHO TQ', 'CH', 'Hàng về chuyến 05/08', 'Quản Trị Viên'
);
