# CitiLap Admin — audit DB, API, luồng vận hành và UI/UX

## Tiến độ khắc phục — 30/09/2026

### Bổ sung theo bốn yêu cầu giao diện/vận hành

Cập nhật theo phản hồi mới: màn hình chi tiết hóa đơn mặc định đã khôi phục giao diện đầy đủ (thông tin đơn, ghi chú nội bộ, lịch sử thanh toán, chứng từ tài chính và bảng sản phẩm). Nút **Giao diện A4** chuyển sang mẫu A4 đã tạo; tại đó có **In A4 / Lưu PDF** và **Chi tiết hóa đơn** để quay lại. Note nội bộ chỉ hiển thị trong màn chi tiết, không có trên mẫu A4. Lint các file thay đổi PASS; kiểm tra browser chuyển qua/lại đang được chạy lại.

- **Tiếng Việt:** migration `20260929180409_repair_remaining_vietnamese_messages.sql` đã áp dụng vào project `citilapdb`. Thay 180 cặp literal lỗi có đối chiếu, không ghi đè định nghĩa hàm từ local lên live. Bản dựng local sửa 65 hàm; đã đọc lại 108 hàm live, fingerprint phần ngoài literal không đổi và không còn hai mẫu lỗi kiểm tra. Bộ quét local toàn bộ 108 hàm PASS. Helper hiển thị bổ sung hỗ trợ Windows-1252 và chuỗi trộn tiếng Việt đúng/sai. Không chỉnh sửa nội dung ghi chú của khách/người dùng.
- **Hóa đơn:** mẫu A4 bán hàng riêng, có chi nhánh, khách hàng, serial, quà tặng, thanh toán, chữ ký và cam kết/bảo hành máy mới/cũ dựa trên nội dung người dùng cung cấp. Không in note nội bộ sản phẩm/đơn. Browser trên dữ liệu thật xuất hóa đơn một laptop + hai quà tặng vừa **1 trang A4**; chưa kiểm mọi hóa đơn nhiều dòng và mọi máy in vật lý.
- **Xuất dữ liệu:** API `/api/exports` chỉ ADMIN, nút CSV và Excel `.xlsx` riêng. Đơn hàng **32 cột**, laptop **24 cột**; bổ sung SALE Offline, quà tặng, điện thoại khách, tiền cọc thực; escape CSV và giữ chuỗi serial/SĐT trong XLSX. Xuất theo các ID trong danh sách đang lọc, lấy dữ liệu mới từ DB và tra cứu cả laptop khác tháng. Live read-only PASS bốn file: **21 đơn / 33 laptop**, CSV và XLSX; kiểm ngày gửi và có dữ liệu offline/quà tặng. Anonymous trả 401; năm trường hợp quyền bị chặn được kiểm ở route giả lập, chưa login live đủ năm vai trò.
- **Lô mua:** một bảng mỗi ngày, gộp nhà cung cấp theo ID, mỗi laptop một dòng; dưới tên NCC có nút thêm vào từng lô. Nhấn tạo dòng nháp ngay trong bảng, lưu qua RPC hiện hữu với khóa chống trùng. Browser dữ liệu thật PASS hai bảng ngày, thêm/hủy nháp, reload và không tràn ngang toàn trang ở 390px. PGlite PASS lưu dữ liệu, đúng lô/tháng/trạng thái và retry không tạo đúp. Chưa tạo máy thử trên DB kinh doanh để kiểm lưu browser end-to-end.

Bằng chứng local: `qa/export-verification.mjs`, `qa/message-verification.mjs`, `qa/purchase-inline-db-verification.mjs`; đã tích hợp vào `npm run test:audit` (**13/13 suite PASS**). Bằng chứng live/browser: `qa/export-live-verification.mjs`, `qa/purchase-invoice-browser.mjs`, kết quả tại `test-results/purchase-invoice/`. Build trước cập nhật phụ thuộc đạt **65/65**; trạng thái bản build cuối được ghi bên dưới khi hoàn tất. Migration trên chỉ thay định nghĩa thông báo, không reset/reseed DB live.

Báo cáo bên dưới là kết quả audit ban đầu; không đồng nghĩa mọi nhận định live đã được xác minh lại trong đợt sửa. Toàn bộ 39 mục **chưa hoàn tất**.

