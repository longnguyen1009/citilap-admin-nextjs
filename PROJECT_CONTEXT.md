# CitiLap Admin — Project Context

> Cập nhật Cloudflare 2026-10-01: runtime hiện tại là Next.js full-stack trên Cloudflare Workers, D1 cho dữ liệu/auth/session và R2 cho ảnh/cache. Mọi Route Handler dùng binding theo request và D1 session; dependency Supabase đã được gỡ. `db/migrations/`, `supabase/migrations/`, `init_full_db.sql` và các báo cáo Supabase bên dưới là tài liệu lịch sử để đối chiếu nghiệp vụ, không phải quy trình deploy hiện tại. Xem `docs/cloudflare/STATUS.md`, `db/d1/migrations/` và `wrangler.jsonc` để vận hành môi trường mới.
>
> Cập nhật local 2026-10-06: chuỗi D1 hiện có migration `0020_integrity_consolidation.sql`; kiểm thử full-chain áp dụng 20/20 migration từ DB trắng, foreign key sạch. Quy tắc lợi nhuận đơn hàng canonical là `sale_price - laptops.import_price_vnd`; cost snapshot khi chốt đơn dùng cùng giá vốn này. Các thay đổi 2026-10-06 chưa được deploy production.

## Mục tiêu hệ thống

CitiLap Admin là hệ thống vận hành nội bộ cho vòng đời laptop, từ mua hàng tại Trung Quốc, nhận hàng, QC, bán hàng, thanh toán, bảo hành, sửa chữa, trả nhà cung cấp đến báo cáo tài chính.

Nguyên tắc dữ liệu trung tâm:

> Một máy dự kiến hoặc máy vật lý luôn là đúng một bản ghi `laptops` từ lúc tạo lô mua đến khi bán.

Không tạo một thực thể máy trung gian khi mua hàng và không tạo laptop mới khi nhận hàng. ID laptop phải giữ nguyên xuyên suốt toàn bộ vòng đời.

## Kiến trúc chạy thực tế

- Frontend và Route Handler: Next.js App Router trong `app/`.
- Giao diện nghiệp vụ: `components/pages/`.
- Trạng thái dùng chung và tải dữ liệu: `context/InventoryContext.jsx`.
- Xác thực và phân quyền API: `lib/apiAuth.js`.
- Kết nối Supabase phía server: `lib/supabaseAdmin.js` và các Route Handler.
- Schema nền: `db/migrations/20260925_clean_baseline.sql`; các migration sau đó là bản nâng cấp tăng dần.
- Chuỗi nền đã có trong `db/migrations/` chạy trước; nâng cấp mới do CLI sinh nằm ở `supabase/migrations/` và chạy sau toàn bộ chuỗi nền. Không trộn sort hai thư mục theo tên ngày.
- Script reset sinh tự động: `init_full_db.sql`.
- Dữ liệu kiểm thử: `reseed_data.sql`.
- Migration lịch sử chỉ để tra cứu: `db/migrations_archive/legacy/`.

Không sửa trực tiếp `init_full_db.sql`. Sau khi thay đổi migration chuẩn, chạy:

```powershell
node qa/build-db-init.mjs
```

## Mô hình laptop

Các trạng thái chính của laptop:

| Trạng thái | Ý nghĩa |
|---|---|
| `in_transit` | Đã mua, chưa nhận tại Việt Nam |
| `waiting_qc` | Đã nhận, đang chờ hoặc đang xử lý QC |
| `available` | Đã đạt QC và sẵn sàng bán |
| `reserved` | Đang được đơn hàng giữ/cọc |
| `sold` | Đã bán |
| `repair` | Đang sửa chữa |
| `supplier_return` | Đang hoặc đã back nhà cung cấp |
| `ignored` | Bỏ qua khỏi vận hành |

Tiến trình QC đang chạy được lưu tại `qc_inspections.status`, không tạo thêm trạng thái chính cho laptop. Laptop FAIL QC vẫn ở `waiting_qc` cho đến khi được đưa sang sửa, back nhà cung cấp hoặc xử lý tiếp.

Nguồn máy:

- `SUPPLIER_PURCHASE`: máy mua trực tiếp trong một `purchase_batch_id`.
- `SUPPLIER_REPLACEMENT`: máy nhà cung cấp gửi thay thế.
- `UNKNOWN`: nhận thực tế nhưng chưa xác định lô hoặc nhà cung cấp.
- `TRADE_IN`: máy thu cũ đổi mới.

Với nguồn nhà cung cấp, mỗi laptop lưu trực tiếp tên máy, phân loại máy, serial dự kiến/thực tế, giá RMB, phí vận chuyển nội địa phân bổ, mã vận chuyển Trung Quốc và ghi chú. `purchase_batches` chỉ là phần đầu lô mua; danh sách máy nằm trong `laptops`. Khi nhập lô hoặc thêm/sửa laptop, tên máy được gợi ý từ `preset_configs` do mục **Gợi ý Cấu hình Sản phẩm** trong Settings quản lý; phân loại được chọn từ nhóm `category`.

