# CitiLap Admin — Toàn bộ logic hệ thống

Ngày cập nhật: 25/09/2026

Tài liệu này mô tả kiến trúc, dữ liệu, luồng thao tác và quy tắc nghiệp vụ sau khi đơn giản hóa quy trình nhập hàng.

## 1. Nguyên tắc dữ liệu

CitiLap Admin quản lý vòng đời laptop từ mua hàng, nhận hàng, QC, bán, thanh toán đến sau bán hàng.

> Một máy dự kiến hoặc máy vật lý chỉ có một `laptops.id` từ lúc tạo lô mua đến khi kết thúc vòng đời.

Hệ thống không tạo thực thể máy trung gian và không tạo laptop mới khi nhận hàng. Mọi module liên kết trực tiếp đến laptop.

## 2. Kiến trúc ứng dụng

```text
Component/page
  → Next.js Route Handler /api/*
  → requireUser + kiểm tra role + validate
  → Supabase query hoặc PostgreSQL RPC
  → response đã lọc
  → state trang / InventoryContext
```

- `app/(dashboard)`: route giao diện.
- `components/pages`: bảng, form và modal nghiệp vụ.
- `app/api`: xác thực, phân quyền, validate và gọi database.
- `context/AuthContext.jsx`: session, profile và role.
- `context/InventoryContext.jsx`: tháng, laptop, order, option, khách hàng và tải song song.
- `lib/apiAuth.js`: biên bảo mật API.
- `lib/apiClient.js`, `lib/services/dbService.js`: chuyển đổi API/DB.
- `db/migrations/20260925_clean_baseline.sql`: schema chuẩn duy nhất.

Ứng dụng dùng Next.js App Router, React và Supabase Auth/PostgreSQL.

## 3. Xác thực và phân quyền

`user_profiles` lưu tên, role và trạng thái hoạt động. Các role chính gồm ADMIN, SALES, TECH/TECHNICAL và STAFF.

Browser chỉ đọc profile của chính phiên đăng nhập. Dữ liệu nghiệp vụ đi qua Route Handler. Service role chỉ tồn tại phía server và chỉ được dùng sau khi request đã được xác thực, phân quyền và kiểm tra payload.

## 4. Trạng thái laptop

| Mã | Hiển thị | Ý nghĩa |
|---|---|---|
| `in_transit` | Chưa về hàng | Đã mua, chưa nhận tại Việt Nam |
| `waiting_qc` | Chờ QC | Đã nhận, chờ hoặc đang QC |
| `available` | Sẵn hàng | Đạt QC và có thể bán |
| `reserved` | Đã cọc | Đang được order giữ |
| `sold` | Đã bán | Đã cam kết bán/giao |
| `repair` | Đang sửa chữa | Đang có quy trình sửa |
| `supplier_return` | Back lại NCC | Đang xử lý trả nhà cung cấp |
| `ignored` | Bỏ qua | Không tham gia vận hành |

Tiến trình QC nằm trong `qc_inspections`, không tạo thêm trạng thái laptop. Không còn `laptops.is_locked`; khả năng bán được xác định bằng status, order và guard trong database.

Nguồn laptop:

- `SUPPLIER_PURCHASE`: máy mua trực tiếp trong một lô.
- `SUPPLIER_REPLACEMENT`: máy nhà cung cấp gửi thay thế.
- `UNKNOWN`: đã nhận nhưng chưa rõ lô hoặc nhà cung cấp.
- `TRADE_IN`: máy thu cũ đổi mới.

## 5. Tháng nghiệp vụ

`month_key` có dạng `MM/YYYY`.

- Máy mới trong lô thuộc tháng mua.
- Khi nhận, máy giữ tháng mua; ngày nhận thực tế nằm trong `received_at`.
- Inventory và Orders mặc định tải tháng đang chọn.
- `ALL` là lựa chọn chủ động.
- Chuyển tháng dùng nghiệp vụ roll-forward, không sửa tùy tiện lịch sử.

## 6. Nhà cung cấp và lô mua

Trang `/suppliers` quản lý thông tin nhà cung cấp. Lô mới chỉ chọn nhà cung cấp hoạt động.