| Mục | Trạng thái hiện tại |
| --- | --- |
| F01–F03 | Đã sửa local: DTO allowlist cho laptop/order, lọc phản hồi phân máy, quyền entity và lọc JSON lịch sử; không cho trường giá rỗng xóa giá vốn. Kiểm tra helper 9/9 và Route Handler 35/35 (DB giả lập), chưa test live năm vai trò. |
| F04 | Đã chặn ID thiếu/sai/không tồn tại tại route; service không còn insert laptop. Route test xác nhận không gọi hàm save khi bị chặn. |
| F05 | Một phần: cấm thay isActive qua chỉnh sửa, server đặt thời gian hủy/trả, bỏ timestamp/lock do client gửi, hạn chế đổi tháng; cần tiếp tục kiểm transaction và ma trận hành động. |
| F09–F10 | Đã lọc reservation ACTIVE còn hạn với thứ tự ổn định; lỗi enrichment trả 503 thay vì dữ liệu rỗng. Chưa hoàn tất kiểm thử tích hợp các nhánh lỗi. |
| F11 | Một phần: helper tháng Việt Nam dùng ở API và service; chưa chuẩn hóa toàn bộ SQL và client. |
| F12 | Đã xác thực ngày tồn tại theo lịch, kiểm ngày nhuận và overflow trong helper test. |
| F13, F30 | Một phần: client Kho/Đơn tải các trang 250 hàng theo ID ổn định, không trả partial success; 7/7 kiểm tra gồm 1.251 hàng. Chưa làm virtualized rows/search server và tải theo nhu cầu hiển thị. |
| F15 | Đã thay ba script ENOENT bằng kiểm tra schema hiện tại: thu cũ 7/7, tài chính 7/7, Sales Operations 22/22. Không coi đây là thay thế đủ mọi kịch bản live E2E. |
| F39 | Đã thêm `npm run test:audit` để chạy 10 suite local và trả exit code khác 0 khi có lỗi; CI và browser gates còn mở. |
| Các mục khác | Chưa khắc phục/xác minh đầy đủ; tiếp tục theo thứ tự ưu tiên trong báo cáo. |

Lint toàn repo đã PASS trong đợt sửa. Build sau batch phân trang đã PASS 64/64; `npm run test:audit` đạt 10/10 suite local, helper bảo mật bổ sung đạt 9/9. Không apply migration, reseed hay sửa dữ liệu live trong đợt này.

**Ngày kiểm tra:** 29/09/2026. **Phạm vi:** repository `citilap-admin-nextjs`, schema PGlite được dựng từ `init_full_db.sql`, project Supabase `citilapdb` (chỉ đọc), và Playwright trên localhost với tài khoản Admin ở viewport 1440/390 px. **Không thay đổi dữ liệu kinh doanh, schema hoặc code sản phẩm.**

**Quy ước bằng chứng:** **CODE** = chứng minh được đường xử lý từ nguồn; **LIVE** = đọc thực tế từ Supabase; **BROWSER** = có kết quả Playwright; **RỦI RO** = có cơ sở kỹ thuật nhưng chưa tái hiện được hậu quả; **ĐỀ XUẤT** = cải tiến cần đo/test trước khi xem là lỗi. P0 = làm trước khi cho nhân viên sử dụng rộng rãi, P1 = chốt trước khi phát hành, P2 = tối ưu vận hành, P3 = tinh chỉnh trải nghiệm. Phân loại là **ưu tiên kỹ thuật xử lý**, không phải khẳng định tất cả đã xảy ra trên dữ liệu thật.

## 1. Kết quả xác minh và giới hạn

| Hạng mục | Bằng chứng/kết quả |
| --- | --- |
| Schema | 38 bảng, 117 index hợp lệ ở cả bản dựng cục bộ và Supabase thật; không thấy cặp index hoặc CHECK trùng hoàn toàn trong bộ dò hiện tại. |
| Dữ liệu live | 30 laptop, 21 đơn, 5 payment, 30 phiếu QC, 3 tài khoản tiền, 5 giao dịch tài khoản; chưa có trade-in. Không ghi nhận duplicate serial đang hoạt động, máy gán trùng cho đơn đang có hiệu lực, đơn đã chốt không có máy, link đơn–máy hỏng, chênh lệch `orders.amount_paid` với `financial_records` trong truy vấn kiểm tra hoặc reservation ACTIVE quá hạn. |
| QC live | Script `qa/audit-qc-product-data.mjs`: 30 laptop/30 phiếu QC, 0 legacy check item, 0 serial/battery trùng hay xung đột giữa cột canonical và `qc_details`; chưa có snapshot/note legacy cần dọn. |
| Schema/workflow cục bộ | `qa/clean-schema-db-verification.mjs`: **19/19 PASS**; dựng schema và seed lặp: PASS; phân bổ đơn: **6/6 PASS**; lọc tháng: **10/10 PASS**; kiểm tra truy vấn tháng, cleanup migration: PASS. Đây là bằng chứng PGlite/static, không tương đương live E2E. |
| Build | `npm.cmd run build`: Next.js 16.3.2 compile thành công và tạo **64/64 trang**. `git diff --check`: PASS tại thời điểm audit. Lint toàn repo đã khởi chạy nhưng lần đọc kết quả bị công cụ chặn; **không xác nhận lint PASS**. |
| Trình duyệt | Playwright đã đăng nhập Admin, thử 26 route × 2 kích thước = **52 lượt**. 51 lượt hoàn tất không ghi nhận JS pageerror/tràn ngang toàn tài liệu; `/inventory` 390px timeout 60 giây khi chờ `networkidle`. Đây **chưa** là bằng chứng trang bị treo hoặc khớp thiết kế bằng mắt. Chrome DevTools riêng không kết nối được cổng 9222. |
| QA đang gãy | `qa/trade-in-obligation-db-verification.mjs`, `qa/financial-operations-db-verification.mjs`, `qa/sales-operations-db-verification.mjs` đều lỗi ENOENT do trỏ tới migration `202610...` hiện không tồn tại. |

