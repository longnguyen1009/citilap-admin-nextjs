-- CitiLap Admin sample data reset.
-- DEV/TEST ONLY: this removes business data but keeps auth users and user_profiles.
-- Run after init_full_db.sql (or after the schema migrations have been applied).

BEGIN;

TRUNCATE TABLE
  financial_records,
  payments,
  stock_movements,
  warranty_cases,
  orders,
  laptops,
  customers,
  activity_logs,
  app_settings
RESTART IDENTITY;

-- Keep the formula in the same unit used by the UI: million VND.
INSERT INTO app_settings (key, value) VALUES
  ('formula', '{"shippingVnd": 400000, "divisor": 1000000, "defaultRate": 3550, "currencyUnit": "million_vnd"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = timezone('utc'::text, now());

-- Ensure this option exists even when reseeding an older database.
INSERT INTO app_options (group_key, option_key, label, sort_order) VALUES
  ('saleOffline', '1', 'Thắng', 0),
  ('saleOffline', '2', 'Vương', 1),
  ('saleOffline', 'other', 'Khác', 2)
ON CONFLICT (group_key, option_key) DO UPDATE
SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = true,
    updated_at = timezone('utc'::text, now());

INSERT INTO customers (name, phone, address) VALUES
  ('Nguyễn Văn Khách', '0987654321', '123 Đường Láng, Đống Đa, Hà Nội'),
  ('Trần Thị Mua', '0912345678', '456 Lê Lợi, Quận 1, TP. HCM'),
  ('Lê Đại Gia', '0909090909', '789 Trần Hưng Đạo, Sơn Trà, Đà Nẵng');

-- Monetary columns in laptops/orders/payments/financial_records are million VND.
INSERT INTO laptops (
  serial, name, category, import_date, warehouse_date,
  location, charger_status, status, seller,
  price_rmb, shipping_rmb, exchange_rate, import_price_vnd,
  wholesale_price_vnd, retail_price_vnd,
  condition_note, is_active, is_locked, warranty_supplier
) VALUES
  (
    'SN-LEGION-001', 'Lenovo Legion 5 Pro 2023 (R7 7745HX/16GB/1TB/RTX4060)',
    '6', '2026-08-01', '2026-08-05', 'store', 'with_charger', 'available', 'guangzhou',
    6000, 50, 3550, 21.88, 23.5, 25.5,
    'Máy đẹp như mới, pin 100%', true, false, NULL
  ),
  (
    'SN-ROG-002', 'ASUS ROG Zephyrus G14 2022 (R9 6900HS/16GB/512GB/RX6700S)',
    '4', '2026-08-10', NULL, 'wh_cn', 'no_charger', 'not_imported', 'shenzhen',
    4500, 40, 3550, 16.52, 18, 19.5,
    'Xước nhẹ mặt A', true, false, NULL
  ),
  (
    'SN-TUF-003', 'ASUS TUF Gaming A15 (R7 5800H/8GB/512GB/RTX3050Ti)',
    '8', '2026-07-20', '2026-07-25', 'store', 'with_charger', 'sold', 'xiao',
    3000, 30, 3550, 11.16, 12, 13,
    'Móp góc trái nhẹ', true, true, NULL
  );

INSERT INTO orders (
  created_date, laptop_id, customer_id, sale_online, sale_offline, note, order_type,
  order_status, payment_status, payment_method, delivery_status, shipping_method,
  sale_price, deposit_amount, deposit_note, cod_amount, amount_paid, debt_amount,
  credit_card_fee, profit_vnd, tracking_code, ship_date, setup_note, warranty, gifts,
  laptop_locked, is_active
) VALUES (
  '2026-08-15',
  (SELECT id FROM laptops WHERE serial = 'SN-TUF-003'),
  (SELECT id FROM customers WHERE phone = '0987654321'),
  '1', NULL, 'Khách mua online', 'retail',
  'done', 'paid', 'transfer_cash', 'delivered', 'direct_store',
  13, 5, 'Cọc qua BIDV', 8, 13, 0,
  0, 1.84, 'TRACK-12345', '2026-08-15', 'Cài sẵn Office 2021', '6 tháng', 'basic_gift',
  true, true
);

UPDATE orders
SET customer_info = 'Nguyễn Văn Khách - 0987654321',
    customer_address = '123 Đường Láng, Đống Đa, Hà Nội'
WHERE laptop_id = (SELECT id FROM laptops WHERE serial = 'SN-TUF-003');

-- Seed the payment history and the linked income ledger in one statement.
WITH seeded_payments AS (
  INSERT INTO payments (
    order_id, payment_type, amount, payment_method, payment_date,
    reference_code, note, recorded_by
  ) VALUES
    (
      (SELECT o.id FROM orders o JOIN laptops l ON l.id = o.laptop_id WHERE l.serial = 'SN-TUF-003'),
      'deposit', 5, 'transfer_cash', '2026-08-15', 'DEP-12345', 'Cọc qua BIDV', 'Seed'
    ),
    (
      (SELECT o.id FROM orders o JOIN laptops l ON l.id = o.laptop_id WHERE l.serial = 'SN-TUF-003'),
      'cod', 8, 'transfer_cash', '2026-08-15', 'COD-12345', 'Đã thu đủ phần còn lại', 'Seed'
    )
  RETURNING id, order_id, payment_type, amount, payment_method, payment_date, note, recorded_by
)
INSERT INTO financial_records (
  record_type, category, amount, order_id, payment_id, occurred_on,
  payment_method, note, recorded_by
)
SELECT
  'income', payment_type, amount, order_id, id, payment_date,
  payment_method, note, recorded_by
FROM seeded_payments;

INSERT INTO financial_records (
  record_type, category, amount, laptop_id, occurred_on, payment_method, note, recorded_by
) VALUES (
  'expense', 'shipping', 0.4,
  (SELECT id FROM laptops WHERE serial = 'SN-TUF-003'),
  '2026-07-25', 'transfer_cash', 'Phí vận chuyển mẫu', 'Seed'
);

INSERT INTO stock_movements (
  laptop_id, movement_type, from_location, to_location, order_id, note, performed_by
) VALUES
  (
    (SELECT id FROM laptops WHERE serial = 'SN-LEGION-001'),
    'NHẬP KHO', 'KHO TQ', 'CH', NULL, 'Hàng về chuyến 05/08', 'Seed'
  ),
  (
    (SELECT id FROM laptops WHERE serial = 'SN-TUF-003'),
    'SOLD', 'CH', 'KHÁCH HÀNG',
    (SELECT o.id FROM orders o JOIN laptops l ON l.id = o.laptop_id WHERE l.serial = 'SN-TUF-003'),
    'Đơn mẫu đã hoàn tất', 'Seed'
  );

COMMIT;
