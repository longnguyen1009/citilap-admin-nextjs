# CitiLap Admin — rà soát sau các đợt sửa, 30/09/2026

> **Bổ sung mới nhất:** [Rà soát UI và luồng vận hành 30/09/2026](ADMIN_UI_WORKFLOW_REVIEW_2026-09-30.md) có bằng chứng Chrome ADMIN, 40 mục đánh giá và trạng thái các sửa đã xác nhận. Các mô tả dưới đây giữ làm lịch sử; không coi A01/A03/A06/D07 là nguyên trạng chưa sửa. A02 và D01 có rủi ro còn lại, xem U04–U07/U25 trong báo cáo mới.

## Phạm vi và mức độ tin cậy

Rà soát mã nguồn hiện tại, báo cáo cũ, schema dựng cô lập và các bộ kiểm tra local. Không sửa code sản phẩm, không ghi dữ liệu kinh doanh trong lượt audit này. Không khẳng định đã kiểm tra mọi pixel hoặc mọi nhánh nghiệp vụ: chưa chạy lại đầy đủ trình duyệt, năm vai trò, dữ liệu lớn, máy in vật lý và Supabase live trong lượt này.

- `npm run test:audit`: **13/13 suite PASS**; gồm helper bảo mật 10/10, route giả lập 38/38, phân trang 7/7, schema 19/19, cùng kiểm tra export/encoding/thêm máy và các luồng tài chính.
- `npm run lint`: **PASS** toàn repo trong lượt này; `git diff --check`: PASS trên thay đổi tracked.
- `node qa/audit-db-ui-workflow.mjs`: **38 bảng, 117 index; không phát hiện index/CHECK trùng hoàn toàn** trong schema local. Không suy ra bảng/index dư từ việc ít được sử dụng.
- Hàm `visibleInvoice` được chạy trực tiếp với snapshot giả lập: SALES vẫn nhận `cost_snapshot_vnd`, `gross_profit_snapshot_vnd`, `direct_cost_snapshot_vnd`, `net_contribution_snapshot_vnd`. Không phải bằng chứng đã có người đọc dữ liệu live.
- Kết quả browser/PDF/export live ở báo cáo 29/09 và đầu phiên 30/09 là bằng chứng lịch sử. Chuyển màn chi tiết ↔ A4 mới nhất chưa được xác nhận lại bởi browser; lần trước timeout đăng nhập.
- Build 16.3.7 gần nhất chưa PASS do tải Google Fonts thất bại; lần yêu cầu mạng ngoài sandbox bị automatic approval review từ chối vì giới hạn sử dụng. Không coi đó là lỗi compile của ứng dụng.
- Báo cáo cũ có các đoạn trạng thái mâu thuẫn theo thời điểm; dùng tài liệu này làm danh sách công việc hiện tại, giữ báo cáo cũ làm lịch sử.

Quy ước: **C** = thấy rõ từ code; **T** = tái hiện bằng kiểm tra local; **R** = rủi ro cần kiểm thử; **ĐX** = đề xuất cải thiện, không phải lỗi đã xảy ra. P0 = chặn phát hành; P1 = sửa trước pilot rộng; P2 = tối ưu tiếp; P3 = hoàn thiện. Không cộng số đề xuất thành số lỗi.

## Tiến độ khắc phục

- **Đã sửa và kiểm tra local:** A01, A02, A03, A04, A06, D01, D07. Snapshot hóa đơn cho SALES dùng allowlist lồng nhau; ghi lịch sử kho kiểm quyền, loại sự kiện và liên kết phiếu bảo hành; GET không còn chạy RPC ghi; expiry chuyển sang POST có kiểm lỗi; repair dùng form kết luận/hủy và chỉ hoàn tất ở TESTING; nháp thêm máy vào lô được giữ trong phiên trình duyệt.
- **Bằng chứng hiện tại:** `npm run test:audit` 13/13, route giả lập 38/38, helper bảo mật 10/10, ESLint các file thay đổi và `git diff --check` đều PASS.
- **Còn cần xác nhận:** ma trận token thật trên Supabase và browser cho các thay đổi UI/persistence; các mục chưa nêu trong danh sách trên vẫn đang mở.

