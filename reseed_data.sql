-- DEV/TEST ONLY: reset business data; preserve auth.users, user_profiles and app_options.
-- Run init_full_db.sql first, or apply all db/migrations to an existing database.
-- 50 laptops (17/17/16), 30 orders (10/10/10) for July/August/September 2026.
-- VND monetary columns use MILLION VND; price_rmb/shipping_rmb use RMB.
BEGIN;
SET LOCAL search_path = public, pg_temp;
TRUNCATE TABLE financial_records, payments, stock_movements, warranty_cases,
  orders, laptops, customers, activity_logs, app_settings RESTART IDENTITY;

INSERT INTO app_settings (key, value) VALUES
  ('formula', '{"shippingVnd":400000,"divisor":1000000,"defaultRate":3550,"currencyUnit":"million_vnd"}'::jsonb);
INSERT INTO app_options (group_key, option_key, label, sort_order) VALUES
  ('saleOffline', '1', 'Thắng', 0), ('saleOffline', '2', 'Vương', 1), ('saleOffline', 'other', 'Khác', 2)
ON CONFLICT (group_key, option_key) DO UPDATE
SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = true;

DO $$
DECLARE
  m INTEGER;
  n INTEGER;
  model INTEGER;
  month TEXT;
  imported DATE;
  ordered DATE;
  stamp TIMESTAMPTZ;
  laptop laptops%ROWTYPE;
  customer customers%ROWTYPE;
  status TEXT;
  sale NUMERIC;
  paid NUMERIC;
  cost NUMERIC;
  names TEXT[] := ARRAY[
    'Lenovo Legion 5 2023 (R7 7735H/16GB/512GB/RTX4060)',
    'ASUS ROG G513 2022 (R7 6800H/16GB/512GB/RTX3060)',
    'ASUS ROG Scar 2022 (i9 12900H/32GB/1TB/RTX3070Ti)',
    'ASUS ROG Zephyrus G14 (R9 6900HS/16GB/512GB/RX6700S)',
    'Lenovo Legion 5 Pro 2022 (R7 6800H/16GB/1TB/RTX3060)',
    'Lenovo Legion 5 Pro 2023 (R7 7745HX/16GB/1TB/RTX4060)',
    'Lenovo Legion Slim 7 (R7 7840HS/16GB/1TB/RTX4060)',
    'ASUS TUF Gaming A15 (R7 5800H/16GB/512GB/RTX3050Ti)',
    'ASUS ROG M16 (i7 12700H/16GB/1TB/RTX3060)',
    'Acer Nitro 5 (i5 12500H/16GB/512GB/RTX3050)'];
  buyers TEXT[] := ARRAY['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu',
    'Phạm Quốc Dũng', 'Hoàng Thu Hà', 'Vũ Gia Huy', 'Đặng Ngọc Lan',
    'Bùi Đức Minh', 'Đỗ Phương Nam', 'Ngô Hải Yến'];
