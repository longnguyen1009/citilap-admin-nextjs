# Đối soát Google Sheet tháng 10/2026

## Mã vận đơn laptop

`tracking_code_cn` là trường duy nhất lưu mã vận chuyển laptop từ Trung Quốc về Việt Nam. Migration `0017_sync_laptop_tracking_codes.sql` là bước tương thích lịch sử đã chạy trước đó; migration `0018_single_laptop_tracking_code.sql` giữ lại dữ liệu cần thiết rồi xóa `laptops.tracking_code`. `orders.tracking_code` vẫn dùng riêng cho mã giao hàng tới khách.

## Chuyển máy mua tháng 9 sang cohort tháng 10

Migration `0016_move_september_order_laptops_to_october.sql` sửa 25 máy lấy từ sheet tháng 9 nhưng đã được đơn tháng 10 chọn: `import_date=2026-09-01` giữ tháng mua, `warehouse_date=2026-10-01` là ngày nhập kho và `month_key=10/2026` là cohort vận hành. Các lô tương ứng giữ `purchase_date=2026-09-01`. Cơ chế frontend tải chéo laptop khác tháng đã được hoàn tác vì không còn đúng với mô hình nghiệp vụ này.

## Migration thay thế hoàn chỉnh 0015

`0015_october_full_replacement.sql` thay thế lại toàn bộ dữ liệu vận hành sau 0013/0014. Tất cả lô mua có `purchase_date=2026-10-01`; cả máy bổ sung tháng 9 vẫn giữ `month_key=09/2026` nhưng lịch sử lô mua là 01/10 theo xác nhận mới. 123 máy `available` có lịch sử nhận và QC `COMPLETED/PASS` toàn bộ ngày 01/10. Ghi chú đơn lấy từ file sheet ghi chú mới, ghép GHI CHÚ 1 và 2 bằng xuống dòng. Các khoản thu đều là chuyển khoản vào `VCB TOI` và có account transaction tương ứng.

## Trạng thái máy xác nhận mới nhất

Danh sách trạng thái người dùng cung cấp được dùng làm nguồn chuẩn cho đủ 165 máy tháng 10: 123 `available`, 29 `in_transit`, 9 `sold`, 3 `reserved`, 1 `ignored`. Trạng thái rõ ràng này được ưu tiên hơn trạng thái cũ trong sheet và suy luận từ đơn; ví dụ #1463 vẫn là `available` theo danh sách mới dù có đơn hoàn thành. Các máy bổ sung từ tháng 9 không có trong danh sách tiếp tục được suy ra từ đơn hàng.

Do 0013 đã được áp dụng remote trước khi danh sách trạng thái mới được thêm, migration `0014_confirmed_october_laptop_statuses.sql` cập nhật riêng 165 trạng thái và có guard kiểm tra đúng tổng từng nhóm.

## Migration thay thế 0013

Đã tạo `db/d1/migrations/0013_october_sheet_replacement.sql`. Chưa áp dụng remote.

**Phá hủy dữ liệu vận hành cũ** theo cùng phạm vi reset của 0010: máy, lô, khách, đơn, thanh toán, tài chính, hóa đơn, QC, kho, sửa chữa/bảo hành, đổi trả, đặt giữ, hoa hồng, lịch sử hoạt động. Giữ users/auth, nhà cung cấp, danh mục, chi nhánh, phụ kiện và tài khoản tiền. Tạo đúng ba nhà cung cấp được chấp thuận. Phải sao lưu trước khi áp dụng.

- 190 máy (165 tháng 10, 25 tháng 9); 60 đơn cùng cohort tháng 10, ngày tạo gốc vẫn giữ. 13 đơn chuyển tiếp không phân máy.
- Lô chia theo tháng và nhà cung cấp. Ngày đầu tháng chỉ là mốc cohort, không phải lịch sử nhận thực tế. Máy mua VND không có tỷ giá dùng purchase_exchange_rate=1 để đáp ứng schema CNY cũ, purchase_price_rmb=0; giá vốn VND giữ nguyên, không tính quy đổi từ giá này.
- Không tạo QC PASS/ngày nhận giả. Máy chưa bán chưa có căn cứ QC được để waiting_qc; máy có đơn dùng sold/reserved. Cần kiểm tra QC trước khi phân các máy tồn chưa xác nhận.
- Số dư cọc và tổng đã thanh toán được nhập từ sheet. Payment method sheet_opening, ngày 06/10 là ngày nhập số dư, không phải ngày ngân hàng nhận tiền. Financial records ghi adjustment, không tạo account_transactions/tài khoản thu giả.
- Các khoản hoàn thành có ghi chú đổi máy/chênh lệch vẫn là số dư thanh toán tổng hợp, không phải doanh thu tiền mặt đã đối soát. Đơn hủy giữ số cọc trong nguồn; chưa suy đoán hoàn/chuyển cọc. Đặc biệt cọc đơn 19/25 cần đối soát trước khi sử dụng báo cáo dòng tiền.
- Toàn bộ bản gốc và các xác nhận lưu ở sheet_import_sources (250 dòng), không chỉ trong ghi chú. Khách trùng số điện thoại dùng chung hồ sơ; địa chỉ mỗi đơn vẫn giữ riêng.
- Sales ánh xạ theo label danh mục hiện có; không khớp để NULL và giữ tên gốc trong note. Quà nhận diện từ mô tả được gắn phụ kiện có sẵn; nguyên văn quà vẫn lưu trong nguồn.
- Kiểm tra nhà cung cấp trước DELETE. Chạy bằng migration runner, không copy chạy từng câu SQL riêng lẻ.

