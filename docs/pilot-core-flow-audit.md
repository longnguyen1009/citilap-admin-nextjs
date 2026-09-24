# Audit luồng vận hành cốt lõi

Ngày rà soát: 2026-09-22. Môi trường chạy thử: data seed hiện tại. Người thao tác: chủ hệ thống.

## Bản đồ luồng

| Bước | Màn hình | Nguồn ghi authoritative | Điều kiện chính |
| --- | --- | --- | --- |
| Chọn máy | `/inventory` | `laptops` | Máy active, đúng trạng thái và không thuộc đơn khác |
| Lập/chốt đơn | `/orders` | RPC tạo/cập nhật order và inventory | Gán máy trước khi giao/hoàn thành; chống bán trùng |
| Thu/hoàn tiền | `/payments` | RPC payment có cash account | Idempotency, payment + trade-in credit không vượt giá bán |
| Đối soát tiền | `/finance` | `account_transactions`, COD, phải thu/phải trả | ADMIN; tách VND/CNY; không ghi nhận doanh thu/chi phí lần hai |
| Xuất hóa đơn | `/invoices` | `issue_invoice`, snapshot hóa đơn | Đơn shipping/done, đủ chi nhánh/khách/máy và có khoản cọc |
| Tiếp nhận bảo hành | `/warranty` | `warranty_cases` | Gắn máy; tự tìm đơn đã chốt cùng máy nếu có |

`/payments` là nơi ghi tiền khách trả theo đơn. `/finance` là nơi quản lý vị trí tiền, COD và đối soát. Hai màn hình dùng hai góc nhìn khác nhau và chưa được hợp nhất.

## Phát hiện batch 1

### P0 — Credit thu cũ có thể bị bỏ khỏi công nợ

Phase 9 lưu `trade_in_credit_vnd` theo VND và giảm `orders.debt_amount`. Logic cũ ở client, API validator, RPC normalization và snapshot hóa đơn vẫn dùng `sale_price - amount_paid`. Vì vậy sửa đơn hoặc ghi thêm thanh toán sau khi nhận thu cũ có thể khôi phục phần công nợ đã được credit, hoặc hiển thị khách còn phải trả nhiều hơn thực tế.

Đã sửa ở các lớp:

- Form thu tiền dùng `orders.debt_amount` do server sở hữu.
- Client normalization tính `sale price - cash paid - trade-in credit`.
- API lấy credit từ order hiện hữu; client không được tự đặt giá trị này.
- Migration `20261013_phase9_trade_in_obligation_repair.sql` thêm trigger bảo vệ bất biến, sửa các order có credit và đồng bộ snapshot hóa đơn.
- Hóa đơn tách “Tiền đã thu”, “Credit thu cũ” và “Còn phải thu”; tiến độ dựa trên nghĩa vụ còn lại.

Migration mới đã được user apply vào Dev Supabase. Live Phase 9 E2E sau migration đạt 64/64 kiểm tra, gồm sửa một trường thông thường trên order có trade-in và thu thêm 5 triệu đồng mà không khôi phục phần công nợ đã được credit.

### P1 — Trạng thái thanh toán có thể bị đổi ngoài sổ tiền

Danh sách và form sửa đơn trước đây cho phép chọn trực tiếp `payment_status`. Điều này tạo hai nơi cùng điều khiển một trạng thái tài chính: form đơn và RPC thu/hoàn tiền.

Đã khóa trường này cho order tồn tại ở ba lớp:

- Danh sách đơn hiển thị badge chỉ đọc, thành phần tiền theo đơn vị triệu VNĐ và liên kết mở thẳng form thu tiền của order.
- Form sửa đơn giải thích trạng thái được cập nhật từ lịch sử thu tiền.
- API order giữ nguyên `payment_status`, `amount_paid`, `deposit_amount` và `debt_amount` hiện hữu khi sửa các trường thông thường.

Batch PILOT-04 tiếp theo loại bỏ luôn đường ghi tiền mở đầu ngoài sổ tiền. Đơn mới bắt đầu ở trạng thái chưa thu; sau khi lưu, người vận hành dùng màn Thu tiền để chọn tài khoản nhận và ghi cọc/thanh toán. Form không còn ô tiền cọc, ghi chú cọc hoặc lựa chọn trạng thái tài chính khi tạo mới; API từ chối payload cố gửi số tiền mở đầu, trạng thái đã cọc/đã thanh toán hoặc giá bán bằng 0. Trạng thái đơn “Đã cọc” cũng không còn xuất hiện khi tạo mới.

