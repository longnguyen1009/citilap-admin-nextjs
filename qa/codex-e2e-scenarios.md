# Kịch bản kiểm thử E2E cho Codex (Playwright MCP)

File này chứa các kịch bản để bạn paste trực tiếp cho extension Codex.
Codex đã được cấu hình Playwright MCP (headed = mở cửa sổ trình duyệt).

Prerequisite: dev server phải đang chạy tại http://localhost:3000
(Codex có thể tự chạy `npm run dev` nếu cần)

---

## Kịch bản 1 — Đăng nhập (Happy path)
```
Mở http://localhost:3000.
Nếu thấy trang Login, điền email admin vào ô email và mật khẩu vào ô password,
sau đó click nút đăng nhập. Chụp ảnh màn hình dashboard sau khi đăng nhập thành công.
Báo cáo: tiêu đề trang, các menu/sidebar hiển thị, có lỗi console không.
```

## Kịch bản 2 — Thêm laptop mới
```
Tại dashboard, điều hướng đến trang Inventory (Kho/Kho máy).
Click nút "Thêm máy" / "Add laptop".
Điền: Tên máy = "Test MacBook Pro 14 M3", Serial = "TEST-SN-001", Category = "Laptop",
Giá RMB = 12000, Ship RMB = 200, Tỷ giá = 3550, Trạng thái = "available".
Click Lưu. Chụp ảnh. Xác nhận máy mới xuất hiện trong bảng và có ID hợp lệ.
```

## Kịch bản 3 — Validation: thêm laptop thiếu tên
```
Tại trang Inventory, mở form thêm máy, để trống Tên máy, điền các trường khác,
click Lưu. Kỳ vọng: hệ thống từ chối (alert hoặc toast lỗi), không tạo record.
Chụp ảnh thông báo lỗi.
```

## Kịch bản 4 — Thêm order (đơn hàng)
```
Điều hướng đến trang Orders (Đơn hàng). Click "Thêm đơn".
Chọn 1 laptop vừa tạo, điền giá bán theo đơn vị triệu VNĐ, khách hàng = tạo mới
hoặc chọn có sẵn, orderStatus = "new". Lưu đơn, sau đó mở liên kết "Mở thu tiền"
và ghi nhận 5.000.000 VND vào đúng tài khoản nhận. Chụp ảnh. Xác nhận đơn tạo
thành công, trạng thái/công nợ chỉ thay đổi sau khi khoản thu được ghi sổ.
```

## Kịch bản 5 — Settings / Formula
```
Điều hướng đến trang Settings. Tìm mục cấu hình công thức (Formula):
shippingVnd, divisor, defaultRate. Thử đổi defaultRate sang giá trị hợp lệ (ví dụ 3600).
Lưu và xác nhận thông báo thành công. Sau đó thử nhập defaultRate = 0 (kỳ vọng bị từ chối).
Chụp ảnh cả 2 trường hợp.
```

## Kịch bản 6 — Customers
```
Điều hướng đến trang Customers. Thêm khách hàng: tên "Khách Test",
SĐT "0901234567", địa chỉ "Hà Nội". Lưu. Xác nhận xuất hiện.
Thử thêm khách thứ 2 cùng SĐT "0901234567" (kỳ vọng báo trùng).
```

## Kịch bản 7 — Month rollover (chuyển tháng)
```
Tại Settings, tìm chức năng "Chuyển tháng" / "Roll forward".
Thực hiện chuyển các item chưa xong sang tháng tiếp theo.
Chụp ảnh kết quả số lượng máy/đơn được chuyển.
LƯU Ý: đây là bug tiềm năng — xem Plan lỗi rollForwardMonth (so sánh chuỗi MM/YYYY sai khi khác năm).
```

## Kịch bản 8 — Role / phân quyền (nếu có nhiều tài khoản)
```
Đăng nhập bằng tài khoản SALES. Thử truy cập trang Settings (kỳ vọng bị chặn / ẩn).
Tại Inventory, thử sửa trường giá nhập (importPrice) — kỳ vọng bị từ chối vì trường nhạy cảm.
Chụp ảnh hành vi.
```

## Kịch bản 9 — Error / Edge cases
```
- Reload trang khi đang ở giữa form → dữ liệu có bị mất không?
- Gửi payload tạo order có opening cash/depositAmount → kỳ vọng API từ chối và hướng dẫn dùng mục Thu tiền.
- Tạo laptop với batteryHealth = 150 → kỳ vọng lỗi (0-100).
- Click logout → có về được trang Login không?
```

## Kịch bản 10 — Responsive / Console errors
```
Mở DevTools console. Duyệt qua các trang chính (Dashboard, Inventory, Orders,
Customers, Settings, Warranty, Payments). Ghi lại mọi lỗi console (red errors)
và lỗi mạng (failed API calls). Chụp ảnh mỗi trang.
```
