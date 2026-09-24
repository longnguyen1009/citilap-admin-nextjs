# Làm mới database và seed tháng 06–09/2026

## Chạy trên Supabase

Trong SQL Editor của đúng project thử nghiệm, chạy lần lượt:

1. Toàn bộ `init_full_db.sql`: thay thế schema `public`, bao gồm đủ 41 migration đến `20261017`. Xóa dữ liệu nghiệp vụ cũ; giữ `auth.users` và khôi phục các `user_profiles` hiện có, gồm vai trò ADMIN/nhân viên. Không tạo hoặc đổi mật khẩu.
2. Sau khi bước 1 thành công, chạy toàn bộ `reseed_data.sql`.
3. Tải lại ứng dụng và chọn tháng 06, 07, 08 hoặc 09/2026.

Mỗi file có transaction riêng: lỗi trong một file sẽ rollback file đó. Nếu init thành công nhưng seed lỗi, schema mới vẫn tồn tại; sửa lỗi rồi chạy lại seed. Không cần chạy lại 41 migration sau init.

Nếu chỉ cần thay dữ liệu trên schema đã cập nhật đầy đủ, chạy riêng `reseed_data.sql`. File này xóa dữ liệu nghiệp vụ và lịch sử liên quan qua `TRUNCATE ... CASCADE`, giữ tài khoản, danh mục tùy chọn, chi nhánh và phụ kiện. Cấu hình công thức trở về giá trị seed.

## Dữ liệu mẫu

| Tháng | Laptop | Đơn hàng | Thanh toán |
|---|---:|---:|---:|
| 06/2026 | 120 | 80 | 104 |
| 07/2026 | 120 | 80 | 104 |
| 08/2026 | 120 | 80 | 104 |
| 09/2026 | 120 | 80 | 104 |
| Tổng | 480 | 320 | 416 |

Mỗi tháng: 40 đơn hoàn thành, 8 đơn đặt cọc, 8 chuẩn bị giao, 8 đang giao COD, 8 đơn mới và 8 đơn hủy. Có khách hàng, serial riêng, giá bán lẻ/bán buôn, đặt cọc và trả phần còn lại. Ngày thu nằm trong đúng tháng nghiệp vụ.

Ba tài khoản mẫu: tiền mặt VND, ngân hàng VND và WeChat CNY. 416 thanh toán đi qua RPC và khớp 416 giao dịch sổ tài khoản. Có 32 khoản COD đang giao. Đơn và thanh toán tính bằng **triệu VND**; sổ tài khoản và thành phần giá vốn tính bằng **VND**.

Laptop là tồn đầu kỳ nhập trực tiếp; giá vốn đã được ghi nhận bằng thành phần chi phí mở đầu. Vì không giả lập chứng từ mua hàng/vận chuyển/QC, trạng thái nguồn giá vốn là `LEGACY`, không phải lô mua `COMPLETE`. Các màn hình nghiệp vụ mở rộng khởi đầu trống, trừ khoản COD nói trên. `created_at` của ledger là thời điểm seed; báo cáo lịch sử dùng ngày nghiệp vụ, không sửa lịch sử bất biến sau khi ghi.

## Kiểm chứng và bảo trì

- `node qa/build-db-init.mjs`: tái tạo init từ `db/bootstrap/legacy_core.sql` và toàn bộ migration được sắp theo tên. Không sửa tay file init sinh ra.
- `node qa/validate-db-reset.mjs`: kiểm tra bằng PGlite độc lập; cần `@electric-sql/pglite` trong thư mục tạm `citilap-db-validation`.
- Đã đạt 7 nhóm kiểm tra: init sạch; seed lần đầu; seed lặp lại; init lặp lại giữ profile; seed sau reset; khóa kho/sổ tiền/giá vốn/công nợ; hàm dashboard và tổng hợp tài chính.
- Kiểm tra này chạy local, không phải bằng chứng đã reset Supabase hoặc kiểm tra quyền RLS trên Supabase. Chưa thực thi hai file trên database từ xa trong lượt này; cấu hình hiện có chỉ cung cấp REST/service-role, không có kết nối SQL quản trị.