## 2. Danh sách cần xử lý, theo mức ưu tiên

### P0 — quyền dữ liệu và bảo vệ giá vốn

**F01 — Giá mua mới đi qua API Inventory tới role không phải Admin. [CODE + LIVE]** `app/api/inventory/route.js:18,77` cho phép ADMIN/SALES/TECH/TECHNICAL/STAFF đọc; `lib/services/dbService.js:136-156` query `laptops.select('*')`; `lib/apiAuth.js:256-259` lọc `priceRmb`, `importPriceVnd`... nhưng **thiếu** `purchasePriceRmb` và `purchaseExchangeRate`. Supabase live có 30/30 laptop với `purchase_price_rmb > 0`; chưa thực hiện request bằng token STAFF để tái hiện qua mạng. **Sửa:** response DTO dạng allowlist theo role ở phía server, kiểm tra cả trường mới phát sinh từ migration; test bất biến cho mọi role và trường lồng nhau. `context/InventoryContext.jsx:34` cũng có danh sách nhạy cảm cũ: đồng nhất định nghĩa server/client, trong đó server là ranh giới bắt buộc.

**F02 — POST phân bổ máy trả về nguyên hàng `orders` và `laptops` cho SALES. [CODE]** `app/api/order-allocation/route.js:34-35,55-63` cho phép SALES, sau RPC dùng `select('*')` trên cả hai bảng và `toCamel` trả nguyên kết quả. Như vậy đường này có thể trả `purchasePriceRmb`, snapshot lợi nhuận và các cột nhạy cảm ngay cả khi sửa F01. **Sửa:** chỉ trả các ID, trạng thái và trường UI cần; dùng chung DTO theo quyền của `/api/orders` và `/api/inventory`; test `POST` của SALES với máy có giá mua. Đây là vấn đề response khi thao tác thành công, không chỉ GET.

**F03 — API nhật ký có đường lộ dữ liệu tài chính cho STAFF/TECH trong tương lai. [CODE; LIVE CHƯA CÓ BẢN GHI]** `app/api/activity-logs/route.js:18,36-43` cho toàn bộ role đọc `changes` nguyên bản bằng entity ID; `app/api/inventory/route.js:9-14,194-205` ghi cả giá mua/tỷ giá/giá nhập; `lib/services/logger.js:29-57` không phân loại trường. Live hiện có **0** nhật ký LAPTOP nên chưa có dữ liệu thực tế bị lộ qua đường này. **Sửa:** áp quyền/DTO cho từng entity, loại `old/new` của trường giá vốn và thông tin nhạy cảm, test log được ghi sau một lần Admin đổi giá và đọc bởi STAFF.

### P1 — tính đúng đắn và an toàn quy trình

**F04 — API chỉnh Inventory có nhánh tạo laptop trái với quy trình. [CODE; RỦI RO]** `app/api/inventory/route.js:118-125` chặn `?mode=create`, nhưng một POST **không có ID** và không có mode này được `validateLaptopPayload(...partial:true)` rồi tới `saveLaptopToCloud`; `lib/services/dbService.js:184-217` sẽ `.insert(...)` nếu thiếu ID. Dữ liệu mặc định ở `laptops` còn một số cột nghiệp vụ cho phép null. Không chạy thử insert trên DB thật. **Sửa:** endpoint chỉnh sửa yêu cầu ID hợp lệ và bản ghi tồn tại; trả 400/404 trước khi gọi service. Tạo laptop mới chỉ qua RPC Lô mua/Nhận máy chưa rõ nguồn/Thu cũ. Xóa nhánh `isCreateRequest` không thể tới và thêm test POST thiếu ID.

