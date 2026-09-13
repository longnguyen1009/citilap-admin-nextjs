# Phân tích project `citilap-admin-nextjs`

Ngày phân tích: 13/09/2026
Mục tiêu: cung cấp checklist có thứ tự ưu tiên để Codex sửa và cải tiến project.

---

## LƯU Ý CHO CODEX

Đây là bản review **vòng 2** (ngày 13/09/2026), cập nhật sau khi Codex đã fix vòng 1.
Các vấn đề **P0/P1/P2** bên dưới là những gì **còn sót** hoặc **mới phát sinh** — hãy fix theo thứ tự ưu tiên.

---

## 1. Tổng quan kiến trúc

Project dùng Next.js App Router (Next 16), React 19, Supabase và `lucide-react`. Các màn hình chính nằm trong `components/pages`: dashboard, inventory, orders, customers, payments, warranty, settings và user management. Route handlers nằm dưới `app/api/*`; dữ liệu đi qua `InventoryContext`, `apiFetchers`, `dbService` và Supabase. Có phân quyền ADMIN/SALES/TECH ở cả UI và API, cùng activity log.

---

## 2. Vấn đề P0 — Bảo mật / Chính xác dữ liệu / Transaction

### P0.1. Tạo sản phẩm có thể ghi đè dữ liệu khi ID số được gửi lên

**Vị trí:** `app/api/inventory/route.js:34-49`, `lib/services/dbService.js:153-171`

API chỉ phân biệt tạo/sửa bằng query `mode=create`. Nếu client gọi `POST /api/inventory?mode=create` nhưng vẫn gửi một `id` số, `saveLaptopToCloud()` bỏ qua kiểm tra update vì `options.create === true`, sau đó thực hiện `insert` với ID đó.

Hậu quả:
- Có thể lỗi `duplicate key` nếu ID đã tồn tại.
- Nếu schema/sequence bị lệch, có thể tạo record với ID do client kiểm soát.
- API chưa kiểm tra ID số có tồn tại khi tạo.

**Đề xuất cho Codex:** Khi tạo mới, phải luôn loại bỏ `id` khỏi payload ở server, bất kể client gửi ID gì. ID do database sinh.

---

### P0.2. Luồng tạo đơn không kiểm tra liên kết laptop/customer/trade-in ở server trước RPC

**Vị trí:** `lib/services/dbService.js:214-225`

`saveOrderToCloud()` (update) có gọi `assertReferenceExists()` cho laptop_id, customer_id, trade_in_laptop_id. Nhưng `createOrderWithInventoryToCloud()` (create) **không** thực hiện các kiểm tra tương tự trước khi gọi RPC.

Nếu RPC hoặc migration hiện tại không kiểm tra đầy đủ, request tạo đơn có thể gửi laptopId, customerId, tradeInLaptopId không tồn tại, hoặc ID không hợp lệ kiểu `#123`.

**Đề xuất cho Codex:** Dùng chung hàm validate/reference cho cả create và update. Tốt hơn nữa, đưa toàn bộ kiểm tra quan hệ vào RPC và trả lỗi nghiệp vụ rõ ràng.

---

### P0.3. API orders và inventory chưa gọi các hàm validate domain đầy đủ

**Vị trí:** `app/api/orders/route.js:30-32`, `app/api/inventory/route.js:30-33`, `lib/apiAuth.js:116-141`

Đã có `validateLaptopPayload()` và `validateOrderPayload()`, nhưng hai route chính chỉ gọi `validateLaptopNumbers(body)` mà không gọi `validateLaptopPayload(body)` hay `validateOrderPayload(body)`.

Vì vậy hiện tại API vẫn có thể nhận:
- Tên sản phẩm rỗng hoặc quá dài
- Serial/tracking code quá dài
- `partsHistory` không phải mảng hoặc vượt kích thước
- `customerId`, `laptopId`, `tradeInLaptopId` sai định dạng
- Ghi chú và địa chỉ vượt giới hạn
- Tiền âm trong order không được validate
- Các chuỗi enum tùy ý không thuộc option hợp lệ