## A. Quyền, tính đúng đắn và vận hành

| ID | Ưu tiên / bằng chứng | Vấn đề, tác động | Đề xuất và điều kiện nghiệm thu |
|---|---|---|---|
| A01 | P0 C/T | `app/api/invoices/route.js:5`: lọc SALES chỉ xóa `profit_vnd`. `issue_invoice` lưu `to_jsonb(o)` nên snapshot còn giá vốn/lợi nhuận khác. | DTO allowlist cho toàn bộ snapshot, dùng cho GET và POST. Test SALES không nhận bất kỳ trường chi phí/lợi nhuận nào kể cả JSON lồng nhau; đối chiếu token thật trên DB test. |
| A02 | P1 C/R | `app/api/stock-movements/route.js:14` cho mọi vai trò nghiệp vụ POST; service chỉ kiểm bản ghi tham chiếu tồn tại rồi insert. Chưa ràng buộc loại sự kiện với chuyển trạng thái thực. | Chỉ cho thao tác chuyển kho hợp lệ; sự kiện bán/QC/trả do RPC phát sinh. Test giả mạo event và ghép laptop–order không liên quan. |
| A03 | P1 C | GET chi tiết cost gọi `sync_laptop_cost_components`; đọc giữ máy gọi `expire_reservations`. Việc xem màn hình có tác dụng ghi. | Chuyển ghi sang transaction nghiệp vụ hoặc tác vụ nền/POST; đọc lại không tạo thay đổi. |
| A04 | P1 C | `sales-operations/route.js:35` bỏ qua kết quả/lỗi expiry RPC. Danh sách có thể thể hiện giữ máy chưa được xử lý hết hạn. | Kiểm lỗi; trạng thái hết hạn phải được tính rõ và job có retry/giám sát. |
| A05 | P1 C/R | `lib/services/logger.js:29` trả false khi log lỗi; nhiều route không xử lý kết quả sau khi đã lưu nghiệp vụ. | Phân loại log bắt buộc và phụ; log bắt buộc nằm cùng transaction/outbox. Test rollback hoặc phục hồi log, không ghi trùng với RPC. |
| A06 | P1 C | `Repairs.jsx:55` hiện nút hoàn tất cho mọi trạng thái ACTIVE, trong khi RPC yêu cầu TESTING. UI dẫn người dùng tới lỗi có thể ngăn trước. | Chỉ bật khi đúng trạng thái và đủ kết luận; giải thích bước còn thiếu ngay cạnh nút. |
| A07 | P1 C/R | Repairs tạo UUID mới mỗi lần submit/start/complete. Sau timeout rồi thử lại, khóa mới không còn đại diện cho thao tác trước. | Giữ khóa theo draft cho tới khi biết kết quả; test RPC đã commit nhưng HTTP response mất. |
| A08 | P1 R | Chưa có bằng chứng ma trận hai phiên đồng thời cho phân máy, giữ máy, thu tiền, nhập lại và đổi trả sau các thay đổi mới. | DB test riêng; hai phiên tranh một máy, retry, rollback; đối chiếu UI/API/ledger và reload. |
| A09 | P1 C/R | Một số form repair dùng `defaultValue` và cập nhật `active` sau request; dữ liệu DOM có thể không phản ánh bản ghi đã đổi/sửa đồng thời. | Controlled form hoặc key theo ID/version; cảnh báo xung đột thay vì ghi đè âm thầm. Test chuyển nhanh giữa hai phiếu. |

## B. DB, API và khả năng mở rộng

