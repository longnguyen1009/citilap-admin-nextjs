BEGIN;

-- A deposited order may wait indefinitely for a physical laptop allocation.
-- Once allocated, the machine remains assigned until a user explicitly changes
-- or releases it; order allocations no longer expire by time.
UPDATE public.orders
   SET reservation_expires_at = NULL
 WHERE reservation_expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.clear_order_allocation_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
BEGIN
  NEW.reservation_expires_at := NULL;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS orders_clear_allocation_expiry ON public.orders;
CREATE TRIGGER orders_clear_allocation_expiry
BEFORE INSERT OR UPDATE OF reservation_expires_at ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.clear_order_allocation_expiry();

COMMIT;
