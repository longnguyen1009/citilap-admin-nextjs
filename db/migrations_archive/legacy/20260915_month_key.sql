-- Migration: Thêm trường month_key vào laptops và orders
-- month_key dạng "MM/YYYY" (vd: "09/2026")
-- Dùng cho bộ lọc theo tháng: query đơn giản WHERE month_key = selectedMonth

BEGIN;

-- 1. Thêm cột month_key vào laptops
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS month_key VARCHAR(10);
CREATE INDEX IF NOT EXISTS idx_laptops_month_key ON public.laptops (month_key);

-- 2. Thêm cột month_key vào orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS month_key VARCHAR(10);
CREATE INDEX IF NOT EXISTS idx_orders_month_key ON public.orders (month_key);

-- 3. Backfill laptops: month_key từ import_date, fallback created_at
UPDATE public.laptops
SET month_key = COALESCE(
  TO_CHAR(import_date, 'MM/YYYY'),
  TO_CHAR(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MM/YYYY')
)
WHERE month_key IS NULL;

-- 4. Backfill orders: month_key từ created_date, fallback created_at
UPDATE public.orders
SET month_key = COALESCE(
  TO_CHAR(created_date, 'MM/YYYY'),
  TO_CHAR(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MM/YYYY')
)
WHERE month_key IS NULL;

COMMIT;