| ID | Ưu tiên / bằng chứng | Vấn đề, tác động | Đề xuất và điều kiện nghiệm thu |
|---|---|---|---|
| B01 | P1 C | Hóa đơn `.limit(500)`, Sales Operations `.limit(200)`, đối soát `.limit(100)` không có cơ chế lấy tiếp ở các endpoint đó. Tìm kiếm phía client không thấy bản ghi ngoài giới hạn. | Phân trang server, total/hasMore và search/filter DB; test 501 hóa đơn, 201 reservation, 101 đối soát. |
| B02 | P2 C | `fetchPagedList` tránh mất hàng nhưng vẫn tải hết các trang tuần tự rồi mới trả cho UI. Đây chưa phải phân trang theo nhu cầu hiển thị. | Trả trang đầu sớm, cache theo filter/tháng/quyền; cursor cho dữ liệu động, virtualization khi cần. |
| B03 | P1 R | Offset qua nhiều request không phải một snapshot nhất quán; thêm/xóa/chuyển tháng trong lúc tải có thể dịch hàng. | Cursor theo ID và mốc snapshot; test thay đổi tập dữ liệu giữa hai trang, không thiếu/trùng ID. |
| B04 | P2 C | Activity logs và stock movements đọc toàn bộ tập phù hợp; timeline sẽ nặng khi tích lũy. | Cursor theo thời gian + ID, tải thêm; giữ audit append-only và chính sách lưu trữ rõ ràng. |
| B05 | P1 R | Lượt trước thấy sáu định nghĩa hàm live khác bản dựng local. Sửa encoding đã bảo toàn logic live, nhưng chưa giải quyết nguồn drift. | So checksum function/view/trigger/grants, xác định nguồn chuẩn; migration tăng dần để đồng bộ có review. Không reset production. |
| B06 | P2 C/R | Tên trường `*_vnd` có nơi lưu triệu VNĐ, nơi lưu đồng; invoice dùng multiplier 1.000.000. Tên không đủ biểu đạt đơn vị. | Chuẩn hóa hợp đồng tiền, validator và format theo đơn vị; lộ trình migration có đối soát, không đổi tên/nhân tiền hàng loạt thiếu kiểm chứng. |
| B07 | P2 C/R | Có cả `price_rmb`/`purchase_price_rmb`, `exchange_rate`/`purchase_exchange_rate`, tracking cũ/mới. Cần giữ đồng bộ khi còn tương thích. | Tài liệu nguồn chuẩn, test mọi đường ghi và trigger; chỉ bỏ cột cũ sau khi xác minh hết consumer. |
| B08 | P2 R | Các cảnh báo FK index, RLS init plan, index ít dùng trong báo cáo cũ chưa được lấy lại ở lượt này. | Đo EXPLAIN với dữ liệu đại diện, thêm index có lợi thực tế. Không xem tất cả cảnh báo là lỗ hổng hoặc index cần xóa. |
| B09 | P1 R | Timezone đã sửa một phần nhưng SQL `CURRENT_DATE`, client và snapshot hiển thị vẫn cần kiểm thống nhất. | Ngày nghiệp vụ Asia/Ho_Chi_Minh; test giao thời điểm UTC/VN cuối tháng, đổi năm và lịch không hợp lệ. |
| B10 | P2 C | `select('*')` ở các list/export có thể kéo thêm cột/JSON không dùng và vô tình tăng bề mặt lộ dữ liệu khi schema thay đổi. | Tách DTO list/detail/export, chọn cột rõ ràng; đo kích thước payload trước/sau. |
| B11 | P2 C/R | Export cho tới 50.000 ID, đọc từng lô 200 rồi tạo XLSX toàn bộ trong RAM. Có nguy cơ timeout/đỉnh RAM cao. | Đo ở 1k/10k/50k; streaming hoặc job nền, trạng thái tiến trình và giới hạn hợp lý. |
| B12 | P1 R | Các trang dùng API service-role nên quyền ở route là ranh giới chính. Test 35 route cases không bao phủ toàn bộ endpoint/JSON. | Ma trận role × verb × entity × trường; thêm invoice snapshot, repair/trade-in và history vào regression. |

