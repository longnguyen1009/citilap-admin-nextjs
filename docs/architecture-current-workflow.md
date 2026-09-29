# Kiến trúc theo quy trình vận hành hiện tại

## Nguồn dữ liệu và đường ghi

| Bước | UI / API | Dữ liệu gốc / thao tác |
|---|---|---|
| Nhà cung cấp | Suppliers / `/api/suppliers` | `suppliers`; lô giữ khóa `supplier_id` |
| Lô mua | DirectIntake / `/api/intake` create | `purchase_batches` + `laptops`; RPC tạo nguyên tử, idempotency |
| Nhận hàng | DirectIntake / `/api/intake` receive | `receive_inventory`, cập nhật chính laptop, chuyển waiting_qc |
| Đối chiếu nguồn | `/api/intake` reconcile | Giữ ID máy vật lý; chỉ bỏ máy dự kiến chưa phát sinh nghiệp vụ |
| QC | QC / `/api/qc` start, quick-complete | `qc_inspections`; 4 kết quả; trạng thái laptop và phiếu liên quan cùng transaction |
| Kho bán | Inventory / `/api/inventory` | Hồ sơ laptop đầy đủ, nguồn NCC được suy ra qua lô |
| Bán hàng | Orders / `/api/orders` | RPC order giữ/bán laptop; bảo vệ phân bổ trùng |
| Thu/chi | API payments, supplier-payments, finance | Ledger bất biến; giá trị VND và triệu VND có quy ước riêng |
| Sửa/trả/bảo hành | API repairs, supplier-returns, warranty | Phiếu liên kết trực tiếp laptop; không tạo bản sao máy |
| Settings | options, presets, settings | Danh mục/nhãn/mẫu cấu hình; không quyết định chuyển trạng thái nghiệp vụ |

`laptops.id` là định danh xuyên suốt. Trạng thái sản phẩm là trạng thái vận hành; trạng thái phiên QC và phiếu sửa/trả là tiến trình xử lý riêng. Kết luận QC tổng thể không giả lập các phép đo chi tiết.

## Đã loại bỏ trong đợt này

- `lib/apiClient.js`: client bảng trực tiếp cũ không còn import; giữ `apiFetchers` → API có xác thực → service/RPC.
- Nhánh tạo/sửa/xác nhận/hủy lô nháp và `PurchaseDetail` trong `Procurement.jsx`, kèm state và truy vấn chỉ phục vụ nhánh này. Hai trang NCC và lịch sử thanh toán vẫn dùng component.
- POST `/api/purchases` trùng đường ghi `/api/intake`, và alias `items` trong response chi tiết lô.
- Các hằng shipment/receiving exception/logistics location/purchase status không còn consumer.
- DTO rút gọn `unified=true` trong API Inventory; mọi consumer runtime dùng hồ sơ đầy đủ.
- Action ghi checklist QC cũ ở API; database bỏ `complete_qc_inspection`, `save_qc_checklist`, `seed_qc_checklist`, trigger chiếu kết quả checklist và overload hoàn tất sửa 4 tham số đã ngừng dùng.
- Seed mới gọi QC rút gọn, không tạo 11.200 checklist vô nghĩa cho 400 phiên.

## Giữ có chủ đích

- `qc_check_items` và cột kỹ thuật trên QC: dữ liệu lịch sử cần xem lại, không phải workflow mới.
- `TechCheckModal`: còn được Inventory gọi để bổ sung pin/linh kiện/ghi chú; không đổi trạng thái hay thay thế kết luận QC.
- `unified_inventory`: view còn dùng bởi kiểm tra đối chiếu DB; không dùng làm form edit.
- Các cột giá/tỷ giá cũ trên laptop: còn consumer tính giá và dữ liệu đang lưu; trigger đồng bộ với trường procurement. Không drop cột khi chưa chuyển toàn bộ consumer.
- `purchase_batches.status`, các enum cũ và ledger: vẫn được hàm tài chính tham chiếu. Chưa xóa cột/enum để tránh làm sai lịch sử.
- `db/migrations_archive`, `qa/archive`: tư liệu lịch sử không tham gia build schema hay các gate hiện hành; không coi chúng là mã runtime.
- Baseline và các migration đã phát hành vẫn giữ nguyên. Migration nâng cấp loại writer cũ ở catalog cuối, không sửa lại lịch sử triển khai.

## Áp dụng

Database đã có quick QC: chạy `supabase/migrations/20260927025849_retire_legacy_qc_workflow.sql` sau `db/migrations/20260928_quick_qc.sql`.
Tên timestamp CLI phản ánh thời điểm tạo, không phải thứ tự của các migration cũ được đặt ngày thủ công. Builder chạy chuỗi `db/migrations` trước rồi chuỗi `supabase/migrations`.

Database mới: chạy init được sinh bằng `node qa/build-db-init.mjs`. Không chạy init reset trên database đang vận hành để nâng cấp.

Các xóa file/nhánh mã nguồn có thể khôi phục từ Git. Không xóa bảng hay dữ liệu nghiệp vụ trong migration nâng cấp này.

## Kiểm chứng đợt dọn mã

- `clean-schema-db-verification`: 18/18, bao gồm xác nhận writer QC cũ không còn và cả 4 nhánh kết quả mới.
- `legacy-qc-upgrade-verification`: migration chạy lại vẫn giữ nguyên phiên QC và checklist cũ; QC mới không tạo checklist, mở lại tiếp tục phiên đang hoạt động.
- `validate-db-reset`: bootstrap, seed lặp lại, bảo toàn auth/profile, ledger/giá vốn/công nợ và báo cáo đều đạt.
- Build production, ESLint các file đã chỉnh và diff check đạt. Chưa áp dụng migration trên Supabase thật hay kiểm tra UI bằng trình duyệt.