Form kho đã thống nhất nhãn tiền: giá mua và phí nội địa dùng RMB; tỷ giá ghi rõ VNĐ/RMB; giá nhập, giá sỉ và giá lẻ dùng triệu VNĐ. Tỷ giá trên giao diện phải lớn hơn 0, khớp validation phía API.

Các trường trạng thái, phân loại, vị trí và tình trạng sạc trên form kho đã được đánh dấu bắt buộc. Chi nhánh bán hàng trên form đơn cũng bắt buộc vì RPC xuất hóa đơn sẽ từ chối đơn thiếu chi nhánh.

### P2 — Tên khu vực tiền dễ gây nhầm

Menu cũ gọi `/payments` là “Thanh toán & Tài chính”, gần nghĩa với “Tài chính vận hành”. Đã đổi `/payments` thành “Thu tiền đơn hàng” và mô tả rõ đây là nơi ghi tiền khách trả. `/finance` tiếp tục là khu vực đối soát.

### P2 — Menu quá dài

Browser xác nhận ADMIN từng thấy hơn 20 mục trong một danh sách liên tục. Sidebar hiện được chia thành Vận hành kho, Nhập hàng, Bán hàng, Tài chính & chứng từ, Hậu mãi và Quản trị; danh sách nghiệp vụ có vùng cuộn riêng để footer tài khoản luôn ổn định. Route và điều kiện role được giữ nguyên.

Mobile hiện có tối đa năm lối tắt theo vai trò. ADMIN/SALES thấy Kho laptop, Đơn hàng, Thu tiền, Bảo hành và Đăng xuất; TECH/TECHNICAL nhận lối tắt QC thay cho các mục bán hàng không có quyền.

### Dữ liệu thử cần chú ý

Màn thu tiền hiện chứa nhiều fixture có mã `TEST-FIN-` và `TEST-ACTION-`. Vì user xác nhận đây là data seed, có thể tiếp tục thử nghiệm; không dùng các tổng số hiện tại làm số dư mở sổ cho vận hành thật.

## Bằng chứng batch 1

- Browser ADMIN: `/inventory`, `/orders`, `/payments`, `/invoices`, `/warranty` đều tải được; `/payments` hiển thị nhãn mới; không có console error/warning trong lần kiểm tra cuối.
- `qa/pilot-ui-smoke.mjs`: 20/20 kiểm tra route, nhóm sidebar, mobile shortcut, trạng thái thanh toán chỉ đọc, deep-link thu tiền, guard đơn mới và đơn vị tiền form kho.
- `qa/trade-in-obligation-db-verification.mjs`: 6/6 kiểm tra PGlite.
- `qa/sales-operations-db-verification.mjs`: 23/23 kiểm tra schema.
- `qa/live-phase9-e2e.mjs`: 64/64 trên Dev Supabase sau khi apply migration `20261013`.
- ESLint, production build và `git diff --check`: pass; diff-check chỉ cảnh báo line ending.

## Batch tiếp theo

Hoàn tất phần form tiền trọng yếu của PILOT-04. Bước tiếp theo rà các trường bắt buộc và giá trị mặc định phi tài chính, sau đó chuyển sang PILOT-05 để đo request/payload của `InventoryContext`.

## PILOT-05 — Đo tải dữ liệu ban đầu

`qa/pilot-data-load-measure.mjs` đo request API và kích thước response khi mở từng route bằng phiên ADMIN thật. Baseline `/orders` trên development server là 62 request / 171.852 byte. Trong đó `InvoiceLink` tạo N+1 request hóa đơn theo từng order và bị gọi hai lần bởi development Strict Mode.

Đã đưa `invoiceId` vào response `/api/orders`, loại bỏ việc từng dòng tự truy vấn hóa đơn. `InventoryContext` cũng chỉ tải warranty, customers, settings và payments ở các route thực sự dùng chúng; lịch sử kho không còn tải toàn bộ vì hiện không có consumer giao diện. Kết quả `/orders` sau tối ưu là 6 request / 85.741 byte, giảm 56 request (90,3%) và 86.111 byte (50,1%). Hai request `/api/months` còn lại là hành vi development Strict Mode; production effect chỉ chạy một lần.

Đo bổ sung xác nhận route-aware loading vẫn tải đúng dữ liệu nghiệp vụ: `/warranty` có 7 request / 86.160 byte; `/payments` có 9 request / 172.384 byte và không còn tải inventory. Trên development server, effect riêng của `Payments` khiến financial records và cash accounts xuất hiện hai lần; đây là mục tối ưu tiếp theo nếu số liệu production hoặc thao tác thực tế cho thấy độ trễ đáng kể.

