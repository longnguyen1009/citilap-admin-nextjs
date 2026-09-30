# CitiLap Admin — rà soát UI và luồng vận hành, 30/09/2026

## Phạm vi và bằng chứng

Đây là báo cáo audit, chưa phải đợt sửa code. Không gửi thao tác tạo/sửa/xóa dữ liệu kinh doanh. Giữ nguyên tab lô mua của người dùng đang có dòng nháp; kiểm tra ở tab riêng.

- **B**: quan sát trực tiếp trên Chrome, phiên ADMIN. Đã xem Kho Laptop, Đơn hàng và form tạo đơn, Lô mua, phiếu sửa chữa đã hủy, danh sách hóa đơn, chi tiết HD000005, chuyển sang A4 và Nhận hàng. Screenshot desktop dùng để đánh giá bảng Kho và modal sửa chữa; các màn còn lại có bằng chứng DOM/accessibility. Chưa kiểm từng pixel trên mọi màn.
- **C**: đối chiếu mã nguồn hiện tại. Không đồng nghĩa đã tái hiện lỗi trên DB live.
- **T**: kiểm tra local/mock. `npm.cmd run test:audit`: **13/13 suite PASS**; trong đó helper **12/12**, route giả lập **43/43**, phân trang **7/7**, schema **19/19**, finance **7/7**, sales operations **22/22**. Đây không phải E2E ghi dữ liệu live. Node có cảnh báo `MODULE_TYPELESS_PACKAGE_JSON`.
- **R**: rủi ro cần thử riêng; **ĐX**: cải thiện UX, không khẳng định là lỗi production.
- Chưa chạy lại lint/build trong lượt audit này; chưa kiểm role thật ngoài ADMIN, mobile/zoom 200%, PDF nhiều trang/máy in, race condition và mất mạng sau commit. Không mở Giữ máy để tránh POST expiry tự chạy khi tải trang.

P1: nên xử lý trước pilot rộng; P2: cải thiện trải nghiệm/độ tin cậy; P3: hoàn thiện. Không phát hiện mới nào đủ bằng chứng để kết luận P0 trong lượt này.

## Những phần đã tốt hơn, không liệt kê lại như lỗi cũ

- Chi tiết HD000005 đã có SALE Online, SALE Offline và người xuất. Chuyển A4 và quay lại đã có nút riêng. A4 hiện đúng **Nhân viên = SALE Online**, không còn người xuất/sale offline/lịch sử thu. Không đề nghị thêm lại các mục người dùng đã yêu cầu bỏ.
- A4 không có ghi chú QC/sản phẩm nội bộ; quà tặng hiện thành các dòng riêng. Chưa xác nhận Ctrl+P từ màn chi tiết.
- Lô mua đã chuyển thành bảng theo ngày, nhóm ô nhà cung cấp, thêm dòng ngay trong nhóm.
- Repair chỉ cho hoàn tất ở TESTING và có form kết luận/hủy. Các prompt của Sales Operations vẫn là vấn đề riêng.
- Allowlist snapshot hóa đơn, chặn tạo laptop cho non-admin và giới hạn export admin đã có kiểm tra local. Chưa suy ra toàn bộ ma trận quyền live đã đạt.
- Draft thêm máy đã được giữ bằng sessionStorage; còn các giới hạn dưới đây. Không tiếp tục gọi D01 cũ là hoàn toàn chưa sửa.

## A. Lỗi và rủi ro cần ưu tiên

