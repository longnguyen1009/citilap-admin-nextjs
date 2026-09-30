# Dọn source — 30/09/2026

- Đã xóa 184 file, tổng 13.029.234 byte: script test/fixture/helper QA, ảnh QA, kết quả JSON/log kiểm thử và asset mẫu không được runtime tham chiếu.
- Giữ báo cáo trong `qa/`, tài liệu nghiệp vụ, migration, seed, `create_admin.js`, cấu hình editor/agent và mã ứng dụng đang sửa.
- Giữ `qa/build-db-init.mjs`, `qa/generate-clean-baseline.mjs`, `qa/repair-message-migration.mjs`: đây là công cụ bảo trì, không phải test runtime.
- Bỏ npm script `test:audit`; thêm ignore cho kết quả kiểm thử phát sinh.
- Bản sao có kiểm tra SHA256, bao gồm thay đổi test chưa commit: `C:\Users\Admin\AppData\Local\Temp\citilap-cleanup-20260930-152759`. `manifest.json` liệt kê từng đường dẫn và kích thước. Bản sao ở thư mục tạm có thể bị hệ điều hành dọn; file đã commit còn khôi phục được từ Git.
- Link tới script/ảnh trong báo cáo lịch sử có thể không còn mở được. Các số PASS cũ không đại diện cho test còn tồn tại trong checkout sau đợt dọn này.
- Không xóa bảng/database, không áp dụng migration hoặc reset dữ liệu.

Các sửa UI/API đang làm trước đợt dọn được giữ nguyên; chưa hoàn thành toàn bộ 40 mục audit.

Kiểm tra sau dọn: ESLint toàn repo PASS; production build PASS (65/65 trang); `git diff --check` PASS. Chưa chạy lại kiểm thử trình duyệt/live trong đợt dọn này.