## PILOT-06 — Logic cũ và mới giao nhau

Dependency map của batch đầu:

| Nghiệp vụ | Đường cũ | Đường chuẩn hiện tại | Quyết định |
| --- | --- | --- | --- |
| Thu cũ đổi mới | Form đơn tự tạo laptop `available`, không có hồ sơ kiểm tra | `/trade-ins`: DRAFT → INSPECTING → QUOTED → ACCEPTED → RECEIVED → CONVERTED_TO_INVENTORY; máy vào `waiting_qc` | Gỡ tạo máy khỏi form đơn; ẩn loại đơn thu cũ khi tạo mới; API từ chối payload đi đường cũ |
| Liên kết máy thu cũ | Client có thể gửi `tradeInLaptopId` trong create/update order | Liên kết do workflow thu cũ đã ACCEPTED quản lý | API giữ nguyên liên kết lịch sử khi sửa order và không nhận liên kết từ đơn mới |
| Trạng thái thanh toán | `preserveExplicitPaymentStatus` cập nhật trực tiếp order sau RPC | Payment ledger, RPC và trigger `enforce_order_customer_obligation()` tính trạng thái/công nợ | Xóa bước ghi đè sau RPC để tránh mutation thứ hai và trạng thái lệch sổ |
| Hiển thị dữ liệu cũ | `orderType=trade_in` và các trường máy thu cũ tồn tại trên order cũ | Hồ sơ mới nằm tại `/trade-ins` | Giữ khả năng đọc đơn lịch sử; các trường legacy trong modal chỉ đọc |

`orderType.trade_in` vẫn được giữ trong field options để render dữ liệu lịch sử và tránh làm hỏng báo cáo cũ. Không dùng tùy chọn này để tạo nghiệp vụ mới. Smoke test kiểm tra form tạo đơn không còn lựa chọn thu cũ và có liên kết sang workflow chính thức.

### Reservation và order cọc

Hai khái niệm vẫn có vai trò riêng: reservation giữ máy trước khi có order hoàn chỉnh; khoản cọc là giao dịch tiền gắn với order. Audit phát hiện trigger cũ chỉ kiểm tra `orders.laptop_id`, dù trigger được gọi cả khi `requested_laptop_id` thay đổi. Vì vậy order chỉ tham chiếu máy dự kiến có thể bỏ qua reservation ACTIVE. `20261014_phase9_reservation_integrity_repair.sql` sửa gate cho cả hai cột, từ chối tạo reservation nếu máy đã thuộc order khác, và chỉ chấp nhận `deposit_payment_id` dương, không phải refund, thuộc đúng order liên kết. API Orders và Sales Operations cũng kiểm tra tương ứng để bảo vệ luồng ứng dụng trước khi migration được apply.

### Commission

Không tìm thấy đường ghi nhận hoa hồng cũ song song trong UI/API. `commissions` là nguồn nghiệp vụ duy nhất; chi hoa hồng đi qua `pay_commission` và tạo `account_transactions` với nguồn `COMMISSION`, trong khi báo cáo lợi nhuận lấy commission đã duyệt/đã chi từ `order_sales_operations_summary`. Unique source, idempotency và immutable history đã có trong migration Phase 9. Vì chưa có bằng chứng xung đột, batch này không thay đổi logic commission.

### QA legacy

`qa/qa-loop.spec.js`, `qa/single-flow.spec.js` và `qa/codex-e2e-scenarios.md` vẫn giả định có thể chọn trạng thái thanh toán hoặc nhập tiền cọc ngay trên Orders. Các kịch bản này đã được đổi sang kiểm tra trạng thái chỉ đọc và điều hướng sang `/payments`; không còn dùng thao tác đã bị khóa để tạo trạng thái tài chính giả.

Sau khi apply `20261014`, live Phase 9 E2E đạt 70/70. Hai kiểm tra mới xác nhận database chặn order chỉ có `requested_laptop_id` trùng reservation ACTIVE và từ chối gắn payment của order khác vào reservation.

## PILOT-07 — Khởi động chạy thử

Baseline ban đầu phát hiện 54 cash account fixture `TEST-*` đang active, trong đó 9 tài khoản mang reconciliation difference thử nghiệm `-500.000 VND`. Toàn bộ lịch sử được giữ nguyên nhưng các tài khoản test đã được chuyển sang inactive. Bốn tài khoản sạch được tạo cho pilot: `PILOT_CASH_VND`, `PILOT_BANK_VND`, `PILOT_WECHAT_CNY`, `PILOT_ALIPAY_CNY`, đều có opening balance 0.