**F05 — Trường vô hiệu hóa bản ghi và vòng đời được gửi từ client. [CODE; RỦI RO]** `lib/apiAuth.js:222-240` chấp nhận `isActive`, `laptopLocked`, `monthKey`, `cancelledAt`, `returnedAt` và thời gian; `app/api/inventory/route.js:95-97,187` không giới hạn `isActive` theo vai trò; `app/api/orders/route.js:95` cho phép SALES gửi các trường điều khiển. RPC update kế thừa `p_order` qua `jsonb_populate_record` và dùng `is_active` trong quy tắc chiếm máy. **Sửa:** allowlist theo từng **hành động**, không chỉ entity; `is_active`, lock và lifecycle timestamps do RPC giao dịch chuyên biệt quyết định. Kiểm thử giả lập POST chỉnh `isActive=false` ở SALES/STAFF **trên DB test** để xác định tác động đầy đủ.

**F06 — Đường ghi lịch sử kho thủ công có thể giả mạo sự kiện nghiệp vụ. [CODE; RỦI RO]** `app/api/stock-movements/route.js:14-29` cho cả STAFF/TECH/SALES POST với `movementType`, `fromLocation`, `toLocation`, `orderId`; `lib/services/dbService.js:350-365` insert trực tiếp vào `stock_movements`, không xác minh mối quan hệ giữa loại sự kiện và trạng thái thực. **Sửa:** phân biệt chuyển vị trí thủ công được phép với sự kiện SOLD/RETURN/QC do RPC ghi nguyên tử; xác thực chuyển vị trí hiện hành, quyền, idempotency và đối soát event với trạng thái.

**F07 — Ghi log ứng dụng tách khỏi giao dịch chính. [CODE; PHỤ THUỘC RPC]** `lib/services/logger.js:29-58` nuốt lỗi ghi log (`return false`), `app/api/inventory/route.js:187-205` và `app/api/orders/route.js:265-279` ghi log sau khi save và không kiểm tra kết quả. Một số RPC cũng tự ghi log, nên phải lập danh mục **cái nào đã có log nguyên tử** và tránh ghi trùng. **Sửa:** log pháp lý/quan trọng trong transaction hoặc outbox; cảnh báo/telemetry khi log phụ thất bại. Không dùng log HTTP hậu giao dịch làm bằng chứng duy nhất.

**F08 — Hai endpoint GET có tác dụng ghi DB. [CODE]** `app/api/costs/route.js:3` gọi `sync_laptop_cost_components` ngay khi đọc chi tiết. RPC có insert/upsert theo dữ liệu nguồn (`db/migrations/20260925_clean_baseline.sql:2336-2355`). `app/api/sales-operations/route.js:35` gọi `expire_reservations` khi xem danh sách giữ máy, có thể thay đổi trạng thái. **Sửa:** GET chỉ đọc; dùng POST `action=sync` đang có hoặc đồng bộ giá vốn trong transaction phát sinh chi phí; chạy hết hạn giữ máy ở cron/RPC tác vụ nền phù hợp. Test GET lặp không tạo mutation, còn expiry chạy đúng lúc và chịu được retry.

**F09 — Danh sách đơn có thể gắn nhầm reservation cũ. [CODE; RỦI RO]** `app/api/orders/route.js:40-58` lấy tất cả reservation của các order rồi `new Map(order_id -> record)` không sắp xếp/giới hạn trạng thái; schema chỉ unique reservation active trên `laptop_id`, không unique theo `order_id`. Live hiện không có order có nhiều reservation. **Sửa:** trạng thái ACTIVE và hạn sử dụng cho badge hiện tại; lịch sử reservation trả thành mảng được sort theo thời gian/ID trong trang chi tiết, có test cùng order trải qua nhiều lần giữ/hết hạn.

**F10 — Query enrichment mất lỗi và biến dữ liệu thiếu thành `null` hợp lệ. [CODE]** `app/api/orders/route.js:40-62` và `app/api/inventory/route.js:49-77` chỉ kiểm tra truy vấn chính; lỗi từ reservations/trade-ins/invoices/customers/users/commissions có thể bị map thành danh sách rỗng. **Sửa:** kiểm tra từng `error`; trả partial-data state được gắn cờ và retry, hoặc fail có chủ đích đối với thành phần trọng yếu như giữ máy/hóa đơn; lưu request ID để tra cứu.

