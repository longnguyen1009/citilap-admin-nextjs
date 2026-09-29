-- Cycle count is no longer part of the product data model.
ALTER TABLE IF EXISTS public.laptops
  DROP COLUMN IF EXISTS cycle_count;