Baseline sau chuẩn bị nằm tại `docs/pilot-baseline-latest.json`: 169 laptop active, 107 order active, 97 payment, 4 invoice, 4 cash account pilot active và không có reconciliation difference. Checklist và bảng ghi vướng mắc của phiên đầu nằm tại `docs/pilot-run-log.md`.

Phiên diễn tập core đầu tiên dùng fixture riêng `PILOT-CORE-MUCVKQH9` và đạt 17/17: order #129, laptop #173, invoice #5; cọc 2 triệu rồi thu 10,5 triệu còn lại. Sau reload, order paid và công nợ 0, laptop sold/locked, có đúng hai payment, invoice snapshot đã thanh toán đủ và tài khoản pilot tăng đúng 12.500.000 VND. Lần chạy đầu cũng phát hiện mốc opening balance trong ngày chặn payment có `payment_date` cùng ngày; script chuẩn bị pilot đã dùng mốc đầu kỳ cố định để dữ liệu seed không gây lỗi giả này.

Phiên hoàn tiền/hủy tiếp theo xác nhận ledger tiền, idempotency, giới hạn hoàn, nhả máy và chặn hóa đơn đều đúng. Tuy nhiên order `cancelled/refunded` vẫn bị view công nợ tính là phải thu vì `debt_amount` lịch sử trở lại giá bán. Migration `20261015_cancelled_receivable_repair.sql` sửa `customer_receivable_summaries` và `get_financial_operations_summary()` để chỉ tính nghĩa vụ còn có thể thu. Migration đã được apply; lần chạy lại trên order #131 đạt 16/16 và DB verification tài chính đạt 14/14.

Phiên COD dùng fixture `PILOT-COD-MUCWKZA6` đạt 27/27. Khi giao order #133, hệ thống ghi một payment COD 15 triệu, đưa công nợ khách về 0 và mở khoản phải thu carrier 15 triệu nhưng chưa tăng số dư ngân hàng. Đối soát 10 triệu có retry đồng thời chỉ sinh một settlement và một cash transaction; thu vượt bị chặn. Khoản 5 triệu cuối đưa COD về `SETTLED`, tổng tiền ngân hàng tăng đúng 15 triệu và order không xuất hiện trong công nợ khách. Lần chạy đầu dừng sau giao hàng do chính script dùng sai tên cột kiểm tra; fixture #132 được giữ lại trong seed để thấy rõ dấu vết phiên dở dang.

Phiên bảo hành trên order #133 phát hiện API cũ chỉ kiểm tra order và laptop tồn tại riêng rẽ, nên chưa bảo đảm order gốc thuộc đúng máy và chưa chống nhiều phiếu đang mở cho cùng một máy. API đã được khóa theo liên kết order/máy, máy gốc bất biến, tập trạng thái hợp lệ, ngày hoàn tất và một phiếu mở. Kịch bản `qa/pilot-warranty-live.mjs` đạt 21/21 cho lifecycle `received → checking → done`, chi phí, stock movement, audit log và reload.

Sau khi apply `20261016_warranty_integrity_repair.sql`, kiểm tra trực tiếp database phát hiện `NOT IN (laptop_id, requested_laptop_id)` trả về unknown nếu một cột là `NULL`, khiến order sai máy vẫn có thể lọt qua. Fixture sai duy nhất do phép thử tạo ra đã được xóa. Migration tiếp nối `20261017_warranty_order_link_null_repair.sql` dùng hai phép `IS DISTINCT FROM` để đóng lỗ hổng null này; đang chờ apply và chạy lại gate cạnh tranh.

Migration `20261017` đã được apply và gate bảo hành cuối đạt 26/26, gồm chặn trực tiếp tại database và hai request tạo phiếu đồng thời chỉ có một request thành công.

Audit Settings phát hiện UI/API cho phép thay đổi cấu trúc các nhóm trạng thái mà trigger và RPC đang dùng như hợp đồng nghiệp vụ. Chính sách mới phân biệt nhóm hệ thống và nhóm danh mục: trạng thái hệ thống chỉ đổi nhãn/thứ tự; category, seller, shipping method, gift và sale có thể mở rộng. Formula được chuẩn hóa về ba field thực sự được dùng và loại `currencyUnit` legacy. Live Settings suite đạt 21/21, gồm auth, CRUD danh mục, bảo vệ mã lõi, validation, reload và audit log.
