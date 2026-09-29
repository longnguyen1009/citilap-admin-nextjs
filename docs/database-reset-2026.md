# Làm mới database và seed dữ liệu 06–09/2026

## Cảnh báo

`init_full_db.sql` xóa và tạo lại toàn bộ schema `public`. File giữ `auth.users` và sao lưu/khôi phục `user_profiles`, nhưng xóa dữ liệu nghiệp vụ. Chỉ chạy trên đúng project và bằng quyền postgres.

## Nguồn schema

Schema chuẩn duy nhất:

```text
db/migrations/20260925_clean_baseline.sql
```

`init_full_db.sql` được sinh từ migration đang hoạt động. Không sửa trực tiếp. Migration lịch sử trong `db/migrations_archive/` không tham gia reset.

Tái tạo file:

```powershell
node qa/build-db-init.mjs
```

## Chạy trên Supabase

1. Mở SQL Editor của đúng project.
2. Chạy toàn bộ `init_full_db.sql`.
3. Chạy `reseed_data.sql` nếu cần dữ liệu mẫu.
4. Tải lại ứng dụng và chọn tháng 06, 07, 08 hoặc 09/2026.

Mỗi file có transaction riêng. Nếu seed lỗi sau khi init thành công, sửa seed rồi chạy lại riêng file seed.

## Dữ liệu mẫu

| Tháng | Laptop | Đơn hàng | Thanh toán |
|---|---:|---:|---:|
| 06/2026 | 120 | 80 | 104 |
| 07/2026 | 120 | 80 | 104 |
| 08/2026 | 120 | 80 | 104 |
| 09/2026 | 120 | 80 | 104 |
| Tổng | 480 | 320 | 416 |

Laptop seed đi theo nguồn nhà cung cấp và lô mua. Mỗi tháng có 120 máy: 10 đang vận chuyển,
10 đã nhận chờ QC và 100 đã hoàn tất QC; trong nhóm đã QC có 80 máy phục vụ dữ liệu đơn hàng.
Mỗi laptop giữ nguyên ID xuyên suốt lô mua, nhận hàng, QC và bán hàng. Order/payment dùng triệu VND;
account ledger và thành phần giá vốn dùng VND.

## Kiểm tra local

```powershell
node qa/clean-schema-db-verification.mjs
node qa/validate-db-reset.mjs
npm.cmd run lint
npm.cmd run build
git diff --check
```

PGlite kiểm tra schema sạch, reset, seed lặp lại, bảo toàn profile, inventory, ledger và số lượng theo tháng. Đây không phải bằng chứng đã áp dụng lên Supabase.

## Kiểm tra live

Sau khi chạy init trên Supabase:

```powershell
node qa/live-procurement-inventory-e2e.mjs
node qa/live-full-regression-e2e.mjs
```

Sau đó kiểm tra trình duyệt bằng phiên mới và xác nhận đúng role trước khi kết luận quyền hoặc giao diện hoạt động.