| ID | Mức / bằng chứng | Phát hiện và tác động | Hướng sửa / nghiệm thu |
|---|---|---|---|
| U01 | P1 B/C | Tạo đơn trong tháng hiện tại mặc định **01/09/2026** thay vì ngày 30/09. `components/pages/Orders.jsx:405` ghép `01/${selectedMonth}`. Dễ ghi sai ngày bán/doanh thu. | Tháng hiện tại dùng hôm nay; tháng quá khứ yêu cầu chọn ngày rõ ràng. Test mở mới ở ALL, tháng hiện tại, tháng cũ và giao tháng. |
| U02 | P1 B/C | SALE Online/Offline tự chọn phần tử đầu danh mục (`Orders.jsx:406–407`). Người dùng không chọn vẫn có người nhận doanh số. | Để trống bắt buộc chọn, hoặc dùng mapping tài khoản được cấu hình rõ; không suy ra nhân viên bằng vị trí trong mảng. Test danh mục đổi thứ tự. |
| U03 | P1 B/C | Form tạo đơn cho chọn Đã chuẩn bị/Đang giao/Hoàn thành trước phân máy; backend có điều kiện phân bổ nên UI dẫn tới request không hợp lệ. | Tạo đơn với trạng thái đầu hợp lệ, rồi hướng dẫn Phân máy → Chuẩn bị → Giao. Nếu hỗ trợ nhập lịch sử phải là luồng riêng đủ dữ liệu. Không kết luận đã bán trùng máy. |
| U04 | P1 C/T | Stock movement kiểm `movementType || type` nhưng service ưu tiên ghi `type`. Gửi cả hai có thể vượt allowlist loại sự kiện. `app/api/stock-movements/route.js:11`, `lib/services/dbService.js:357`. | Chuẩn hóa một trường trước validate/write; từ chối hai alias khác nhau. Test cả ADMIN và TECH với event sai. Không chỉ sửa UI. |
| U05 | P1 C/R | Warranty POST cho SALES/STAFF, nhưng ghi lịch sử bảo hành chỉ cho ADMIN/TECH/TECHNICAL. Context lưu phiếu rồi gọi lịch sử kiểu fire-and-forget; thất bại chỉ console và hàng local vẫn hiện. `context/InventoryContext.jsx:807,1460,1509`. | Ghi nghiệp vụ và lịch sử bắt buộc cùng transaction/RPC với cùng hợp đồng quyền. Test tạo/đổi trạng thái bằng từng role, reload vẫn có đúng một lịch sử. |
| U06 | P1 B/C | Phiếu repair **Đã hủy** lại hiện select disabled **OPEN**. Select chỉ có ACTIVE, thiếu CANCELLED/COMPLETED (`Repairs.jsx:9,53`). | Phiếu kết thúc dùng summary đúng nhãn hoặc option trạng thái hiện tại. Test mọi trạng thái cuối, không hiển thị fallback OPEN. |
| U07 | P1 C/R | Draft lô mua dùng key sessionStorage chung, logout chỉ dọn localStorage. Người khác đăng nhập cùng tab có thể kế thừa nháp, giá mua và batch của phiên trước. | Scope theo user, phiên và version; xóa khi logout/đổi user. Test A đăng xuất → B đăng nhập cùng tab; không giữ nháp nhầm người. |
| U08 | P1 C/R | Idempotency UUID mới ở nhiều lần submit/act của Sales Operations và tạo repair. Mất response sau commit rồi thử lại có thể trở thành thao tác mới. | Giữ key theo ý định/draft đến khi biết kết quả; phục hồi qua reload khi cần. Test mất response và nhấn thử lại, không tạo hai chứng từ. |
| U09 | P1 C | Hoàn tất kiểm tra thu cũ hardcode `mainboardStatus='UNKNOWN'`, checklist `GENERAL_INSPECTION=PASS` chỉ từ prompt kết luận (`SalesOperations.jsx:81`). | Form checklist có kết quả thực tế; không mặc định PASS cho kiểm tra chưa làm. Cho biết mục thiếu và lý do chưa đánh giá. |
| U10 | P1 C | Hóa đơn API giới hạn 500; reservation/trade-in/commission giới hạn 200. Phân trang client không lấy được phần vượt giới hạn. | Search/filter và pagination server với total/hasMore; test 501/201 bản ghi, tìm được bản ghi cuối. |
| U11 | P1 C | Debt fallback chi tiết/list là total-paid; A4 trừ thêm credit thu cũ. Khi thiếu debt snapshot, cùng đơn có thể hiện khác số. `Invoices.jsx:32,41`, `InvoiceDocument.jsx:16–17`. | Một hàm tính tiền chung đúng đơn vị; fixture có credit, thiếu debt, hoàn tiền, trả thừa. |
| U12 | P1 C/R | Policy bảo hành là nội dung trong component; đổi code làm bản in lại của hóa đơn cũ đổi điều khoản. | Snapshot policy_version và nội dung áp dụng lúc phát hành. Bản cũ in lại không thay nội dung; giữ thông tin thanh toán cập nhật riêng có nhãn rõ. |

