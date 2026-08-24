-- SCRIPT SỬA LỖI 500 (INTERNAL SERVER ERROR) DO RLS ĐỆ QUY VÔ HẠN
-- Vui lòng chạy đoạn mã này trong mục SQL Editor của Supabase

-- 1. Xóa Policy cũ (gây ra lỗi vòng lặp đệ quy trên bảng user_profiles)
DROP POLICY IF EXISTS "Chỉ ADMIN được ghi user_profiles" ON user_profiles;

-- 2. Tách riêng các Policy cho hành động INSERT, UPDATE, DELETE thay vì dùng "FOR ALL"
CREATE POLICY "Chỉ ADMIN được cập nhật user_profiles" ON user_profiles FOR UPDATE USING (
  (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'ADMIN'
);

CREATE POLICY "Chỉ ADMIN được xóa user_profiles" ON user_profiles FOR DELETE USING (
  (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'ADMIN'
);

CREATE POLICY "Chỉ ADMIN được tạo user_profiles" ON user_profiles FOR INSERT WITH CHECK (
  (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'ADMIN'
);
