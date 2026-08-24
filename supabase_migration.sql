-- Tạo bảng customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bật RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Chính sách: Ai cũng có thể đọc (đã đăng nhập)
CREATE POLICY "Cho phép đọc khách hàng" ON customers FOR SELECT USING (auth.role() = 'authenticated');
-- Chính sách: Ai cũng có thể tạo mới/cập nhật (đã đăng nhập)
CREATE POLICY "Cho phép ghi khách hàng" ON customers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Cho phép cập nhật khách hàng" ON customers FOR UPDATE USING (auth.role() = 'authenticated');

-- Cập nhật bảng orders
ALTER TABLE orders
  ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  DROP COLUMN IF EXISTS customer_info,
  DROP COLUMN IF EXISTS customer_address,
  DROP COLUMN IF EXISTS amount_paid,
  DROP COLUMN IF EXISTS debt_amount;

-- Xóa bảng payments (sổ quỹ) vì không dùng nữa
DROP TABLE IF EXISTS payments;
