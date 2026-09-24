# CitiLap Admin — Toàn bộ logic hệ thống

Ngày rà soát: 2026-09-24. Tài liệu này mô tả code hiện tại trong workspace để onboarding, vận hành và lập kế hoạch tối ưu. Phần cần Supabase/browser live được đánh dấu ở cuối.

## 1. Kiến trúc và luồng request

CitiLap Admin dùng Next.js 16, React 19, Supabase Auth/PostgreSQL và route handler server-side.

    Component → apiFetchers → /api/module → requireUser
      → sanitize/validate → Supabase/RPC → filter dữ liệu nhạy cảm
      → JSON → page state hoặc InventoryContext

Các lớp chính:

- `app/(dashboard)`: route pages và layout dashboard.
- `app/api`: auth, validation, query/RPC và response.
- `components/pages`: màn hình nghiệp vụ, form, modal, bảng.
- `context/AuthContext`: session, profile, role, login/logout.
- `context/InventoryContext`: laptops, orders, options, months, customers, payments.
- `lib/apiFetchers.js`: gọi API từ browser.
- `lib/apiAuth.js`: `requireUser`, sanitize, validators, sensitive field policy.
- `lib/services/dbService.js`: mapping camelCase/snake_case và Supabase server operations.
- `db/migrations`: schema, constraints, trigger, RPC, hardening.

Luồng nghiệp vụ tổng quát:

    Supplier → Purchase batch → Shipment → Receiving → QC
      → Available inventory → Reservation/Deposit → Order
      → Delivery → Payment/COD → Completed/Invoice

Nhánh lỗi: QC FAIL → Repair hoặc Supplier Return → Replacement/Refund → QC lại.

## 2. Auth và quyền

`AuthContext` khôi phục session Supabase, đọc `user_profiles` theo auth user id, kiểm tra `is_active`, rồi mới cho dashboard hiển thị. Thiếu profile hoặc user bị khóa sẽ bị sign out. Logout xóa state CitiLap trước rồi sign out Supabase.

Role được server tin cậy:

| Role | Quyền chính |
|---|---|
| `ADMIN` | Toàn hệ thống, tài chính, giá vốn/lợi nhuận, users, cấu hình |
| `SALES` | Khách hàng, laptop, order, bán hàng trong policy |
| `TECH` | QC, repair, dữ liệu kỹ thuật |
| `TECHNICAL` | Quyền kỹ thuật theo allowlist API |
| `STAFF` | Các route vận hành được allowlist |

`requireUser` xác minh Bearer token bằng server client, đọc role từ DB và trả 401/403. Ẩn menu chỉ là UX, không phải security boundary.

`sanitizePayload` chỉ giữ field allowlist, đổi key, strip HTML và chặn field nhạy cảm với non-admin. Validator kiểm tra ID, text length, số không âm, month key, payment totals và phụ kiện.

## 3. Mô hình dữ liệu

### Danh mục

- `user_profiles`: profile Auth, role, active.
- `app_options`: status, location, nguồn sale, phương thức giao/thu tiền, category, seller.
- `app_settings`: công thức và cấu hình JSON.
- `customers`: tên, điện thoại, địa chỉ.
- `branches`: chi nhánh bán.
- `accessories`: phụ kiện tặng trên hóa đơn.

### Laptop

`laptops` là tài sản vật lý: sku, serial, cấu hình, ngày nhập, `month_key`, vị trí, seller, status, lock, giá RMB/VND, battery, charger/component, condition, supplier và `purchase_item_id`.

Serial có unique index không phân biệt hoa thường sau trim. Giá không âm, battery từ 0 đến 100.

Trạng thái quan trọng:

    waiting_qc → qc_in_progress → available hoặc qc_failed
    qc_failed → repairing → qc_in_progress
    available → deposited → sold
    available/deposited → returned_cn hoặc skipped

Laptop nhận từ shipment bắt đầu `waiting_qc`; chỉ QC PASS mới thành `available`.

### Order và ledger

