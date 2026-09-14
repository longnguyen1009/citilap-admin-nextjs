BEGIN;

-- Payment status is an explicit order field. Financial totals are still
-- normalized, but they must not overwrite the option selected by the user.
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
  v_order.deposit_amount := LEAST(v_order.sale_price, GREATEST(COALESCE(v_order.deposit_amount, 0), 0));
  v_order.amount_paid := LEAST(v_order.sale_price,
    GREATEST(COALESCE(v_order.amount_paid, 0), v_order.deposit_amount));
  v_order.debt_amount := GREATEST(v_order.sale_price - v_order.amount_paid, 0);
  v_order.cod_amount := LEAST(v_order.debt_amount, GREATEST(COALESCE(v_order.cod_amount, 0), 0));
  v_order.credit_card_fee := GREATEST(COALESCE(v_order.credit_card_fee, 0), 0);
  v_order.profit_vnd := COALESCE(v_order.profit_vnd, 0);

  v_order.payment_status := lower(btrim(COALESCE(v_order.payment_status, '')));
  IF v_order.payment_status NOT IN ('unpaid', 'deposited', 'cod', 'paid', 'refunded') THEN
    v_order.payment_status := 'unpaid';
  END IF;

  IF v_order.laptop_id IS NOT NULL
     AND v_order.is_active IS TRUE
     AND v_order.reservation_expires_at IS NULL
     AND (v_order.order_status = 'deposited' OR v_order.payment_status = 'deposited') THEN
    v_order.reservation_expires_at := timezone('utc'::text, now()) + INTERVAL '48 hours';
  END IF;

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

REVOKE ALL ON FUNCTION public.normalize_order_financials(orders)
  FROM PUBLIC, anon, authenticated;

COMMIT;
