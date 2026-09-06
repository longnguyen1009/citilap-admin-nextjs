# Citilap Admin - Project Context & Architecture

Đây là tài liệu tóm tắt bối cảnh, kiến trúc hệ thống và luồng nghiệp vụ cốt lõi của dự án **Citilap Admin**. Tài liệu này giúp việc mở rộng, bảo trì và nắm bắt hệ thống dễ dàng hơn cho cả lập trình viên lẫn người quản lý.

---

## 1. Kiến trúc & Công nghệ (Tech Stack)
- **Framework:** Next.js (App Router) dùng cho việc xây dựng API Route và UI.
- **Styling:** Kết hợp CSS truyền thống (`index.css`), giao diện hiện đại mang phong cách Glassmorphism và bộ icon `lucide-react`.
- **Database & Authentication:** Supabase (PostgreSQL).
  - Sử dụng Token/JWT để phân quyền.
  - Tích hợp 2 Role chính: `ADMIN` (toàn quyền) và `STAFF` (bị giới hạn các trường nhạy cảm như giá nhập, lợi nhuận).

## 2. Cấu trúc CSDL (Database Schema)
Hệ thống xoay quanh các bảng chính:
- `laptops` (Kho máy): Lưu chi tiết tên máy, serial, trạng thái, mã vận đơn, tình trạng pin... (Lưu ý: Các trường tài chính như `profit_vnd`, `price_rmb` được tính toán linh hoạt trên frontend hoặc nằm ở bảng tài chính riêng biệt để bảo mật).
- `orders` (Đơn hàng): Liên kết chặt chẽ với khách hàng. Lưu trữ giá bán, cọc, phí quẹt thẻ, quà tặng, trạng thái thanh toán.
- `customers` (Khách hàng): Quản lý tên, sđt, địa chỉ.
- `activity_logs`: Bảng nhật ký Append-only, chuyên phục vụ tính năng Timeline để theo dõi nhân viên nào đã thay đổi trường dữ liệu gì, vào thời gian nào (So sánh giá trị Cũ ➔ Mới).
- `stock_movements`, `warranty_cases`, `financial_records`: Các bảng phụ trợ cho quản lý kho bãi, bảo hành và tài chính.

## 3. Các Luồng Nghiệp Vụ Cốt Lõi (Business Logic)
- **Quản lý Kho (Inventory):**
  - Danh sách máy phân loại linh hoạt theo trạng thái: Sẵn sàng, Đang về, Đã bán...
  - Tự động hóa tính toán "Giá Nhập" qua hệ thống cấu hình tỷ giá và phí vận chuyển.
  - Phân quyền thông minh: Ẩn giá nhập, lợi nhuận và nhà cung cấp đối với nhân viên (STAFF).
- **Quản lý Đơn Hàng (Orders):**
  - Form tạo/sửa đơn hàng chứa 20+ trường thông tin nghiệp vụ chi tiết (Online/Offline, cọc, trả góp).
  - Thuật toán màu sắc (Color Logic): 
    - Màu Xám: Đơn Đã Hủy / Hoàn thành.
    - Màu Vàng: Đơn đang giao / chờ COD.
    - Màu Xanh/Đỏ: Tùy biến theo tính chất chưa thanh toán...
- **Timeline Lịch Sử Cập Nhật:**
  - Logic diff (so sánh) tự động qua API. Bất cứ hành động Sửa/Xóa/Thêm nào cũng được lưu vào `activity_logs`.
  - Hiển thị song song với Form nhập liệu (chia đôi màn hình), tăng tính minh bạch trong quá trình làm việc nhóm.

## 4. Triết Lý Thiết Kế & Hướng Phát Triển
- **Sự Đơn Giản & Mở Rộng:** Form nhập liệu được thiết kế "map" 1-1 với DB. Việc thêm tính năng mới chỉ cần thêm cột ở Supabase ➔ Thêm trường ở Frontend (UI) ➔ Cập nhật logic API lấy/lưu dữ liệu.
- **Cẩn trọng với State UI:** Một số biến như `importPriceManuallyEdited` hay `profitVnd` chỉ tồn tại ở UI để tính toán, bắt buộc phải bị loại bỏ (delete object keys) trước khi ném payload qua Supabase để tránh lỗi Schema Cache.

---
*Tài liệu này được tạo ra để lưu trữ lại các quy chuẩn phát triển sau quá trình tối ưu hóa dự án.*