`orders` lưu thông tin bán, order/payment/delivery status, laptop vật lý, `requested_laptop_id`, khách hàng, COD, aggregate thanh toán và snapshot bán. `payments` là từng khoản deposit/balance/cod/refund/other. `financial_records` là sổ thu/chi. `cash_accounts` và `account_transactions` là ledger theo tài khoản tiền.

`amount_paid`, `debt_amount`, `deposit_amount`, `cod_amount` được guard/normalize ở DB. COD là số tiền giao đơn vị vận chuyển thu, không mặc định là số đã thu.

### Nhập hàng/logistics

- `suppliers`: nhà cung cấp.
- `purchase_batches`: lô mua, tỷ giá, chi phí, destination, status.
- `purchase_items`: từng máy trong lô, model, serial dự kiến, giá RMB.
- `supplier_payments`: ledger thanh toán NCC append-only.
- `shipments`/`shipment_items`: vận chuyển.
- `receiving_sessions`/`receiving_items`/`receiving_exceptions`: nhận hàng và sai lệch.

### QC/hậu mãi

- `qc_inspections`/`qc_check_items`: phiên QC và checklist.
- `repair_jobs`/`repair_parts`/`repair_actions`: sửa chữa.
- `supplier_returns`: trả NCC, refund/replacement.
- `warranty_cases`: bảo hành khách hàng.
- `stock_movements`: lịch sử kho.
- `activity_logs`: audit append-only.
- `reservations`, `trade_ins`, `commissions`: bán hàng mở rộng.
- `invoices`: snapshot order/customer/branch/items/payment.

## 4. Inventory và chống bán trùng

`order_uses_laptop` xem order đang chiếm laptop khi có laptop id, còn active, chưa refund/cancel/return và status là `prepared`, `shipping`, `done`, hoặc deposit còn hạn.

`prevent_laptop_double_reservation` khóa advisory theo laptop rồi kiểm tra order khác đang giữ cùng máy. `guard_order_sellable_laptop` chặn laptop `waiting_qc`, `qc_in_progress`, `qc_failed`, inactive hoặc status không bán được.

`refresh_laptop_inventory` lock laptop, đồng bộ `orders.laptop_locked`, kiểm tra order committed/locked và requested deposit, rồi đặt laptop về `sold`, `deposited`, `available` hoặc giữ status kỹ thuật.

## 5. Logic order và payment

### Tạo order

API buộc `salePrice` và `orderType`, không cho client tự mở payment bất hợp lệ. RPC normalize financial fields, set `month_key`, kiểm tra laptop, chống trùng, insert order, tạo payment opening nếu hợp lệ, refresh inventory, ghi stock movement và trả state mới.

### Sửa order

API đọc bản cũ để kiểm tra quyền/tháng và diff audit. RPC lock order/laptop cũ-mới theo thứ tự ổn định, normalize, cập nhật metadata, refresh inventory, ghi movement và trả order/laptop.

Sau khi bỏ field legacy `gifts`, order chỉ dùng `giftPreset` và `giftAccessoryIds`. Hai migration `20260926_remove_legacy_gifts.sql` và `20260927_patch_order_rpc_after_gifts_removal.sql` phải được apply trên Supabase live.

### Ghi payment

`record_order_payment` lock order/laptop, chặn amount không dương hoặc vượt giá bán, insert payment + financial record, cập nhật paid/debt/status, refresh laptop và movement. Refund không vượt số đã thu.

### State order

    new → deposited → prepared → shipping → done
                     ↘ cancelled
    shipping/done → returned

Cancel và return tách bằng reason/timestamp riêng; mutation phải giải phóng inventory và ghi audit.

## 6. Purchase, shipment, receiving

Purchase batch yêu cầu supplier active, 1–200 item, model hợp lệ, giá không âm, tỷ giá dương và idempotency key. Subtotal tính từ item. Chỉ DRAFT được sửa; CONFIRMED khóa field tài chính/item bằng trigger.

Supplier payment lock batch, giới hạn trong công nợ, ghi RMB/VND/tỷ giá/phương thức/reference/idempotency. Ledger append-only; điều chỉnh bằng transaction mới.

Shipment tạo từ purchase item đã xác nhận, không trùng shipment active. Transition chính:

    DRAFT → READY → IN_TRANSIT → AT_CHINA_WAREHOUSE → IN_TRANSIT_VN
                                        → PARTIALLY_RECEIVED → RECEIVED

