# Thu cũ đổi mới — thay đổi ngày 08/10/2026

## Ba trường hợp

1. **Khách lẻ bán máy:** nhập họ tên, tên máy, phân loại, Serial. Tạo laptop nguồn **Thu lại khách lẻ**, trạng thái **Chờ QC**, tháng hiện tại. Chưa ghi nhận giá vốn hoặc phiếu chi khi chưa nhập giá thu mua.
2. **Thu lại từ đơn đã bán:** tìm đơn theo mã đơn, tên/SĐT hoặc Serial; ghi nhận tên và SĐT người bán. Tạo laptop mới cùng Serial, tên, phân loại và thông tin tình trạng cơ bản; QC mới bắt đầu trống. Laptop/đơn cũ giữ lịch sử. `previous_laptop_id` nối hai lần nhập; `acquisition_closed` ngăn bán lại bản ghi cũ.
3. **Đổi máy/lên đời:** chọn đơn cũ và máy khác đang sẵn hàng. Nhập giá thu lại, giá bán mới, tài khoản nhận tiền bù. Đơn cũ thành **HỦY**, lý do **ĐỔI HÀNG**; laptop cũ trở lại **Sẵn hàng**, tháng hiện tại. Đơn mới sao chép khách hàng/địa chỉ, trạng thái **Mới**, máy mới được giữ cho đơn. Giá thu lại là khoản cấn trừ; chỉ phần chênh lệch tạo payment, financial record và giao dịch tiền vào.

Tháng/ngày nghiệp vụ tính theo UTC+7. Gửi lại cùng yêu cầu không tạo thêm máy/đơn/phiếu thu; cùng mã yêu cầu nhưng nội dung khác bị từ chối. Toàn bộ thay đổi của mỗi lần xác nhận nằm trong một D1 batch nguyên tử.

## Phạm vi và điều kiện

- ADMIN xác nhận nhập kho/thu tiền, theo quyền nhận máy của luồng cũ. SALES và SALES_TECH xem hồ sơ; TECHNICAL chỉ xem thông tin máy.
- Đổi máy hỗ trợ thu bù dương hoặc đổi ngang; chưa triển khai chi trả khi máy mới rẻ hơn giá thu lại.
- Đơn cũ còn công nợ phải xử lý trước khi đổi máy. Máy đã được thu lại hoặc không còn trạng thái đã bán không được nhận lần nữa.
- Giá vốn hai luồng thu mua để NULL, không giả định miễn phí hoặc dùng lại giá vốn lịch sử. Luồng đổi máy giữ giá vốn của laptop trả về theo yêu cầu chuyển lại cùng bản ghi.
- Lịch sử thu tiền của đơn cũ được bảo toàn, không tạo hoàn tiền giả. Đơn đã đổi bị khóa sửa để không tác động lại máy đã trả về.

## Kiểm chứng

- `node --test qa/trade-in-workflows.test.mjs`: 6/6 nhóm kiểm thử; bao gồm cả ba trường hợp, đổi ngang, quyền, validation, idempotency, lịch sử, số tiền ba sổ, rollback và bảo vệ bản ghi cũ.
- `node qa/trade-in-runtime.mjs`: PASS trên workerd/D1 thật chạy cục bộ; gửi đồng thời cùng key, đổi máy, thu tiền, replay và rollback.
- `node qa/cloudflare-migrations.mjs`: toàn bộ 21 migration chạy được, không lỗi khóa ngoại.
- `npm.cmd run build`: PASS, 69/69 trang; `npm.cmd run lint`: PASS trong lượt kiểm tra trước, được chạy lại khi hoàn tất.
- Trình duyệt local: đã kiểm tra cả ba luồng lưu thành công. Luồng thu từ đơn cũ tìm Serial QA-OLD, tự điền người bán/SĐT, tạo laptop #99003 liên kết đơn #99001; hồ sơ còn nguyên sau reload. Luồng đổi máy chọn máy #99002, giá bán 25 triệu, giá thu lại 12 triệu, thu bù 13 triệu vào tài khoản đã chọn; tạo được đơn mới. Đã sửa thẻ hồ sơ đổi máy để hiển thị `original_laptop_id` khi không tạo laptop mới. Cũng đã kiểm tra lỗi thiếu trường/focus và popup phân loại bằng bàn phím. Harness dùng component và route thực với SQLite tạm; chỉ xác thực được thay thế. Chưa xác minh mobile và phiên đăng nhập production.
- Không tạo tài khoản hoặc thay mật khẩu; không ghi vào DB production.

## Triển khai

Cần áp dụng `db/d1/migrations/0021_trade_in_workflows.sql` trước khi triển khai ứng dụng có metadata mới. Migration và ứng dụng hiện chỉ được kiểm chứng cục bộ; chưa áp dụng D1 remote, chưa deploy hoặc push.

Audit trong `docs/database-audit.md` và `database-audit-assets` là snapshot trước migration 0021, được giữ nguyên.