## C. Hóa đơn, A4 và file xuất

| ID | Ưu tiên / bằng chứng | Vấn đề, tác động | Đề xuất và điều kiện nghiệm thu |
|---|---|---|---|
| C01 | P1 C | Chính sách bảo hành hardcode trong `InvoiceDocument.jsx`; thay code sẽ thay nội dung bản in của hóa đơn cũ. | Lưu policy_version và nội dung áp dụng vào snapshot lúc xuất; bản cũ in lại giữ chính sách cũ. |
| C02 | P1 C/ĐX | A4 in cả điều kiện máy mới và máy cũ, chưa chỉ rõ loại sản phẩm nào trên đơn áp dụng chính sách nào. | Ghi tình trạng mới/cũ và warranty plan vào từng dòng/snapshot; không suy luận từ note test máy. |
| C03 | P1 C | Debt fallback của chi tiết/list là total-paid, A4 là total-paid-credit. Khi thiếu `debt_amount`, hai màn có thể khác số. | Một hàm tính từ snapshot và đơn vị tiền thống nhất; fixture có credit và thiếu debt. |
| C04 | P2 C | Nhãn SALE tra từ `getLabel` hiện tại thay vì nhãn snapshot. Đổi tên nhân viên/tùy chọn có thể đổi thông tin hóa đơn cũ. | Snapshot cả key lẫn tên hiển thị khi phát hành. |
| C05 | P2 C/R | Chế độ A4 chỉ ở state; reload/quay lại browser không biểu đạt chế độ đang xem. | Query `view=a4` hoặc route riêng, có liên kết quay lại giữ đúng hóa đơn. |
| C06 | P1 R | Ctrl+P ở màn chi tiết có thể in giao diện quản trị và note nội bộ; nút in chuẩn chỉ nằm ở chế độ A4. | Quy định hành vi print rõ: in A4 hoặc hướng dẫn chuyển chế độ; kiểm Ctrl+P không vô tình phát hành note nội bộ. |
| C07 | P2 C/R | CSS print đặt document absolute, ẩn phần khác bằng visibility; có khả năng bố cục ẩn ảnh hưởng số trang ở chứng từ dài. | Test nhiều sản phẩm/quà, địa chỉ dài, policy dài, chữ ký và footer qua nhiều trang; không ép mọi hóa đơn thành một trang. |
| C08 | P2 C/ĐX | Điều khoản in 8pt, dễ khó đọc với khách; bản preview mobile không phản ánh nguyên tờ giấy. | Đánh giá bản PDF thật/100% zoom, cân đối 9–10pt; xem trước tỷ lệ A4 có zoom. |
| C09 | P2 C | Invoice effect chưa reset error/rows khi ID/query đổi; lỗi cũ có thể tiếp tục che kết quả mới khi cùng instance được tái sử dụng. | Loading/error theo request, reset khi đổi ID; retry tại chỗ, không hiển thị dữ liệu hóa đơn trước trong lúc chờ. |
| C10 | P2 C/ĐX | XLSX mọi cột rộng 23, chưa định dạng tiền/số/ngày theo từng cột, text dài khó đọc. | Width theo loại, wrap note/quà, định dạng số rõ đơn vị, giữ SĐT/serial dạng text, thêm phạm vi bộ lọc/ngày xuất. |

## D. Lô mua, sửa chữa và chi tiết UI

