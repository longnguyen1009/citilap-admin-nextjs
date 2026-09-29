# Rà soát dữ liệu laptop và QC — 28/09/2026

## Kết luận

Hiện tại chưa có một nguồn duy nhất cho thông tin kỹ thuật máy. Một bản ghi `laptops` đã đại diện cho máy xuyên suốt mua/nhận/QC/bán, nhưng thông tin của nó còn được sao chép vào JSON QC, cột tóm tắt và phiên QC.

QC phải cập nhật hồ sơ máy hiện tại. Phiên QC chỉ quản lý sự kiện: máy nào, ai bắt đầu/kết thúc, thời gian, kết quả, hướng xử lý và khóa chống gửi trùng. Không dùng bản sao của phiên QC để khởi tạo form sửa thông tin hiện tại.

## Cập nhật triển khai

Đã áp dụng `20260928094834_canonical_qc_product_fields.sql` lên Supabase và chạy `reseed_data.sql` theo xác nhận thay thế dữ liệu của người dùng. Sau reseed: 480 laptop, 320 đơn, 416 thanh toán, 400 phiên QC, 40 máy chờ QC, 206 user_profiles. Checklist legacy, snapshot và ghi chú riêng trong phiên đều không có dữ liệu mới.

Serial/pin nhận từ form QC được kiểm tra rồi lưu vào cột laptop, loại khỏi JSON trước khi ghi. QC không tạo snapshot mới, ghi chú hiện tại nằm ở laptop. Modal QC và nguồn QC trong sửa chữa đọc hồ sơ hiện tại. Reseed dùng RPC QC có chi tiết kỹ thuật. `init_full_db.sql` đã được sinh lại; trên live chỉ áp dụng migration tăng dần rồi reseed, không thay toàn bộ schema.

Kiểm tra: 19/19 schema local; bootstrap/reseed lặp và giữ profile đạt; lint hai file thay đổi đạt. Live kiểm tra sửa pin 95 rồi ghi QC vẫn giữ 95, không có key pin lặp (transaction rollback). Chưa kiểm tra giao diện bằng trình duyệt.

Phần chuẩn hóa còn lại: cột tóm tắt screen/mainboard/camera-mic vẫn là các cột tương thích được trigger cập nhật; schema lịch sử vẫn giữ nguyên. Chưa thực hiện bỏ cột, gộp key keyboard/fan ở mọi writer, hoặc chống ghi đè đồng thời. Thiết kế đích bên dưới bao gồm những phần này.

## Bằng chứng Supabase chỉ đọc

Chạy `node qa/audit-qc-product-data.mjs` ngày 28/09/2026, phân trang 500 dòng, bao gồm cả laptop không active:

| Hạng mục | Kết quả |
|---|---:|
| Laptop | 483 |
| Phiên QC | 413 |
| Checklist lịch sử `qc_check_items` | 11.284 |
| Máy có Serial và pin trong cả cột lẫn JSON | 5 |
| Máy lệch Serial giữa hai nơi | 0 |
| Máy lệch pin giữa hai nơi | 0 |
| Phiên có `detail_snapshot` | 5 |
| Phiên có `overall_notes` không rỗng | 405 |
| Cặp keyboard/backlight hoặc fan/cooling khác kết quả trong JSON | 0 |

Năm máy lưu lặp Serial/pin: 450, 460, 481, 482, 485. Kết quả không chứng minh các bản sao sẽ luôn đồng nhất; code vẫn có đường ghi đè dữ liệu cũ. Khác biệt giữa lịch sử và hiện tại không mặc nhiên là lỗi. Chưa đối chiếu từng nội dung ghi chú, mọi trigger/catalog live hoặc toàn bộ trường của từng checklist cũ. Không sửa dữ liệu trong lần kiểm tra này.

## Nguồn dữ liệu đích

| Thông tin | Nơi hiện tại | Nguồn duy nhất cần dùng |
|---|---|---|
| Serial | `laptops.serial`, `qc_details.serialNumber`, snapshot | `laptops.serial` |
| Phần trăm pin | `laptops.battery_health`, `qc_details.batteryHealth`, snapshot | `laptops.battery_health` |
| Ghi chú tình trạng hiện tại | `laptops.condition_note`, `qc_inspections.overall_notes` | `laptops.condition_note` |
| Kết quả màn hình | `qc_details.screen`, `screen_status`, checklist/snapshot | `laptops.qc_details.screen` |
| Kết quả mainboard | `qc_details.mainboard`, `mainboard_status`, checklist/snapshot | `laptops.qc_details.mainboard` |
| Camera/mic | hai mục trong `qc_details`, `camera_mic_status`, checklist/snapshot | hai mục riêng trong `laptops.qc_details`; tóm tắt tính lúc đọc |
| Bàn phím và đèn | `keyboard`, `keyboard_backlight` | một mục kiểm tra kết hợp, chuyển dữ liệu cũ có quy tắc |
| Quạt và tản nhiệt | `fan`, `cooling` | một mục kiểm tra kết hợp, chuyển dữ liệu cũ có quy tắc |
| Các kiểm tra còn lại | `qc_details`, checklist/snapshot | `laptops.qc_details` |
| Tên/cấu hình, phân loại | `laptops.name`, `category` | giữ ở `laptops`; không thêm bản sao trong QC |
| Có/thiếu sạc | `laptops.charger_status` | giữ riêng: có sạc không đồng nghĩa sạc hoạt động tốt |
| Sạc đạt/không đạt | `qc_details.charger` | giữ kết quả kỹ thuật riêng với có/thiếu sạc |
| Tình trạng luồng máy | `laptops.status` | giữ; khác `qc_inspections.status` là trạng thái phiên |
| Người/giờ/kết quả QC | `qc_inspections` | giữ ở phiên QC, không suy ra từ trạng thái laptop hiện tại |