### Tái hiện local U04

Chạy handler hiện tại với auth ADMIN giả lập, writer giả lập đúng thứ tự ưu tiên của service:

```json
{"laptopId":1,"movementType":"DEACTIVATED","type":"FAKE_EVENT"}
```

Kết quả: **HTTP 200**, writer nhận `movement_type: "FAKE_EVENT"`. Không gọi Supabase, không insert live. Mock sanitizer giữ payload; đã đối chiếu allowlist thật có cả `movementType` lẫn `type` (`lib/apiAuth.js:254`). Bằng chứng xác nhận khoảng hở validate/write, không phải chứng minh DB chấp nhận mọi chuỗi event.

## B. Bán hàng, hóa đơn và thanh toán

| ID | Mức / bằng chứng | Phát hiện và tác động | Hướng sửa / nghiệm thu |
|---|---|---|---|
| U13 | P2 B | A4 HD000005 vẫn hiện **Thanh toán: Chuyển khoản / Tiền mặt**. Đây vẫn là phương thức thanh toán dù đã đổi nhãn; chưa khớp yêu cầu bỏ phương thức của người dùng. | Bỏ dòng phương thức; giữ số tiền đã thu/còn phải thu. Nhân viên chỉ SALE Online; không thêm lại issuer/offline/lịch sử. |
| U14 | P2 B/ĐX | Bộ chọn “Máy Trong Kho” của đơn mới có máy đã bán/chưa về và mã vị trí store/wh_cn. Help có nói chỉ tham khảo cấu hình nhưng tên control gây nhầm với phân máy vật lý. | Đổi tên thành “Cấu hình tham khảo”, badge trạng thái/vị trí tiếng Việt; tách rõ bước “Phân máy thực tế”. Không loại bỏ khả năng tham khảo nếu nghiệp vụ cần. |
| U15 | P2 B/C | Danh sách đơn hiện 0/0 và “Không tìm thấy…” trong lúc dữ liệu vẫn đang tải. | Loading, empty, error tách biệt; chỉ hiện empty sau request thành công. Giữ hàng cũ khi refresh và đánh dấu đang cập nhật. |
| U16 | P1 B/R | Đơn đã hủy vẫn có “CHƯA THANH TOÁN”, “Còn …” và nút “Mở thu tiền”. Chưa thử thu thật; không kết luận backend cho thu sai. | Tách nghĩa vụ đơn hủy/hoàn cọc khỏi công nợ bán hàng. Chỉ mở hành động tài chính hợp lệ, kèm giải thích số còn treo. Test hủy trước/sau cọc. |
| U17 | P2 B/ĐX | Danh sách HD000001 có tổng 20 triệu, đã thu 25 triệu nhưng chỉ ghi “Đã hoàn tất nghĩa vụ”. Không biết phần chênh lệch là thu dư hay có khoản khác. | Hiện diễn giải đối soát khi đã thu vượt nghĩa vụ; xác minh ledger trước gọi là lỗi tiền. Không tự hoàn tiền hoặc sửa dữ liệu. |
| U18 | P2 C | Tên SALE/phương thức tra danh mục hiện tại bằng getLabel; đổi tên danh mục có thể đổi hiển thị hóa đơn cũ. | Snapshot key và display name; dữ liệu cũ có fallback rõ. Test đổi tên/ẩn danh mục rồi in lại. |
| U19 | P2 B/C | A4 vẫn cùng URL, chế độ chỉ là state; copy link/reload không mở đúng preview đang xem. | Query `view=a4` hoặc route riêng; Back trở lại chi tiết đúng hóa đơn và filter danh sách. |
| U20 | P2 B/ĐX | A4 in cả chính sách máy mới/cũ nhưng dòng laptop không chỉ rõ loại áp dụng; thời hạn trên đơn có, loại máy chưa rõ. | Snapshot tình trạng và gói bảo hành từng máy; chỉ rõ điều khoản áp dụng, không lấy note kỹ thuật làm tình trạng bán hàng. |
| U21 | P2 C/R | Catalog chi nhánh trong form tải bất đồng bộ nhưng thiếu loading/retry riêng; lúc mới mở chỉ có “Chọn chi nhánh”. | Hiện đang tải/lỗi, retry tại trường, khóa submit khi thiếu catalog bắt buộc. Không kết luận danh mục thực sự rỗng. |
| U22 | P2 R | Print từ màn chi tiết, hóa đơn dài và nội dung rất dài chưa kiểm lại. Note nội bộ tồn tại hợp lệ ở màn quản trị. | Kiểm Ctrl+P chỉ xuất nội dung khách hàng; PDF 1/2/5 trang không cắt dòng, thiếu chữ ký hoặc trang trắng; kiểm 100% zoom. |

