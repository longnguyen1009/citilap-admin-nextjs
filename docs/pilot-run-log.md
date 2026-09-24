# Nhật ký chạy thử vận hành

Mốc dữ liệu ban đầu được tạo bằng:

```powershell
node qa/pilot-baseline-snapshot.mjs --write=docs/pilot-baseline-latest.json
```

Chạy lại sau mỗi ngày thử nghiệm và lưu file theo ngày nếu cần so sánh. Snapshot chỉ chứa số tổng hợp và mã tài khoản, không chứa thông tin khách hàng.

## Phiên 01 — 22/09/2026

- Người thao tác: Chủ hệ thống
- Môi trường: Supabase hiện tại, dữ liệu seed
- Mục tiêu: Chốt baseline và bắt đầu chạy luồng kho → đơn → thu tiền → hóa đơn.
- Gate trước khi chạy: Phase 9 live E2E 70/70 sau migration `20261014`.
- Baseline: `docs/pilot-baseline-latest.json`
- Trạng thái: Sẵn sàng thao tác thực tế.

### Checklist thao tác

- [ ] Chọn một laptop `available`, ghi lại ID và serial.
- [ ] Tạo đơn mới, xác nhận giá bán và khách hàng.
- [ ] Reload Orders; kiểm tra đúng máy, công nợ bằng giá bán và chưa có tiền thu.
- [ ] Mở “Thu tiền” từ đúng order, ghi một khoản cọc vào tài khoản VND.
- [ ] Reload; kiểm tra `amount_paid`, `debt_amount`, trạng thái thanh toán và số dư tài khoản.
- [ ] Thu phần còn lại; kiểm tra công nợ về 0 và không có payment trùng.
- [ ] Chuyển đơn qua chuẩn bị/giao/hoàn thành theo tình huống thực tế.
- [ ] Phát hành hóa đơn; kiểm tra snapshot gồm đúng payment, credit thu cũ nếu có và công nợ.
- [ ] Ghi mọi vướng mắc vào bảng dưới đây trước khi sửa.

### Vướng mắc quan sát được

| Thời điểm | Order/Laptop | Việc muốn làm | Thực tế | Ảnh hưởng | Ưu tiên | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

### Đối soát cuối phiên

- [ ] Số laptop theo trạng thái khớp thay đổi đã thực hiện.
- [ ] Tổng tiền thu trong payment ledger khớp giao dịch thử.
- [ ] Tổng công nợ order thay đổi đúng bằng tiền thu và credit phi tiền mặt.
- [ ] Số dư tài khoản ghi sổ thay đổi đúng; không có reconciliation difference mới chưa giải thích.
- [ ] Hóa đơn và trạng thái đơn vẫn đúng sau reload/đăng nhập lại.
- [ ] Không còn lỗi P0/P1 chưa có hướng xử lý.

## Phiên diễn tập tự động 01 — 22/09/2026

- Mã: `PILOT-CORE-MUCVKQH9`
- Order: `#129`
- Laptop: `#173`
- Invoice: `#5`
- Kết quả: 17/17 kiểm tra đạt.
- Tiền: cọc 2 triệu + thu còn lại 10,5 triệu vào `PILOT_BANK_VND`.
- Sau reload: order `shipping/paid`, đã thu 12,5 triệu, công nợ 0; laptop `sold` và khóa; đúng 2 payment; invoice snapshot đã thanh toán đủ; số dư tài khoản tăng đúng 12.500.000 VND.
- Vướng mắc phát hiện: `opening_balance_at` ban đầu dùng thời điểm tạo tài khoản, muộn hơn đầu ngày của `payment_date`, khiến khoản thu cùng ngày bị từ chối. Bộ chuẩn bị seed đã đổi mốc tài khoản pilot sang `2026-01-01T00:00:00Z`; chạy lại đạt.

## Phiên diễn tập hoàn tiền/hủy — 22/09/2026

- Fixture đạt gate cuối: order `#131` và laptop `#175`.
- Đã xác nhận: thu cọc 2 triệu; hoàn đủ; retry hoàn tiền không tạo giao dịch thứ hai; hoàn vượt số đã thu bị chặn; số dư `PILOT_CASH_VND` trở lại đúng mức ban đầu; order giữ trạng thái audit `cancelled/refunded`; laptop được nhả về `available`; hóa đơn không thể phát hành.
- Lỗi phát hiện: order đã hủy vẫn xuất hiện trong `customer_receivable_summaries` vì view chỉ lọc `is_active` và `debt_amount > 0`.
- Sửa chữa: migration `20261015_cancelled_receivable_repair.sql` loại `cancelled`, `returned` và `refunded` khỏi công nợ, đồng thời dùng cùng view này cho dashboard tài chính.
- Trạng thái: migration `20261015` đã được apply. Kịch bản chạy lại đạt 16/16; order đã hủy/hoàn tiền không còn xuất hiện trong công nợ và kiểm tra DB tài chính đạt 14/14.

