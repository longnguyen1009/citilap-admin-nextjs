BEGIN;

-- Chuẩn hóa dữ liệu cũ trước khi gắn constraint, tránh migration fail trên row vi phạm.
UPDATE public.orders
SET deposit_amount = LEAST(GREATEST(COALESCE(deposit_amount, 0), 0), GREATEST(COALESCE(sale_price, 0), 0))
WHERE deposit_amount IS NOT NULL
  AND (deposit_amount < 0 OR deposit_amount > GREATEST(COALESCE(sale_price, 0), 0));

UPDATE public.orders
SET amount_paid = LEAST(GREATEST(COALESCE(amount_paid, 0), 0), GREATEST(COALESCE(sale_price, 0), 0))
WHERE amount_paid IS NOT NULL
  AND (amount_paid < 0 OR amount_paid > GREATEST(COALESCE(sale_price, 0), 0));

UPDATE public.orders
SET cod_amount = LEAST(
  GREATEST(COALESCE(cod_amount, 0), 0),
  GREATEST(GREATEST(COALESCE(sale_price, 0), 0) - COALESCE(amount_paid, 0), 0)
)
WHERE cod_amount IS NOT NULL
  AND (cod_amount < 0 OR cod_amount > GREATEST(GREATEST(COALESCE(sale_price, 0), 0) - COALESCE(amount_paid, 0), 0));

-- Keep order payment totals internally consistent at database level.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_deposit_amount_lte_sale_price_chk,
  DROP CONSTRAINT IF EXISTS orders_amount_paid_lte_sale_price_chk,
  DROP CONSTRAINT IF EXISTS orders_cod_amount_lte_debt_amount_chk;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_deposit_amount_lte_sale_price_chk
    CHECK (COALESCE(deposit_amount, 0) >= 0 AND COALESCE(deposit_amount, 0) <= COALESCE(sale_price, 0)),
  ADD CONSTRAINT orders_amount_paid_lte_sale_price_chk
    CHECK (COALESCE(amount_paid, 0) >= 0 AND COALESCE(amount_paid, 0) <= COALESCE(sale_price, 0)),
  ADD CONSTRAINT orders_cod_amount_lte_debt_amount_chk
    CHECK (COALESCE(cod_amount, 0) >= 0 AND COALESCE(cod_amount, 0) <= GREATEST(COALESCE(sale_price, 0) - COALESCE(amount_paid, 0), 0));

-- Payment status is an explicit order field; totals are normalized separately.
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

  IF v_order.laptop_id IS NOT NULL
     AND v_order.is_active IS TRUE
     AND v_order.reservation_expires_at IS NULL
     AND (v_order.order_status = 'deposited' OR v_order.payment_status = 'deposited') THEN
    v_order.reservation_expires_at := timezone('utc'::text, now()) + INTERVAL '48 hours';
  END IF;

  v_order.payment_status := lower(btrim(COALESCE(v_order.payment_status, '')));
  IF v_order.payment_status NOT IN ('unpaid', 'deposited', 'cod', 'paid', 'refunded') THEN
    v_order.payment_status := 'unpaid';
  END IF;
  v_order.laptop_locked := public.order_uses_laptop(
    v_order.laptop_id, v_order.is_active, v_order.order_status,
    v_order.payment_status, v_order.reservation_expires_at
  );
  RETURN v_order;
END;
$$;

COMMIT;