## Luồng nhập hàng

### Tạo lô mua

Trang `/purchases` gọi `POST /api/intake` với action `create`.

RPC `create_purchase_batch` thực hiện trong một transaction:

1. Kiểm tra nhà cung cấp, tỷ giá và danh sách máy.
2. Tạo `purchase_batches`.
3. Tạo một bản ghi `laptops` cho từng máy với trạng thái `in_transit`.
4. Lưu giá mua, phí vận chuyển, mã vận chuyển và nguồn lô ngay trên laptop.
5. Ghi audit log.

Idempotency key ngăn thao tác lặp tạo lô hoặc máy trùng.

### Danh sách lô

Trang nhập hàng hiển thị lô, nhà cung cấp, số máy, đã nhận, chưa nhận, tổng giá máy và phí vận chuyển. Mở một lô để xem từng laptop và trạng thái nhận của chính ID đó.

### Nhận hàng đã xác định

Trang `/receiving` tìm laptop bằng mã vận chuyển, serial, model hoặc ID. Một lần nhận có thể chọn nhiều laptop từ nhiều lô khác nhau.

RPC `receive_purchase_laptops`:

1. Khóa các laptop được chọn.
2. Chỉ nhận máy đang `in_transit`.
3. Cập nhật serial và thông tin thực nhận trên đúng bản ghi đó.
4. Chuyển trạng thái sang `waiting_qc`.
5. Ghi thời điểm, người nhận, stock movement và audit log.

Không có shipment, shipment item hay receiving session.

### Máy nhận không rõ nguồn

RPC `receive_unknown_laptop` tạo laptop nguồn `UNKNOWN` ở trạng thái `waiting_qc`. Máy có thể đi QC ngay dù chưa xác định nguồn.

Khi rà soát được nguồn, action `reconcile` gọi `reconcile_unknown_laptop`:

1. Giữ nguyên ID của máy đã nhận.
2. Gắn máy đó vào lô và dữ liệu nguồn chính xác.
3. Chỉ cho phép hợp nhất với máy dự kiến chưa phát sinh lịch sử nghiệp vụ.
4. Loại máy dự kiến đó để không tồn tại hai laptop cho cùng một máy; lịch sử máy vật lý được giữ nguyên.
5. Ghi dấu vết hợp nhất trong audit log.

## Tháng vận hành

`month_key` có dạng `MM/YYYY`.

- Máy `in_transit` thuộc cohort tháng mua.
- Khi nhận hàng, laptop giữ cohort tháng mua; `received_at` lưu ngày nhận thực tế do người dùng chọn.
- Inventory và Orders mặc định chỉ tải tháng đang chọn.
- `ALL` là lựa chọn chủ động, không phải mặc định.

## QC và sửa chữa

- Chỉ laptop `waiting_qc` được bắt đầu QC.
- Một laptop chỉ có một phiên QC đang hoạt động.
- PASS chuyển laptop sang `available` và ghi `available_for_sale_at`.
- FAIL giữ laptop ở `waiting_qc`; kết quả chi tiết nằm trong lịch sử QC.
- Tạo phiếu sửa chuyển laptop sang `repair`.
- Hoàn tất sửa đưa laptop về `waiting_qc` để kiểm tra lại.
- Hoàn tất QC dùng duy nhất `complete_quick_qc`: Đạt, Chưa đạt, Cần sửa chữa, BACK về TQ. Hai lựa chọn cuối tự tạo phiếu sửa/trả trong cùng transaction.
- Phiên mới không sinh checklist. `qc_check_items` chỉ giữ lịch sử cũ; API không còn action `save`/`complete` kiểu checklist.

Các thay đổi trạng thái kỹ thuật phải đi qua RPC nghiệp vụ; API inventory không cho sửa trạng thái trực tiếp.

## Đơn hàng và tồn kho

Đơn hàng dùng `orders.laptop_id` cho máy vật lý đã phân bổ và `requested_laptop_id` cho yêu cầu cọc chưa phân bổ độc quyền.

Trạng thái laptop bán hàng được suy ra và đồng bộ bởi RPC:

- Đơn giữ/cọc hợp lệ → `reserved`.
- Đơn chuẩn bị, đang giao hoặc hoàn thành → `sold`.
- Hủy, hoàn hoặc hết giữ → trở về `available` nếu không còn đơn khác giữ máy.

Advisory lock và trigger chống hai đơn giữ cùng một laptop. Chỉ laptop `available` hoặc `reserved` hợp lệ mới được chọn vào đơn.

