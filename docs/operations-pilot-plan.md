# Kế hoạch chạy thử vận hành CitiLap

Ngày bắt đầu kế hoạch: 2026-09-22. Trạng thái: đã rà soát sơ bộ repository; chưa bắt đầu vận hành thật.

## 1. Định hướng hiện hành

Tạm hoãn CRM: lead, follow-up, pipeline và automation chăm sóc khách hàng. Giữ hồ sơ khách hàng hiện hữu phục vụ đơn hàng, hóa đơn và bảo hành.

Chuyển từ mở rộng theo phase sang chạy thử nghiệp vụ, ghi nhận vướng mắc, sửa từng đợt nhỏ. Kho laptop, đơn hàng, thanh toán/tài chính, hóa đơn, bảo hành và settings là phạm vi cốt lõi. Chín phase đã phát triển là nền tảng sử dụng; tính năng nâng cao chỉ đưa vào thao tác hằng ngày khi nghiệp vụ phát sinh.

Chưa kết luận logic nào là thừa chỉ vì ít dùng. Ưu tiên đơn giản hóa cách thao tác trước; việc bỏ logic phải kiểm tra caller, dữ liệu lịch sử, quyền và tác động tài chính.

## 2. Bằng chứng và giới hạn hiện tại

- PROJECT_CONTEXT.md mục 109–110 ghi nhận Phase 8–9 đã hoàn tất trên Dev Supabase, gồm E2E và browser theo vai trò. Đây là kết quả được lưu trong repository, chưa được chạy lại trong đợt lập kế hoạch này và không chứng minh môi trường production đã sẵn sàng.
- MainLayout.jsx có nhiều mục nghiệp vụ cùng cấp; `/payments` mang tên “Thanh toán & Tài chính”, trong khi `/finance` là “Tài chính vận hành”. Đây là ứng viên đơn giản hóa điều hướng, chưa phải bằng chứng hai nghiệp vụ trùng nhau.
- Payments.jsx sử dụng payments và financial_records; Finance.jsx sử dụng các API tài khoản tiền, COD, phải thu/phải trả. Cần phân biệt ghi nhận sự kiện kinh doanh với dòng tiền trước khi hợp nhất giao diện.
- InventoryContext.jsx tải tám nhóm dữ liệu và refresh mỗi 60 giây bên cạnh realtime. Cần đo request/payload và tính đúng sau reload trước khi thay cơ chế tải.
- Roadmap cũ còn gọi Phase 9 là CRM và yêu cầu bắt đầu Phase 1; mục 110 ghi Phase 9 thực tế là Sales Operations. Định hướng trong kế hoạch này được ưu tiên cho công việc tiếp theo.
- Working tree đang có thay đổi Phase 9 chưa commit. Giữ nguyên các thay đổi đó; đợt khởi động chỉ bổ sung tài liệu.

## 3. Phạm vi thao tác

| Nhóm | Cách dùng trong đợt thử |
| --- | --- |
| Kho, đơn hàng, thanh toán, hóa đơn, bảo hành | Luồng chính hằng ngày |
| Settings, người dùng, nhật ký | Cấu hình ban đầu và tra cứu khi cần |
| Mua hàng, vận chuyển, nhận hàng, QC, giá vốn | Dùng khi có lô nhập; giữ liên kết và điều kiện đủ để bán |
| COD, công nợ, tài khoản tiền | Dùng theo phương thức thanh toán thực tế; đối soát cuối ngày |
| Giữ máy, thu cũ, hoa hồng, trả NCC, sửa chữa | Dùng khi phát sinh; đề xuất gom vào nhóm phụ, chưa ẩn/xóa |
| CRM mở rộng | Tạm hoãn |

## 4. Các đợt thực hiện

### Đợt A — Chuẩn bị mốc đối chiếu và rà soát luồng chính

