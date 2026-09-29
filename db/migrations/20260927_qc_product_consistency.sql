-- Incremental upgrade for databases already using the clean baseline.
-- Preserve detailed QC enums on the inspection and project compatible values
-- into the product fields used by Inventory and Settings.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_laptop_purchase_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.purchase_price_rmb IS DISTINCT FROM OLD.purchase_price_rmb THEN
      IF NEW.price_rmb IS DISTINCT FROM OLD.price_rmb AND NEW.price_rmb IS DISTINCT FROM NEW.purchase_price_rmb THEN
        RAISE EXCEPTION 'Giá mua và giá nhập không thống nhất';
      END IF;
      NEW.price_rmb := NEW.purchase_price_rmb;
    ELSIF NEW.price_rmb IS DISTINCT FROM OLD.price_rmb THEN
      NEW.purchase_price_rmb := coalesce(NEW.price_rmb,0);
    END IF;
    IF NEW.purchase_exchange_rate IS DISTINCT FROM OLD.purchase_exchange_rate THEN
      IF NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate AND NEW.exchange_rate IS DISTINCT FROM NEW.purchase_exchange_rate THEN
        RAISE EXCEPTION 'Tỷ giá mua và tỷ giá nhập không thống nhất';
      END IF;
      NEW.exchange_rate := NEW.purchase_exchange_rate;
    ELSIF NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate THEN
      NEW.purchase_exchange_rate := NEW.exchange_rate;
    END IF;
    IF NEW.tracking_code_cn IS DISTINCT FROM OLD.tracking_code_cn THEN
      NEW.tracking_code := nullif(NEW.tracking_code_cn,'');
    ELSIF NEW.tracking_code IS DISTINCT FROM OLD.tracking_code THEN
      NEW.tracking_code_cn := coalesce(NEW.tracking_code,'');
    END IF;
  ELSE
    IF coalesce(NEW.purchase_price_rmb,0)=0 AND coalesce(NEW.price_rmb,0)>0 THEN
      NEW.purchase_price_rmb := NEW.price_rmb;
    END IF;
    NEW.price_rmb := NEW.purchase_price_rmb;
    NEW.purchase_exchange_rate := coalesce(NEW.purchase_exchange_rate,NEW.exchange_rate);
    NEW.exchange_rate := NEW.purchase_exchange_rate;
    NEW.tracking_code_cn := coalesce(nullif(NEW.tracking_code_cn,''),NEW.tracking_code,'');
    NEW.tracking_code := nullif(NEW.tracking_code_cn,'');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_completed_qc_product()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status <> 'COMPLETED' OR OLD.status = 'COMPLETED' THEN RETURN NEW; END IF;
  IF NEW.result = 'PASS' AND NOT EXISTS (
    SELECT 1 FROM public.qc_check_items
    WHERE qc_inspection_id = NEW.id AND requirement = 'REQUIRED'
  ) THEN
    RAISE EXCEPTION 'Không thể hoàn tất QC đạt khi thiếu checklist bắt buộc';
  END IF;

  UPDATE public.laptops SET
    charger_status = CASE NEW.charger_status
      WHEN 'MISSING' THEN 'no_charger'
      WHEN 'UNKNOWN' THEN 'unchecked'
      ELSE 'with_charger' END,
    mainboard_status = CASE NEW.mainboard_status
      WHEN 'ORIGINAL' THEN 'ok'
      WHEN 'OFFICIAL_REPLACED' THEN 'ok'
      WHEN 'REPAIRED' THEN 'error'
      ELSE NULL END,
    screen_status = (SELECT CASE result WHEN 'PASS' THEN 'ok'
      WHEN 'FAIL' THEN 'error' WHEN 'WARNING' THEN 'error' ELSE NULL END
      FROM public.qc_check_items WHERE qc_inspection_id = NEW.id AND check_key = 'screen'),
    camera_mic_status = (SELECT CASE
      WHEN bool_or(result IN ('FAIL','WARNING')) THEN 'error'
      WHEN count(*) = 2 AND bool_and(result = 'PASS') THEN 'ok'
      ELSE NULL END FROM public.qc_check_items
      WHERE qc_inspection_id = NEW.id AND check_key IN ('camera','microphone'))
  WHERE id = NEW.laptop_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_completed_qc_product ON public.qc_inspections;
CREATE TRIGGER sync_completed_qc_product AFTER UPDATE OF status ON public.qc_inspections
FOR EACH ROW EXECUTE FUNCTION public.sync_completed_qc_product();
REVOKE ALL ON FUNCTION public.sync_completed_qc_product() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