Kiểm tra: `node --test qa/october-normalization.test.mjs qa/october-migration.test.mjs`.

Triển khai sau khi xem kỹ các giới hạn trên:

```powershell
npx.cmd wrangler d1 export DB --remote --output ./d1-before-october-replacement.sql
npx.cmd wrangler d1 migrations list DB --remote
npx.cmd wrangler d1 migrations apply DB --remote
```

File export chứa dữ liệu cá nhân: giữ riêng, không commit. Không chạy lại 0010/0011 để nhập dữ liệu này.

## Chốt cọc đơn 3 và 14

- Đơn 3: cọc 0, không chia cọc từ đơn 2; phần còn lại bằng giá bán.
- Đơn 14: cọc 0, người dùng xác nhận đã thu đủ 31,5 triệu. Lưu confirmed_paid_million_vnd=31.5; không suy đoán ngày thu hoặc tài khoản thu.
- Hai vấn đề unresolved_deposit đã được giải quyết trong normalized.json. Giá trị raw vẫn giữ nguyên nguồn. Các ghi chú cũ về hai ô cọc bên dưới đã hết hiệu lực; các điểm đối soát giao dịch khác vẫn giữ nguyên.

## Xác nhận bổ sung đã áp dụng

- Cho phép tạo WE_TECH (Nhập thợ WECHAT), WE_A_BUT_KI (We-A Bút Kí), WE_DATANG (We-大唐数码（出售 出租）).
- Tuấn HCM → VN_TECH; #1966 → QUEANH; đơn 267 → 30/09/2026.
- Chuẩn hóa Nhập thợ HN / Thợ lẻ → VN_TECH, QA MUA → QUEANH. Giữ nguyên tên gốc trong raw.
- approved-suppliers.sql chỉ là thành phần SQL tạo 3 nhà cung cấp, chưa phải migration thay thế hoàn chỉnh và chưa chạy remote.
- Các vấn đề nhà cung cấp/ngày ở báo cáo cũ bên dưới đã được giải quyết. Hai ô cọc của đơn 3 và 14 cùng các điểm đối soát giao dịch vẫn chưa được xác nhận; chưa sinh sổ thu tiền giả định.
- Kiểm tra: node --test qa/october-normalization.test.mjs.

## Xác nhận mới nhất 06/10 — thay thế giả định trong báo cáo ban đầu bên dưới

- Đã đồng ý thay thế dữ liệu vận hành, chỉ dùng nhà cung cấp hiện có; chưa chạy reset.
- Nhập 60 đơn: 47 tháng 10 và 13 chuyển tiếp. Cả 13 đơn chuyển tiếp chưa phân máy, đã cọc, chưa hoàn thành, kể cả STT 184. Không nhập thêm máy #1891.
- #1810 đã thu đủ; dòng máy #1878 ngày 06/10 là STT 46.
- #1913 bổ sung các trường giá nhập/nhà cung cấp trống từ cùng ID tháng 9, giữ tháng 10 và lưu field_sources.
- normalized.json: orders chứa 60 đơn; carryover_orders chứa 13 đơn chuyển tiếp; raw giữ nguyên nguồn gốc.
- SELECT D1 remote xác nhận có 13 nhà cung cấp, rows_written=0. Chưa xác định ánh xạ cho thợ lẻ wechat, We-A Bút Kí, We-大唐数码（出售 出租）, Tuấn HCM và nhà cung cấp trống của #1966. Không tạo nhà cung cấp mới.
- Ngày 31/9 của đơn 267 vẫn cần xác nhận. Các xung đột khoản thu khác chưa được giải quyết, chưa tạo giao dịch suy đoán.