Receiving chỉ nhận shipment đúng trạng thái. Mỗi item đối chiếu serial/model/sạc; item nhận tạo/cập nhật laptop `waiting_qc`, receiving item, stock movement và exception nếu sai. Shipment và batch được cập nhật theo số item nhận. Idempotency chống submit lặp.

## 7. QC, repair, warranty

Start QC chỉ cho `waiting_qc` hoặc `qc_failed`; một laptop chỉ có một phiên active. Complete QC kiểm tra result, mainboard, charger, cosmetic, checklist không trùng, không PASS khi còn FAIL/NOT_TESTED, mainboard repaired hoặc charger missing. PASS chuyển available; FAIL chuyển qc_failed và giữ lock. Trigger chặn update trực tiếp ngoài RPC.

Repair có thể mở trực tiếp từ QC FAIL. Khi hoàn tất, outcome dẫn đến `RE_QC`, `SUPPLIER_RETURN`, `NO_FURTHER_ACTION` hoặc `OTHER`. Warranty case lưu issue, status, diagnosis, resolution, parts, ngày và repair cost không âm.

## 8. Finance, COD, invoice

Finance gồm dashboard, accounts, account transactions, financial records, payables, receivables, reconciliation và COD. Mutation tiền ưu tiên RPC atomic + idempotency + actor.

COD tạo receivable với carrier/tracking/due date; chỉ khi thực nhận mới ghi payment/account transaction.

Issue invoice yêu cầu order active ở `shipping`/`done`, sale price, branch, laptop, customer hợp lệ và đã thu ít nhất một khoản. Invoice lưu snapshot bất biến; sau issue chỉ payment block được sync.

## 9. Màn hình và thao tác người dùng

- Dashboard `/`: KPI tài sản, máy bán, máy đang giữ, lợi nhuận và việc chờ xử lý.
- Inventory `/inventory`: chọn tháng, search/filter, resize cột, import/export, add/edit/delete, lịch sử, QC/action.
- Orders `/orders`: list theo tháng, search/filter, inline edit/modal, tạo order, chọn laptop/khách, link reservation/trade-in/payment/invoice, hủy/trả có xác nhận.
- Payments `/payments`: chọn order, loại payment, amount, account/method, reference; submit atomic.
- Customers `/customers`: CRUD tên/phone/address.
- QC `/qc`: máy chờ QC, checklist, PASS/FAIL, link tạo repair.
- Repairs `/repairs`: tạo/detail/parts/actions/cancel/complete, link re-QC hoặc trả NCC.
- Procurement `/purchases`, `/suppliers`, `/supplier-payments`: batch, supplier, confirm/cancel, item, payment.
- Logistics `/shipments`, `/receiving`: shipment, transition, nhận hàng, exception.
- Supplier returns `/supplier-returns`: detail, transition, refund/replacement.
- Warranty `/warranty`: case và chi phí.
- Finance: accounts, transactions, payables, receivables, COD, summary.
- Invoices `/invoices`: list, detail, print/PDF.
- Settings `/settings`: options, formula, presets, users, role.

## 10. InventoryContext

Context giữ laptops, orders, warrantyCases, payments, customers, appOptions, formulaConfig, selectedMonth, knownMonths, cloudStatus và loading state.

Khi user/route/month đổi: kiểm tra session, tính dataset cần theo pathname, lấy auth headers một lần, chạy primary/secondary request song song, tắt loading khi laptops/orders sẵn sàng, gắn metadata khi hoàn tất, lưu localStorage và background refresh khoảng 60 giây. Cross-fetch laptop/order có throttle.

## 11. API inventory

Các route gồm inventory, orders, payments, customers, warranty, stock-movements, activity-logs, options, settings, users, management-dashboard, financial-operations, cash-accounts, account-transactions, account-reconciliations, financial-records, cod, payables, receivables, purchases, suppliers, supplier-payments, shipments, receiving, qc, repairs, supplier-returns, costs, cost-allocations, invoice-catalog, invoices, months, month-roll, sales-operations và presets.