| ID | Ưu tiên / bằng chứng | Vấn đề, tác động | Đề xuất và điều kiện nghiệm thu |
|---|---|---|---|
| D01 | P1 C | Draft ở `PurchaseDayTables`; `DirectIntake.load()` đặt loading và unmount bảng. Reload/lưu một nhóm có thể mất draft nhóm khác. | Nâng draft lên state ổn định hoặc giữ bảng khi refresh; test hai nhóm cùng có draft rồi lưu một nhóm. |
| D02 | P2 C | Nhấn thêm máy không chủ động focus vào ô tên; ô tên mới không có nhãn truy cập riêng tại chỗ. | Focus tên, aria-label/label và highlight dòng mới; Enter/Tab theo thứ tự hợp lý. |
| D03 | P2 C/ĐX | Ô NCC `rowSpan` rất cao với 15+ máy; khi cuộn không còn nhìn thấy NCC/nút thêm. Header và NCC chưa sticky trong CSS bảng mới. | Header sticky, ô nhận diện NCC theo vùng cuộn; đánh giá bảng dài 100 máy, không che dữ liệu. |
| D04 | P2 C/ĐX | Bảng lô tối thiểu 1100px; chữ phụ 11px; thao tác mobile cần cuộn ngang nhiều. | Preset cột gọn/mobile, cho mở chi tiết hàng; giữ bảng desktop đúng yêu cầu. Không tự đổi toàn bộ thành card. |
| D05 | P2 C | API intake dựng batches từ laptop trả về, nên lô không có laptop phù hợp không xuất hiện. Không phân biệt “không có lô” và “bộ lọc không có máy”. | Trạng thái rỗng rõ phạm vi, nút xóa filter; nếu cần quản lý lô rỗng, query header riêng. |
| D06 | P2 C | Tổng số/tiến độ trên bảng được tính từ máy sau lọc. Người dùng có thể hiểu nhầm là toàn lô/toàn NCC. | Gắn “trong bộ lọc”, tách tổng thực và kết quả phù hợp. |
| D07 | P1 C | Hoàn tất sửa chữa dùng nhiều `window.prompt` để nhập mã outcome/action bằng tay. Dễ nhập sai, không thấy đầy đủ điều kiện. | Form kết luận một màn, select tiếng Việt, lỗi ngay trường, trạng thái đủ điều kiện và review trước lưu. |
| D08 | P2 C | Repairs còn hiển thị TESTING/NORMAL/INTERNAL và các mã linh kiện/hành động tiếng Anh. | Nhãn tiếng Việt thống nhất; giữ mã ở dữ liệu, tooltip nếu người dùng cần mã kỹ thuật. |
| D09 | P2 C/R | Repairs/DirectIntake có modal div riêng trong khi app có Radix Modal. Nút X một số nơi không nhãn; chưa thấy focus trap/Escape ở modal tự viết. | Dùng modal chuẩn, accessible title, khóa nền, restore focus; kiểm bàn phím và screen reader. |
| D10 | P2 C | ProductNameInput chọn gợi ý bằng onMouseDown, không có onClick/onKeyDown và cơ chế active option; bàn phím không có luồng chọn hoàn chỉnh. | Combobox chuẩn: Arrow/Enter/Escape, aria-expanded/controls/activedescendant, hỗ trợ touch. |
| D11 | P2 C | Timeline chỉ render diff cho UPDATE; CREATE không hiện dữ liệu, action khác CREATE bị mô tả chung là cập nhật. | Renderer theo event, nhãn trường nghiệp vụ, giữ redaction và phân trang. |
| D12 | P2 C/R | Poll dữ liệu chung mỗi 60 giây và poll riêng Inventory cùng lúc; trạng thái form có nguy cơ bị ảnh hưởng refresh. | Refresh khi tab active, cache/invalidation theo entity, hiển thị “đang cập nhật” nhẹ; kiểm không mất nhập liệu. |
| D13 | P2 ĐX | Hai hệ giao diện legacy list và Taste workspace chưa đồng nhất hoàn toàn. | Chuẩn spacing, chiều cao nút/input, badge, focus ring, empty/error/loading; giữ mật độ thông tin của Kho/Đơn. |
| D14 | P2 ĐX | Các lỗi đang ở đầu màn/modal có thể nằm ngoài vùng nhìn khi form dài. | Error summary có anchor/focus, lỗi liên kết input, cuộn tới trường đầu tiên; toast chỉ bổ sung. |
| D15 | P2 ĐX | Bảng dài, chuỗi serial/tên cấu hình/địa chỉ rất dài và giá trị 0/null cần quy ước nhất quán. | 0 phải hiện 0, thiếu hiện “Chưa có”; wrap có chủ đích, copy serial/tracking kèm thông báo, không tooltip-only trên mobile. |
| D16 | P3 ĐX | Cần xác nhận tương phản chữ phụ/badge và kích thước hit-area icon. | Đo thực tế ở light/dark nếu có; keyboard focus luôn thấy, thông tin không chỉ dựa vào màu. |
| D17 | P2 ĐX | Form chưa có một hợp đồng chung khi đóng/back/đổi tháng với dữ liệu chưa lưu. | Cảnh báo khi có thay đổi thực, nút lưu/hủy rõ; không cảnh báo khi không sửa. |
| D18 | P2 ĐX | Search/filter thiếu tiêu chí nghiệm thu chung. | Kiểm bỏ dấu, khoảng trắng, serial chính xác, clear filter, giữ filter khi quay lại; URL phản ánh phạm vi. |

