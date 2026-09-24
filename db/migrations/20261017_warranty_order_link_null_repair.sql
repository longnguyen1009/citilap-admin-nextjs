-- PostgreSQL NOT IN becomes unknown when one compared order laptop column is
-- NULL. Use null-safe comparisons so either valid laptop reference may match,
-- while an unrelated device is always rejected.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_warranty_case_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  NEW.status := lower(trim(coalesce(NEW.status, '')));
  IF NEW.status NOT IN ('received', 'checking', 'wait_parts', 'repairing', 'done', 'swap_device', 'refunded') THEN
    RAISE EXCEPTION 'Trạng thái bảo hành không hợp lệ';
  END IF;
  IF NEW.laptop_id IS NULL THEN
    RAISE EXCEPTION 'Phiếu bảo hành phải gắn với laptop';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.laptop_id IS DISTINCT FROM OLD.laptop_id THEN
    RAISE EXCEPTION 'Không thể đổi máy gốc của phiếu bảo hành';
  END IF;

  IF NEW.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
    IF NOT FOUND OR (
      NEW.laptop_id IS DISTINCT FROM v_order.laptop_id
      AND NEW.laptop_id IS DISTINCT FROM v_order.requested_laptop_id
    ) THEN
      RAISE EXCEPTION 'Đơn gốc không thuộc máy đang tiếp nhận bảo hành';
    END IF;
  END IF;

  IF NEW.status IN ('done', 'swap_device', 'refunded') THEN
    NEW.resolved_date := coalesce(NEW.resolved_date, current_date);
  ELSE
    NEW.resolved_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_warranty_case_integrity()
FROM PUBLIC, anon, authenticated;

COMMIT;
