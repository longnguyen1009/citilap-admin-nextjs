-- CitiLap Admin: Round 2 fixes.
-- Requires Postgres 15+ for partial unique indexes and NOT VALID + VALIDATE CONSTRAINT.
-- DOES NOT drop business data.

BEGIN;

-- 1) Normalize legacy laptop status text created by earlier soft-delete logic.
UPDATE public.laptops
SET status = 'inactive'
WHERE status = 'NGỪNG HOẠT ĐỘNG';

-- 2) Enforce unique serials where the value exists.
--    Lower-trim index only on non-empty serials; fails fast on duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS laptops_serial_unique_ci_idx
  ON public.laptops (lower(btrim(serial)))
  WHERE serial IS NOT NULL AND btrim(serial) <> '';

-- 3) Enforce unique phone numbers when the value exists.
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique_ci_idx
  ON public.customers (lower(btrim(phone)))
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

COMMIT;