## Phiên diễn tập COD — 22/09/2026

- Mã đạt gate: `PILOT-COD-MUCWKZA6`.
- Order: `#133`; laptop: `#177`; COD: `9894315a-5d15-4427-807e-21297fbb2548`.
- Kết quả: 27/27 kiểm tra đạt.
- Khi giao hàng: order chuyển sang `paid`, công nợ khách về 0 và khoản phải thu carrier là 15.000.000 VND; số dư `PILOT_BANK_VND` chưa thay đổi.
- Khi đối soát: nhận 10.000.000 VND rồi 5.000.000 VND; retry đồng thời chỉ tạo một settlement và một dòng tiền; yêu cầu thu vượt bị chặn.
- Sau tất toán: COD `SETTLED`, còn phải thu 0, có đúng hai settlement tổng 15.000.000 VND; tài khoản ngân hàng tăng từ 12.500.000 lên 27.500.000 VND và không có chênh lệch đối soát.
- Order không bị tính đồng thời vào công nợ khách; payment loại `cod` ghi nhận việc carrier nhận tiền nhưng không tự tạo tiền vào tài khoản.
- Lần chạy thử đầu dừng sau bước giao hàng do script kiểm tra nhầm tên cột ledger; fixture dở dang là order `#132`/laptop `#176`. Đây là dữ liệu seed có dấu vết audit, chưa được tính là phiên đạt gate.

## Phiên diễn tập bảo hành — 22/09/2026

- Mã: `PILOT-WARRANTY-MUCWX2K6`.
- Phiếu bảo hành: `#2`; order gốc: `#133`; laptop: `#177`.
- Kết quả API/lifecycle: 21/21 kiểm tra đạt.
- Đã xác nhận liên kết đúng order và máy; order của máy khác, đổi máy sau tiếp nhận, trạng thái lạ và phiếu đang mở trùng đều bị chặn.
- Luồng `received → checking → done` lưu đúng chẩn đoán, kết quả, chi phí 0,25 triệu và ngày hoàn tất; mở lại tự xóa ngày hoàn tất, đóng lại tự lập ngày hoàn tất.
- Có đúng ba stock movement cho tiếp nhận, chẩn đoán và hoàn tất; activity log có một CREATE và hai UPDATE tại thời điểm kiểm tra chính.
- Order vẫn `paid`, công nợ 0; laptop vẫn `sold/locked`, phản ánh quyền sở hữu sau bán trong lúc lịch sử bảo hành theo dõi việc tiếp nhận và xử lý.
- API đã được gia cố. Migration `20261016_warranty_integrity_repair.sql` đã được apply. Gate trực tiếp phát hiện phép so sánh `NOT IN` không chặn được order sai máy khi một tham chiếu laptop của order là `NULL`; fixture sai `#3` đã được xóa khỏi seed.
- Migration tiếp nối `20261017_warranty_order_link_null_repair.sql` đã được apply. Gate cuối đạt 26/26: database chặn order sai máy, trạng thái lạ và chỉ cho đúng một yêu cầu thắng khi hai phiếu mở được tạo đồng thời; fixture thắng cuộc đã được đóng sau kiểm tra.

## Phiên diễn tập Settings — 23/09/2026

- Kết quả: 21/21 kiểm tra đạt.
- Mã trạng thái hệ thống được bảo vệ: không thể thêm mã tùy ý, đổi key, vô hiệu hóa hoặc xóa `paid` và các nhóm semantic tương tự. Admin vẫn có thể đổi nhãn và thứ tự.
- Các nhóm có tính danh mục như model, nguồn hàng, hãng vận chuyển, quà tặng và nhân viên sale vẫn cho phép thêm/sửa/ẩn.
- Đã xác nhận chuẩn hóa boolean, chặn key trùng không phân biệt hoa thường, giữ option inactive để hiển thị dữ liệu lịch sử và có activity log.
- Formula chỉ còn ba trường đang được dùng: `shippingVnd`, `divisor`, `defaultRate`. Trường seed cũ `currencyUnit` không được code sử dụng đã bị loại khi lưu lại; kết quả tính giá không đổi.
- Anonymous bị từ chối đọc cấu hình; mutation chỉ đi qua quyền ADMIN.

## Batch UI vận hành 01 — 23/09/2026

- Đã kiểm tra trực quan Dashboard trên desktop và mobile bằng phiên ADMIN thật.
- Thay các mã cảnh báo kỹ thuật bằng câu hành động tiếng Việt, ví dụ `COD_DISPUTED` thành số COD đang tranh chấp và `TRADE_IN_WAITING_INSPECTION` thành số hồ sơ thu cũ chờ kiểm tra.
- Chuẩn hóa các nhãn vốn, QC, sửa chữa, tuổi tồn và trạng thái kho sang ngôn ngữ vận hành; giải thích dữ liệu cũ và máy thiếu ngày bắt đầu bán ngay tại chỗ.
- Đổi menu `Shipments` thành `Vận chuyển TQ–VN` để nêu rõ mục đích.
- Browser smoke đạt 23/23 trên các màn hình lõi, gồm kiểm tra nhãn Dashboard mới, desktop navigation và mobile navigation.

