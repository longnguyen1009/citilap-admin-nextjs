-- CitiLap Admin: order, payment, and inventory consistency follow-up migration.
-- Run after 20260907_security_and_schema.sql and 20260907_payments_finance_ledger.sql.
-- This migration does not delete business data.

BEGIN;

ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS wholesale_price_vnd NUMERIC DEFAULT 0;
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS retail_price_vnd NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS orders_laptop_active_idx
  ON public.orders (laptop_id, is_active, order_status, payment_status);
CREATE INDEX IF NOT EXISTS laptops_active_status_import_date_idx
  ON public.laptops (is_active, status, import_date DESC);
CREATE INDEX IF NOT EXISTS warranty_cases_laptop_created_at_idx
  ON public.warranty_cases (laptop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_laptop_created_at_idx
  ON public.stock_movements (laptop_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.laptops'::regclass
      AND conname = 'laptops_sale_prices_non_negative'
  ) THEN
    ALTER TABLE public.laptops
      ADD CONSTRAINT laptops_sale_prices_non_negative
      CHECK (
        COALESCE(wholesale_price_vnd, 0) >= 0
        AND COALESCE(retail_price_vnd, 0) >= 0
      ) NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.warranty_cases'::regclass
      AND conname = 'warranty_cases_repair_cost_non_negative'
  ) THEN
    ALTER TABLE public.warranty_cases
      ADD CONSTRAINT warranty_cases_repair_cost_non_negative
      CHECK (COALESCE(repair_cost, 0) >= 0) NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_profiles'::regclass
      AND conname = 'user_profiles_role_valid'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_role_valid
      CHECK (role IN ('ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF')) NOT VALID;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.order_uses_laptop(BIGINT, BOOLEAN, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.order_uses_laptop(
  p_laptop_id BIGINT,
  p_is_active BOOLEAN,
  p_order_status TEXT,
  p_payment_status TEXT,
  p_reservation_expires_at TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    p_laptop_id IS NOT NULL
    AND p_is_active IS TRUE
    AND COALESCE(p_payment_status, '') <> 'refunded'
    AND COALESCE(p_order_status, '') NOT IN ('cancelled', 'returned')
    AND (
      p_order_status IN ('prepared', 'shipping', 'done')
      OR (
        (p_order_status = 'deposited' OR p_payment_status = 'deposited')
        AND (p_reservation_expires_at IS NULL OR p_reservation_expires_at > CURRENT_TIMESTAMP)
      )
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_laptop_double_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.order_uses_laptop(
    NEW.laptop_id, NEW.is_active, NEW.order_status, NEW.payment_status, NEW.reservation_expires_at
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(NEW.laptop_id);
  IF EXISTS (
    SELECT 1
    FROM orders existing_order
    WHERE existing_order.laptop_id = NEW.laptop_id
      AND existing_order.id IS DISTINCT FROM NEW.id
      AND public.order_uses_laptop(
        existing_order.laptop_id,
        existing_order.is_active,
        existing_order.order_status,
        existing_order.payment_status,
        existing_order.reservation_expires_at
      )
  ) THEN
    RAISE EXCEPTION 'Laptop % is already reserved by another active order', NEW.laptop_id
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_laptop_double_reservation_trigger ON orders;
CREATE TRIGGER prevent_laptop_double_reservation_trigger
  BEFORE INSERT OR UPDATE OF laptop_id, order_status, payment_status, is_active ON orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_laptop_double_reservation();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_set_updated_at_trigger ON public.user_profiles;
CREATE TRIGGER user_profiles_set_updated_at_trigger
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS app_settings_set_updated_at_trigger ON public.app_settings;
CREATE TRIGGER app_settings_set_updated_at_trigger
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS app_options_set_updated_at_trigger ON public.app_options;
CREATE TRIGGER app_options_set_updated_at_trigger
  BEFORE UPDATE ON public.app_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS customers_set_updated_at_trigger ON public.customers;
CREATE TRIGGER customers_set_updated_at_trigger
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS laptops_set_updated_at_trigger ON public.laptops;
CREATE TRIGGER laptops_set_updated_at_trigger
  BEFORE UPDATE ON public.laptops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS orders_set_updated_at_trigger ON public.orders;
CREATE TRIGGER orders_set_updated_at_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS warranty_cases_set_updated_at_trigger ON public.warranty_cases;
CREATE TRIGGER warranty_cases_set_updated_at_trigger
  BEFORE UPDATE ON public.warranty_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_activity_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS activity_logs_append_only_trigger ON public.activity_logs;
CREATE TRIGGER activity_logs_append_only_trigger
  BEFORE UPDATE OR DELETE ON public.activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_activity_log_mutation();

-- CONSISTENCY FUNCTIONS FOR ORDER AND INVENTORY STATE
-- =========================================================================================

CREATE OR REPLACE FUNCTION public.normalize_order_financials(p_order orders)
RETURNS orders
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order orders := p_order;
BEGIN
  v_order.is_active := COALESCE(v_order.is_active, true);
  v_order.sale_price := GREATEST(COALESCE(v_order.sale_price, 0), 0);
  v_order.deposit_amount := GREATEST(COALESCE(v_order.deposit_amount, 0), 0);
  v_order.cod_amount := GREATEST(COALESCE(v_order.cod_amount, 0), 0);
  v_order.amount_paid := GREATEST(COALESCE(v_order.amount_paid, 0), v_order.deposit_amount);
  v_order.credit_card_fee := GREATEST(COALESCE(v_order.credit_card_fee, 0), 0);
  v_order.profit_vnd := COALESCE(v_order.profit_vnd, 0);

  IF v_order.payment_status = 'paid' AND v_order.sale_price > 0 THEN
    v_order.amount_paid := v_order.sale_price;
  END IF;

  IF v_order.laptop_id IS NOT NULL
     AND v_order.is_active IS TRUE
     AND v_order.reservation_expires_at IS NULL
     AND (v_order.order_status = 'deposited' OR v_order.payment_status = 'deposited') THEN
    v_order.reservation_expires_at := timezone('utc'::text, now()) + INTERVAL '48 hours';
  END IF;

  IF v_order.amount_paid > v_order.sale_price THEN
    RAISE EXCEPTION 'amount_paid cannot exceed sale_price';
  END IF;

  v_order.debt_amount := GREATEST(v_order.sale_price - v_order.amount_paid, 0);
  v_order.payment_status := CASE
    WHEN v_order.payment_status = 'refunded' AND v_order.amount_paid = 0 THEN 'refunded'
    WHEN v_order.debt_amount = 0 AND v_order.sale_price > 0 THEN 'paid'
    WHEN v_order.payment_status = 'cod' AND v_order.debt_amount > 0 THEN 'cod'
    WHEN v_order.amount_paid > 0 THEN 'deposited'
    ELSE 'unpaid'
  END;
  v_order.laptop_locked := public.order_uses_laptop(
    v_order.laptop_id,
    v_order.is_active,
    v_order.order_status,
    v_order.payment_status,
    v_order.reservation_expires_at
  );
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_laptop_inventory(p_laptop_id BIGINT)
RETURNS laptops
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_laptop laptops%ROWTYPE;
  v_has_committed BOOLEAN;
  v_has_locked BOOLEAN;
BEGIN
  IF p_laptop_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_laptop
  FROM laptops
  WHERE id = p_laptop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laptop % does not exist', p_laptop_id;
  END IF;

  UPDATE orders
  SET laptop_locked = public.order_uses_laptop(
        laptop_id,
        is_active,
        order_status,
        payment_status,
        reservation_expires_at
      ),
      updated_at = timezone('utc'::text, now())
  WHERE laptop_id = p_laptop_id
    AND laptop_locked IS DISTINCT FROM public.order_uses_laptop(
      laptop_id,
      is_active,
      order_status,
      payment_status,
      reservation_expires_at
    );

  SELECT EXISTS (
    SELECT 1
    FROM orders
    WHERE laptop_id = p_laptop_id
      AND public.order_uses_laptop(
        laptop_id,
        is_active,
        order_status,
        payment_status,
        reservation_expires_at
      )
      AND order_status IN ('prepared', 'shipping', 'done')
  ) INTO v_has_committed;

  SELECT EXISTS (
    SELECT 1
    FROM orders
    WHERE laptop_id = p_laptop_id
      AND public.order_uses_laptop(
        laptop_id,
        is_active,
        order_status,
        payment_status,
        reservation_expires_at
      )
  ) INTO v_has_locked;

  IF COALESCE(v_laptop.status, '') IN ('not_imported', 'repairing', 'returned_cn', 'skipped') THEN
    UPDATE laptops
    SET is_locked = v_has_locked,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_laptop_id;
  ELSE
    UPDATE laptops
    SET is_locked = v_has_locked,
        status = CASE
          WHEN v_has_committed THEN 'sold'
          WHEN v_has_locked THEN 'deposited'
          WHEN status IN ('sold', 'deposited') THEN 'available'
          ELSE status
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_laptop_id;
  END IF;

  SELECT * INTO v_laptop FROM laptops WHERE id = p_laptop_id;
  RETURN v_laptop;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_order_payment(
  p_order_id BIGINT,
  p_amount NUMERIC,
  p_payment_type TEXT,
  p_payment_method TEXT DEFAULT 'transfer_cash',
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_reference_code TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_recorded_by TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_financial financial_records%ROWTYPE;
  v_new_amount_paid NUMERIC;
  v_old_uses BOOLEAN;
  v_new_uses BOOLEAN;
  v_old_committed BOOLEAN;
  v_new_committed BOOLEAN;
  v_laptop laptops%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF p_payment_type NOT IN ('deposit', 'balance', 'cod', 'refund', 'other') THEN
    RAISE EXCEPTION 'Unsupported payment type';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % does not exist', p_order_id;
  END IF;
  IF v_order.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot record payment for an inactive order';
  END IF;

  v_old_uses := public.order_uses_laptop(
    v_order.laptop_id,
    v_order.is_active,
    v_order.order_status,
    v_order.payment_status,
    v_order.reservation_expires_at
  );
  v_old_committed := v_old_uses AND v_order.order_status IN ('prepared', 'shipping', 'done');
  IF v_order.laptop_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(v_order.laptop_id);
  END IF;

  IF p_payment_type = 'refund' THEN
    IF p_amount > COALESCE(v_order.amount_paid, 0) THEN
      RAISE EXCEPTION 'Refund cannot exceed amount already paid';
    END IF;
    v_new_amount_paid := GREATEST(COALESCE(v_order.amount_paid, 0) - p_amount, 0);
    v_order.deposit_amount := LEAST(COALESCE(v_order.deposit_amount, 0), v_new_amount_paid);
    IF v_new_amount_paid = 0 THEN
      v_order.payment_status := 'refunded';
    END IF;
  ELSE
    IF COALESCE(v_order.amount_paid, 0) + p_amount > COALESCE(v_order.sale_price, 0) THEN
      RAISE EXCEPTION 'Payment exceeds order sale price';
    END IF;
    v_new_amount_paid := COALESCE(v_order.amount_paid, 0) + p_amount;
    v_order.amount_paid := v_new_amount_paid;
    IF p_payment_type = 'deposit' THEN
      v_order.deposit_amount := COALESCE(v_order.deposit_amount, 0) + p_amount;
    ELSIF p_payment_type = 'cod' THEN
      v_order.payment_status := 'cod';
    END IF;
  END IF;

  v_order.amount_paid := v_new_amount_paid;
  v_order := public.normalize_order_financials(v_order);

  INSERT INTO payments (
    order_id, payment_type, amount, payment_method, payment_date,
    reference_code, note, recorded_by
  ) VALUES (
    p_order_id,
    p_payment_type,
    p_amount,
    COALESCE(NULLIF(btrim(p_payment_method), ''), 'transfer_cash'),
    COALESCE(p_payment_date, CURRENT_DATE),
    p_reference_code,
    p_note,
    p_recorded_by
  ) RETURNING * INTO v_payment;

  INSERT INTO financial_records (
    record_type, category, amount, order_id, payment_id, occurred_on,
    payment_method, note, recorded_by
  ) VALUES (
    CASE WHEN p_payment_type = 'refund' THEN 'refund' ELSE 'income' END,
    p_payment_type,
    p_amount,
    p_order_id,
    v_payment.id,
    COALESCE(p_payment_date, CURRENT_DATE),
    COALESCE(NULLIF(btrim(p_payment_method), ''), 'transfer_cash'),
    p_note,
    p_recorded_by
  ) RETURNING * INTO v_financial;

  UPDATE orders
  SET amount_paid = v_order.amount_paid,
      deposit_amount = v_order.deposit_amount,
      debt_amount = v_order.debt_amount,
      payment_status = v_order.payment_status,
      laptop_locked = v_order.laptop_locked,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  v_new_uses := public.order_uses_laptop(
    v_order.laptop_id,
    v_order.is_active,
    v_order.order_status,
    v_order.payment_status,
    v_order.reservation_expires_at
  );
  v_new_committed := v_new_uses AND v_order.order_status IN ('prepared', 'shipping', 'done');
  IF v_order.laptop_id IS NOT NULL THEN
    v_laptop := public.refresh_laptop_inventory(v_order.laptop_id);
    IF v_old_uses IS DISTINCT FROM v_new_uses
       OR v_old_committed IS DISTINCT FROM v_new_committed THEN
      INSERT INTO stock_movements (laptop_id, order_id, movement_type, note, performed_by)
      VALUES (
        v_order.laptop_id,
        v_order.id,
        CASE
          WHEN NOT v_new_uses THEN 'RELEASED'
          WHEN v_new_committed THEN 'SOLD'
          ELSE 'RESERVED'
        END,
        'Laptop state synchronized by payment',
        p_recorded_by
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'financial_record', to_jsonb(v_financial),
    'order', to_jsonb(v_order),
    'laptop', CASE WHEN v_laptop.id IS NULL THEN NULL ELSE to_jsonb(v_laptop) END
  );
END;
$$;

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
  v_input := jsonb_populate_record(NULL::orders, COALESCE(p_order, '{}'::jsonb));
  v_input.created_at := COALESCE(v_input.created_at, timezone('utc'::text, now()));
  v_input.updated_at := COALESCE(v_input.updated_at, timezone('utc'::text, now()));
  v_input := public.normalize_order_financials(v_input);

  INSERT INTO orders (
    created_date, sale_online, sale_offline, note, order_type, order_status,
    payment_status, payment_method, delivery_status, shipping_method, laptop_id,
    sale_price, deposit_amount, deposit_note, cod_amount, amount_paid, debt_amount,
    credit_card_fee, profit_vnd, trade_in_laptop_id, customer_id, customer_info,
    customer_address, tracking_code, ship_date, setup_note, warranty, gifts,
    laptop_locked, reservation_expires_at, cancel_reason, cancelled_at, is_active,
    created_at, updated_at
  ) VALUES (
    v_input.created_date, v_input.sale_online, v_input.sale_offline, v_input.note,
    v_input.order_type, v_input.order_status, v_input.payment_status,
    v_input.payment_method, v_input.delivery_status, v_input.shipping_method,
    v_input.laptop_id, v_input.sale_price, v_input.deposit_amount, v_input.deposit_note,
    v_input.cod_amount, v_input.amount_paid, v_input.debt_amount, v_input.credit_card_fee,
    v_input.profit_vnd, v_input.trade_in_laptop_id, v_input.customer_id,
    v_input.customer_info, v_input.customer_address, v_input.tracking_code,
    v_input.ship_date, v_input.setup_note, v_input.warranty, v_input.gifts,
    v_input.laptop_locked, v_input.reservation_expires_at, v_input.cancel_reason,
    v_input.cancelled_at, v_input.is_active, v_input.created_at, v_input.updated_at
  ) RETURNING * INTO v_order;

  -- Keep the order opening balance and the payment ledger in sync.
  v_initial_deposit := LEAST(COALESCE(v_order.deposit_amount, 0), COALESCE(v_order.amount_paid, 0));
  v_initial_balance := GREATEST(COALESCE(v_order.amount_paid, 0) - v_initial_deposit, 0);
  IF v_initial_deposit > 0 THEN
    INSERT INTO payments (
      order_id, payment_type, amount, payment_method, payment_date, note, recorded_by
    ) VALUES (
      v_order.id,
      'deposit',
      v_initial_deposit,
      COALESCE(NULLIF(btrim(v_order.payment_method), ''), 'transfer_cash'),
      COALESCE(v_order.created_date, CURRENT_DATE),
      v_order.deposit_note,
      p_recorded_by
    ) RETURNING * INTO v_payment;
    v_created_payments := v_created_payments || jsonb_build_array(to_jsonb(v_payment));

    INSERT INTO financial_records (
      record_type, category, amount, order_id, payment_id, occurred_on,
      payment_method, note, recorded_by
    ) VALUES (
      'income', 'deposit', v_initial_deposit, v_order.id, v_payment.id,
      COALESCE(v_order.created_date, CURRENT_DATE),
      COALESCE(NULLIF(btrim(v_order.payment_method), ''), 'transfer_cash'),
      v_order.deposit_note,
      p_recorded_by
    );
  END IF;

  IF v_initial_balance > 0 THEN
    INSERT INTO payments (
      order_id, payment_type, amount, payment_method, payment_date, note, recorded_by
    ) VALUES (
      v_order.id,
      CASE WHEN v_order.payment_status = 'cod' THEN 'cod' ELSE 'balance' END,
      v_initial_balance,
      COALESCE(NULLIF(btrim(v_order.payment_method), ''), 'transfer_cash'),
      COALESCE(v_order.created_date, CURRENT_DATE),
      'Initial payment recorded with order',
      p_recorded_by
    ) RETURNING * INTO v_payment;
    v_created_payments := v_created_payments || jsonb_build_array(to_jsonb(v_payment));

    INSERT INTO financial_records (
      record_type, category, amount, order_id, payment_id, occurred_on,
      payment_method, note, recorded_by
    ) VALUES (
      'income',
      CASE WHEN v_order.payment_status = 'cod' THEN 'cod' ELSE 'balance' END,
      v_initial_balance,
      v_order.id,
      v_payment.id,
      COALESCE(v_order.created_date, CURRENT_DATE),
      COALESCE(NULLIF(btrim(v_order.payment_method), ''), 'transfer_cash'),
      'Initial payment recorded with order',
      p_recorded_by
    );
  END IF;

  IF v_order.laptop_id IS NOT NULL THEN
    v_laptop := public.refresh_laptop_inventory(v_order.laptop_id);
    IF v_order.laptop_locked IS TRUE THEN
      INSERT INTO stock_movements (laptop_id, order_id, movement_type, note, performed_by)
      VALUES (
        v_order.laptop_id,
        v_order.id,
        CASE WHEN v_order.order_status IN ('prepared', 'shipping', 'done') THEN 'SOLD' ELSE 'RESERVED' END,
        'Inventory updated by order transaction',
        p_recorded_by
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

  v_old_laptop_id := v_existing.laptop_id;
  v_new_laptop_id := v_next.laptop_id;
  v_old_uses := public.order_uses_laptop(
    v_existing.laptop_id,
    v_existing.is_active,
    v_existing.order_status,
    v_existing.payment_status,
    v_existing.reservation_expires_at
  );
  v_new_uses := public.order_uses_laptop(
    v_next.laptop_id,
    v_next.is_active,
    v_next.order_status,
    v_next.payment_status,
    v_next.reservation_expires_at
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

  UPDATE orders
  SET created_date = v_next.created_date,
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
      gifts = v_next.gifts,
      laptop_locked = v_next.laptop_locked,
      reservation_expires_at = v_next.reservation_expires_at,
      cancel_reason = v_next.cancel_reason,
      cancelled_at = v_next.cancelled_at,
      is_active = v_next.is_active,
      updated_at = v_next.updated_at
  WHERE id = v_order_id
  RETURNING * INTO v_order;

  IF v_old_laptop_id IS NOT NULL THEN
    v_previous_laptop := public.refresh_laptop_inventory(v_old_laptop_id);
  END IF;
  IF v_new_laptop_id IS NOT NULL THEN
    IF v_new_laptop_id = v_old_laptop_id THEN
      v_laptop := v_previous_laptop;
    ELSE
      v_laptop := public.refresh_laptop_inventory(v_new_laptop_id);
    END IF;
  END IF;

  IF v_old_laptop_id IS DISTINCT FROM v_new_laptop_id THEN
    IF v_old_laptop_id IS NOT NULL AND v_old_uses THEN
      INSERT INTO stock_movements (laptop_id, order_id, movement_type, note, performed_by)
      VALUES (v_old_laptop_id, v_order.id, 'RELEASED', 'Laptop released by order update', p_recorded_by);
    END IF;
    IF v_new_laptop_id IS NOT NULL AND v_new_uses THEN
      INSERT INTO stock_movements (laptop_id, order_id, movement_type, note, performed_by)
      VALUES (
        v_new_laptop_id,
        v_order.id,
        CASE WHEN v_new_committed THEN 'SOLD' ELSE 'RESERVED' END,
        'Laptop assigned by order update',
        p_recorded_by
      );
    END IF;
  ELSIF v_new_laptop_id IS NOT NULL
    AND (
      v_old_uses IS DISTINCT FROM v_new_uses
      OR v_old_committed IS DISTINCT FROM v_new_committed
    ) THEN
    INSERT INTO stock_movements (laptop_id, order_id, movement_type, note, performed_by)
    VALUES (
      v_new_laptop_id,
      v_order.id,
      CASE
        WHEN NOT v_new_uses THEN 'RELEASED'
        WHEN v_new_committed THEN 'SOLD'
        ELSE 'RESERVED'
      END,
      'Laptop state synchronized by order update',
      p_recorded_by
    );
  END IF;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'laptop', CASE WHEN v_laptop.id IS NULL THEN NULL ELSE to_jsonb(v_laptop) END,
    'previous_laptop', CASE WHEN v_old_laptop.id IS NULL THEN NULL ELSE to_jsonb(v_old_laptop) END,
    'inventory_applied', true
  );
END;
$$;

DO $$
DECLARE
  laptop_row RECORD;
BEGIN
  FOR laptop_row IN SELECT id FROM public.laptops LOOP
    PERFORM public.refresh_laptop_inventory(laptop_row.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.order_uses_laptop(BIGINT, BOOLEAN, TEXT, TEXT, TIMESTAMP WITH TIME ZONE)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_order_financials(orders)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_laptop_inventory(BIGINT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_order_payment(BIGINT, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_order_with_inventory(JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_order_with_inventory(JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_payment(BIGINT, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_order_with_inventory(JSONB, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.update_order_with_inventory(JSONB, TEXT)
  TO service_role;

REVOKE UPDATE, DELETE ON public.activity_logs FROM service_role;
GRANT SELECT, INSERT ON public.activity_logs TO service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_activity_log_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_activity_log_mutation() TO service_role;
COMMIT;