BEGIN
  FOR m IN 7..9 LOOP
    month := to_char(make_date(2026, m, 1), 'MM/YYYY');
    FOR n IN 1..(CASE WHEN m = 9 THEN 16 ELSE 17 END) LOOP
      model := 1 + (n + m - 8) % 10;
      imported := make_date(2026, m, 1 + (n - 1) % 5);
      stamp := (imported + TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
      cost := round(((3000 + model * 300 + n * 20 + 50) * 3550 + 400000)::numeric / 1000000, 2);
      INSERT INTO laptops (
        serial, name, category, import_date, warehouse_date, month_key,
        location, charger_status, status, seller, price_rmb, shipping_rmb,
        exchange_rate, import_price_vnd, wholesale_price_vnd, retail_price_vnd,
        battery_health, screen_status, camera_mic_status, mainboard_status,
        condition_note, warranty_supplier, is_active, is_locked, created_at, updated_at
      ) VALUES (
        format('CT-2026%s-%s', lpad(m::text, 2, '0'), lpad(n::text, 3, '0')),
        names[model], model::text, imported, imported + 2, month,
        'store', 'with_charger', 'available',
        (ARRAY['guangzhou', 'shenzhen', 'beijing', 'aming', 'xiao'])[1 + (n - 1) % 5],
        3000 + model * 300 + n * 20, 50, 3550, cost, cost + 1.5, cost + 3,
        85 + n % 16, 'ok', 'ok', 'ok', 'Máy đã kiểm tra, hoạt động tốt',
        'Bảo hành nhà cung cấp 3 tháng', true, false, stamp, stamp
      ) RETURNING * INTO laptop;
      INSERT INTO stock_movements (laptop_id, movement_type, from_location, to_location,
        note, performed_by, created_at)
      VALUES (laptop.id, 'NHẬP KHO', 'KHO TQ', 'CH',
        'Nhập kho mẫu tháng ' || month, 'Seed', stamp + INTERVAL '2 days');

      IF n > 10 THEN CONTINUE; END IF;
      ordered := make_date(2026, m, 6 + n);
      stamp := (ordered + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
      INSERT INTO customers (name, phone, address, created_at, updated_at)
      VALUES (buyers[n], '090' || lpad((m * 100 + n)::text, 7, '0'),
        format('%s Nguyễn Trãi, Hà Nội', 10 + n), stamp, stamp)
      RETURNING * INTO customer;

      -- No time-dependent reservations: reruns give the same inventory state.
      status := CASE WHEN n <= 6 THEN 'done' WHEN n = 7 THEN 'prepared'
        WHEN n = 8 THEN 'shipping' WHEN n = 9 THEN 'new' ELSE 'cancelled' END;
      sale := CASE WHEN n % 3 = 0 THEN laptop.wholesale_price_vnd ELSE laptop.retail_price_vnd END;
      paid := CASE WHEN n <= 7 THEN sale WHEN n = 8 THEN 2 ELSE 0 END;
      PERFORM public.create_order_with_inventory(jsonb_build_object(
        'created_date', ordered, 'month_key', month,
        'laptop_id', laptop.id, 'customer_id', customer.id,
        'customer_info', customer.name || ' - ' || customer.phone,
        'customer_address', customer.address,
        'sale_online', (1 + (n - 1) % 8)::text, 'sale_offline', (1 + (n - 1) % 2)::text,
        'note', 'Đơn mẫu tháng ' || month,
        'order_type', CASE WHEN n % 3 = 0 THEN 'wholesale' ELSE 'retail' END,
        'order_status', status,
        'payment_status', CASE WHEN n <= 7 THEN 'paid' WHEN n = 8 THEN 'cod' ELSE 'unpaid' END,
        'payment_method', 'transfer_cash',
        'delivery_status', CASE WHEN n <= 6 THEN 'delivered' WHEN n = 8 THEN 'shipped' ELSE 'at_store' END,
        'shipping_method', CASE WHEN n = 8 THEN 'viettelpost' ELSE 'direct_store' END,
        'sale_price', sale, 'amount_paid', paid,
        'deposit_amount', CASE WHEN n <= 8 THEN 2 ELSE 0 END,
        'deposit_note', CASE WHEN n <= 8 THEN 'Cọc chuyển khoản' ELSE NULL END,
        'cod_amount', CASE WHEN n = 8 THEN sale - paid ELSE 0 END,
        'profit_vnd', CASE WHEN n = 10 THEN 0 ELSE sale - cost END,
        'ship_date', CASE WHEN n <= 6 OR n = 8 THEN ordered ELSE NULL END,
        'tracking_code', CASE WHEN n = 8 THEN 'VTP-' || laptop.serial ELSE NULL END,
        'setup_note', 'Cài đặt Windows và kiểm tra máy', 'warranty', '6 tháng', 'gifts', 'basic_gift',
        'cancel_reason', CASE WHEN n = 10 THEN 'Khách đổi nhu cầu' ELSE NULL END,
        'cancelled_at', CASE WHEN n = 10 THEN stamp ELSE NULL END,
        'is_active', true, 'created_at', stamp, 'updated_at', stamp
      ), 'Seed');
    END LOOP;
  END LOOP;
END;
$$;

-- RPC-generated history belongs to the sample month, not the day this script runs.
UPDATE payments SET created_at = (payment_date + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
UPDATE financial_records SET created_at = (occurred_on + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
UPDATE stock_movements s SET created_at = o.created_at FROM orders o WHERE s.order_id = o.id;

-- Abort the entire reset if counts, links, or payment history are inconsistent.
DO $$
BEGIN
  IF (SELECT count(*) FROM laptops) <> 50 OR (SELECT count(*) FROM orders) <> 30
    OR EXISTS (
      SELECT 1 FROM (VALUES ('07/2026', 17), ('08/2026', 17), ('09/2026', 16)) expected(month_key, total)
      WHERE (SELECT count(*) FROM laptops l WHERE l.month_key = expected.month_key) <> expected.total
         OR (SELECT count(*) FROM orders o WHERE o.month_key = expected.month_key) <> 10
    ) THEN RAISE EXCEPTION 'Seed counts do not match the requested monthly distribution'; END IF;
  IF EXISTS (
    SELECT 1 FROM orders o JOIN laptops l ON l.id = o.laptop_id
    WHERE o.month_key IS DISTINCT FROM l.month_key
      OR o.month_key IS DISTINCT FROM to_char(o.created_date, 'MM/YYYY')
      OR l.month_key IS DISTINCT FROM to_char(l.import_date, 'MM/YYYY')
      OR o.amount_paid <> COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.order_id = o.id), 0)
      OR o.amount_paid <> COALESCE((SELECT sum(f.amount) FROM financial_records f WHERE f.order_id = o.id), 0)
      OR o.debt_amount <> o.sale_price - o.amount_paid
      OR l.is_locked IS DISTINCT FROM o.laptop_locked
  ) THEN RAISE EXCEPTION 'Seed relationships or financial totals are inconsistent'; END IF;
END;
$$;
COMMIT;

SELECT l.month_key, l.laptops, o.orders
FROM (SELECT month_key, count(*) AS laptops FROM laptops GROUP BY month_key) l
JOIN (SELECT month_key, count(*) AS orders FROM orders GROUP BY month_key) o USING (month_key)
ORDER BY l.month_key;
