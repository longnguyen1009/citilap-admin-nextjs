-- Chạy lệnh này trên trình SQL Editor của Supabase để xóa các cột
ALTER TABLE laptops 
DROP COLUMN IF EXISTS wholesale_price_vnd, 
DROP COLUMN IF EXISTS retail_price_vnd, 
DROP COLUMN IF EXISTS custom_profit;