1. Xác định môi trường chạy thử, người thao tác, ngày bắt đầu và phạm vi máy/đơn. Chưa mặc định Dev Supabase chứa dữ liệu phù hợp để vận hành thật.
2. Đối chiếu migration đã áp dụng với repository, đặc biệt các bản sửa Phase 8–9. Không tự áp dụng lại migration cũ.
3. Kiểm kê máy theo serial, trạng thái, vị trí; đối chiếu đơn đang mở, tiền đã thu, công nợ và số dư từng tài khoản theo loại tiền tại cùng thời điểm. Xác định dữ liệu TEST còn lưu, không xóa lịch sử tài chính để làm sạch màn hình.
4. Chuẩn bị bản sao lưu và phương án phục hồi của môi trường đích. Ghi nhận mốc chuyển sang dùng hệ thống để tránh nhập lại số dư và giao dịch cũ.
5. Đi qua luồng kho → đơn → thu tiền → hóa đơn → bảo hành trên môi trường thử; lưu bằng chứng API, UI và số liệu sau reload.

Đầu ra: checklist môi trường, bảng số dư/tồn kho đầu kỳ, danh sách lỗi tái hiện được. Chỉ chuyển sang giao dịch thật khi không còn lỗi gây sai máy, sai tiền hoặc sai quyền trong phạm vi thử.

### Đợt B — Tối ưu UI theo nhiệm vụ

- Rà soát và gom menu theo công việc: kho/nhập hàng, bán hàng, tài chính, hậu mãi, quản trị; giữ quyền truy cập và đường dẫn drill-down.
- Làm rõ nơi “thu tiền đơn hàng” và nơi “đối soát tài khoản/COD”; không tạo thêm nơi nhập cùng một khoản tiền.
- Đánh dấu trường bắt buộc, đưa trường ít dùng vào phần mở rộng, thống nhất nhãn trạng thái và đơn vị tiền. Giá trị mặc định phải phù hợp quy trình đã xác nhận.
- Giữ ngữ cảnh máy/đơn khi chuyển sang thanh toán, hóa đơn hoặc bảo hành; giảm tìm kiếm và nhập lại thông tin.
- Kiểm tra desktop/mobile, bàn phím, trạng thái đang lưu/lỗi/rỗng, bấm lặp, refresh và quay lại trang.

Đầu ra: từng batch UI nhỏ kèm ảnh trước/sau, luồng đã kiểm tra và số thao tác trước/sau. Đọc hướng dẫn Next.js cài trong repository và skill frontend-design trước khi sửa giao diện.

### Đợt C — Chạy thử thực tế có phạm vi

Đề xuất 5–10 ngày làm việc, bắt đầu với nhóm máy và người thao tác đã chọn. Đây là khung đề xuất, chưa phải lịch đã chốt.

- Mỗi giao dịch ghi một lần trong hệ thống, đối chiếu với chứng từ thực tế.
- Cuối ngày đối chiếu tồn kho, đơn, thu/hoàn tiền, COD và số dư theo từng loại tiền; ghi rõ cả chênh lệch chưa giải thích được.
- Ghi vướng mắc ngay tại bước phát sinh bằng mẫu cuối tài liệu. Khi có sai lệch máy/tiền, dừng luồng bị ảnh hưởng để điều tra và dùng chứng từ đối chiếu; không sửa trực tiếp lịch sử cho khớp số.
- Xếp ưu tiên: P0 sai dữ liệu/tiền/quyền; P1 chặn thao tác; P2 thao tác rườm rà; P3 ít dùng hoặc chỉ thẩm mỹ.

### Đợt D — Lược bỏ dựa trên bằng chứng

Mỗi đề xuất bỏ field, trạng thái, API hoặc nhánh logic phải có: tình huống thực tế, tần suất dùng, caller UI/API/RPC, dữ liệu phụ thuộc, phương án tương thích và test hồi quy. Phân biệt “chưa dùng trong đợt thử” với “không còn cần”.

Ưu tiên bỏ nhập liệu lặp, tính toán lặp hoặc điều kiện đã được chứng minh dư thừa. Giữ validation phía server/database, phân quyền, audit, idempotency, khóa chống bán trùng và sổ tiền. Không sửa migration đã áp dụng hay xóa dữ liệu lịch sử.

## 5. Backlog khởi động

