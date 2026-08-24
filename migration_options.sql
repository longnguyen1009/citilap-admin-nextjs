-- Tạo bảng app_options
DROP TABLE IF EXISTS app_options CASCADE;
CREATE TABLE app_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_key TEXT NOT NULL,
  option_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(group_key, option_key)
);

-- Bật RLS
ALTER TABLE app_options ENABLE ROW LEVEL SECURITY;

-- Chính sách
CREATE POLICY "Cho phép đọc options" ON app_options FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Cho phép ghi options" ON app_options FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Cho phép cập nhật options" ON app_options FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Cho phép xóa options" ON app_options FOR DELETE USING (auth.role() = 'authenticated');

-- Seed Data
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

-- Cập nhật Laptops
ALTER TABLE laptops
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS charger_status,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS seller,
  DROP COLUMN IF EXISTS screen_status,
  DROP COLUMN IF EXISTS camera_mic_status,
  DROP COLUMN IF EXISTS mainboard_status;

ALTER TABLE laptops
  ADD COLUMN category_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN location_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN charger_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN seller_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN screen_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN camera_mic_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN mainboard_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL;

-- Cập nhật Orders
ALTER TABLE orders
  DROP COLUMN IF EXISTS sale_online,
  DROP COLUMN IF EXISTS order_type,
  DROP COLUMN IF EXISTS order_status,
  DROP COLUMN IF EXISTS payment_status,
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS delivery_status,
  DROP COLUMN IF EXISTS shipping_method,
  DROP COLUMN IF EXISTS gifts;

ALTER TABLE orders
  ADD COLUMN sale_online_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN order_type_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN order_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN payment_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN payment_method_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN delivery_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN shipping_method_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN gifts_id UUID REFERENCES app_options(id) ON DELETE SET NULL;

