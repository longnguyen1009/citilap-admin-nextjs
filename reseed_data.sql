-- DESTRUCTIVE TEST RESET: 480 laptops, 320 orders, 416 payments across June-September 2026.
-- Requires init_full_db.sql or all migrations through 20261017. Preserves auth/profiles and catalogs.
-- Run as postgres. Monetary order/payment fields are MILLION VND; cash ledger is VND.
BEGIN;
SET LOCAL search_path = public, pg_temp;
TRUNCATE TABLE financial_records, payments, stock_movements, warranty_cases,
 orders, laptops, customers, activity_logs, app_settings, cash_accounts,
 suppliers, purchase_batches, shipments, receiving_sessions, supplier_returns,
 cost_allocations, trade_ins RESTART IDENTITY CASCADE;
ALTER SEQUENCE public.laptop_sku_seq RESTART WITH 1;
INSERT INTO cash_accounts(code,name,account_type,currency,opening_balance,opening_balance_at,created_by) VALUES
 ('SEED_CASH','Tien mat','CASH','VND',50000000,'2026-06-01T00:00:00+07','Seed'),
 ('SEED_BANK','Ngan hang','BANK','VND',200000000,'2026-06-01T00:00:00+07','Seed'),
 ('SEED_CNY','WeChat CNY','WECHAT','CNY',100000,'2026-06-01T00:00:00+07','Seed');

INSERT INTO app_settings (key, value) VALUES
  ('formula', '{"shippingVnd":400000,"divisor":1000000,"defaultRate":3550}'::jsonb);
INSERT INTO app_options (group_key, option_key, label, sort_order) VALUES
  ('saleOffline', '1', 'Thắng', 0), ('saleOffline', '2', 'Vương', 1), ('saleOffline', 'other', 'Khác', 2)
ON CONFLICT (group_key, option_key) DO UPDATE
SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = true;