## E. Kiểm thử và phát hành

| ID | Ưu tiên / bằng chứng | Vấn đề, tác động | Đề xuất và điều kiện nghiệm thu |
|---|---|---|---|
| E01 | P1 C/R | Build phụ thuộc Google Fonts từ mạng (`app/layout.js`); lần build gần nhất bị chặn ở tải font. | Self-host font được cấp phép hoặc cache/network build ổn định; clean production build PASS ở môi trường triển khai. |
| E02 | P1 C | Không thấy `.github` trong checkout. Có script audit nhưng chưa thấy workflow CI trong repo. | Chọn CI thực tế: lint, build, local DB, quyền, browser artifact; không suy ra bên ngoài chưa có CI. |
| E03 | P1 R | Browser QA cần credential/mạng, lần gần nhất timeout login trước kiểm hóa đơn. | Tách readiness/login assertion, báo lỗi đăng nhập rõ; dùng tài khoản QA tối thiểu trên môi trường test. Không coi timeout networkidle là UI hỏng. |
| E04 | P2 ĐX | Chưa có baseline đầy đủ cho 320/390/768/1440px, zoom 200%, nội dung dài, empty/error/loading/disabled. | Matrix theo màn và trạng thái, ảnh có review; đo overflow toàn trang lẫn container hợp lệ, modal khi bàn phím ảo mở. |
| E05 | P1 R | Backup/restore, rollback migration, cảnh báo lệch tiền, slow query chưa được xác minh lần này. | Diễn tập restore vào DB cô lập; đối soát tồn kho/công nợ/thu tiền và ghi thời gian phục hồi. |
| E06 | P2 C | Báo cáo cũ vừa ghi 10 suite vừa 13; vừa “không apply migration” vừa có migration live ở phần bổ sung. | Nhật ký theo thời điểm/commit, một trạng thái hiện tại; tách kết quả lịch sử khỏi release gate đang mở. |

## Thứ tự đề nghị

1. **A01:** bịt snapshot hóa đơn trước phát hành. A02/A05/A07 và kiểm giao dịch đồng thời tiếp theo.
2. **D01/A06/D07/B01:** tránh mất dữ liệu nhập, thao tác sai trạng thái và danh sách thiếu bản ghi.
3. **C01–C04/B05/B06:** đóng băng hợp đồng hóa đơn, đồng bộ schema và đơn vị tiền.
4. **D02–D18/C05–C10:** polish từng màn sau khi các hợp đồng nghiệp vụ ổn định.
5. **E01–E05:** build, role/browser matrix, backup restore và đối soát trước pilot rộng.

Tổng: **55 mục**, bao gồm lỗi đã chứng minh, rủi ro và đề xuất; không phải 55 lỗi production đã tái hiện. Các sửa trước (DTO Kho/Đơn, admin export, cột quà tặng/offline, encoding, A4, bảng NCC) được giữ là tiến bộ đã có, không liệt kê lại nguyên trạng như lỗi cũ.
