-- Migration: Thêm returned_at / return_reason vào orders để phân biệt trả hàng với hủy đơn
-- Có thể chạy nhiều lần an toàn (IF NOT EXISTS)

BEGIN;

-- 1. Thêm cột vào bảng orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_reason TEXT;

-- 2. Patch create_order_with_inventory: thêm returned_at / return_reason vào INSERT
CREATE OR REPLACE FUNCTION public.create_order_with_inventory(
  p_order JSONB,
  p_recorded_by TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_input orders%ROWTYPE;
  v_order orders%ROWTYPE;
  v_laptop laptops%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_initial_deposit NUMERIC;
  v_initial_balance NUMERIC;
  v_created_payments JSONB := '[]'::jsonb;
BEGIN
  IF p_order IS NULL THEN
    RAISE EXCEPTION 'Order data is required';
  END IF;

  v_input := jsonb_populate_record(NULL::orders, p_order);
  v_input.created_at := COALESCE(v_input.created_at, timezone('utc'::text, now()));
  v_input.updated_at := COALESCE(v_input.updated_at, timezone('utc'::text, now()));
  v_input := public.normalize_order_financials(v_input);

  IF v_input.month_key IS NULL OR btrim(v_input.month_key) = '' THEN
    v_input.month_key := TO_CHAR(CURRENT_DATE, 'MM/YYYY');
  END IF;

  INSERT INTO orders (
    created_date, sale_online, sale_offline, note, order_type, order_status,
    payment_status, payment_method, delivery_status, shipping_method, laptop_id,
    sale_price, deposit_amount, deposit_note, cod_amount, amount_paid, debt_amount,
    credit_card_fee, profit_vnd, trade_in_laptop_id, customer_id, customer_info,
    customer_address, tracking_code, ship_date, setup_note, warranty,
    laptop_locked, reservation_expires_at, cancel_reason, cancelled_at,
    returned_at, return_reason, is_active, month_key, created_at, updated_at
  ) VALUES (
    v_input.created_date, v_input.sale_online, v_input.sale_offline, v_input.note,
    v_input.order_type, v_input.order_status, v_input.payment_status,
    v_input.payment_method, v_input.delivery_status, v_input.shipping_method,
    v_input.laptop_id, v_input.sale_price, v_input.deposit_amount, v_input.deposit_note,
    v_input.cod_amount, v_input.amount_paid, v_input.debt_amount, v_input.credit_card_fee,
    v_input.profit_vnd, v_input.trade_in_laptop_id, v_input.customer_id,
    v_input.customer_info, v_input.customer_address, v_input.tracking_code,
    v_input.ship_date, v_input.setup_note, v_input.warranty,
    v_input.laptop_locked, v_input.reservation_expires_at, v_input.cancel_reason,
    v_input.cancelled_at, v_input.returned_at, v_input.return_reason,
    v_input.is_active, v_input.month_key, v_input.created_at, v_input.updated_at
  ) RETURNING * INTO v_order;

  v_initial_deposit := LEAST(COALESCE(v_order.deposit_amount, 0), COALESCE(v_order.amount_paid, 0));
  v_initial_balance := GREATEST(COALESCE(v_order.amount_paid, 0) - v_initial_deposit, 0);

  IF v_initial_deposit > 0 THEN
    INSERT INTO payments (order_id, payment_type, amount, payment_method, payment_date, note, recorded_by)
    VALUES (v_order.id, 'deposit', v_initial_deposit,
      COALESCE(NULLIF(btrim(v_order.payment_method), ''), 'transfer_cash'),
      COALESCE(v_order.created_date, CURRENT_DATE), v_order.deposit_note, p_recorded_by
    ) RETURNING * INTO v_payment;
    v_created_payments := v_created_payments || jsonb_build_array(to_jsonb(v_payment));

    INSERT INTO financial_records (record_type, category, amount, order_id, payment_id, occurred_on, payment_method, note, recorded_by)
    VALUES ('income', 'deposit', v_initial_deposit, v_order.id, v_payment.id,
      COALESCE(v_order.created_date, CURRENT_DATE),
      COALESCE(NULLIF(btrim(v_order.payment_method), ''), 'transfer_cash'),
      'Đơn hàng #' || v_order.id || ' - Tiền cọc', p_recorded_by
    );
  END IF;

  IF v_initial_balance > 0 THEN
    INSERT INTO payments (order_id, payment_type, amount, payment_method, payment_date, note, recorded_by)
    VALUES (v_order.id,
      CASE WHEN v_order.payment_status = 'cod' THEN 'cod' ELSE 'balance' END,
      v_initial_balance,
      COALESCE(NULLIF(btrim(v_order.payment_method), ''), 'transfer_cash'),
      COALESCE(v_order.created_date, CURRENT_DATE), 'Initial payment recorded with order', p_recorded_by
    ) RETURNING * INTO v_payment;
    v_created_payments := v_created_payments || jsonb_build_array(to_jsonb(v_payment));

    INSERT INTO financial_records (record_type, category, amount, order_id, payment_id, occurred_on, payment_method, note, recorded_by)
    VALUES ('income',
      CASE WHEN v_order.payment_status = 'cod' THEN 'cod' ELSE 'balance' END,
      v_initial_balance, v_order.id, v_payment.id,
      COALESCE(v_order.created_date, CURRENT_DATE),
      COALESCE(NULLIF(btrim(v_order.payment_method), ''), 'transfer_cash'),
      'Initial payment recorded with order', p_recorded_by
    );
  END IF;

  IF v_order.laptop_id IS NOT NULL THEN
    v_laptop := public.refresh_laptop_inventory(v_order.laptop_id);
    IF v_order.laptop_locked IS TRUE THEN
      INSERT INTO stock_movements (laptop_id, order_id, movement_type, note, performed_by)
      VALUES (v_order.laptop_id, v_order.id,
        CASE WHEN v_order.order_status IN ('prepared', 'shipping', 'done') THEN 'SOLD' ELSE 'RESERVED' END,
        'Inventory updated by order transaction', p_recorded_by
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'laptop', CASE WHEN v_laptop.id IS NULL THEN NULL ELSE to_jsonb(v_laptop) END,
    'payments', v_created_payments,
    'inventory_applied', true
  );
END;
$$;

-- 3. Patch update_order_with_inventory: thêm returned_at / return_reason vào UPDATE SET
CREATE OR REPLACE FUNCTION public.update_order_with_inventory(
  p_order JSONB,
  p_recorded_by TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id BIGINT;
  v_existing orders%ROWTYPE;
  v_next orders%ROWTYPE;
  v_order orders%ROWTYPE;
  v_old_laptop laptops%ROWTYPE;
  v_previous_laptop laptops%ROWTYPE;
  v_laptop laptops%ROWTYPE;
  v_old_laptop_id BIGINT;
  v_new_laptop_id BIGINT;
  v_old_uses BOOLEAN;
  v_new_uses BOOLEAN;
  v_old_committed BOOLEAN;
  v_new_committed BOOLEAN;
BEGIN
  IF p_order IS NULL OR NOT (p_order ? 'id') THEN
    RAISE EXCEPTION 'Order id is required';
  END IF;

  v_order_id := (p_order->>'id')::BIGINT;
  SELECT * INTO v_existing FROM orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % does not exist', v_order_id;
  END IF;

  v_next := jsonb_populate_record(v_existing, p_order);
  v_next.id := v_existing.id;
  v_next.created_at := COALESCE(v_next.created_at, v_existing.created_at);
  v_next.updated_at := timezone('utc'::text, now());
  v_next := public.normalize_order_financials(v_next);

  IF v_next.month_key IS NULL OR btrim(v_next.month_key) = '' THEN
    v_next.month_key := COALESCE(v_existing.month_key, TO_CHAR(CURRENT_DATE, 'MM/YYYY'));
  END IF;

  v_old_laptop_id := v_existing.laptop_id;
  v_new_laptop_id := v_next.laptop_id;
  v_old_uses := public.order_uses_laptop(
    v_existing.laptop_id, v_existing.is_active, v_existing.order_status,
    v_existing.payment_status, v_existing.reservation_expires_at
  );
  v_new_uses := public.order_uses_laptop(
    v_next.laptop_id, v_next.is_active, v_next.order_status,
    v_next.payment_status, v_next.reservation_expires_at
  );
  v_old_committed := v_old_uses AND v_existing.order_status IN ('prepared', 'shipping', 'done');
  v_new_committed := v_new_uses AND v_next.order_status IN ('prepared', 'shipping', 'done');

  IF v_old_laptop_id IS NOT NULL AND v_new_laptop_id IS NOT NULL AND v_old_laptop_id <> v_new_laptop_id THEN
    IF v_old_laptop_id < v_new_laptop_id THEN
      PERFORM pg_advisory_xact_lock(v_old_laptop_id);
      PERFORM pg_advisory_xact_lock(v_new_laptop_id);
    ELSE
      PERFORM pg_advisory_xact_lock(v_new_laptop_id);
      PERFORM pg_advisory_xact_lock(v_old_laptop_id);
    END IF;
  ELSIF v_old_laptop_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(v_old_laptop_id);
  ELSIF v_new_laptop_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(v_new_laptop_id);
  END IF;

  IF v_old_laptop_id IS NOT NULL THEN
    SELECT * INTO v_old_laptop FROM laptops WHERE id = v_old_laptop_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Laptop % does not exist', v_old_laptop_id; END IF;
  END IF;
  IF v_new_laptop_id IS NOT NULL AND v_new_laptop_id <> v_old_laptop_id THEN
    SELECT * INTO v_laptop FROM laptops WHERE id = v_new_laptop_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Laptop % does not exist', v_new_laptop_id; END IF;
  END IF;

  UPDATE orders SET
    created_date = v_next.created_date,
    sale_online = v_next.sale_online,
    sale_offline = v_next.sale_offline,
    note = v_next.note,
    order_type = v_next.order_type,
    order_status = v_next.order_status,
    payment_status = v_next.payment_status,
    payment_method = v_next.payment_method,
    delivery_status = v_next.delivery_status,
    shipping_method = v_next.shipping_method,
    laptop_id = v_next.laptop_id,
    sale_price = v_next.sale_price,
    deposit_amount = v_next.deposit_amount,
    deposit_note = v_next.deposit_note,
    cod_amount = v_next.cod_amount,
    amount_paid = v_next.amount_paid,
    debt_amount = v_next.debt_amount,
    credit_card_fee = v_next.credit_card_fee,
    profit_vnd = v_next.profit_vnd,
    trade_in_laptop_id = v_next.trade_in_laptop_id,
    customer_id = v_next.customer_id,
    customer_info = v_next.customer_info,
    customer_address = v_next.customer_address,
    tracking_code = v_next.tracking_code,
    ship_date = v_next.ship_date,
    setup_note = v_next.setup_note,
    warranty = v_next.warranty,
    laptop_locked = v_next.laptop_locked,
    reservation_expires_at = v_next.reservation_expires_at,
    cancel_reason = v_next.cancel_reason,
    cancelled_at = v_next.cancelled_at,
    returned_at = v_next.returned_at,
    return_reason = v_next.return_reason,
    is_active = v_next.is_active,
    month_key = v_next.month_key,
    updated_at = v_next.updated_at
  WHERE id = v_order_id
  RETURNING * INTO v_order;

  IF v_old_laptop_id IS NOT NULL AND (v_new_laptop_id IS NULL OR v_new_laptop_id <> v_old_laptop_id) THEN
    v_previous_laptop := public.refresh_laptop_inventory(v_old_laptop_id);
  END IF;
  IF v_new_laptop_id IS NOT NULL THEN
    v_laptop := public.refresh_laptop_inventory(v_new_laptop_id);
  END IF;

  IF v_old_laptop_id IS NOT NULL AND (v_new_laptop_id IS NULL OR v_new_laptop_id <> v_old_laptop_id) THEN
    INSERT INTO stock_movements (laptop_id, order_id, movement_type, note, performed_by)
    VALUES (v_old_laptop_id, v_order.id, 'UNRESERVED', 'Laptop unlinked from order', p_recorded_by);
  END IF;
  IF v_new_laptop_id IS NOT NULL AND v_new_laptop_id <> v_old_laptop_id THEN
    INSERT INTO stock_movements (laptop_id, order_id, movement_type, note, performed_by)
    VALUES (v_new_laptop_id, v_order.id,
      CASE WHEN v_order.order_status IN ('prepared', 'shipping', 'done') THEN 'SOLD' ELSE 'RESERVED' END,
      'Laptop linked to order', p_recorded_by
    );
  END IF;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'laptop', CASE WHEN v_laptop.id IS NULL THEN NULL ELSE to_jsonb(v_laptop) END,
    'payments', '[]'::jsonb,
    'inventory_applied', true
  );
END;
$$;

COMMIT;
