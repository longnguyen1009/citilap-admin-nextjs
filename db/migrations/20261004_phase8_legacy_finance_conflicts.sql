-- Phase 8 preflight for Dev databases that already contain an unused legacy
-- finance prototype. Preserve those objects under legacy_* names so the
-- authoritative Phase 8 schema can be created without dropping data.
BEGIN;

DO $$
DECLARE row_count bigint;
BEGIN
  IF to_regclass('public.account_transactions') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='account_transactions' AND column_name='performed_by')
     AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='account_transactions' AND column_name='direction') THEN
    IF to_regclass('public.legacy_account_transactions') IS NOT NULL THEN RAISE EXCEPTION 'legacy_account_transactions đã tồn tại; cần kiểm tra thủ công';END IF;
    EXECUTE 'SELECT count(*) FROM public.account_transactions' INTO row_count;
    IF row_count<>0 THEN RAISE EXCEPTION 'account_transactions legacy có % dòng; dừng để lập migration dữ liệu',row_count;END IF;
    ALTER TABLE public.account_transactions RENAME TO legacy_account_transactions;
  END IF;

  IF to_regclass('public.cod_receivables') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cod_receivables' AND column_name='cod_amount')
     AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cod_receivables' AND column_name='expected_cod_amount_vnd') THEN
    IF to_regclass('public.legacy_cod_receivables') IS NOT NULL THEN RAISE EXCEPTION 'legacy_cod_receivables đã tồn tại; cần kiểm tra thủ công';END IF;
    EXECUTE 'SELECT count(*) FROM public.cod_receivables' INTO row_count;
    IF row_count<>0 THEN RAISE EXCEPTION 'cod_receivables legacy có % dòng; dừng để lập migration dữ liệu',row_count;END IF;
    ALTER TABLE public.cod_receivables RENAME TO legacy_cod_receivables;
  END IF;

  IF to_regclass('public.cod_settlements') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cod_settlements' AND column_name='batch_code')
     AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cod_settlements' AND column_name='cod_receivable_id') THEN
    IF to_regclass('public.legacy_cod_settlements') IS NOT NULL THEN RAISE EXCEPTION 'legacy_cod_settlements đã tồn tại; cần kiểm tra thủ công';END IF;
    EXECUTE 'SELECT count(*) FROM public.cod_settlements' INTO row_count;
    IF row_count<>0 THEN RAISE EXCEPTION 'cod_settlements legacy có % dòng; dừng để lập migration dữ liệu',row_count;END IF;
    ALTER TABLE public.cod_settlements RENAME TO legacy_cod_settlements;
  END IF;
END $$;

COMMIT;
