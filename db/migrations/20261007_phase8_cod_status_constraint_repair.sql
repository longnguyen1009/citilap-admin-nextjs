-- Phase 8 live repair: remove legacy duplicate COD status checks that reject DELIVERED.
BEGIN;

DO $$ DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN
   SELECT conname FROM pg_constraint
   WHERE conrelid='public.cod_receivables'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) ILIKE '%status%'
 LOOP
   EXECUTE format('ALTER TABLE public.cod_receivables DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $$;

ALTER TABLE public.cod_receivables
  ADD CONSTRAINT cod_receivables_status_check
  CHECK(status IN(
    'PENDING_DELIVERY','DELIVERED','WAITING_SETTLEMENT','PARTIALLY_SETTLED',
    'SETTLED','DISPUTED','RETURNED','CANCELLED'
  ));

COMMIT;