**Đề xuất cho Codex:** Gọi validator tương ứng ở route sau `sanitizePayload()`. Đồng thời kiểm tra enum/status/category ở server.

---

### P0.4. SALES/STAFF/TECH có thể gửi field nhạy cảm mà bị loại bỏ âm thầm

**Vị trí:** `lib/apiAuth.js:71-85`

`sanitizePayload()` loại bỏ field nhạy cảm đối với non-admin mà không trả lỗi. Ví dụ SALES gửi `importPriceVnd` hoặc `profitVnd`, API âm thầm bỏ qua rồi tiếp tục lưu.

Điều này gây hiểu lầm cho người dùng và nguy hiểm nếu UI tưởng dữ liệu đã được lưu.

**Đề xuất cho Codex:** Phân biệt rõ:
- Field không được phép gửi → trả `403`
- Field không cần thiết/không thuộc endpoint → trả `400`
- Hoặc chỉ cho phép field nhạy cảm đối với ADMIN và hiển thị lỗi rõ ràng

---

### P0.5. `profitVnd` vẫn được gửi vào audit nhưng bị server loại khỏi DB

**Vị trí:** `lib/services/dbService.js:141-150`, `app/api/inventory/route.js:52-78`

`saveLaptopToCloud()` xóa `profit_vnd` trước khi ghi DB vì coi đây là field computed. Tuy nhiên route vẫn dùng `body` ban đầu để audit. Log có thể ghi một lợi nhuận mà DB không lưu.

Tương tự, order có thể audit `profitVnd` do client gửi, trong khi RPC có thể tự tính lại hoặc bỏ qua.

**Đề xuất cho Codex:** Audit dữ liệu sau khi server chuẩn hóa/tính toán. Không ghi giá trị tài chính do client tự gửi nếu server không chấp nhận giá trị đó.

---

## 3. Vấn đề P1 — Lóg tạo đơn hàng

### P1.1. `updateOrder` gọi `saveOrderToCloud` với tham số `user?.name`, nhưng API client không truyền tham số này

**Vị trí:** `context/InventoryContext.jsx:1021`, `lib/apiFetchers.js:50-59`

Context gọi `saveOrderToCloud(merged, user?.name)` nhưng fetcher chỉ nhận một tham số: `async (order) => ...`. Tên người ghi nhận bị bỏ qua hoàn toàn.

**Đề xuất cho Codex:** Sửa fetcher để truyền `recordedBy` đúng cách. Hoặc tốt hơn, server lấy user từ token/profile, không nhận từ client.

---

### P1.2. Tạo đơn mới vẫn tự sinh ID tạm và kiểm tra trên danh sách client

**Vị trí:** `context/InventoryContext.jsx:868-879`

Client tính `nextId` bằng `Math.max(...orders) + 1` dù sau đó bỏ `id` để DB sinh. Việc này gây lãng phí, có thể lỗi nếu danh sách chỉ là dữ liệu theo tháng, và kiểm tra trùng ID phía client không bảo vệ race condition.

**Đề xuất cho Codex:** Bỏ hoàn toàn logic sinh/check ID ở client khi tạo mới. Chỉ kiểm tra ID khi đang sửa order đã tồn tại.

---

### P1.3. Tạo đơn có thể tạo stock movement ngoài transaction

**Vị trí:** `context/InventoryContext.jsx:947-965`

Sau khi RPC tạo order thành công, client gọi thêm `addStockMovement()`. Nếu request stock movement thất bại, đơn hàng vẫn tồn tại nhưng lịch sử kho bị thiếu. Ngược lại, retry có thể tạo movement trùng.

**Đề xuất cho Codex:** Stock movement phải được ghi trong cùng RPC transaction với tạo/sửa/hủy đơn. Client chỉ cập nhật state từ kết quả RPC, không tự tạo bản ghi nghiệp vụ thứ hai.

