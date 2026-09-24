# Rà soát màn hình — 23/09/2026

## Phạm vi đã kiểm tra

- 27 route chính, mỗi route ở 1440×900 và 390×844: 54 lượt mở trang.
- 16 form tạo mới ở cả hai kích thước: 32 lượt mở form.
- Kết quả `qa/pilot-screen-audit.mjs`: không có lỗi JavaScript, không tràn ngang document khi mở trang hoặc form; ảnh và số đo trong `test-results/screen-audit/`.
- Đây là kiểm tra với tài khoản ADMIN, dữ liệu seed hiện tại. Không đồng nghĩa mọi modal chi tiết, tab con, quyền nhân viên hoặc giao dịch ghi database đã được kiểm thử.

## Đã sửa

- Grid lô mua co giãn đúng, không để input đẩy tràn trang desktop/mobile.
- Form bảo hành mobile về một cột, loại bỏ cột ẩn phát sinh từ `grid-column: span 2`.
- Thanh điều hướng mobile không kéo rộng document; modal tài chính/thu cũ có giới hạn chiều cao và cuộn.
- Khóa gửi đồng bộ cho khách hàng, thu tiền, tài chính và thao tác Sales Operations; thêm phản hồi đang lưu và lỗi trong modal tài chính/thu cũ/thu tiền.
- Lỗi sửa chữa, trả NCC và giá vốn được hiển thị cả bên trong modal đang mở.
- Giữ tham chiếu form trước `await` để reset form linh kiện, thao tác sửa chữa, chi phí và hoàn NCC không truy cập `event.currentTarget` đã hết hiệu lực.
- Bắt đầu kiểm tra thu cũ không bị chặn vì ghi chú tùy chọn rỗng; hủy prompt không gửi thao tác.
- Phân trang thực sự reset khi đổi bộ lọc và điều chỉnh khi số trang giảm, tránh quay lại trang cũ khi đổi bộ lọc qua lại.

## Bằng chứng

- ESLint các component/hook đã chỉnh: PASS.
- Production build: PASS, 66/66 trang.
- `git diff --check`: PASS.
- `qa/pilot-form-feedback.mjs`: 6 kiểm tra PASS — chặn submit trùng, nút loading bị khóa, lỗi API trong modal, giữ dữ liệu nhập, cho phép thử lại, input bảo hành nằm trong viewport mobile.
- Kiểm thử phản hồi form dùng POST giả lập lỗi; không ghi giao dịch vào database. Không dùng kết quả này thay thế kiểm thử tích hợp nghiệp vụ.

## Còn cần kiểm tra sâu

- Các modal sửa/chi tiết, tab con Settings và luồng chi tiết lô mua/vận chuyển/hóa đơn.
- Ma trận quyền SALES/TECH; thao tác lưu thành công và đọc lại từ Supabase.
- Phân trang với dữ liệu trên 50 bản ghi và các chuỗi lọc/chuyển trang thực tế.
- Khóa gửi/lỗi nội tuyến nhất quán ở các form nghiệp vụ còn lại.