Thanh toán là sổ append-only trong `payments`, đồng thời ghi `financial_records` và giao dịch tài khoản tiền. Tổng đã thu và công nợ của order được đồng bộ từ nghiệp vụ thanh toán.

## Giá vốn và tài chính nhà cung cấp

Giá vốn laptop được tính từ dữ liệu trực tiếp trên laptop:

- Giá mua RMB × tỷ giá nguồn.
- Phí vận chuyển nội địa Trung Quốc đã phân bổ cho máy.
- Các chi phí trực tiếp còn lại theo mô hình hiện hành.

Không còn bảng cost allocation hoặc phân bổ chi phí theo shipment.

Công nợ một lô được suy ra từ tổng giá mua của các laptop thuộc lô. `supplier_payments` là sổ thanh toán nhà cung cấp bất biến và có idempotency key. Phí vận chuyển được trình bày riêng, không cộng hai lần vào tiền hàng phải trả.

## Bảo hành, trả nhà cung cấp và máy thay thế

- Warranty case liên kết trực tiếp order và laptop.
- Repair job liên kết trực tiếp laptop.
- Supplier return liên kết laptop gốc và có thể liên kết laptop thay thế.
- Nhà cung cấp được suy ra từ lô mua của laptop; người dùng không chọn lại thủ công.
- Tạo phiếu trả chuyển laptop sang `supplier_return` trong cùng transaction; hủy phiếu khôi phục trạng thái trước đó.
- Máy thay thế được tạo như một laptop thật, không qua `purchase_items`.
- Trạng thái laptop nguồn được đồng bộ qua các RPC chuyên biệt.

## API và bảo mật

Browser chỉ đọc profile của chính phiên đăng nhập. Dữ liệu nghiệp vụ đi qua Route Handler đã xác thực và phân quyền; Supabase service role chỉ tồn tại phía server.

Các thao tác quan trọng dùng RPC transaction và idempotency key. `activity_logs`, payment ledger và supplier payment ledger là append-only.

Các route chính còn hoạt động gồm inventory, orders, intake, purchases, suppliers, supplier-payments, QC, repairs, supplier-returns, warranty, invoices, costs, finance và sales operations. Không còn route shipment, receiving kiểu cũ hoặc cost allocation.

`/api/purchases` chỉ đọc tổng hợp và chi tiết lô. Toàn bộ ghi nhập hàng đi qua `/api/intake`. Inventory chỉ có một DTO đầy đủ; nhánh `unified=true` rút gọn đã bỏ. `lib/apiClient.js` truy cập bảng trực tiếp kiểu cũ đã được xóa; browser dùng `lib/apiFetchers.js`.

## Reset và kiểm tra

### Cọc theo cấu hình và phân máy (2026-09-29)

- `requested_laptop_id` là máy tham khảo; `requested_configuration` và `requested_category` lưu yêu cầu trên đơn. Nhiều khách có thể cọc cùng cấu hình mà không giữ laptop.
- `laptop_id` là phân bổ vật lý độc quyền. Chỉ thao tác phân máy mới giữ máy; trạng thái `reserved` hiển thị “Đã giữ cho đơn”.
- `/api/order-allocation` cho ADMIN/SALES chọn, giải phóng hoặc chuyển máy. RPC kiểm tra chủ giữ hiện tại, khóa transaction và ghi audit; tiền đã thu vẫn thuộc đơn gốc.
- Đơn `prepared`, `shipping`, `done` bắt buộc có máy và không chuyển bằng thao tác phân máy. Đơn chưa phân máy chưa hiển thị lợi nhuận.
- List laptop hiển thị đơn đã thu tiền chờ phân theo cùng tên cấu hình và phân loại, đọc tất cả tháng. Các đơn cũ có `laptop_id` vẫn giữ phân bổ hiện tại.
- Kịch bản hồi quy phân máy đã được dọn khỏi checkout ngày 30/09/2026; kết quả trước đó chỉ là bằng chứng lịch sử.

Reset toàn bộ môi trường phát triển:

1. Chạy `init_full_db.sql` bằng quyền postgres trong Supabase SQL Editor.
2. Chạy `reseed_data.sql` nếu cần dữ liệu mẫu.
3. Không chạy migration trong `db/migrations_archive/`.

Kiểm tra cục bộ:

```powershell
npm.cmd run lint
npm.cmd run build
git diff --check
```

Các script kiểm thử local/live và ảnh QA đã được dọn theo yêu cầu ngày 30/09/2026. Các kết quả trong báo cáo cũ là bằng chứng lịch sử, không phải lệnh kiểm thử còn có sẵn. Sau khi áp dụng schema cần kiểm tra lại luồng nghiệp vụ trên môi trường test trước khi dùng thực tế.

Luôn phân biệt rõ kết quả kiểm tra tĩnh/PGlite với kết quả Supabase live và kiểm tra trình duyệt.
