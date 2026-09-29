# Đối chiếu 38 bảng với UI và luồng vận hành

Rà soát ngày 27/09/2026 trên mã nguồn, baseline và migration hiện tại. Chưa đo catalog, dung lượng hoặc kế hoạch truy vấn trên Supabase thật. Không coi bảng ít dữ liệu hoặc không có trang riêng là bảng thừa.

## Quyết định cho từng bảng

| Bảng | UI / API / nghiệp vụ sử dụng | Quyết định |
|---|---|---|
| suppliers | Nhà cung cấp, intake, công nợ, trả NCC | Giữ danh mục; không lọc theo tháng tạo NCC. |
| purchase_batches | Lô mua, nhận hàng, supplier-payments | Giữ đầu lô và FK NCC; tổng tiền/tiến độ đọc từ máy và ledger. Cột logistics cũ chỉ bỏ sau khi chuyển RPC thanh toán. |
| laptops | Kho, nhận hàng, QC, orders, sửa, trả, thu cũ | Thực thể máy duy nhất. Chuẩn đích: purchase_price_rmb/purchase_exchange_rate/tracking_code_cn; alias cũ còn writer nên chưa drop. |
| qc_inspections | QC, nguồn phiếu sửa, trả NCC | Giữ kết luận, người thực hiện và snapshot lịch sử; danh sách không cần tải snapshot. |
| qc_check_items | Chi tiết QC lịch sử cũ qua /api/qc?id | Giữ chỉ để đọc lịch sử; không sinh thêm cho QC mới. Không xóa kết quả kỹ thuật đã nhập. |
| repair_jobs | Sửa chữa, QC, giá vốn | Giữ phiếu và kết luận; trạng thái qua RPC. |
| repair_parts | Chi tiết sửa, tổng chi phí linh kiện | Giữ từng linh kiện, số lượng và giá; không nhét vào ghi chú. |
| repair_actions | Nhật ký thao tác trong phiếu sửa | Giữ; khác audit chỉnh sửa. |
| supplier_returns | Phiếu BACK về TQ | Giữ đầu phiếu, tiến trình và vận chuyển. |
| supplier_return_items | Máy trong phiếu trả, máy thay thế | Giữ FK máy gốc/thay thế và previous_laptop_status để hủy đúng trạng thái. |
| supplier_return_events | Timeline trả NCC | Giữ sự kiện nghiệp vụ để xem tiến trình. |
| supplier_refunds | Hoàn tiền NCC, tài khoản CNY | Giữ ledger; không gộp với giá trị dự kiến trên phiếu trả. |
| supplier_payments | Thanh toán lô, công nợ NCC | Giữ ledger; khóa batch/supplier bảo vệ trả đúng NCC. |
| customers | Khách hàng, orders, hóa đơn, thu cũ | Giữ hồ sơ; số điện thoại có ràng buộc chống trùng. |
| orders | Danh sách đơn, giữ máy, giao, thu tiền | Giữ month_key vận hành, FK máy yêu cầu/máy phân bổ riêng, snapshot giá vốn. |
| payments | Phiếu thu/hoàn theo đơn | Giữ nguồn số tiền khách đã trả; không thay bằng amount_paid nhập tay. |
| invoices | Xem/in hóa đơn | Giữ snapshot lúc xuất; không dựng lại bằng giá máy hiện tại. |
| reservations | Giữ máy và cảnh báo quản trị | Giữ; có thời hạn, hủy/chuyển đơn. Không đồng nhất với mọi đơn cọc. |
| trade_ins | Thu cũ đổi mới | Giữ hồ sơ, định giá, nghĩa vụ đổi máy. Bỏ index non-null trùng unique constraint. |
| trade_in_inspections | Kiểm định máy thu cũ | Giữ; khác QC hàng nhập và vẫn có UI. |
| trade_in_check_items | Checklist kiểm định thu cũ | Giữ; API sales-operations còn đọc/ghi. |
| commissions | Hoa hồng, duyệt/chi tiền | Giữ trạng thái và giao dịch; không suy ra lại khoản đã chi. |
| warranty_cases | Bảo hành | Giữ liên kết đơn/máy, chẩn đoán, chi phí. |
| laptop_cost_components | Giá vốn, sửa chữa, thu cũ | Giữ chi phí có nguồn; void thay vì xóa. View laptop_landed_costs tổng hợp. |
| financial_records | Sổ tài chính, ghi tay, snapshot hóa đơn | Chưa bỏ: có cả dòng từ payment và dòng nhập tay. Cần đối soát/chuyển API trước khi thay bằng view. |
| cash_accounts | Tài khoản tiền | Giữ tiền tệ và số dư đầu kỳ. |
| account_transactions | Thu/chi/chuyển tiền, số dư | Giữ ledger bất biến; khác payments vì có chuyển tiền và giao dịch NCC/COD. |
| account_reconciliations | Đối soát tiền thực tế | Giữ từng lần đối soát; không ghi đè lịch sử bằng số dư mới. |
| cod_receivables | Theo dõi tiền hãng vận chuyển giữ | Giữ; nghĩa vụ của đơn vị giao hàng khác nợ khách. |
| cod_settlements | Đối soát COD nhiều lần | Giữ từng khoản thực nhận và tài khoản. |
| stock_movements | Lịch sử máy/nhập/xuất/QC | Giữ sự kiện tồn kho; khác activity_logs. |
| activity_logs | Timeline/audit | Giữ; chưa có chính sách lưu trữ nên không xóa theo tuổi hoặc tên Seed. |
| operation_requests | RPC nhập/nhận/đối chiếu chống gửi trùng | Giữ dù không có UI; xóa sớm có thể làm retry tạo trùng dữ liệu. |
| user_profiles | Đăng nhập, phân quyền, kỹ thuật viên | Giữ; bỏ check role trùng khi biểu thức và constraint thay thế được xác minh. |
| app_options | Settings và các dropdown | Giữ nhãn/key; không xóa option cũ khi dữ liệu lịch sử còn tham chiếu key. |
| app_settings | Công thức, cấu hình ứng dụng | Giữ theo key; preset_configs là dữ liệu settings, không phải bảng riêng. |
| accessories | Danh mục quà/phụ kiện, hóa đơn | Giữ; snapshot hóa đơn và gift_accessory_ids còn sử dụng. |
| branches | Chi nhánh đơn/hóa đơn | Giữ danh mục và FK orders.branch_id. |