`qc_inspections.mainboard_status` ở schema cũ dùng nghĩa nguồn gốc board (ví dụ UNKNOWN), không được tự quy đổi sang PASS/FAIL. Tương tự không gộp ngày mua, ngày nhận và giờ QC; mỗi trường có ý nghĩa khác nhau.

## Lỗi và rủi ro trong code hiện tại

1. **Trigger ghi ngược từ JSON:** `validate_product_qc_details()` trong migration `20260927050000_shared_qc_details.sql` ghi `serialNumber`/`batteryHealth` vào cột máy mỗi lần cập nhật `qc_details`. Form sửa máy gửi lại JSON cũ có thể hoàn tác Serial/pin mới. Bản vá pin trong `InventoryContext.jsx` đang cập nhật cả hai nơi, chỉ xử lý triệu chứng.
2. **QC mở bản sao cũ:** `components/pages/QC.jsx` ưu tiên `inspection.detail_snapshot` trước hồ sơ laptop. Cần luôn lấy Serial/pin/ghi chú/kết quả hiện tại từ laptop cho form sửa; lịch sử sự kiện không được trở thành nguồn ghi ngược.
3. **Hai đường lưu:** Test kho gửi toàn bộ `qcDetails` qua inventory API; QC gọi `complete_qc_with_details`. Hai đường phải dùng cùng bộ chuẩn hóa, kiểm tra và quy tắc xóa giá trị. Serial trống hiện bị trigger bỏ qua, nhưng pin trống xóa được.
4. **Cột tóm tắt tồn tại song song:** `screen_status`, `mainboard_status`, `camera_mic_status` còn dùng ở inventory và SQL. Không thể drop trước khi đổi nơi đọc và rà soát function/view phụ thuộc.
5. **Ghi chú phiên:** `complete_quick_qc` vẫn ghi `overall_notes`; Repairs API/UI còn đọc nó. Chuyển phần ghi chú máy sang join `laptops.condition_note`. Giữ lý do mở phiếu sửa/trả NCC và log biến động như sự kiện độc lập, không đồng bộ chúng mỗi lần sửa ghi chú máy.
6. **Checklist cũ:** QC detail API vẫn tải `qc_check_items`, dù form hiện tại dùng `QCDetailsFields`. Không xóa 11.284 dòng trước khi kiểm tra dữ liệu chỉ tồn tại ở checklist. Việc lưu trữ lịch sử không làm nó thành nguồn hiện tại.
7. **Hai mục đã gộp trên UI vẫn ghi hai key:** `QCDetailsFields` còn nhân đôi keyboard/backlight và fan/cooling. Migration phải xử lý FAIL/WARNING/NOT_TESTED/NOT_APPLICABLE, giữ ghi chú cũ, không tự coi một PASS là toàn bộ đạt.
8. **Ghi đè đồng thời:** một nguồn duy nhất chưa đủ ngăn form mở lâu ghi đè dữ liệu vừa được người khác sửa. Cần PATCH trường thực sự thay đổi và kiểm tra phiên bản (`updated_at` hoặc version) trong transaction.

## Trình tự chuyển đổi cần thực hiện

1. Xuất báo cáo xung đột đầy đủ và lưu bản sao trước migration. Với bản sao khác nhau, không suy đoán bản nào mới chỉ từ `laptops.updated_at` vì thời gian đó dùng chung cho nhiều trường.
2. Chuẩn hóa payload chung: Serial/pin/ghi chú ở trường riêng; JSON chỉ chứa kiểm tra kỹ thuật. Kiểm tra quyền, pin 0–100, Serial và uniqueness hiện hành ở server/DB.
3. Viết migration tăng dần thay trigger/RPC: cập nhật máy và hoàn tất phiên trong một transaction; bỏ ghi bản sao mới của hồ sơ máy vào phiên. Giữ metadata phiên và hành vi PASS/FAIL/REPAIR/RETURN_CN, khóa và idempotency.
4. Đổi mọi nơi đọc: tạo/sửa máy, tạo/sửa lô, nhận hàng, Test, QC, kho, chi tiết sửa chữa. Trả dữ liệu mới từ DB sau lưu, thay state bằng response.
5. Chuyển dữ liệu cũ có kiểm tra; bỏ Serial/pin khỏi JSON; chuyển các cột tóm tắt sang giá trị tính khi đọc. Lịch sử đã có được lưu trữ để tra cứu, không đọc làm hiện trạng.
6. Sau khi hết phụ thuộc mới bỏ cột/checklist dư bằng migration riêng. Không sửa migration đã áp dụng và không chạy `init_full_db.sql` trên DB vận hành.

## Kiểm thử bắt buộc cho đợt chuẩn hóa

- Sửa Serial/pin tại sửa laptop → reload → mở QC/Test vẫn thấy giá trị mới.
- Sửa tại QC/Test → reload → kho/lô mua hiển thị cùng giá trị.
- Ghi chú có thể thay thế hoặc xóa rỗng qua mua/nhận/sửa/Test/QC.
- Mở QC cũ không phục hồi snapshot vào hồ sơ hiện tại.
- Pin 0/100/null hợp lệ; âm, trên 100, số lẻ bị từ chối; Serial trùng theo quy tắc hiện hành.
- Không gửi trường nào thì giữ nguyên trường đó; hai người sửa đồng thời nhận thông báo xung đột.
- Hoàn tất QC idempotent; lỗi chuyển sửa/trả NCC rollback cả cập nhật máy và phiên.
- Lịch sử vẫn đúng người/giờ/kết quả; quyền SALES không được nâng thành quyền sửa QC.
- Đối chiếu số máy/phiên trước và sau migration, bảo toàn dữ liệu legacy chỉ có trong checklist.