Tại `/purchases`, người dùng nhập nhà cung cấp, ngày mua, tỷ giá, ghi chú và một hoặc nhiều máy. Mỗi máy có tên, phân loại máy, giá RMB, serial tùy chọn, mã vận chuyển Trung Quốc, phí vận chuyển RMB và ghi chú. Tên máy dùng chung `preset_configs` với modal thêm/sửa laptop và mục **Gợi ý Cấu hình Sản phẩm** trong Settings; phân loại máy được chọn từ nhóm `category`.

`POST /api/intake` action `create_batch` gọi `create_direct_purchase_batch`. Trong một transaction, RPC:

1. Kiểm tra nhà cung cấp, tỷ giá và các dòng máy.
2. Tạo `purchase_batches`.
3. Tạo trực tiếp một `laptops` cho từng máy với trạng thái `in_transit`.
4. Lưu nguồn, giá và mã vận chuyển ngay trên laptop.
5. Ghi audit log.

Idempotency key ngăn retry tạo trùng. Chi tiết lô là danh sách laptop thật; không còn `purchase_items`.

## 7. Nhận hàng

Tại `/receiving`, người dùng tìm bằng mã vận chuyển, serial, model hoặc ID và có thể chọn nhiều máy thuộc nhiều lô.

Action `receive` gọi `receive_direct_laptops`:

1. Khóa các laptop đã chọn.
2. Chỉ nhận laptop `in_transit`.
3. Cập nhật thông tin thực nhận trên đúng ID.
4. Ghi người nhận và ngày nhận do người dùng chọn; giữ nguyên tháng mua của laptop.
5. Chuyển sang `waiting_qc`.
6. Ghi stock movement và audit log.

Không còn shipment, shipment item hoặc receiving session.

### Máy chưa rõ nguồn

Action `create_unknown` tạo laptop nguồn `UNKNOWN` ở `waiting_qc`. Máy có thể QC ngay.

Khi xác định được nguồn, action `reconcile` chọn máy UNKNOWN và placeholder `SUPPLIER_PURCHASE` tương ứng. RPC giữ ID của máy đã nhận, gắn dữ liệu nguồn/lô/giá, chuyển các liên kết cần thiết và xóa placeholder. Sau thao tác chỉ còn một laptop cho máy vật lý.

## 8. Danh sách laptop

Trang `/inventory` hiển thị cả máy chưa về, chờ QC, sẵn hàng và các trạng thái sau đó. Người dùng lọc theo tháng, trạng thái, nguồn và từ khóa; xem tên máy, serial, giá, vị trí và lịch sử.

Nút thêm máy điều hướng sang quy trình nhập hàng. Form kỹ thuật không cho sửa status. API inventory cũng chặn tạo laptop tùy ý và chặn đổi trạng thái trực tiếp.

## 9. QC

Trang `/qc` lấy laptop `waiting_qc` và lịch sử inspection.

- Chỉ máy `waiting_qc` được bắt đầu QC.
- Mỗi laptop chỉ có một phiên `IN_PROGRESS`.
- Checklist không được trùng key.
- PASS không được còn mục FAIL hoặc mục bắt buộc chưa test.
- PASS chuyển máy sang `available` và ghi `available_for_sale_at`.
- FAIL giữ máy ở `waiting_qc`; lỗi nằm trong lịch sử QC.

## 10. Sửa chữa

Trang `/repairs` quản lý repair job.

- Tạo phiếu sửa chuyển laptop sang `repair`.
- Phiếu lưu lỗi, chẩn đoán, linh kiện, chi phí và người xử lý.
- Hoàn tất sửa đưa laptop về `waiting_qc` để QC lại.
- Transition phải đi qua RPC chuyên biệt.

## 11. Trả nhà cung cấp

`/supplier-returns` quản lý back NCC, hoàn tiền và đổi máy.