Orders/inventory enrichment dùng batch ID và `Promise.all`, tránh N+1 theo từng dòng. Các route detail procurement/logistics/finance cũng chạy query độc lập song song.

## 12. Đề xuất tối ưu hệ thống và thao tác

### P0 — đo trước

1. Thêm timing cho auth, query, enrichment, serialize ở inventory/orders/dashboard/payments.
2. Đo request count, response bytes, query duration và time-to-primary-data.
3. Kiểm tra query plan cho month_key, status, payment date, shipment item, activity log.

### P1 — dữ liệu lớn

1. Thêm server pagination/cursor cho inventory/orders với limit, cursor, search, status, location, monthKey.
2. Chỉ dùng `all=true` cho export/QC/repair đối soát.
3. Trả total/nextCursor/hasMore.
4. Tạo endpoint lightweight cho laptop/order picker.

### P1 — request và payload

1. Gộp options + months thành metadata endpoint có cache ngắn.
2. Dashboard dùng aggregate RPC có owner duy nhất.
3. Mutation trả updated state, tránh chuỗi GET refresh.
4. Rà soát `select('*')`, thay bằng field list theo role sau khi đo.

### P1 — giảm click

1. Receive xong có nút Mở QC.
2. QC FAIL có nút Tạo phiếu sửa.
3. Repair complete có Tái QC hoặc Trả NCC.
4. Tạo reservation/order mở thẳng bước Thu tiền.
5. Batch receive nhiều máy trong transaction; không batch payment khi thiếu reconciliation.
6. Default current user/ngày/tỷ giá snapshot/phương thức phổ biến, không default số tiền nguy hiểm.

### P2 — React/render

1. Đo React Profiler trước khi thêm memoization.
2. Memoize row sau khi có bằng chứng rerender.
3. Giảm object/array inline ở bảng lớn.
4. Debounce server search 250–400ms.
5. Ưu tiên pagination trước virtualization.

### P2 — tính đúng và bảo trì

1. Xác định owner cho payment ledger, order aggregate, invoice snapshot, landed cost, commission snapshot.
2. Contract test cho order/payment/receiving/QC/supplier payment RPC.
3. Live verification script cho migration, grants, RLS, function signature, trigger, constraint.
4. Chuẩn hóa lỗi API thành error/code/details/requestId.
5. Test replay idempotency và hai tab thao tác cùng laptop/order.

## 13. Kiểm thử và giới hạn

## 14. Trạng thái tối ưu P0/P1/P2 đã thực hiện

- P0: `InventoryContext` dùng chung auth headers, chạy request laptop/order và các request phụ song song, trả loading ngay khi primary data sẵn sàng. Các mutation order song song hóa kiểm tra foreign key và roll-forward song song hóa truy vấn/cập nhật độc lập.
- P0: inventory, orders và management dashboard có `Server-Timing` (`query`, `queries`, `total`) để đo latency production mà không đổi response body.
- P1: `GET /api/inventory` và `GET /api/orders` hỗ trợ tùy chọn `limit`/`offset`, trả `total`, `hasMore`; không truyền các tham số này thì contract cũ và dữ liệu đầy đủ được giữ nguyên.
- P2: ô tìm kiếm ở inventory/orders dùng `useDeferredValue` để trì hoãn phép lọc nặng khi người dùng đang gõ; chưa ép memoization/virtualization vì cần đo React Profiler và payload thực tế trước khi can thiệp vào row rendering.

Static: ESLint, `next build`, TypeScript/build routes, `git diff --check`.

Database: apply migration trên clone, kiểm tra grants/RLS, duplicate serial/reservation/idempotency, payment/refund/debt, QC guard, receiving transition.

Browser/E2E: login từng role; Dashboard → Inventory → Order → Payment → Invoice; Purchase → Shipment → Receiving → QC → Available; QC FAIL → Repair → Re-QC/Return; reload sau mutation; hai tab cùng tài sản.

Kiến trúc, route, mapper, validator, state flow và RPC trong tài liệu được đọc từ repository. Latency production, payload thực, query plan và migration state trên Supabase live vẫn cần chạy riêng.