---

### P1.4. `updateOrder` optimistic update có thể ghi đè dữ liệu mới từ server

**Vị trí:** `context/InventoryContext.jsx:1016-1038`

Nếu người dùng sửa cùng một order nhanh liên tiếp, request về sau có thể bị request trước ghi đè. Rollback cũng dùng `currentOrder` của lần gọi đầu, có thể khôi phục sai trạng thái.

**Đề xuất cho Codex:** Dùng mutation version/request ID hoặc queue per order. Chỉ áp dụng response nếu đó vẫn là request mới nhất.

---

### P1.5. `normalizeMoney()` tự động biến trạng thái `paid` thành đã thanh toán toàn bộ

**Vị trí:** `context/InventoryContext.jsx:803-815`

Khi `paymentStatus === 'paid'`, code đặt `amountPaid = salePrice`. Điều này có thể ghi đè số tiền thực tế nếu người dùng đổi trạng thái trước khi nhập đủ, hoặc dữ liệu lịch sử thiếu amount.

**Đề xuất cho Codex:** Chỉ RPC/payment ledger mới được quyết định số tiền đã trả. Nếu trạng thái `paid`, server cần xác minh tổng payment ledger, không tự suy ra từ label client.

---

### P1.6. Không kiểm tra `depositAmount` và `amountPaid` không vượt `salePrice`

**Vị trí:** `context/InventoryContext.jsx:803-815`, `lib/apiAuth.js:131-141`

Hiện chỉ kiểm tra số không âm. Có thể lưu tiền cọc hoặc tiền đã trả lớn hơn giá bán, COD âm hoặc lớn hơn phần còn nợ, `debtAmount` do client gửi không khớp công thức.

**Đề xuất cho Codex:** Validate và tính lại ở RPC:
```
0 <= depositAmount <= salePrice
0 <= amountPaid <= salePrice
debtAmount = salePrice - amountPaid
codAmount <= debtAmount
```

---

### P1.7. `assignmentError` ở client không thay thế được kiểm tra race-condition

**Vị trí:** `context/InventoryContext.jsx:780-801`

Client kiểm tra laptop có đơn blocking trước khi tạo đơn, nhưng hai người dùng có thể đồng thời chọn cùng một laptop. Trigger advisory lock là lớp bảo vệ chính, nhưng cần xác minh tất cả trạng thái đều được trigger/RPC xử lý.

**Đề xuất cho Codex:** Thêm integration test concurrency và kiểm tra RPC trả mã lỗi `409 Conflict`, thay vì trả chung `400`.

---

## 4. Vấn đề P1 — Lóg tạo/cập nhật sản phẩm

### P1.8. `addLaptop()` dùng `parseFloat()` không nhất quán với `parseFlexibleFloat()`

**Vị trí:** `context/InventoryContext.jsx:1163-1186`

Một số field dùng `parseFlexibleFloat()`, nhưng nhiều field khác lại dùng `parseFloat()`. Dữ liệu `"4.800,50"` hoặc `"4,800.50"` có thể bị đọc sai.

**Đề xuất cho Codex:** Dùng một helper parse duy nhất cho toàn bộ tiền/số. Thêm test cho định dạng Việt Nam và Excel.

---

### P1.9. `addLaptop()` cho phép tạo sản phẩm không có tên, và validator chưa được gọi

**Vị trí:** `context/InventoryContext.jsx:1173`, `app/api/inventory/route.js:30-33`

Code tạo `name: laptopData.name || ''` nhưng route không gọi `validateLaptopPayload()`. Sản phẩm trống tên có thể được ghi DB.

**Đề xuất cho Codex:** Bắt buộc `name` và `serial` nếu nghiệp vụ yêu cầu. Validate tại server; UI chỉ là lớp hỗ trợ.

---

### P1.10. Kiểm tra serial trùng chỉ chạy trên danh sách laptop đang tải