## C. Kho, lô mua, nhận hàng và sửa chữa

| ID | Mức / bằng chứng | Phát hiện và tác động | Hướng sửa / nghiệm thu |
|---|---|---|---|
| U23 | P2 B/ĐX | Kho desktop cần cuộn ngang mới thấy Serial/giá/tracking; filter trạng thái bị cắt chữ. | Preset cột theo tác vụ, cố định nhận diện máy và hành động, đủ rộng filter; giữ bảng dày thông tin theo yêu cầu cũ. Test resize và lưu preset. |
| U24 | P2 B/ĐX | Màu phủ hàng và badge nhiều màu cạnh tranh nhau; `reserved` được gọi “Đã cọc”, dễ lẫn giữ máy vật lý với tiền cọc của đơn. | Nhãn “Đang giữ/Đã phân bổ” theo đúng nghĩa; màu trạng thái thống nhất, ưu tiên chữ/icon. Chỉ gọi “Đã cọc” khi có chứng từ cọc. |
| U25 | P2 C/R | sessionStorage draft không kiểm schema sau JSON.parse; setItem không catch lỗi quota/storage. Nháp còn giữ nguyên batch/tỷ giá lúc tạo. | Version/validate nháp, báo khi không lưu được, đối chiếu batch/tỷ giá hiện tại lúc phục hồi và trước lưu. |
| U26 | P2 C/ĐX | Nháp được lưu chỉ cho dòng thêm máy; form tạo lô/nhận hàng/sửa không có cùng hợp đồng khôi phục. | Quy tắc đóng/back/reload nhất quán; cảnh báo chỉ khi có thay đổi, phục hồi an toàn. Test nhập hai nhóm rồi lưu một nhóm không mất nhóm kia. |
| U27 | P2 B/C | Máy đã bán vẫn có nút sửa dữ liệu mua hàng; backend có thể từ chối sau khi người dùng nhập. | Quyền và trạng thái quyết định field/button; nếu cần điều chỉnh giá vốn dùng luồng có kiểm soát riêng. |
| U28 | P2 C/ĐX | Ô NCC rowSpan cao; bảng dài mất tên NCC/nút thêm khỏi vùng nhìn. Dòng mới không autofocus tên máy. | Sticky header/nhận diện nhóm, focus và highlight dòng mới; test cùng NCC nhiều lô, 100 máy/ngày, thêm giữa danh sách. |
| U29 | P2 B/C | Nhận hàng chỉ trả máy chưa về nhưng ô tổng vẫn có “Chờ QC”, “đã nhận” theo tập lọc. Có thể hiểu nhầm thành toàn bộ tiến độ lô. | Nhãn “trong danh sách đang lọc”; nếu cần tổng toàn lô, lấy aggregate riêng. Không cộng dữ liệu sau lọc rồi gọi tổng hệ thống. |
| U30 | P2 B/C | Checkbox nhận hàng không có tên máy trong accessible name; nhiều input/select inline ở Orders tương tự. | Tên truy cập gồm field + mã máy/đơn, liên kết th/table, tab order theo hàng; screen reader biết đang sửa đối tượng nào. |
| U31 | P2 B/ĐX | Phiếu repair đã hủy vẫn là form lớn nhiều ô disabled trống; không thấy lý do/người/thời điểm hủy trong modal đã mở. | Summary read-only cho phiếu đóng; hiển thị metadata khi có, phân biệt chưa ghi với lỗi tải; timeline là nơi truy vết. |
| U32 | P2 B/ĐX | Dropdown kỹ thuật viên chứa nhiều tài khoản TEST-AGING/TEST-COST/TEST-LIVE/TEST-REPAIR. | Xác định tài khoản QA có còn dùng; danh sách assignment chỉ nhân viên active phù hợp. Không tự xóa user hoặc lịch sử tham chiếu. |
| U33 | P2 B/C | “Repair Jobs”, NORMAL, store, TESTING và mã nghiệp vụ còn hiện trực tiếp. | Dictionary nhãn tiếng Việt dùng chung; giữ mã trong dữ liệu/tooltip. Quét encoding riêng, không nhầm tiếng Anh hợp lệ với mojibake. |
| U34 | P2 C/R | Repair dùng defaultValue; load/open bắt lỗi nội bộ có thể để form cũ sau save hoặc refetch. | Controlled state/version, cảnh báo “đã lưu nhưng tải lại thất bại”; tránh success chung khi chưa có dữ liệu mới. Test đổi nhanh phiếu và hai người sửa. |

