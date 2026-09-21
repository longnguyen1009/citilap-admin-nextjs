-- Phase 8 final regression repair: keep Repair -> landed-cost sync compatible
-- with the actual repair_jobs schema, which records created_by but no completed_by.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_repair_cost_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF NEW.status='COMPLETED' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.sync_laptop_cost_components(
      NEW.laptop_id,
      coalesce(nullif(NEW.created_by,''),'SYSTEM')
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS repair_sync_landed_cost ON public.repair_jobs;
CREATE TRIGGER repair_sync_landed_cost
AFTER UPDATE OF status ON public.repair_jobs
FOR EACH ROW
EXECUTE FUNCTION public.sync_repair_cost_trigger();

REVOKE ALL ON FUNCTION public.sync_repair_cost_trigger() FROM PUBLIC,anon,authenticated;

COMMIT;
