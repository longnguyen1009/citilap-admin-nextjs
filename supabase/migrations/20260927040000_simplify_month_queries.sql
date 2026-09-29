BEGIN;
-- Keep the equivalent unique index: serial uniqueness is unchanged.
DO $$
BEGIN
  IF to_regclass('public.laptops_serial_unique_ci_idx') IS NOT NULL
     AND to_regclass('public.laptops_serial_unique_idx') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_index a JOIN pg_index b
       ON a.indrelid=b.indrelid AND a.indkey=b.indkey
         AND a.indclass=b.indclass AND a.indcollation=b.indcollation
         AND a.indoption=b.indoption
       WHERE a.indexrelid=to_regclass('public.laptops_serial_unique_ci_idx')
         AND b.indexrelid=to_regclass('public.laptops_serial_unique_idx')
         AND a.indisunique AND b.indisunique AND a.indisvalid AND b.indisvalid
         AND pg_get_expr(a.indexprs,a.indrelid) IS NOT DISTINCT FROM pg_get_expr(b.indexprs,b.indrelid)
         AND pg_get_expr(a.indpred,a.indrelid) IS NOT DISTINCT FROM pg_get_expr(b.indpred,b.indrelid)
     ) THEN
    DROP INDEX public.laptops_serial_unique_idx;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_data_months(p_scope text DEFAULT 'operations')
RETURNS TABLE(month_key text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  SELECT m FROM (
    SELECT l.month_key::text m FROM public.laptops l
      WHERE p_scope='operations' AND l.is_active IS TRUE
    UNION
    SELECT o.month_key::text FROM public.orders o
      WHERE p_scope='operations' AND o.is_active IS TRUE
    UNION
    SELECT to_char(b.purchase_date,'MM/YYYY') FROM public.purchase_batches b
      WHERE p_scope='purchases'
  ) months
  WHERE m ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
  ORDER BY right(m,4) DESC, left(m,2) DESC;
$$;
REVOKE ALL ON FUNCTION public.list_data_months(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_data_months(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