**Vị trí:** `context/InventoryContext.jsx:1158-1161`, `context/InventoryContext.jsx:1077-1079`

Nếu danh sách đang lọc theo tháng, serial của máy ở tháng khác không nằm trong state. Hai người dùng cũng có thể cùng tạo serial trùng.

**Đề xuất cho Codex:** Thêm unique index không phân biệt hoa thường ở DB, ví dụ trên `lower(trim(serial))` với điều kiện serial không rỗng. Bắt lỗi duplicate key thành `409`.

---

### P1.11. Cập nhật profit order liên quan có điều kiện so sánh ID sai kiểu

**Vị trí:** `context/InventoryContext.jsx:1111-1119`

Đoạn lọc dùng `o.laptopId === id` trong khi các đoạn khác thường dùng `String(...)` hoặc `==`. Nếu `o.laptopId` là số và `id` là chuỗi, order liên quan sẽ không được cập nhật profit.

**Đề xuất cho Codex:** Thống nhất so sánh ID bằng helper canonical, ví dụ `sameId(a, b)`.

---

### P1.12. Cập nhật laptop và cập nhật profit order không nguyên tử

**Vị trí:** `context/InventoryContext.jsx:1101-1123`

Laptop được lưu trước, sau đó các order liên quan lưu từng request độc lập. Nếu một request order lỗi, lợi nhuận giữa laptop/order có thể lệch.

**Đề xuất cho Codex:** Tính profit ở server/RPC hoặc tạo transaction cập nhật laptop + toàn bộ order liên quan. Ít nhất phải có job/retry và báo lỗi rõ ràng.

---

### P1.13. `deleteLaptop()` ghi status là label tiếng Việt không hợp lệ với key hệ thống

**Vị trí:** `context/InventoryContext.jsx:1225`

Code vẫn dùng `status: 'NGỪNG HOẠT ĐỘNG'` trong khi các logic khác dùng key như `inactive`, `sold`, `available`. Điều này khiến bộ lọc inactive không nhận diện, reconcile status trả lại trạng thái khác, DB lưu label thay vì key chuẩn.

**Đề xuất cho Codex:** Dùng constant key duy nhất, ví dụ `inactive`. Chỉ format label ở UI.

---

## 5. Vấn đề P1 — Settings và Options

### P1.14. `updateFormulaConfig()` không chờ hoặc xử lý lỗi khi lưu settings

**Vị trí:** `context/InventoryContext.jsx:1055-1070`

Code gọi `setFormulaConfig(newConfig)` rồi `saveSetting('formula', newConfig)` mà không `await`, không kiểm tra kết quả, không rollback. Nếu API lỗi, UI/localStorage vẫn hiển thị công thức mới, nhưng lần tải lại từ server có thể quay về công thức cũ. Khi `recalculateAll=true`, laptop có thể đã tính theo cấu hình chưa persist.

**Đề xuất cho Codex:** Biến thành async: validate → gọi server → chỉ cập nhật state sau khi save thành công (hoặc optimistic có rollback) → recalculate sau khi settings đã lưu.

---

### P1.15. Settings chỉ validate kiểu số, chưa giới hạn giá trị hợp lý

**Vị trí:** `app/api/settings/route.js:28-43`

`shippingVnd`, `divisor`, `defaultRate` chỉ kiểm tra `Finite` và dương. Có thể nhập giá trị cực lớn gây overflow/giá nhập bất thường/lỗi precision.

**Đề xuất cho Codex:** Giới hạn min/max và reject key lạ bên trong `formula`. Formula chỉ chấp nhận chính xác ba key được phép.

---

### P1.16. `saveSetting()` và `saveSettings()` nuốt lỗi database

**Vị trí:** `lib/services/dbService.js:389-405`

Các hàm trả `false` khi lỗi mà không trả nguyên nhân. Route chỉ trả lỗi chung. Context không kiểm tra kết quả ở `updateFormulaConfig()`.

