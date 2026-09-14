BEGIN;

-- Hạn bảo hành nguồn accepts free-form values such as "2028" or "11/2028".
ALTER TABLE public.laptops
  ALTER COLUMN warranty_supplier TYPE TEXT
  USING warranty_supplier::TEXT;

COMMIT;