**F11 — Lọc tháng dùng nhiều nguồn timezone. [CODE; RỦI RO BIÊN THÁNG]** `lib/listScope.js:19-23` dùng `Asia/Ho_Chi_Minh`; `app/api/orders/route.js:136-143` dùng timezone máy chủ cho quyền sửa tháng; `lib/services/dbService.js:282-286` dùng `new Date()` để đặt tháng khi tạo; SQL dùng `CURRENT_DATE`. **Sửa:** một helper `businessMonthKey` và business date thống nhất Asia/Ho_Chi_Minh ở route/service/DB; test 23:59/00:01 ngày cuối tháng và server chạy UTC. Query `listScope` hiện qua 10/10 case nhưng chưa bao phủ các chỗ kia.

**F12 — Validator ngày thanh toán có thể chấp nhận lịch sai. [CODE; RỦI RO]** `app/api/payments/route.js:7-11` kiểm regex `YYYY-MM-DD` và JavaScript Date không NaN; Date có thể chuẩn hóa ngày không tồn tại. **Sửa:** so lại `toISOString().slice(0,10)` với đầu vào, xác thực ngày vận hành, bổ sung test 29/02 không nhuận, 31/04 và múi giờ.

**F13 — Chưa có hàng rào phân trang cuối–cuối cho danh sách chủ lực. [CODE; RỦI RO THEO QUY MÔ]** `lib/apiFetchers.js:17-24,42-49` không gửi `limit`/`offset`, trong khi `lib/services/dbService.js:136-146,231-245` chỉ phân trang nếu client yêu cầu. `context/InventoryContext.jsx:543-568` nạp nguyên tháng, `ALL` có thể ngày càng nặng hoặc đụng giới hạn trả hàng của PostgREST. **Sửa:** phân trang server bắt buộc, sort ổn định, tổng số, search/filter ở DB, virtualized rows và test >1.000 bản ghi. Không mặc định nạp ALL.

**F14 — Migration registry trên live chưa ánh xạ rõ tới repo. [LIVE + SOURCE]** `supabase` báo bốn version đã đăng ký: `20260928095034`, `20260929074624`, `20260929154557`, `20260929154653`, còn local chứa tên/timestamp khác (`20260928094834`, `20260929073848`, `20260929154320`...) và có baseline riêng trong `db/migrations`. Không tự coi đây là schema drift vì `init_full_db.sql` có thể đã được chạy thủ công. **Sửa:** so sánh function/view/trigger hash live với schema được dựng từ migrations; thiết kế lịch sử migration chuẩn có tài liệu baseline, thứ tự, checksum và quy trình thêm migration không phá dữ liệu.

**F15 — 3 bài QA hiện lỗi ENOENT. [ĐÃ CHẠY]** `qa/trade-in-obligation-db-verification.mjs`, `qa/financial-operations-db-verification.mjs`, `qa/sales-operations-db-verification.mjs` đọc những file `db/migrations/202610...` không có trong repo; vì thế không tạo được gate bảo đảm thu cũ, kế toán, hoa hồng. **Sửa:** viết lại theo baseline/schema hiện tại, có test hành vi PGlite + isolated live E2E, đăng ký vào CI.

