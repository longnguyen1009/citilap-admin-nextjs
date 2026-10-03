# Kiểm thử trình duyệt sale_tech - 2026-10-03

## Phạm vi và dữ liệu

- Môi trường: Cloudflare local dev tại `http://localhost:3000`, D1 local.
- Tài khoản: `QA Sale Tech Browser`, role `SALES_TECH`.
- Laptop kiểm thử chính: `#22`, serial `E2E-ST-20261003-01`.
- Đơn kiểm thử chính: `#3`, giá bán 21,5 triệu VND.
- Tài khoản tiền local: `E2E-VND-UUID`.
- Đây là dữ liệu kiểm thử local, không ghi lên production.

## Ma trận 30 kịch bản

| # | Kịch bản | Kết quả | Bằng chứng chính |
|---:|---|:---:|---|
| 1 | Đăng nhập bằng tài khoản `sale_tech` | PASS | Sidebar hiển thị `QA Sale Tech Browser` |
| 2 | Kiểm tra menu theo role | PASS | Có Kho, QC, Nhận hàng, Đơn hàng, Thu tiền; không có menu Lô mua/Settings |
| 3 | Mở danh sách laptop tháng 10/2026 | PASS | 9 laptop được tải từ D1 local |
| 4 | Select nguồn nhập hiển thị toàn bộ danh mục | PASS | Có Nhập thợ VN, Thu lại khách lẻ, WECHAT 001, Wechat002 |
| 5 | Select vị trí và trạng thái hiển thị toàn bộ option | PASS | Có đủ 5 vị trí và 8 trạng thái |
| 6 | Bấm Thêm Laptop với `sale_tech` | PASS | Mở modal nhập nội địa, không chuyển sang Lô mua |
| 7 | Bỏ trống trường bắt buộc khi tạo laptop | PASS | Trình duyệt chặn tại Serial |
| 8 | Tạo laptop nguồn Thu lại khách lẻ | PASS | Tạo laptop #22, giá vốn nhập trực tiếp 15,75 triệu |
| 9 | Giá RMB và phí ship của nhập nội địa cố định bằng 0 | PASS | Dữ liệu lưu theo luồng nhập nội địa; UI không cho sale_tech sửa giá RMB |
| 10 | Reload sau khi tạo laptop | PASS | Laptop #22 vẫn tồn tại |
| 11 | Tìm laptop theo serial | PASS | `E2E-ST-20261003-01` trả đúng 1 laptop |
| 12 | Lọc theo nguồn Thu lại khách lẻ | PASS | Trả đúng laptop #22 |
| 13 | Mở modal sửa laptop bằng `sale_tech` | PASS | Không hiển thị trường giá nhập |
| 14 | Sửa tên, ngày nhập, tracking, vị trí, sạc, pin, ghi chú | PASS | Laptop #22 lưu thành MEDIA, Sạc Lô, pin 91% |
| 15 | Reload sau sửa laptop | PASS | Toàn bộ thay đổi vẫn tồn tại |
| 16 | Sửa bảo hành nguồn bằng `sale_tech` | PASS sau sửa | `BH nguồn E2E 14 ngày` tồn tại trong D1 và hiện lại sau reload |
| 17 | Tạo đơn mới, tải danh mục chi nhánh/phụ kiện | PASS | CITILAP HANOI và 4 phụ kiện được tải |
| 18 | Chọn Full combo quà tặng | PASS | Đơn #3 lưu `gift_preset=full`, IDs `[1,2,3,4]` |
| 19 | Tạo đơn với giá 21,5 triệu và khách có sẵn | PASS | Tạo đơn #3, chưa thanh toán |
| 20 | Phân laptop #22 cho đơn #3 | PASS | Máy chuyển trạng thái giữ cho đơn; picker của đơn khác ghi rõ `Đang cọc đơn #3` |
| 21 | Chuyển đơn sang Đã cọc/Giữ máy | PASS | Trạng thái đơn được lưu |
| 22 | Ghi cọc 5 triệu | PASS | Payment `deposit`, reference `E2E-DEP-001` |
| 23 | Ghi phần còn lại 16,5 triệu | PASS | Payment `balance`, reference `E2E-BAL-001` |
| 24 | Đối chiếu công nợ tự động | PASS | Đã thu 21,5 triệu, còn nợ 0, trạng thái Đã thanh toán |
| 25 | Sửa ghi chú, giao hàng, phương thức và tracking của đơn | PASS | ViettelPost, `E2E-VTP-003`, trạng thái Đã gửi hàng |
| 26 | Chuyển Đã chuẩn bị xong -> Đang giao hàng -> Hoàn thành | PASS | Đơn #3 thành `done`, laptop #22 thành `sold` |
| 27 | Reload và đối chiếu laptop sau hoàn thành | PASS | #22 hiện Đã bán, vẫn giữ nguồn Thu lại khách lẻ và serial/tracking |
| 28 | Tìm/lọc đơn theo tracking, thanh toán, phân loại | PASS | Mỗi bộ lọc trả đúng đơn #3 |
| 29 | Truy cập trực tiếp `/settings` bằng `sale_tech` | PASS | Hiện trang Không có quyền truy cập |
| 30 | Truy cập trực tiếp `/purchases`, sau đó kiểm tra `/receiving` | PASS sau sửa | `/purchases` không còn nút tạo lô; `/receiving` hiển thị thông tin nhận hàng và không lộ giá/RMB/CNY |

## Lỗi tìm thấy và đã sửa

### P1 - Sale/tech không lưu được modal laptop

Form sửa gửi lại các trường giá nhạy cảm đã bị ẩn, khiến API trả lỗi quyền. Payload của non-admin hiện loại bỏ các trường tài chính trước khi gửi.

### P1 - Bảo hành nguồn lưu được nhưng biến mất sau reload

`warrantySupplier` vừa bị xếp là trường tài chính nhạy cảm, vừa không có trong DTO công khai. Trường này hiện được phép đọc/sửa cho role vận hành; giá nhập vẫn bị ẩn.

### P1 - Truy cập URL `/purchases` vẫn hiện giao diện tạo lô

API đã chặn nhưng UI vẫn dựng toolbar và nút `+ Tạo lô mua`. Trang hiện trả giao diện Không có quyền truy cập cho non-admin và không gọi tải dữ liệu lô.

### P2 - Laptop hoàn thành bán hàng thiếu `sold_at`

Trạng thái đổi sang `sold` nhưng mốc bán không được cập nhật. Nghiệp vụ D1 hiện đặt `sold_at` khi đơn hoàn thành, giữ mốc khi đang chuẩn bị/giao và xóa mốc nếu máy được giải phóng về kho.

## Đối chiếu D1

- Laptop #22: `status=sold`, nguồn `Thu lại khách lẻ`, pin 91, MEDIA, Sạc Lô, `sold_at` đã có timestamp.
- Đơn #3: `order_status=done`, `payment_status=paid`, `amount_paid=21.5`, `debt_amount=0`, chi nhánh #1, combo `[1,2,3,4]`.
- Hai payment: 5 triệu cọc và 16,5 triệu phần còn lại, cùng ghi vào tài khoản tiền local hợp lệ.

## Kiểm tra mã nguồn

- ESLint các file thay đổi: PASS.
- `npm.cmd run cf:test`: PASS 11/11.
- `npm.cmd run cf:test:runtime`: PASS workerd (auth, R2, operations, payments/finance, replay và atomic rollback).
- `git diff --check`: PASS.
- Chưa commit, push hoặc deploy.
