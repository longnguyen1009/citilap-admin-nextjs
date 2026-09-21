-- Live verification fix: a laptop waiting for QC must never enter the sales workflow.
-- Apply after 20260922_phase2_logistics.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_order_sellable_laptop()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public,pg_temp
AS $$
DECLARE candidate_id bigint; candidate_status text;
BEGIN
  candidate_id:=coalesce(NEW.laptop_id,NEW.requested_laptop_id);
  IF candidate_id IS NULL THEN RETURN NEW; END IF;

  -- Existing orders may legitimately keep editing the same laptop after it became sold.
  IF TG_OP='UPDATE'
     AND candidate_id=coalesce(OLD.laptop_id,OLD.requested_laptop_id)
     AND NEW.laptop_id IS NOT DISTINCT FROM OLD.laptop_id
     AND NEW.requested_laptop_id IS NOT DISTINCT FROM OLD.requested_laptop_id THEN
    RETURN NEW;
  END IF;

  SELECT status INTO candidate_status FROM public.laptops WHERE id=candidate_id AND is_active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop không tồn tại hoặc đã ngừng sử dụng'; END IF;
  IF coalesce(candidate_status,'') NOT IN('available','deposited') THEN
    RAISE EXCEPTION 'Laptop chưa sẵn sàng để bán (trạng thái: %)',coalesce(candidate_status,'không xác định');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_order_sellable_laptop_trigger ON public.orders;
CREATE TRIGGER guard_order_sellable_laptop_trigger
BEFORE INSERT OR UPDATE OF laptop_id,requested_laptop_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_sellable_laptop();

REVOKE ALL ON FUNCTION public.guard_order_sellable_laptop() FROM PUBLIC,anon,authenticated;
COMMIT;
