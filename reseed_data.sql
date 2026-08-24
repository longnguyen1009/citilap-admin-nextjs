-- CHÈN SEED DATA (Dữ liệu mẫu cho App Options)
-- =========================================================================================
INSERT INTO app_options (group_key, option_key, label, sort_order) VALUES
('laptopStatus', 'not_imported', 'Chưa nhập kho', 0),
('laptopStatus', 'available', 'Sẵn hàng (đã nhập kho)', 1),
('laptopStatus', 'deposited', 'Đã cọc (Giữ chỗ)', 2),
('laptopStatus', 'sold', 'Đã bán', 3),
('laptopStatus', 'returned_cn', 'Back lại TQ', 4),
('laptopStatus', 'repairing', 'Đang sửa chữa', 5),
('laptopStatus', 'skipped', 'Bỏ qua', 6),
('laptopLocation', 'store', 'CH', 0),
('laptopLocation', 'wh', 'KHO', 1),
('laptopLocation', 'wh_cn', 'KHO TQ', 2),
('laptopLocation', 'repair', 'Sửa chữa', 3),
('chargerStatus', 'with_charger', 'Có Sạc', 0),
('chargerStatus', 'no_charger', 'Không Sạc', 1),
('chargerStatus', 'shared_charger', 'Sạc Lô', 2),
('chargerStatus', 'unchecked', 'Chưa Check', 3),
('componentStatus', 'ok', 'OK', 0),
('componentStatus', 'error', 'Lỗi / Có vấn đề', 1),
('orderStatus', 'new', 'MỚI TẠO', 0),
('orderStatus', 'deposited', 'ĐÃ CỌC / GIỮ MÁY', 1),
('orderStatus', 'prepared', 'ĐÃ CHUẨN BỊ XONG', 2),
('orderStatus', 'shipping', 'ĐANG GIAO HÀNG', 3),
('orderStatus', 'done', 'HOÀN THÀNH', 4),
('orderStatus', 'returned', 'BACK MÁY', 5),
('orderStatus', 'cancelled', 'HỦY ĐƠN', 6),
('paymentStatus', 'unpaid', 'CHƯA THANH TOÁN', 0),
('paymentStatus', 'deposited', 'ĐÃ CỌC', 1),
('paymentStatus', 'cod', 'ĐANG CHỜ COD', 2),
('paymentStatus', 'paid', 'ĐÃ THANH TOÁN', 3),
('paymentStatus', 'refunded', 'ĐÃ HOÀN TIỀN', 4),
('deliveryStatus', 'preparing', 'ĐANG CHUẨN BỊ', 0),
('deliveryStatus', 'shipped', 'ĐÃ GỬI HÀNG', 1),
('deliveryStatus', 'delivered', 'ĐÃ GIAO HÀNG', 2),
('deliveryStatus', 'at_store', 'TẠI SHOP', 3),
('deliveryStatus', 'returned', 'HOÀN HÀNG', 4),
('orderType', 'retail', 'Bán lẻ (Retail)', 0),
('orderType', 'wholesale', 'Bán sỉ/Thợ (Wholesale)', 1),
('orderType', 'trade_in', 'Thu cũ đổi mới (Trade-in)', 2),
('paymentMethod', 'transfer_cash', 'Chuyển khoản / Tiền mặt', 0),
('paymentMethod', 'card', 'Quẹt thẻ (Tốn phí)', 1),
('paymentMethod', 'installment', 'Trả góp', 2),
('shippingMethod', 'viettelpost', 'ViettelPost', 0),
('shippingMethod', 'shopee_spx', 'Shopee SPX', 1),
('shippingMethod', 'direct_store', 'Trực tiếp Shop', 2),
('shippingMethod', 'hcm_agent', 'Nhờ HCM giao dịch', 3),
('shippingMethod', 'hai_an', 'Nhà xe Hải An', 4),
('shippingMethod', 'shared_car', 'Xe Ghép', 5),
('shippingMethod', 'direct_ship', 'Ship trực tiếp khách', 6),
('shippingMethod', 'bus', 'Xe khách', 7),
('giftOptions', 'basic_gift', 'quà cơ bản (balo + chuột)', 0),
('giftOptions', 'no_gift', 'ko quà', 1),
('giftOptions', 'mouse_only', 'chỉ tặng chuột', 2),
('giftOptions', 'bag_only', 'chỉ tặng balo', 3),
('category', '1', 'LEGION 5 2023', 0),
('category', '2', 'ROG G513 2022', 1),
('category', '3', 'ROG Scar 2022', 2),
('category', '4', 'ROG Zephyrus G14', 3),
('category', '5', 'LEGION 5 Pro 2022', 4),
('category', '6', 'LEGION 5 Pro 2023 - 2024', 5),
('category', '7', 'LEGION Slim 7', 6),
('category', '8', 'ASUS TUF Gaming', 7),
('category', '9', 'ROG M16 / G16', 8),
('category', '10', 'ACER Nitro 5', 9),
('saleOnline', '1', 'Thắng Tiktok', 0),
('saleOnline', '2', 'Thắng Zalo', 1),
('saleOnline', '3', 'Vương', 2),
('saleOnline', '4', 'Quế Anh', 3),
('saleOnline', '5', 'Quảng', 4),
('saleOnline', '6', 'Linh', 5),
('saleOnline', '7', 'Hoàng', 6),
('saleOnline', '8', 'Tuấn', 7),
('saleOnline', 'other', 'Khác', 8),
('seller', 'guangzhou', 'Guangzhou Tech', 0),
('seller', 'shenzhen', 'Shenzhen Digital', 1),
('seller', 'beijing', 'Beijing Digital', 2),
('seller', 'aming', 'Shop TQ A-Ming', 3),
('seller', 'xiao', 'Shop TQ Xiao', 4),
('warrantyCaseStatus', 'received', 'TIẾP NHẬN', 0),
('warrantyCaseStatus', 'checking', 'ĐANG KIỂM TRA', 1),
('warrantyCaseStatus', 'wait_parts', 'CHỜ LINH KIỆN', 2),
('warrantyCaseStatus', 'repairing', 'ĐANG SỬA', 3),
('warrantyCaseStatus', 'done', 'HOÀN TẤT', 4),
('warrantyCaseStatus', 'swap_device', 'ĐỔI MÁY', 5),
('warrantyCaseStatus', 'refunded', 'HOÀN TIỀN', 6);


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
