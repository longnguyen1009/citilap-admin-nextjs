-- Keep warranty cases attached to the sold laptop and its originating order,
-- and prevent parallel open cases for the same physical device.
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
    IF NOT FOUND OR NEW.laptop_id NOT IN (v_order.laptop_id, v_order.requested_laptop_id) THEN
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

DROP TRIGGER IF EXISTS warranty_cases_enforce_integrity ON public.warranty_cases;
CREATE TRIGGER warranty_cases_enforce_integrity
BEFORE INSERT OR UPDATE OF laptop_id, order_id, status, resolved_date
ON public.warranty_cases
FOR EACH ROW EXECUTE FUNCTION public.enforce_warranty_case_integrity();

CREATE UNIQUE INDEX IF NOT EXISTS warranty_cases_one_open_per_laptop_idx
ON public.warranty_cases(laptop_id)
WHERE status IN ('received', 'checking', 'wait_parts', 'repairing');

REVOKE ALL ON FUNCTION public.enforce_warranty_case_integrity()
FROM PUBLIC, anon, authenticated;

COMMIT;