## D. Tương tác chung và khả năng vận hành

| ID | Mức / bằng chứng | Phát hiện và tác động | Hướng sửa / nghiệm thu |
|---|---|---|---|
| U35 | P2 B/C | Modal repair tự dựng, nút X không tên truy cập; nền vẫn có trong cây accessibility, chưa có dialog/focus trap rõ. Screenshot có cuộn nền và modal. | Dùng modal chuẩn có title, aria-modal, focus trap/Escape/restore focus và khóa scroll nền. Test hoàn toàn bằng bàn phím. |
| U36 | P2 C | ProductNameInput chọn bằng onMouseDown, chưa có active option/Arrow/Enter; aria-selected không phản ánh lựa chọn. | Combobox hoàn chỉnh, hỗ trợ bàn phím và touch, không mất lựa chọn khi blur. |
| U37 | P2 C | Sales Operations vẫn yêu cầu nhập ID đơn, ID khách, UUID tài khoản và chuỗi thời gian qua form/prompt. | Picker tìm kiếm hiển thị đối tượng và điều kiện hợp lệ; form review một màn, lỗi tại field, người dùng không cần biết UUID. |
| U38 | P1 C/R | Expiry đã chuyển POST có kiểm lỗi nhưng vẫn chạy khi mở Giữ máy; trạng thái phụ thuộc có người mở trang nếu không có scheduler khác. | Kiểm scheduler thực tế; job idempotent có giám sát, UI giải thích trạng thái quá hạn. Chưa khẳng định môi trường triển khai không có job bên ngoài. |
| U39 | P2 C/R | History đọc toàn bộ; fetchPagedList tải tuần tự toàn tập rồi mới trả; lớn dần sẽ chậm dù test pagination PASS. | Đo thời gian/payload trước; page đầu sớm, cursor/tải thêm, cache theo role/tháng/filter. Test cập nhật giữa hai page không thiếu/trùng. |
| U40 | P1 C/R | Logger trả false khi lỗi và nhiều caller bỏ qua; nghiệp vụ và audit có thể lệch. Quyền test local chưa bao phủ toàn bộ endpoint/JSON. | Phân biệt log bắt buộc/phụ; transaction/outbox và retry. Ma trận role × action × field với token thật trên DB test; không dùng service-role như bằng chứng RLS. |

