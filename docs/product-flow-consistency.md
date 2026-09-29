# Tính nhất quán của hồ sơ máy

> Cập nhật sau đợt dọn mã: xem `architecture-current-workflow.md`. Luồng ghi checklist đã được gỡ khỏi catalog cuối; checklist lịch sử vẫn được giữ. Seed hiện dùng `complete_quick_qc`. Các ghi chú về đồng bộ checklist bên dưới mô tả giai đoạn trước khi nghỉ luồng cũ.

Mỗi laptop giữ một ID từ lô mua, nhận hàng, QC đến kho bán. Nguồn nhập được đọc qua `purchase_batch_id → supplier_id`; Settings quản lý phân loại, mẫu cấu hình và nhãn hiển thị.

## Sửa trong lần rà soát này

- Kho dùng dữ liệu đầy đủ từ InventoryContext khi mở form sửa, tránh mất giá bán và trường kỹ thuật do DTO rút gọn. Bỏ truy vấn trùng và giới hạn 500 dòng riêng của màn Kho.
- Nguồn nhập có mã lô và liên kết về lô mua; phân loại còn trống không tự gán mục đầu tiên.
- Pin chưa đo giữ null, kể cả trong Tech Check; phí vận chuyển để trống được lưu 0.
- Giá mua, tỷ giá và tracking được đồng bộ hai chiều giữa tên trường của Kho và nghiệp vụ mua hàng. Giá 0 là giá trị hợp lệ; cập nhật hai giá khác nhau bị từ chối.
- QC hoàn tất cập nhật sạc, mainboard, màn hình và camera/mic vào cùng laptop. Chi tiết sạc/mainboard vẫn giữ trong inspection; trường sản phẩm dùng mã tương thích Settings. Kết quả chưa kiểm tra không bị suy diễn thành đạt.
- UI QC rút gọn còn 4 kết quả, ghi chú tùy chọn và nút hoàn tất. Checklist cũ chỉ hiển thị trong lịch sử. Settings giải thích nguồn dữ liệu và bước chuyển trạng thái.

## QC rút gọn

Migration `20260928_quick_qc.sql` bổ sung `complete_quick_qc` và `qc_inspections.disposition`:

| Kết quả | Trạng thái máy | Phiếu liên quan |
|---|---|---|
| Đạt | available | Không |
| Chưa đạt | waiting_qc | Có thể mở phiên QC mới |
| Cần sửa chữa | repair | Tự tạo repair job, liên kết QC |
| BACK về TQ | supplier_return | Tự tạo phiếu trả NCC nháp, liên kết QC |

Kết luận tổng thể không tự điền các phép kiểm tra chi tiết hoặc ghi đè thông số kỹ thuật đã lưu. BACK về TQ yêu cầu máy đã xác định lô mua/NCC; phiếu trả chưa được coi là đã giao vận chuyển. Hoàn tất QC, chuyển trạng thái và tạo phiếu là một transaction. Retry cùng key không tạo phiếu trùng.

## Áp dụng database

Database đã có clean baseline: chạy lần lượt `db/migrations/20260927_qc_product_consistency.sql` và `db/migrations/20260928_quick_qc.sql` nếu chưa áp dụng. Các migration không xóa dữ liệu hay ghi đè QC lịch sử.

Database mới: `node qa/build-db-init.mjs` tạo init chứa baseline và migration mới. `init_full_db.sql` vẫn là bản reset phá hủy dữ liệu, không dùng để nâng cấp database đang vận hành.

## Bằng chứng

`node qa/clean-schema-db-verification.mjs`: 19/19 trên PostgreSQL cục bộ qua PGlite, gồm luồng cũ và cả 4 kết quả QC rút gọn, retry, phiếu sửa/trả, bảo toàn checklist và chặn trả máy chưa rõ nguồn. Chưa xác minh giao diện trong trình duyệt hoặc áp dụng migration lên Supabase thật.

`node qa/validate-db-reset.mjs`: đạt kiểm tra bootstrap, seed lặp lại, giữ auth/profile khi rebuild, giá vốn, công nợ, dashboard và tổng hợp tài chính. Build production thành công với 63 routes/pages được xử lý.