Phần dưới giữ lại báo cáo ban đầu để đối chiếu, không thay thế các xác nhận trên.

Đây là dữ liệu chuẩn hóa để duyệt, **chưa phải migration vận hành**. Không chạy SQL reset, không thay đổi D1 remote.

## Phạm vi đã tách

- 165 máy từ bảng tháng 10, giữ tháng 2026-10.
- 25 máy bổ sung từ tháng 9 được các đơn tháng 10 tham chiếu; giữ tháng 2026-09. Tổng 190 máy.
- 47 dòng đơn thuộc phần T10.26; giữ cả đơn hủy để đối soát.
- 13 đơn chuyển tiếp trước dấu T10.26 được lưu riêng, chưa đưa vào tập đơn tháng 10. Nếu nhập thêm nhóm này sẽ cần thêm máy tháng 9 #1891.
- Không lấy các dòng đơn trống làm đơn hàng.

`normalized.json` giữ dữ liệu gốc theo từng dòng, số tiền chuẩn hóa theo triệu VND và nguồn/tháng của từng máy. Khóa đơn dùng vị trí dòng nguồn, không dùng STT làm khóa DB vì có STT trùng. Không tự tách tên/điện thoại, ghép khách, tạo lịch sử QC hay giao dịch thanh toán từ ghi chú.

## Các điểm phải chốt trước migration

1. Hai dòng STT 36: đơn hủy máy #1531 ngày 04/10 và đơn máy #1878 ngày 06/10. Không tự sửa STT thứ hai thành 46.
2. Đơn 39 / máy #1810: bảng mới ghi HOÀN THÀNH, thu hộ 0; trước đây đã đính chính chưa thu 23,5 triệu. Cần xác nhận trạng thái mới nhất.
3. Đơn 19 hủy và đơn 25 hoàn thành cùng máy #1916, thông tin cọc/khách tương tự. Không ghi nhận cọc và khoản thu hai lần khi chưa xác nhận chuyển đơn.
4. Đơn 3 ghi cọc “xem cùng vs khách bên trên”; đơn 14 không có số cọc. Không mặc định số trống là 0.
5. Đơn 8 ghi bù chênh 4 triệu: cần phân biệt tiền thực thu và giá trị máy đổi, không tạo giao dịch thu toàn bộ 23 triệu.
6. Các ghi chú thanh toán cần đối soát: đơn 12 (cọc 1 + CK 27,7 + thẻ 5 so với giá 33,5); đơn 23 (góp 36,5 so với phần còn lại 36,3); đơn 29 (CK 38, hoàn 0,2); đơn 41 (CK 27,9 so với phần còn lại 27,8); đơn 42 (CK 31,2 có bao gồm cọc 1 hay không).
7. Máy #1913 thiếu nhà cung cấp/giá nhập trong bảng tháng 10; có thể đối chiếu bảng tháng 9 nhưng chưa tự ghi đè. Máy #1966 thiếu nhà cung cấp. Cần xác nhận và ánh xạ nhà cung cấp với DB hiện tại.
8. Một số cấu hình giữa đơn và máy khác RAM/SSD/màn hình: giữ nguyên cả hai nguồn, chưa coi đó là nâng cấp đã thực hiện.
9. Nếu nhập 13 đơn chuyển tiếp, ngày “31/9” của đơn 267 không hợp lệ, cần sửa bằng thông tin thực tế.

## Quy tắc tiền

Cọc là số tiền đọc rõ được từ ô cọc; phần còn lại = giá bán − cọc, không phải dư nợ thực tế. Khoản này vẫn giữ nguyên sau khi thu đủ. Trạng thái thu đủ, dư nợ và các giao dịch thực thu cần nguồn lịch sử thanh toán riêng; không suy ra thời điểm/tài khoản thu từ trạng thái hoàn thành.

## Tái tạo và kiểm tra

`node scripts/normalize-october-sheet.mjs --json` xuất kết quả ra stdout (không sửa DB).

Parser kiểm tra số cột mọi dòng và xử lý trường mã vận đơn có dấu ngoặc kép lỗi `"0606` trong nguồn; vẫn giữ nguyên giá trị gốc để kiểm tra. Các số không đọc được giữ null, không chuyển thành 0. Đường dẫn ba nguồn được khai báo trong script; cần giữ các file đính kèm để tái tạo.

Trước khi tạo migration vận hành cần chốt: nhập 47 hay 60 đơn; thay thế hay bổ sung dữ liệu hiện có; các xung đột ở trên. Không áp dụng lại migration seed 0010 để nhập bộ dữ liệu này.
