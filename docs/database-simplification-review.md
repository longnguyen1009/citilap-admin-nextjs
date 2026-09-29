# Rà soát đơn giản hóa database

Đối chiếu mới nhất đủ 38 bảng, quyết định giữ/bỏ và phần đã triển khai: [database-table-review.md](database-table-review.md). Migration `20260927164025_remove_redundant_workflow_objects.sql` dọn index/check trùng và hai guard cũ; API danh sách QC bỏ tải snapshot chi tiết.

## Đợt triển khai truy vấn tháng

Migration `supabase/migrations/20260927040000_simplify_month_queries.sql` thêm RPC `list_data_months` chỉ trả các tháng khác nhau, phân biệt operations và purchases. API `/api/months` dùng RPC; DirectIntake yêu cầu `scope=purchases`. Áp dụng migration trước khi deploy API mới. Chưa áp dụng trên Supabase thật.

Migration kiểm tra hai index serial tương đương trong catalog trước khi bỏ `laptops_serial_unique_idx`; giữ `laptops_serial_unique_ci_idx`. Không xóa hàng hay cột. Kiểm thử PGlite xác nhận chạy lại được, lọc active/sắp xếp tháng đúng, tách ngày mua, quyền RPC và serial uniqueness được giữ. `init_full_db.sql` đã sinh lại, vẫn chỉ dùng cho reset.

Phạm vi: schema trong repo (baseline + QC consistency + quick QC + retirement), API và consumer hiện tại. Chưa đối chiếu catalog production, dung lượng bảng hay EXPLAIN ANALYZE. Đây là đề xuất thiết kế; chưa drop bảng/cột hoặc thay đổi dữ liệu.

## Kết luận

Baseline có 38 bảng, nhưng vấn đề chính là các biểu diễn trùng của cùng dữ liệu và quy tắc ghi nằm ở nhiều lớp. Không nên gộp toàn bộ nghiệp vụ vào một bảng laptop hoặc JSON. Giữ mô hình một laptop xuyên suốt; giảm alias, trường tổng hợp và writer cũ.

## Ưu tiên và bằng chứng

| Ưu tiên | Hiện trạng trong repo | Thiết kế đề xuất |
|---|---|---|
| P0 | `rollForwardMonth` cập nhật `laptops.month_key` và `orders.month_key`; API danh sách lọc chính trường này | Định nghĩa đây là tháng vận hành, không phải tháng mua/ngày phát sinh. Dùng `purchase_batches.purchase_date` cho tháng mua, `orders.created_date` cho tháng phát sinh. Nhãn UI và API phải phân biệt rõ. |
| P0 | `laptops_serial_unique_ci_idx` và `laptops_serial_unique_idx` cùng biểu thức và predicate | Bỏ một index sau khi xác minh catalog thực tế; giữ nguyên bảo vệ serial không trùng. |
| P1 | Laptop có `price_rmb`/`purchase_price_rmb`, `exchange_rate`/`purchase_exchange_rate`, `tracking_code`/`tracking_code_cn` | Chọn bộ `purchase_price_rmb`, `purchase_exchange_rate`, `tracking_code_cn` làm nguồn chính. Chuyển toàn bộ API/UI/RPC/seed rồi bỏ alias và trigger đồng bộ. |
| P1 | `import_price_vnd` trên laptop và view `laptop_landed_costs` cung cấp hai cách lấy giá vốn; `unified_inventory` chỉ tính mua + ship CN | Dùng `laptop_landed_costs` cho giá vốn hiện tại; snapshot trên order cho giá vốn đã chốt. Chuyển consumer trước khi bỏ `import_price_vnd` và view phụ. |
| P1 | `purchase_batches` giữ trạng thái logistics/thanh toán cũ và tổng tiền mặc định 0 trong create mới | Lô giữ định danh/NCC/ngày mua/ghi chú/tỷ giá mặc định; tiến độ nhận suy ra từ máy, công nợ suy ra máy + thanh toán. Trạng thái đóng/hủy chỉ giữ nếu còn nghiệp vụ cụ thể. |
| P1 | Tên cột `_vnd` nhưng nhiều giá laptop/order/payment thực tế dùng triệu VND; cash ledger dùng VND | Chuẩn hóa lưu VND, CNY đúng đơn vị; UI mới chia triệu. Là migration riêng có đối soát toàn bộ snapshot, RPC, báo cáo và hóa đơn; không nhân hàng loạt cột theo tên. |
| P1 | QC nhanh lưu `disposition` và `result` (3 kết quả không đạt cùng map FAIL), còn chi tiết checklist lịch sử | `disposition` là kết quả chính cho phiên mới. Giữ `result` tương thích tới khi sửa các consumer repair/report; giữ checklist lịch sử chỉ đọc. Không tạo thêm checklist mới. |
| P1 | `/api/months` đọc từng trang month_key của toàn bộ laptop và order để lấy tập tháng | RPC chỉ trả DISTINCT tháng của bản ghi active; API giữ nguyên kiểm tra quyền. Không đưa toàn bộ hàng về Node để loại trùng. |
| P2 | Unique constraint `trade_ins.inventory_laptop_id` và partial unique index cùng bảo vệ non-null | Rà dependency rồi loại index thừa nếu không phục vụ nhu cầu riêng. |
| P2 | `source_reference_id` là text đa nghĩa; supplier đã có `purchase_batch_id`, trade-in có `inventory_laptop_id` | Dùng FK nghiệp vụ có kiểu rõ ràng; không nhân thêm supplier_id trên laptop nếu nguồn mua suy ra qua batch. Backfill và kiểm tra consumer trước khi bỏ text reference. |
| P2 | `created_by`/`updated_by` phần lớn là tên text | Với dữ liệu mới có thể thêm actor user ID; tên text giữ làm snapshot lịch sử, không backfill UUID bằng cách đoán tên. |