## Batch UI vận hành 02 — 23/09/2026

- Đã kiểm tra trực quan Kho laptop và Orders bằng phiên ADMIN trên desktop và mobile.
- Giảm độ đậm của nền trạng thái toàn hàng; vẫn giữ màu nhấn ở mép trái và badge để nhận diện nhanh mà không làm chìm ô nhập, số tiền và nội dung đơn.
- Bảng Kho ghi rõ đơn vị cho giá mua, phí nội địa, tỷ giá và giá nhập; tiêu đề CSV dùng cùng cách gọi.
- Sửa liên kết nhãn của bộ lọc Phân loại máy và Vị trí kho. Hai control không còn dùng trùng `id`; tên truy cập của combobox vị trí chỉ còn `Vị trí kho`.
- Browser smoke đạt 25/25. Lint, build 66 trang và `git diff --check` đều đạt.

## Batch UI vận hành 03 — 23/09/2026

- Rà soát chuỗi Thu tiền → Hóa đơn → Đối soát tài chính.
- Loại đường ghi “Khoản thu/chi” legacy khỏi màn Thu tiền. Dòng tiền ngoài thanh toán đơn nay được dẫn sang sổ `account_transactions` tại Đối soát tài chính, là nguồn số dư của Phase 8.
- Bảng thanh toán ghi rõ đơn vị `triệu VNĐ`; ADMIN có liên kết trực tiếp sang danh sách giao dịch tài khoản.
- Việt hóa số dư tài khoản, trạng thái COD, tuổi nợ, trạng thái phải trả, hướng và loại giao dịch trên màn tài chính.
- Lint, production build 66 trang và `git diff --check` đạt. UI smoke chưa chạy qua bước đăng nhập do phiên Supabase Auth không chuyển khỏi `/login` trong 30 giây, kể cả sau khi khởi động lại localhost; chưa có assertion mới nào thất bại.

## Batch UI vận hành 04 — 23/09/2026

- Sửa race condition của Supabase Auth: các lần gọi đồng thời cùng tải hồ sơ giờ chờ chung một tiến trình, không điều hướng khi hồ sơ người dùng chưa sẵn sàng.
- Thêm trạng thái đang xác thực trên nút đăng nhập, màn khôi phục phiên và lớp loading theo từng giai đoạn cho dữ liệu vận hành.
- Không tải dữ liệu vận hành khi URL vẫn ở `/login`. Các API ban đầu chạy theo lô tối đa hai request; dashboard quản trị chỉ tải sau khi dữ liệu lõi đã hoàn tất.
- Phép đo trình duyệt với Supabase thật: điều hướng sau đăng nhập 814 ms, dashboard sẵn sàng 2.370 ms và tối đa 2 API nội bộ chạy đồng thời.
- Browser smoke đạt 27/27; lint các tệp thay đổi, production build 66 trang và `git diff --check` đạt.
- Hộp thoại “Thay đổi mật khẩu của bạn” là cảnh báo mật khẩu bị lộ của Google Password Manager. Form đã hạn chế autofill ngoài ý muốn, nhưng cần đổi mật khẩu seed nếu Chrome vẫn nhận diện mật khẩu đó trong danh sách rò rỉ.

## Batch UI vận hành 05 — 23/09/2026

- Thu gọn vùng tiêu đề dùng chung trên Dashboard và các trang nghiệp vụ để đưa bảng, bộ lọc và nội dung chính lên cao hơn.
- Sidebar đổi nhận diện thành `KHO CITILAP`; dòng phụ hiển thị tên nhân viên đang đăng nhập. Ô Supabase Cloud riêng đã được bỏ, thay bằng biểu tượng database cạnh tên nhân viên và đổi màu theo trạng thái kết nối thật.
- Bổ sung bộ phân trang dùng chung 50 bản ghi/trang cho khách hàng, thanh toán, hóa đơn, bảo hành, QC, sửa chữa, nhà cung cấp, lô mua, thanh toán NCC, shipment, nhận hàng, trả NCC, giá vốn, giữ máy, thu cũ, hoa hồng, danh mục hóa đơn và các danh sách quản trị. Kho laptop và đơn hàng tiếp tục hiển thị toàn bộ theo yêu cầu.
- Các endpoint tài chính có phân trang phía máy chủ đã chuyển từ 30 lên 50 bản ghi/trang.
- Browser smoke đạt 30/30, gồm kiểm tra tên kho, icon database kết nối và không còn ô Supabase Cloud riêng. Lint các tệp thay đổi và production build 66 trang đạt.
