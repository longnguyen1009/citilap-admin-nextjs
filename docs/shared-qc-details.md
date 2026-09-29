# Chi tiết QC dùng chung

Áp dụng `supabase/migrations/20260927050000_shared_qc_details.sql` sau migration simplify_month_queries, trước khi triển khai UI/API mới. Không chạy init reset trên dữ liệu vận hành.

- `laptops.qc_details`: kết quả kỹ thuật hiện tại. Serial và pin là giá trị nhập trực tiếp; các mục kỹ thuật chỉ có Đạt/Không đạt.
- Hai nơi dùng `QCDetailsFields`: phiên QC và modal Test trong Kho laptop.
- Hoàn tất QC gọi `complete_qc_with_details`: lưu chi tiết, snapshot phiên và chuyển trạng thái trong cùng transaction; giữ bốn disposition hiện tại.
- Test cập nhật hồ sơ kỹ thuật, không tự chuyển trạng thái máy. Serial, pin, màn hình, mainboard và camera–mic được trigger cập nhật về các cột sản phẩm. Phiên đã hoàn tất giữ snapshot cũ.
- UI không còn model/CPU/GPU/RAM/SSD, ghi chú từng mục, hoặc các ô Pin/Ngoại hình tách riêng ở đầu modal. Ngoại hình vẫn là một mục Đạt/Không đạt trong nhóm kiểm tra.
- Checklist chưa nhập giữ Chưa kiểm tra, không tự giả lập kết quả đạt. Checklist lịch sử cũ vẫn đọc từ qc_check_items.
- Orders bỏ phân trang, giữ dropdown laptop chỉ dựng lựa chọn khi focus. Inventory vốn không phân trang.

Kiểm thử schema local: 19/19, bao gồm snapshot không đổi sau khi sửa Test và pin ngoài 0–100 bị từ chối. Chưa áp dụng migration hay kiểm tra hai màn trên Supabase thật.