**Đề xuất cho Codex:** Throw lỗi có mã chuẩn (`VALIDATION`, `CONFLICT`, `DATABASE`) và route trả status phù hợp.

---

### P1.17. Options có thể thay đổi label thành chuỗi rỗng/không giới hạn

**Vị trí:** `context/InventoryContext.jsx:461-469`, `app/api/options/route.js`

Cần xác minh route options đã validate:
- Label bắt buộc, không rỗng
- Độ dài tối đa
- Loại bỏ whitespace
- Không cho sửa `group_key`/`option_key` thành giá trị nguy hiểm
- Unique key sau normalize

**Đề xuất cho Codex:** Thêm validation đầy đủ ở route options.

---

### P1.18. Warranty vẫn dùng option object như string

**Vị trí:** `components/pages/Warranty.jsx:70`, `context/InventoryContext.jsx:495`, `context/InventoryContext.jsx:1285`

`dynamicOptions.WARRANTY_CASE_STATUS_OPTIONS` trả object `{ key, label }` nhưng Warranty render `<option key={status} value={status}>{status}</option>` — giá trị trở thành `"[object Object]"`. Status mặc định cũng có thể là object thay vì key.

**Đề xuất cho Codex:** Dùng thống nhất `option.key` / `option.label`. Mặc định bằng `options[0]?.key`.

---

## 6. Vấn đề P1 — Các nghiệp vụ khác

### P1.19. Tạo warranty case gồm nhiều thao tác không transaction

**Vị trí:** `context/InventoryContext.jsx:1295-1313`

Quy trình: (1) tạo warranty case → (2) cập nhật `conditionNote` laptop → (3) tạo stock movement. Nếu bước 2 hoặc 3 lỗi, warranty case vẫn tồn tại nhưng laptop/lịch sử kho không đồng bộ.

**Đề xuất cho Codex:** Gom vào RPC transaction hoặc server endpoint duy nhất xử lý cả ba thao tác.

---

### P1.20. `updateWarrantyCase()` có thể nối diagnosis lặp vô hạn vào `conditionNote`

**Vị trí:** `context/InventoryContext.jsx:1332-1342`

Mỗi lần sửa warranty case có `diagnosis`, code nối thêm `| KT: ${updates.diagnosis}` vào `conditionNote`. Nếu lưu lại nhiều lần, cùng một chẩn đoán bị lặp.

**Đề xuất cho Codex:** Không dùng `conditionNote` làm log append-only. Lưu lịch sử diagnosis riêng hoặc cập nhật phần ghi chú theo `warrantyCaseId`.

---

### P1.21. Tạo customer không kiểm tra trùng số điện thoại ở server

**Vị trí:** `context/InventoryContext.jsx:1233-1251`, `lib/services/dbService.js:355-364`

Có thể tạo nhiều khách hàng cùng số điện thoại do race condition hoặc nhập khác format.

**Đề xuất cho Codex:** Chuẩn hóa số điện thoại, tạo unique constraint phù hợp và trả cảnh báo/409 khi trùng.

---

### P1.22. Các thao tác save customer/warranty không truyền người thực hiện lấy từ server

Nhiều payload chứa `createdAt`, `updatedAt`, `handledBy`, `performedBy` từ client. Người dùng có thể gửi tên người khác hoặc sửa timestamp.

**Đề xuất cho Codex:** Server lấy user ID/name từ `requireUser()` và ghi `performed_by`, `handled_by`, audit timestamp bằng database/server. Không tin các field audit từ client.

---

## 7. Vấn đề P2 — Hiệu suất và An toàn

### P2.1. API GET `all=true` chưa thấy giới hạn hoặc phân trang

**Vị trí:** `app/api/inventory/route.js:13-21`, `app/api/orders/route.js:13-21`, `lib/services/dbService.js:122-135`, `lib/services/dbService.js:182-192`