**F16 — Supabase Auth tắt kiểm tra mật khẩu lộ. [LIVE ADVISOR]** Bật compromised/leaked password protection và kiểm thử luồng đăng nhập, đổi mật khẩu. [Tài liệu Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

**F17 — Chưa hoàn tất ma trận E2E quyền hạn và giao dịch đồng thời cho bản hiện tại. [CHƯA XÁC MINH]** Đã thử browser Admin ở các route và PGlite nghiệp vụ; cần ít nhất ADMIN/SALES/TECH/TECHNICAL/STAFF × từng route/verb/trường nhạy cảm, hai trình duyệt tranh một serial, đổi phân bổ khi đơn khác giữ máy, refresh sau thao tác, gián đoạn mạng giữa RPC và UI, hủy/hoàn/đổi. Chạy trên nhánh hoặc DB thử nghiệm cô lập, không reseed live đang hoạt động.

### P2 — database, hiệu năng, nhất quán và trải nghiệm

**F18 — 29 khóa ngoại chưa có index bao phủ theo Supabase Advisor. [LIVE ADVISOR]** Ví dụ `orders.customer_id`, `payments.account_id`, `repair_parts.repair_job_id`, `warranty_cases.order_id`, các khóa liên kết supplier payment/reservation. **Sửa:** kiểm query thực tế/`EXPLAIN (ANALYZE, BUFFERS)` và bổ sung chọn lọc ở các join hoặc delete/check hay dùng; không tự động thêm đủ 29 khi tập dữ liệu chỉ có 30 laptop. [Linter FK](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

**F19 — RLS `user_profiles` đánh giá `auth.uid()` mỗi hàng. [LIVE ADVISOR]** Đổi policy thành `id=(select auth.uid())` nếu kiểm tra EXPLAIN và migration xác nhận giữ nguyên quyền. [Tài liệu](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

**F20 — 19 index bị advisor đánh dấu chưa sử dụng. [LIVE ADVISOR]** Dữ liệu rất nhỏ và cửa sổ thống kê có giới hạn: chưa đủ bằng chứng index dư. **Sửa:** lấy usage sau thử nghiệm luồng điển hình với dữ liệu lớn; chỉ gộp/bỏ index sau khi chứng minh không phục vụ FK/unique hoặc đường truy vấn quan trọng. [Linter](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

**F21 — 37 cảnh báo RLS enabled/no policy là thiết kế server-only hiện tại, cần ghi thành contract. [LIVE]** SQL live: `anon` có SELECT trên **0** bảng, `authenticated` trên **1** bảng; không có quyền trực tiếp EXECUTE function `SECURITY DEFINER` cho anon/authenticated. Đây **không phải 37 lỗ hổng**; mô hình dùng API service-role sau `requireUser`. **Sửa/duy trì:** hợp đồng bảo mật về grants + RLS trong CI, tuyệt đối không thêm client truy vấn thẳng bảng nghiệp vụ vì muốn realtime.

**F22 — Các bảng không được gọi trực tiếp từ code không có nghĩa là rác. [ĐÃ ĐỐI CHIẾU]** `cash_accounts` live có 3 hàng; `operation_requests` hiện 0 hàng nhưng dùng cho idempotency trong RPC; `cod_receivables`, `cod_settlements`, `trade_in_inspections`, `trade_in_check_items` được dùng qua view/RPC hoặc để lưu lịch sử. **Sửa:** dựng dependency graph gồm API → view/RPC → trigger/FK → bảng + row count/live usage trước khi đề xuất DROP; hiện **không đề xuất xóa bảng**.

**F23 — Chưa có bằng chứng hiệu năng p95/p99 theo route và khối lượng thật. [ĐỀ XUẤT]** Đã có `Server-Timing` ở Inventory/Orders nhưng chưa có hồ sơ request waterfall ổn định ở 100/1.000/10.000 laptop, số đơn lớn, mạng chậm, hai vai trò. Thiết lập ngân sách TTFB, thời gian có thể thao tác, số API/request, kích thước JSON, query slow-log. So sánh tháng mặc định với `ALL`.

**F24 — `/inventory` trên mobile không đạt tiêu chí `networkidle` của browser audit. [BROWSER]** Thất bại 60 giây ở 390px; đo tải dữ liệu riêng desktop route cũng timeout 30 giây chờ `networkidle`. Không ghi nhận lỗi JS hoặc lỗi tràn ngang ở những lượt đã hoàn tất. **Sửa:** thu HAR/waterfall, so sánh thời điểm DOM ready, loading overlay ẩn, network 60s poll/request đang pending; dùng tiêu chí giao diện có thể thao tác thay vì chỉ `networkidle`, rồi tối ưu nếu có slow API thực sự.

**F25 — Màn Inventory ưu tiên bảng rộng cố định; trải nghiệm mobile cần thiết kế theo công việc. [CODE + ĐỀ XUẤT UI]** `components/pages/Inventory.jsx:112-147,184-186,960` cộng chiều rộng cột cố định; không bị tràn **document** ở lượt test nhưng vẫn cần cuộn ngang trong container bảng. Đề xuất thẻ mobile có serial, tên, QC/status, vị trí và hành động thường dùng; desktop giữ resize/sticky, có preset cột theo SALES/TECH/ADMIN và nút reset độ rộng.

**F26 — Layout hiện cố ý chia hai hệ thị giác. [CODE + ĐỀ XUẤT UI]** `layouts/MainLayout.jsx:46` giữ `/inventory` và `/orders` ở layout legacy trong khi các màn khác dùng Taste workspace. Khi các màn đã ổn định, chuẩn hóa spacing, typography, badge trạng thái, màu supplier, nút chính/phụ, modal/toast/empty state **mà không làm mất độ đậm thông tin của hai list cũ**.

**F27 — Giao diện lịch sử không hiển thị chi tiết CREATE đã được log. [CODE]** `components/ActivityTimeline.jsx:53-78,141-145` render old/new diff **chỉ** cho UPDATE, trong khi logger lưu CREATE dưới dạng trường phẳng. **Sửa:** cho người được phép mở thay đổi lúc tạo; hiển thị nhãn người dùng thay khóa JS, redaction dữ liệu nhạy cảm như F03 và phân trang timeline.

**F28 — Đồng bộ client định kỳ nạp lại nhiều dữ liệu. [CODE + ĐỀ XUẤT]** `context/InventoryContext.jsx:638-641` làm full refresh mỗi 60 giây; `components/pages/Inventory.jsx:43-58` cũng poll nhu cầu phân máy 60 giây. Nên có bộ nhớ cache theo month/role, cơ chế visibility-aware/background refresh, ETag hoặc timestamp delta; giữ server API làm ranh giới bảo mật, kiểm tra người đang sửa draft không bị background refresh ghi đè.

**F29 — API đọc lớn đang dùng `select('*')` ở nhiều nơi. [CODE]** Inventory, Orders, Warranty, Purchases, Activity Logs, Costs, Stock Movements… trả nhiều cột và có thể chứa JSON QC. **Sửa:** DTO theo mục đích (list/detail/export), cột chính xác theo role, lazy load history/QC/chi tiết hóa đơn và đo bytes/request; đây cũng là biện pháp giảm rủi ro lộ dữ liệu khi schema đổi.

**F30 — Lỗi network ở các fetcher thường chuyển thành `null` chung. [CODE]** `lib/apiFetchers.js:17-55`, `lib/services/dbService.js:147-159,244-251` trả null khi lỗi; UI khó phân biệt 401, 403, timeout, server quá tải và danh sách thực sự rỗng. **Sửa:** typed error/error code, retry có giới hạn cho GET, giao diện lỗi có nút tải lại và giữ filter/draft.

**F31 — Các đường thời gian/tìm kiếm nhiều lịch sử cần chiến lược retention. [ĐỀ XUẤT]** `app/api/activity-logs/route.js:36-41` không phân trang; stock movement/warranty history cũng đọc toàn bộ ở service. Giữ audit append-only, thêm cursor/time-window, lưu trữ dài hạn theo chính sách kiểm toán, index theo entity/time nếu EXPLAIN chứng minh cần.

### P3 — checklist polish trước bàn giao

**F32 — Kiểm tra từng modal bằng bàn phím và screen reader. [CHƯA XÁC MINH]** Tập trung form tạo đơn, thanh toán, phiếu sửa, supplier return, phân máy: nhãn input, focus trap/restore, Escape, disabled/submit, thông báo lỗi liên kết input, thông tin bắt buộc, thông báo `aria-live`. Playwright hiện mới kiểm vị trí bounding box/JS error.

**F33 — Mobile workflow riêng theo vai trò. [ĐỀ XUẤT]** Với TECH: check QC nhanh, scan serial, vị trí; SALES: tra máy/giữ máy/thu tiền; ADMIN: xem cảnh báo vốn và công nợ. Đánh giá 320/360/390/430px và 200% zoom, màn bàn phím ảo mở, landscape tablet.

**F34 — Hợp nhất thông báo nghiệp vụ. [ĐỀ XUẤT]** Chuẩn hóa lỗi validation ngay dưới trường, cảnh báo xác nhận thao tác không thể đảo, trạng thái loading và retry idempotent; thông báo người dùng bằng tiếng Việt, nhất quán nhãn tiền là **triệu VND**, **VND**, **RMB** và tỷ giá. Kiểm tra các RPC tiếng Việt hiện diện từ source migration mới bằng browser khi xử lý thất bại.

**F35 — Đối soát trạng thái đa bước bằng dữ liệu thử thật. [CHƯA XÁC MINH]** Trên DB test chạy `lô → dự kiến → nhận → QC fail → sửa → QC lại → sẵn bán → giữ → cọc vào tài khoản → giao → hóa đơn → bảo hành/hoàn`, cùng nhánh `unknown → reconcile` và `supplier return + refund` và `trade-in/commission`. Ở mỗi bước kiểm 3 lớp UI–API–ledger + reload + history, hai phiên cạnh tranh.

**F36 — Đặt yêu cầu test cho tình huống mất mạng/gửi hai lần. [CHƯA XÁC MINH]** Kiểm double-click tiền/thu cũ/giữ máy/nhập lô, retry sau timeout khi RPC đã commit, lỗi API thứ cấp sau commit, form còn nội dung sau lỗi, idempotency key được gửi ổn định từ browser.

**F37 — Nâng cấp bộ kiểm tra giao diện từ hình chụp thành baseline review. [ĐỀ XUẤT]** So ảnh 52 màn theo vùng (header/list/modal), xác nhận bằng mắt/computed-style, test empty/very-long text/1.000 hàng, trạng thái role khác nhau và màn 200% zoom. Lưu ảnh baseline ngoài các file screenshot cũ và chỉ cập nhật có review để tránh test tự ghi đè golden image.

**F38 — Chốt observability và vận hành trước phát hành. [ĐỀ XUẤT]** Structured server logs không chứa token/PII, correlation ID qua API/RPC, dashboard lỗi và latency, cảnh báo thanh toán lệch/khóa máy, backup có thử restore vào project cô lập, checklist migration/rollback và ghi nhận migration hash. Chưa kiểm cấu hình production CDN/backup nên đây là release gate, không khẳng định các phần đó hiện thiếu.

**F39 — Gọn bộ kiểm thử trong CI. [ĐỀ XUẤT TỪ LỖI F15]** Chia nhanh: lint + build + `git diff --check`, static quyền/DTO, PGlite schema/reseed/invariants, E2E isolated Supabase role matrix, browser desktop/mobile accessibility + screenshot review. Tách script legacy/hardcoded 202610 đã lỗi khỏi gate phát hành cho đến khi chuyển sang canonical migration. Ghi PASS thực tế và gate chưa chạy; không xem build xanh là chứng nhận toàn hệ thống.

## 3. Thứ tự thực hiện và điều kiện nghiệm thu

1. **Chặn đường lộ dữ liệu:** F01–F03, thêm automated role/field allowlist test cho tất cả nested DTO và historical `changes`. Đồng thời khóa F04–F06 tại API/RPC theo hành động. *Gate:* role SALES/TECH/STAFF không thể thấy giá vốn/snapshot hoặc thay đổi lifecycle không được phép qua API kể cả payload giả mạo.
2. **Chuẩn hóa transaction và chính xác luồng:** F07–F12; kiểm race/rollback, current/historical reservation, month end và lỗi ngày. *Gate:* một thao tác tạo đúng một event tài chính/history theo hợp đồng; retry không tạo đúp, refresh từ DB giống UI.
3. **Làm sạch release pipeline:** F14–F17, đối chiếu live schema/migration và thay thế ba script QA gãy. *Gate:* chạy toàn bộ kiểm tra trên DB test giống bản live; hoàn tất phân quyền năm vai trò.
4. **Tối ưu theo số liệu và hoàn thiện giao diện:** F13 và F18–F39, ưu tiên phục hồi phép đo `/inventory` 390px và đo 100/1.000+ máy trước khi tạo index/đổi layout lớn. *Gate:* không có màn vượt tiêu chí thời gian được định nghĩa; keyboard/zoom/empty/long-data và error state đều qua review.

## 4. Căn cứ và cách tái kiểm

**Các lệnh chạy thành công trong lần này:** `node qa/audit-db-ui-workflow.mjs`, `node qa/clean-schema-db-verification.mjs`, `node qa/validate-db-reset.mjs`, `node qa/order-allocation-verification.mjs`, `node qa/month-query-db-verification.mjs`, `node qa/list-scope-verification.mjs`, `node qa/workflow-cleanup-verification.mjs`, `node qa/audit-qc-product-data.mjs`, `npm.cmd run build`, `node qa/pilot-screen-audit.mjs` (51/52 lượt; một timeout), `git diff --check`. **Không hoàn tất:** lint result do công cụ chặn đọc tiến trình; đo tải `/inventory` do `networkidle` timeout; ba script QA legacy ENOENT. Không chạy thao tác ghi lên Supabase live.

**Supabase live advisors (29/09/2026):** security: 37 INFO RLS no policy (khớp mô hình server-only, không tự coi là lỗi), 1 WARN leaked-password protection; performance: 29 INFO unindexed FK, 1 WARN auth RLS init plan, 19 INFO unused index. [Security/password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [performance/FK](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [policy](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), [index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

**Quan trọng:** Báo cáo chỉ xác nhận các lỗi bảo mật/logic bằng nguồn và các bất biến bằng dữ liệu hiện có; không coi việc chưa thấy lỗi trên mẫu 30 máy là bằng chứng tất cả nhánh nghiệp vụ đã an toàn. Không xóa bảng, index, dữ liệu hoặc tái seed production trước khi có dependency graph và kiểm tra isolated live.