DO $$
DECLARE
  m INTEGER;
  k INTEGER;
  order_id bigint;
  account uuid;
  result jsonb;
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
  FOR m IN 6..9 LOOP
    month := to_char(make_date(2026, m, 1), 'MM/YYYY');
    FOR n IN 1..120 LOOP
      k := 1 + (n - 1) % 10;
      model := 1 + (n + m) % 10;
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
      -- Direct-import opening inventory has no procurement lineage. Record its
      -- known landed cost without fabricating purchase/shipment/QC history.
      PERFORM add_manual_laptop_cost(laptop.id,'OTHER',cost*1000000,
        'Opening inventory landed cost',stamp,'Seed','seed-opening-cost-'||m||'-'||n);
      INSERT INTO stock_movements (laptop_id, movement_type, from_location, to_location,
        note, performed_by, created_at)
      VALUES (laptop.id, 'NHẬP KHO', 'KHO TQ', 'CH',
        'Nhập kho mẫu tháng ' || month, 'Seed', stamp + INTERVAL '2 days');

      IF n > 80 THEN CONTINUE; END IF;
      ordered := make_date(2026, m, 7 + (n - 1) % 14);
      stamp := (ordered + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
      INSERT INTO customers (name, phone, address, created_at, updated_at)
      VALUES (buyers[k], '090' || lpad((m * 100 + n)::text, 7, '0'),
        format('%s Nguyễn Trãi, Hà Nội', 10 + n), stamp, stamp)
      RETURNING * INTO customer;

      -- No time-dependent reservations: reruns give the same inventory state.
      status := CASE WHEN k <= 5 THEN 'done' WHEN k = 6 THEN 'deposited' WHEN k = 7 THEN 'prepared'
        WHEN k = 8 THEN 'shipping' WHEN k = 9 THEN 'new' ELSE 'cancelled' END;
      sale := CASE WHEN n % 3 = 0 THEN laptop.wholesale_price_vnd ELSE laptop.retail_price_vnd END;
      paid := CASE WHEN k <= 5 THEN sale WHEN k BETWEEN 6 AND 8 THEN 2 ELSE 0 END;
      result := public.create_order_with_inventory(jsonb_build_object(
        'created_date', ordered, 'month_key', month,
        'laptop_id', laptop.id, 'customer_id', customer.id,
        'customer_info', customer.name || ' - ' || customer.phone,
        'customer_address', customer.address,
        'sale_online', (1 + (n - 1) % 8)::text, 'sale_offline', (1 + (n - 1) % 2)::text,
        'note', 'Đơn mẫu tháng ' || month,
        'order_type', CASE WHEN n % 3 = 0 THEN 'wholesale' ELSE 'retail' END,
        'order_status', status,
        'payment_status', 'unpaid',
        'payment_method', 'transfer_cash',
        'delivery_status', CASE WHEN k <= 5 THEN 'delivered' WHEN k = 8 THEN 'shipped' ELSE 'at_store' END,
        'shipping_method', CASE WHEN k = 8 THEN 'viettelpost' ELSE 'direct_store' END,
        'sale_price', sale, 'amount_paid', 0,
        'deposit_amount', 0,
        'deposit_note', CASE WHEN k BETWEEN 6 AND 8 THEN 'Cọc chuyển khoản' ELSE NULL END,
        'cod_amount', CASE WHEN k = 8 THEN sale - paid ELSE 0 END,
        'profit_vnd', CASE WHEN k = 10 THEN 0 ELSE sale - cost END,
        'ship_date', CASE WHEN k <= 5 OR k = 8 THEN ordered ELSE NULL END,
        'tracking_code', CASE WHEN k = 8 THEN 'VTP-' || laptop.serial ELSE NULL END,
        'setup_note', 'Cài đặt Windows và kiểm tra máy', 'warranty',
        'cancel_reason', CASE WHEN k = 10 THEN 'Khách đổi nhu cầu' ELSE NULL END,
        'cancelled_at', CASE WHEN k = 10 THEN stamp ELSE NULL END,
        'is_active', true, 'created_at', stamp, 'updated_at', stamp
      ), 'Seed');
      order_id := (result->'order'->>'id')::bigint;
      SELECT id INTO account FROM cash_accounts WHERE code=CASE WHEN n%2=0 THEN 'SEED_BANK' ELSE 'SEED_CASH' END;
      IF paid > 0 THEN
        PERFORM record_order_payment_with_account(order_id,2,'deposit','transfer_cash',ordered,
          'SEED-'||m||'-'||n||'-D','Initial deposit','Seed',account,'seed-'||m||'-'||n||'-deposit');
        IF paid > 2 THEN
          PERFORM record_order_payment_with_account(order_id,paid-2,'balance','transfer_cash',ordered+1,
            'SEED-'||m||'-'||n||'-B','Remaining balance','Seed',account,'seed-'||m||'-'||n||'-balance');
        END IF;
      END IF;
      UPDATE orders SET payment_due_at=(ordered+7)::timestamptz WHERE id=order_id;
      IF k=8 THEN
        PERFORM create_cod_receivable(order_id,'Viettel Post','VTP-'||laptop.serial,
          (ordered+5)::timestamptz,'Sample COD','Seed','seed-cod-'||m||'-'||n);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Timestamps of append-only ledgers are not rewritten. Business dates are historical.
DO $$
BEGIN
 IF (SELECT count(*) FROM laptops)<>480 OR (SELECT count(*) FROM orders)<>320
   OR (SELECT count(*) FROM payments)<>416 OR (SELECT count(*) FROM account_transactions)<>416 THEN
   RAISE EXCEPTION 'Seed counts mismatch';
 END IF;
 IF EXISTS(SELECT 1 FROM orders o WHERE
   o.amount_paid <> coalesce((SELECT sum(CASE WHEN p.payment_type='refund' THEN -p.amount ELSE p.amount END) FROM payments p WHERE p.order_id=o.id),0)
   OR o.debt_amount <> greatest(o.sale_price-o.amount_paid,0)
   OR o.month_key <> to_char(o.created_date,'MM/YYYY')) THEN
   RAISE EXCEPTION 'Payment/debt/month inconsistency';
 END IF;
 IF EXISTS(SELECT 1 FROM payments p LEFT JOIN account_transactions t ON t.reference_type='PAYMENT' AND t.reference_id=p.id::text
   WHERE t.id IS NULL OR t.amount<>p.amount*1000000 OR t.account_id IS DISTINCT FROM p.account_id) THEN
   RAISE EXCEPTION 'Cash ledger mismatch';
 END IF;
 IF EXISTS(SELECT 1 FROM generate_series(6,9) m WHERE
   (SELECT count(*) FROM laptops WHERE month_key=lpad(m::text,2,'0')||'/2026')<>120 OR
   (SELECT count(*) FROM orders WHERE month_key=lpad(m::text,2,'0')||'/2026')<>80) THEN
   RAISE EXCEPTION 'Monthly distribution mismatch';
 END IF;
END $$;
COMMIT;
SELECT month_key,count(*) orders,sum(sale_price) sale_million_vnd,sum(amount_paid) paid_million_vnd
FROM orders GROUP BY month_key ORDER BY month_key;