`select('*')` và `all=true` vẫn tải toàn bộ dữ liệu. Khi dữ liệu tăng, mỗi tab có thể tải lượng lớn và polling lại sau 60 giây.

**Đề xuất cho Codex:** Thêm pagination/cursor, page size tối đa, chỉ lấy các cột cần thiết, filter/search phía server. `all=true` chỉ dành cho endpoint export ADMIN.

---

### P2.2. Client có thể tạo trùng dữ liệu do retry sau timeout

**Vị trí:** `context/InventoryContext.jsx:937-965`, `lib/services/dbService.js:214-225`

Nếu RPC tạo đơn đã commit nhưng response bị timeout, client nhận lỗi và người dùng bấm tạo lại. Có thể sinh hai order giống nhau.

**Đề xuất cho Codex:** Thêm idempotency key cho create request, lưu unique key ở DB và để RPC trả lại record đã tạo nếu request được retry.

---

## 8. Thứ tự triển khai đề xuất cho Codex

### Ưu tiên cao nhất (P0) — làm trước

1. Loại bỏ ID client khi tạo laptop/order — server luôn tự sinh ID
2. Validate đầy đủ order/laptop payload ở API (gọi `validateLaptopPayload` / `validateOrderPayload`)
3. Kiểm tra reference laptop/customer/trade-in trong cả create và update tại RPC
4. Đảm bảo order + inventory + stock movement là một transaction
5. Sửa status key `NGỪNG HOẠT ĐỘNG` → `inactive`
6. Sửa Warranty option object/string rendering
7. Không để client quyết định profit, amountPaid, debtAmount — server tính lại
8. Audit dữ liệu sau khi server chuẩn hóa, không dùng raw body

### Ưu tiên cao (P1) — làm tiếp

9. Fix optimistic update race condition
10. Fix lưu formula async + rollback
11. Unique serial và phone ở DB
12. Sửa parse số không nhất quán (`parseFloat` → `parseFlexibleFloat`)
13. Sửa `saveOrderToCloud` fetcher truyền đúng `recordedBy`
14. Bỏ sinh ID tạm ở client khi tạo mới
15. Gom stock movement vào transaction
16. Validate deposit/amountPaid/cod không vượt salePrice
17. Sửa so sánh ID sai kiểu trong profit recalculation
18. Sửa `deleteLaptop` dùng key chuẩn thay vì label tiếng Việt
19. Thêm validation cho options (label required, max length, unique key)
20. Thêm transaction cho warranty case operations
21. Không nối diagnosis lặp vào conditionNote
22. Unique constraint cho phone customer
23. Server tự lấy actor/timestamp, không tin client

### Ưu tiên trung bình (P2)

24. Pagination và giới hạn `all=true`
25. Idempotency key cho create operations
26. Chuẩn hóa error code/status
27. Bổ sung test timezone, money, status transition và retry

---

## 9. Checklist kiểm chứng sau khi sửa

- Production build và lint vẫn pass
- Không thể tạo laptop với ID trùng hoặc ID do client kiểm soát
- Tạo laptop/order phải validate đầy đủ name, serial, numeric fields, references
- SALES/STAFF gửi importPriceVnd/profitVnd bị từ chối rõ ràng (403), không chỉ bỏ qua ngầm
- Tạo/sửa/hủy đơn phải atomic: order + inventory + stock movement thành công hoặc thất bại cùng lúc
- Status key `NGỪNG HOẠT ĐỘNG` không còn tồn tại, dùng `inactive`
- Warranty case render dropdown đúng key/label, status mặc định là key
- Optimistic update không bị race condition khi sửa cùng order liên tiếp
- Lưu formula phải await và rollback nếu lỗi
- Serial unique ở DB, phone unique ở DB
- Profit được tính server-side, không phụ thuộc giá client gửi
- Deposit/amountPaid không vượt salePrice
- Thuật toán parse số nhất quán cho tất cả field tiền tệ
