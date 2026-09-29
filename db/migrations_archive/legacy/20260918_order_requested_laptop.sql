-- Allow several deposit orders to reference the same requested laptop/model
-- while keeping the physical allocation in orders.laptop_id exclusive.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS requested_laptop_id BIGINT REFERENCES public.laptops(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_requested_laptop_idx
  ON public.orders (requested_laptop_id, is_active, order_status, payment_status);

-- Existing deposit rows used laptop_id for the requested product. Move those
-- references to the non-exclusive column; committed orders keep their actual
-- laptop allocation in laptop_id.
UPDATE public.orders
SET requested_laptop_id = laptop_id,
    laptop_id = NULL,
    laptop_locked = false,
    updated_at = timezone('utc'::text, now())
WHERE requested_laptop_id IS NULL
  AND laptop_id IS NOT NULL
  AND is_active IS TRUE
  AND (order_status = 'deposited' OR payment_status = 'deposited')
  AND order_status NOT IN ('prepared', 'shipping', 'done');

-- Keep the inventory badge visible while a deposit is waiting for a physical
-- allocation. requested_laptop_id does not lock the unit, but it does keep the
-- laptop in the "deposited" state until all such deposits expire/cancel.
CREATE OR REPLACE FUNCTION public.refresh_laptop_inventory(p_laptop_id BIGINT)
RETURNS public.laptops
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_laptop public.laptops%ROWTYPE;
  v_has_committed BOOLEAN;
  v_has_locked BOOLEAN;
  v_has_requested BOOLEAN;
BEGIN
  IF p_laptop_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_laptop FROM public.laptops WHERE id = p_laptop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop % does not exist', p_laptop_id; END IF;

  UPDATE public.orders
  SET laptop_locked = public.order_uses_laptop(
        laptop_id, is_active, order_status, payment_status, reservation_expires_at
      ),
      updated_at = timezone('utc'::text, now())
  WHERE laptop_id = p_laptop_id
    AND laptop_locked IS DISTINCT FROM public.order_uses_laptop(
      laptop_id, is_active, order_status, payment_status, reservation_expires_at
    );

  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE laptop_id = p_laptop_id
      AND public.order_uses_laptop(laptop_id, is_active, order_status, payment_status, reservation_expires_at)
      AND order_status IN ('prepared', 'shipping', 'done')
  ) INTO v_has_committed;

  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE laptop_id = p_laptop_id
      AND public.order_uses_laptop(laptop_id, is_active, order_status, payment_status, reservation_expires_at)
  ) INTO v_has_locked;

  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE requested_laptop_id = p_laptop_id
      AND laptop_id IS NULL
      AND is_active IS TRUE
      AND COALESCE(payment_status, '') <> 'refunded'
      AND COALESCE(order_status, '') NOT IN ('cancelled', 'returned')
      AND (order_status = 'deposited' OR payment_status = 'deposited')
      AND (reservation_expires_at IS NULL OR reservation_expires_at > CURRENT_TIMESTAMP)
  ) INTO v_has_requested;

  IF COALESCE(v_laptop.status, '') IN ('not_imported', 'repairing', 'returned_cn', 'skipped') THEN
    UPDATE public.laptops SET is_locked = v_has_locked, updated_at = timezone('utc'::text, now()) WHERE id = p_laptop_id;
  ELSE
    UPDATE public.laptops
    SET is_locked = v_has_locked,
        status = CASE
          WHEN v_has_committed THEN 'sold'
          WHEN v_has_locked OR v_has_requested THEN 'deposited'
          WHEN status IN ('sold', 'deposited') THEN 'available'
          ELSE status
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_laptop_id;
  END IF;

  SELECT * INTO v_laptop FROM public.laptops WHERE id = p_laptop_id;
  RETURN v_laptop;
END;
$$;

-- Recalculate badges for laptops affected by the backfill immediately.
DO $$
DECLARE
  v_laptop_id BIGINT;
BEGIN
  FOR v_laptop_id IN
    SELECT DISTINCT requested_laptop_id
    FROM public.orders
    WHERE requested_laptop_id IS NOT NULL
  LOOP
    PERFORM public.refresh_laptop_inventory(v_laptop_id);
  END LOOP;
END;
$$;

-- The Next.js server uses Supabase's service role for this backend RPC.
GRANT EXECUTE ON FUNCTION public.refresh_laptop_inventory(BIGINT) TO service_role;