## Phần đã triển khai trong đợt này

- Migration `20260927164025_remove_redundant_workflow_objects.sql` bỏ index trùng của trade-in và check role trùng khi catalog xác nhận điều kiện; bỏ hai hàm guard trạng thái repair/return cũ không còn trigger. Dùng DROP RESTRICT mặc định, không CASCADE. Giữ guard trạng thái tổng và mọi hàng nghiệp vụ.
- GET danh sách QC chỉ chọn trường card đang dùng; chi tiết theo ID vẫn trả snapshot, hồ sơ máy và checklist cũ. Giảm dữ liệu JSON truyền lặp theo lịch sử QC mà không sửa snapshot.
- Không xóa bảng nghiệp vụ: cả 38 bảng đều có vai trò hiện hành hoặc consumer lịch sử. Các bảng shipment/receiving trung gian đã vắng mặt trong baseline hiện tại.

## Phần cần chuyển đồng bộ trước khi bỏ

1. Giá mua/tỷ giá/tracking laptop: chuyển mapper, form kho, CSV, seed và RPC sang bộ purchase_* rồi mới drop alias và trigger sync. Không đổi đơn vị tiền cùng đợt này.
2. Giá vốn: phân biệt giá vốn hiện tại từ laptop_landed_costs với snapshot order; không thay snapshot đã bán. import_price_vnd còn consumer nên chưa drop.
3. Lô mua: bỏ trạng thái logistics và subtotal lưu dư sau khi record_supplier_payment, guard_confirmed_purchase_batch và các báo cáo không còn phụ thuộc.
4. QC: dữ liệu hiện tại nằm trong laptops.qc_details, lịch sử nằm trong detail_snapshot. Các khóa model/cpu/gpu/ram/ssd/note cũ không còn ô nhập nhưng có thể chứa thông tin thật; giữ lịch sử, không UPDATE hàng loạt để xóa.
5. Tài chính: payment, dòng tiền tài khoản và sổ financial_records có vai trò khác nhau. Muốn hợp nhất phải đối soát giao dịch thủ công, hoàn tiền, COD và invoice snapshot trước.

## Truy vấn và tháng

- Kho/Orders: month_key là tháng vận hành; giữ ALL là lựa chọn chủ động. Không suy tháng này từ purchase_date vì có chuyển tồn.
- Lô mua: lọc purchase_batches.purchase_date theo khoảng ngày. Nhận hàng/QC: hàng đợi theo status xuyên tháng.
- Xem từng máy/phiếu mới lấy lịch sử lớn. Không thêm GIN lên qc_details khi UI không tìm kiếm nội dung JSON.
- Chỉ thêm index sau EXPLAIN trên dữ liệu đại diện; index nhiều làm tăng chi phí ghi. Ưu tiên đo month_key + active, FK repair_job_id và lọc lô theo purchase_date. Tham khảo [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization).

## Triển khai

Chạy migration mới sau shared_qc_details trên DB hiện hữu. `init_full_db.sql` là bản reset được generator sinh, không dùng nâng cấp DB vận hành. Chưa áp dụng lên Supabase thật; số lượng hàng/dung lượng tiết kiệm cần đo trên môi trường đó. Kiểm thử local gồm giữ dữ liệu trước/sau migration, chạy lại migration, constraint còn hiệu lực, bốn nhánh QC và seed/ledger.

Kết quả local: `workflow-cleanup-verification.mjs` đạt 3 nhóm kiểm tra (hash/count toàn bộ 38 bảng không đổi sau hai lần migration; bỏ đúng đối tượng dư; guard và báo cáo còn hoạt động). `clean-schema-db-verification.mjs` đạt 19/19. Đây là PGlite, chưa phải bằng chứng hiệu năng production.