## E. Các hạng mục từ báo cáo trước cần giữ mở

Không sao chép thành lỗi mới hoặc khẳng định đã tái hiện lại. Xem ID tương ứng tại [ADMIN_REAUDIT_2026-09-30.md](ADMIN_REAUDIT_2026-09-30.md):

| Nhóm cũ | Công việc còn cần thực hiện |
|---|---|
| A08, B03 | Hai phiên tranh một laptop, mất response khi thu tiền, hủy/hoàn/nhập lại; đối chiếu ledger và reload. |
| B05–B09 | Drift live/local, tiền đồng/triệu, cột tương thích, timezone giao tháng, index với EXPLAIN. Không reset DB hoặc xóa bảng/index từ audit UI. |
| B10–B12 | DTO list/detail/export rõ cột; benchmark XLSX lớn; role matrix live cho endpoint và trường dữ liệu. |
| C07–C10 | PDF dài, font điều khoản, stale loading/error hóa đơn; width/format Excel theo loại cột, serial/SĐT dạng text. |
| D11–D18 | Timeline theo event, polling không làm mất nhập liệu, spacing/focus/empty/error, chuỗi dài, 0/null, search bỏ dấu và giữ filter. |
| E01–E05 | Production build độc lập tải font; CI thực tế; viewport 320/390/768/1440, zoom 200%; backup/restore và cảnh báo đối soát. |

## Ma trận nghiệm thu đề nghị

1. **Nhập hàng:** tạo lô → thêm 2 draft khác NCC → lưu một → reload → nhận một phần → cập nhật serial → QC fail → repair → re-QC pass; vẫn một laptop ID, không mất draft còn lại.
2. **Bán hàng:** đơn mới đúng ngày → chọn sale → đặt cọc → phân máy → chuẩn bị/giao → thu đủ → xuất hóa đơn → A4; tổng tiền/credit/công nợ nhất quán, A4 không có note nội bộ.
3. **Ngoại lệ:** đơn hủy có cọc, khách trả hàng, thu dư, repair hủy, trả NCC, giữ quá hạn, hai người giữ cùng máy; chỉ hiện hành động hợp lệ và lý do.
4. **Quyền:** ADMIN/SALES/TECH/TECHNICAL/STAFF; non-admin vào Kho sau login, không tạo laptop/export; thông tin tài chính bị lọc từ API và snapshot, không chỉ ẩn UI.
5. **UI:** bàn phím, mobile, filter rỗng, API lỗi/chậm, form dài, tên máy/serial dài, dữ liệu 0/null, đóng modal/Back/reload có nháp, in nhiều trang.

## Thứ tự xử lý

1. U04–U05: hợp đồng quyền/lịch sử kho; U01–U03: ngày, attribution và trạng thái tạo đơn.
2. U06–U12: trạng thái repair, nháp theo user, retry, checklist thu cũ, dữ liệu danh sách và tiền/policy hóa đơn.
3. U13–U22: hoàn thiện hóa đơn/bán hàng theo yêu cầu mới nhất; không thêm lại các trường A4 đã yêu cầu bỏ.
4. U23–U40: thao tác kho/kỹ thuật, accessibility và khả năng vận hành; chạy ma trận nghiệm thu trên môi trường test.

**40 mục đánh giá hiện tại**, gồm lỗi, rủi ro và đề xuất; không phải 40 lỗi production đã tái hiện. Những mục cũ đã được sửa không tính lại như lỗi mở. Báo cáo này bổ sung bằng chứng hiện tại; danh sách E là phần cần xác minh tiếp, không phải kết quả PASS.
