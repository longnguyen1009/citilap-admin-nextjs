-- Preserve all business rows. Abort on unexpected dependencies; never CASCADE.
BEGIN;
DO $$
BEGIN
  -- The validated role check already enforces exactly the same expression.
  IF EXISTS (
    SELECT 1 FROM pg_constraint kept JOIN pg_constraint redundant
      ON kept.conrelid=redundant.conrelid AND kept.conbin=redundant.conbin
    WHERE kept.conrelid='public.user_profiles'::regclass
      AND kept.conname='user_profiles_role_check' AND kept.contype='c' AND kept.convalidated
      AND redundant.conname='user_profiles_role_valid' AND redundant.contype='c'
  ) THEN
    ALTER TABLE public.user_profiles DROP CONSTRAINT user_profiles_role_valid;
  END IF;
  -- UNIQUE(column) also rejects duplicate non-null values; NULL stays allowed.
  IF EXISTS (
    SELECT 1 FROM pg_index kept JOIN pg_index redundant
      ON kept.indrelid=redundant.indrelid AND kept.indkey=redundant.indkey
        AND kept.indclass=redundant.indclass AND kept.indcollation=redundant.indcollation
        AND kept.indoption=redundant.indoption
    WHERE kept.indexrelid=to_regclass('public.trade_ins_inventory_laptop_id_key')
      AND redundant.indexrelid=to_regclass('public.trade_ins_inventory_source_unique')
      AND kept.indisunique AND kept.indisvalid AND kept.indimmediate
      AND kept.indpred IS NULL AND kept.indexprs IS NULL
      AND redundant.indisunique AND redundant.indisvalid AND redundant.indexprs IS NULL
      AND pg_get_expr(redundant.indpred,redundant.indrelid)='(inventory_laptop_id IS NOT NULL)'
  ) THEN
    DROP INDEX public.trade_ins_inventory_source_unique;
  END IF;
END $$;
-- No trigger or runtime caller uses these old status-specific guards.
-- laptops_status_workflow_guard is the authoritative transition guard.
DROP FUNCTION IF EXISTS public.guard_repair_laptop_transition();
DROP FUNCTION IF EXISTS public.guard_supplier_return_laptop_transition();
NOTIFY pgrst,'reload schema';
COMMIT;