| ID | Việc | Tiêu chí hoàn thành | Trạng thái |
| --- | --- | --- | --- |
| PILOT-01 | Chốt môi trường, phạm vi và số dư đầu kỳ | Có mốc đối chiếu máy/tiền và người vận hành | Dùng data seed hiện tại; chủ hệ thống trực tiếp thao tác; còn chờ mốc số dư |
| PILOT-02 | Audit kho → đơn → thu tiền → hóa đơn | Có bản đồ bước, nguồn dữ liệu và lỗi tái hiện | Hoàn thành audit lõi; xem `docs/pilot-core-flow-audit.md` |
| PILOT-03 | Đơn giản hóa menu và nhãn tài chính | Tìm được luồng chính, không mất quyền/link | Hoàn thành batch đầu: nhóm sidebar, mobile shortcuts, nhãn tài chính |
| PILOT-04 | Rà soát trường/form và đơn vị tiền | Không nhập lại dữ liệu có sẵn; số tiền nhất quán | Hoàn thành batch cốt lõi: khóa trạng thái/số tiền ngoài sổ, bắt buộc chi nhánh, chuẩn hóa trường kho và đơn vị tiền |
| PILOT-05 | Đo tải dữ liệu InventoryContext | Có request/payload/thời gian trước khi tối ưu | Đang thực hiện: route-aware loading; `/orders` giảm từ 62 xuống 6 request và từ 171.852 xuống 85.741 byte |
| PILOT-06 | Audit logic cũ và mới giao nhau | Có dependency map và đề xuất có bằng chứng | Hoàn thành: khóa thu cũ legacy, sửa reservation/order overlap, xác nhận commission không có đường ghi song song, cập nhật QA cũ |
| PILOT-07 | Chạy thử và tổng hợp vướng mắc | Có nhật ký, đối soát và backlog sau từng ngày | Đã khởi động: live gate 70/70, baseline đã chụp, tài khoản seed đã dọn và checklist phiên 01 sẵn sàng |

## 6. Kịch bản nghiệm thu tối thiểu

| Luồng | Điều cần đối chiếu |
| --- | --- |
| Máy có sẵn → bán trực tiếp → thu đủ → hóa đơn | Đúng serial, không bán trùng, đúng tiền và nội dung hóa đơn sau reload |
| Cọc → thu còn lại; bấm gửi lặp | Công nợ giảm đúng, không phát sinh hai khoản thu |
| Hủy/hoàn tiền | Tiền, công nợ và trạng thái máy nhất quán theo quy tắc hiện hành |
| COD nếu sử dụng | Giao hàng khác thu tiền; đối soát một phần/đủ không ghi nhận kép |
| Nhận lô → QC → nhập kho bán | Trace được nguồn máy/giá vốn; máy chưa đủ điều kiện không bán được |
| Bảo hành/đổi trả | Truy về đơn/máy đúng, không mất lịch sử, chi phí đúng nơi |
| Giữ máy/thu cũ/hoa hồng nếu sử dụng | Không giữ/bán trùng, credit thu cũ không thành tiền mặt, chi hoa hồng một lần |
| Đổi tháng và vai trò | Số liệu đúng phạm vi; API không lộ dữ liệu tài chính trái quyền |

Khi sửa code: chạy test liên quan, lint, build và diff-check. Dùng lại các script qa hiện có sau khi đọc phạm vi mutation; không chạy bộ live E2E tạo fixture vào dữ liệu vận hành một cách mặc định. Ghi riêng kết quả static, DB, API, browser và quan sát vận hành thật.

## 7. Mẫu nhật ký vướng mắc

```text
Ngày / người thao tác / môi trường:
Mã máy hoặc mã đơn (không ghi thông tin nhạy cảm không cần thiết):
Việc muốn làm:
Các bước đã làm:
Kết quả mong đợi / thực tế:
Thời gian hoặc số bước bị mất:
Ảnh hoặc thông báo lỗi:
Ảnh hưởng: máy / tiền / quyền / thao tác / hiển thị
Ưu tiên / người xử lý / trạng thái:
Bằng chứng sau sửa và sau reload:
```

Kết thúc đợt thử khi các luồng đã chọn chạy được, số liệu đối soát không còn chênh lệch chưa giải thích, không còn P0/P1 và các bất tiện còn lại có thứ tự xử lý. Quyết định mở lại CRM được xem xét riêng sau khi vận hành cốt lõi ổn định.