## Tháng vận hành và tháng mua

Máy mua tháng 6 được chuyển tồn sang tháng 9 vẫn phải thuộc lô mua tháng 6. API intake đã đổi sang lọc theo khoảng purchase_batches.purchase_date bằng inner join; không dùng month_key của máy để suy ra ngày mua. Thông tin batch/NCC lấy cùng truy vấn laptop, không cần lượt truy vấn bổ sung. Chưa kiểm chứng join này trên Supabase thật.

Kho/Orders có thể tiếp tục dùng month_key để giữ hành vi chuyển tồn đã có. Nếu chuyển sang kiểu DATE ngày đầu tháng hoặc đổi tên operating_month, phải chuyển endpoint month-roll, localStorage/UI và dữ liệu cũ cùng nhau. Không tự sinh tháng vận hành từ ngày mua vì sẽ phá hành vi chuyển tồn.

Nhận hàng là hàng đợi `in_transit` xuyên tháng. QC là hàng đợi `waiting_qc` xuyên tháng. NCC là danh mục, không lọc theo tháng tạo NCC.

## Mô hình đọc dễ hiểu

```text
suppliers → purchase_batches → laptops → qc_inspections
                                  ├→ orders → payments
                                  ├→ repair_jobs → parts/actions
                                  └→ supplier_return_items → supplier_returns
```

- Danh sách lô: purchase_batches + suppliers; chỉ tổng hợp máy thuộc lô/tháng đang xem.
- Máy trong lô: laptops WHERE purchase_batch_id = ...; không ghép ledger.
- Kho: laptops theo tháng vận hành/trạng thái, join lô/NCC; lấy đủ trường cho bảng, chi tiết tải khi mở.
- Orders: orders theo tháng vận hành, join khách/máy; lịch sử payment, commission, invoice chi tiết tải theo nhu cầu thực tế. Những tổng lợi nhuận UI đang hiển thị vẫn phải được cung cấp.
- Giá vốn: một view chuẩn. Công nợ: view riêng; không chạy cùng mọi GET nhập hàng.
- Một RPC cho mỗi thao tác nhận/QC/bán/thu tiền. Trigger giữ ràng buộc và lịch sử, tránh cùng tính lại kết quả ở UI, API và trigger.

## Index ứng viên cần đo

Đang có index month_key đơn. Với truy vấn theo tháng + active + sắp xếp ID, cân nhắc `(month_key, id DESC) WHERE is_active IS TRUE` trên laptops/orders. Với hàng chờ nhận/QC, cân nhắc `(status, id DESC) WHERE is_active IS TRUE`. Không thêm tất cả mặc định: kiểm tra EXPLAIN ANALYZE, số hàng, pg_stat_user_indexes và chi phí ghi trước; thay index cũ khi xác định trùng chức năng. Pagination phải có ORDER BY ổn định.

## Các bảng chưa nên bỏ

- `payments` là tiền khách theo đơn; `account_transactions` là dòng tiền tài khoản: hai vai trò khác nhau.
- `financial_records` có cả đường ghi tay và dữ liệu hóa đơn; cần phân loại dữ liệu, đối soát và chuyển consumer trước khi tính tới thay bằng view.
- `orders` cost snapshot và `invoices.snapshot` giữ sự thật tại thời điểm chốt; không thay bằng giá laptop hiện tại.
- `stock_movements` là sự kiện tồn kho; `activity_logs` là audit thao tác. Có thể tránh ghi trùng nội dung lớn nhưng không coi hai bảng tương đương.
- Repair/return/warranty/commission/trade-in vẫn có consumer đang hoạt động; không bỏ vì không nằm trên màn nhập hàng.

## Lộ trình

1. Sửa ngữ nghĩa tháng mua vs tháng vận hành; đưa DISTINCT tháng xuống DB; bỏ index trùng đã xác minh. Không mất dữ liệu.
2. Chuyển API/UI sang bộ field chuẩn và một view giá vốn. So sánh kết quả cũ/mới trên seed và dữ liệu thật chỉ đọc.
3. Migration riêng bỏ alias và trạng thái lô không còn dùng; giữ lịch sử QC cũ. Không sửa lại migration đã áp dụng.
4. Chuẩn hóa đơn vị tiền trong một đợt có đối soát riêng; chuyển toàn bộ writer/reader đồng bộ.

Gate tối thiểu: nhận/QC bốn nhánh vẫn giữ laptop ID; mua tháng 6/chuyển tồn tháng 9 truy vấn đúng cả hai nghĩa; serial không trùng; công nợ/giá vốn/số dư/snapshot không đổi; retry không tạo trùng; kiểm tra quyền; đo query và payload trước/sau. Chỉ kết luận nhanh hơn sau khi có số đo.