- Phiếu liên kết trực tiếp laptop nguồn.
- Nhà cung cấp được suy ra từ lô của laptop nguồn.
- Tạo phiếu và chuyển laptop nguồn sang `supplier_return` diễn ra trong cùng transaction; hủy phiếu khôi phục trạng thái trước đó.
- Máy thay thế là một laptop thật, không qua purchase item.
- Máy thay thế nhận về đi qua `waiting_qc` và QC bình thường.
- Kết quả tài chính được ghi vào ledger phù hợp.

## 12. Khách hàng và đơn hàng

`/customers` quản lý tên, số điện thoại và địa chỉ. Số điện thoại có ràng buộc duy nhất khi có giá trị.

`/orders` quản lý đơn với luồng chính:

```text
new → deposited → prepared → shipping → done
                    ↘ cancelled / returned
```

- `laptop_id` là máy vật lý đã phân bổ.
- `requested_laptop_id` là yêu cầu cọc chưa phân bổ độc quyền.
- Đơn cọc hợp lệ làm laptop thành `reserved`.
- Đơn prepared/shipping/done làm laptop thành `sold`.
- Hủy, trả hoặc hết giữ giải phóng máy nếu không còn order khác.
- Advisory lock và trigger ngăn hai request giữ cùng laptop.

Form đơn lưu trạng thái, thanh toán, giao hàng, giá, COD, khách hàng, mã vận đơn, cài đặt, bảo hành, chi nhánh và combo phụ kiện. Trường quà cũ `gifts` đã loại; quà dùng `gift_accessory_ids` và `gift_preset`.

## 13. Đặt cọc và Action Center

`/reservations` hiển thị giữ máy đang hoạt động, sắp hết hạn và quá hạn. Gia hạn, phân bổ hoặc giải phóng đều qua RPC để đồng bộ order/laptop.

Action Center gom các ngoại lệ cần xử lý: giữ máy hết hạn, COD quá hạn, công nợ, trade-in và commission theo quyền.

## 14. Thanh toán khách hàng

`payments` là ledger append-only. RPC thanh toán:

1. Khóa order.
2. Kiểm tra số tiền và loại giao dịch.
3. Ghi payment.
4. Ghi financial record.
5. Ghi account transaction nếu có tài khoản.
6. Đồng bộ đã thu, công nợ và payment status.
7. Đồng bộ phần thanh toán của invoice đã phát hành.

Order/payment dùng triệu VND; account ledger và thành phần giá vốn dùng VND.

## 15. Tài chính

- `/finance/accounts`: tiền mặt, ngân hàng và WeChat.
- `/finance/transactions`: sổ giao dịch.
- `/finance/cod`: khoản COD phải thu và đối soát.
- `/finance/receivables`: phải thu.
- `/finance/payables`: phải trả.
- `/finance`: báo cáo tổng hợp.

Ledger có idempotency key và tham chiếu nguồn. Reconciliation tạo dấu vết đối soát thay vì viết lại lịch sử.

## 16. Thanh toán nhà cung cấp và giá vốn

`/supplier-payments` ghi thanh toán cho lô. Công nợ tiền hàng được suy ra từ tổng giá mua của laptop thuộc lô. `supplier_payments` là append-only và có idempotency key.

`/costs` trình bày giá vốn theo laptop:

- Giá mua quy đổi.
- Phí vận chuyển nội địa Trung Quốc trực tiếp.
- Nâng cấp/phụ kiện và chi phí trực tiếp hợp lệ.
- Phí vận chuyển Việt Nam hoặc điều chỉnh thủ công hiện hành.

Không còn cost allocation theo shipment và không còn `/api/cost-allocations`. Phí vận chuyển được tách rõ để không cộng hai lần.

## 17. Hóa đơn và phụ kiện

Khi phát hành invoice:

- Order ở trạng thái cho phép.
- Có laptop, khách hàng, chi nhánh và khoản cọc/thanh toán hợp lệ.
- Hệ thống lưu snapshot order, khách, laptop, chi nhánh và item.
- Phần payment tiếp tục đồng bộ từ ledger.
- Thông tin hàng hóa/khách hàng trong snapshot không đổi theo dữ liệu sau này.

## 18. Bảo hành, trade-in và commission

`/warranty` theo dõi case bảo hành trực tiếp theo order/laptop. Trạng thái warranty là trạng thái case, độc lập với tám trạng thái laptop.

`/trade-ins` quản lý nghĩa vụ thu cũ đổi mới. Laptop nhận lại dùng nguồn `TRADE_IN`.

`/commissions` quản lý commission của sale và ledger chi trả. Thao tác tài chính đi qua RPC có guard.

## 19. Dashboard

Dashboard tải song song các nguồn độc lập và dùng RPC tổng hợp phía server. Nội dung gồm:

- Số laptop theo tám trạng thái.
- Máy chờ QC và phiên QC đang chạy.
- Tuổi tồn kho và giá trị tồn.
- Repair, supplier return và máy thay thế.
- Doanh số, lợi nhuận, đã thu, COD, phải thu/phải trả.
- Action Center.

## 20. Cài đặt và audit

`/settings` quản lý app options, công thức và người dùng theo quyền. Order/payment/warranty có namespace trạng thái riêng; các mã `deposited` hoặc `repairing` trong module con không phải trạng thái laptop cũ.

`activity_logs` là append-only. Các thao tác quan trọng dùng transaction, row/advisory lock, idempotency key, foreign key, unique index và RPC transition.

## 21. Tải dữ liệu và hiệu năng

- Request độc lập được tải đồng thời.
- Mặc định chỉ tải cohort tháng hiện tại.
- Dashboard tổng hợp trong database.
- Index ưu tiên month, status, reference và ngày.
- Sau mutation chỉ refresh nguồn liên quan.
- Retry an toàn nhờ idempotency.

## 22. Schema sạch

Các bảng cũ đã loại:

- `purchase_items`.
- `shipments`, `shipment_items`.
- `receiving_sessions`, `receiving_items`, `receiving_exceptions`.
- `intake_receipts`, `unmatched_received_items`.
- `cost_allocations`, `cost_allocation_items`.

Migration lịch sử nằm tại `db/migrations_archive/legacy/`; bootstrap cũ tại `db/migrations_archive/legacy_core.sql`. Chúng không tham gia build reset.

## 23. Reset và triển khai

`qa/build-db-init.mjs` sinh `init_full_db.sql` từ migration đang hoạt động. File init sao lưu/khôi phục profile và thay toàn bộ schema public.

Quy trình:

1. Tạo lại init.
2. Chạy PGlite kiểm tra schema và seed.
3. Chạy init bằng quyền postgres trên Supabase.
4. Chạy seed nếu cần.
5. Chạy live E2E.
6. Kiểm tra browser theo role.

Vercel dùng biến môi trường Supabase hiện tại. Service role chỉ cấu hình ở server.

## 24. Kiểm tra

```powershell
node qa/clean-schema-db-verification.mjs
node qa/validate-db-reset.mjs
npm.cmd run lint
npm.cmd run build
git diff --check
```

Sau khi áp dụng schema lên Supabase:

```powershell
node qa/live-procurement-inventory-e2e.mjs
node qa/live-full-regression-e2e.mjs
```

Kết quả local/PGlite không thay thế bằng chứng Supabase live, RLS hoặc browser.

## 25. Đề xuất tối ưu tiếp theo

### P0 — độ đúng dữ liệu

- Áp dụng baseline lên database mục tiêu và chạy live E2E.
- Mở rộng live mutation test cho order, payment, QC, repair và supplier return.
- Kiểm tra dữ liệu production trước khi reset để phát hiện constraint/index xung đột.

### P1 — tốc độ thao tác

- Nhận hàng bằng scanner/mã vận chuyển với focus tự động.
- Bulk receive và báo lỗi theo từng dòng.
- Cache theo tháng, invalidation theo module.
- Chỉ refresh vùng dữ liệu bị ảnh hưởng sau mutation.

### P2 — quan sát và báo cáo

- Đo thời gian API/RPC và số query mỗi màn hình.
- Cảnh báo máy `in_transit` quá lâu, UNKNOWN chưa đối soát và QC tồn.
- Xuất báo cáo lô mua, chênh lệch nguồn và lịch sử hợp nhất.
- Tự động hóa browser matrix theo role trên staging.
