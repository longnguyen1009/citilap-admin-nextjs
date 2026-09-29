# Quy trình nhập và nhận hàng trực tiếp

## Nguyên tắc

Mỗi máy trong lô mua được tạo ngay thành một bản ghi `laptops`. Khi hàng về, hệ thống cập nhật chính ID đó từ `in_transit` sang `waiting_qc`; không sinh thêm laptop.

## Tạo lô mua

Tại `/purchases`:

1. Chọn nhà cung cấp, ngày mua, phân loại lô, tỷ giá và ghi chú lô.
2. Thêm một hoặc nhiều máy.
3. Nhập tên máy, phân loại máy, giá RMB, serial nếu có, phí vận chuyển RMB, mã vận chuyển Trung Quốc và ghi chú. Tên máy có gợi ý từ Settings; phân loại được chọn riêng cho từng máy.
4. Lưu lô.

Sau khi lưu, các máy xuất hiện trong danh sách laptop với trạng thái **Chưa về hàng**. Mỗi dòng máy giữ `purchase_batch_id`, thông tin nguồn và chi phí riêng.

## Nhận máy đã biết nguồn

Tại `/receiving`:

1. Tìm bằng mã vận chuyển, serial, model hoặc ID.
2. Chọn nhiều máy, kể cả khi thuộc nhiều lô.
3. Chọn ngày nhận thực tế.
4. Bổ sung serial hoặc thông tin thực nhận nếu cần.
5. Xác nhận nhận hàng.

Hệ thống cập nhật đúng laptop đã chọn, ghi thời điểm nhận và chuyển máy sang **Chờ QC**.

## Nhận máy chưa rõ nguồn

Chọn mục **Máy chưa rõ nguồn**, nhập tối thiểu thông tin nhận diện và mã vận chuyển nếu có. Hệ thống tạo một laptop nguồn `UNKNOWN`, trạng thái **Chờ QC**, để máy không bị chặn khỏi quy trình kỹ thuật.

## Đối soát máy chưa rõ nguồn

Khi xác định được máy thuộc lô nào:

1. Chọn máy chưa rõ nguồn.
2. Chọn máy dự kiến `in_transit` tương ứng trong lô.
3. Xác nhận đối soát.

Hệ thống giữ ID của máy đã nhận, đổi nguồn sang `SUPPLIER_PURCHASE`, gắn lại lô và lịch sử chính xác, chuyển các liên kết nghiệp vụ cần thiết rồi xóa placeholder dự kiến. Sau thao tác chỉ còn một laptop đại diện cho máy vật lý.

## Trạng thái và tháng

- Tạo lô: `in_transit`, thuộc tháng mua.
- Nhận hàng: `waiting_qc`, giữ tháng mua và ghi ngày nhận vào `received_at`.
- QC PASS: `available`.
- QC FAIL: vẫn `waiting_qc`, xem kết quả trong lịch sử QC.
- Sửa chữa: `repair`; hoàn tất sửa trở về `waiting_qc`.

## Các mô hình đã loại bỏ

Luồng hiện tại không sử dụng `purchase_items`, shipment, shipment item, receiving session, receiving item, unmatched item hay cost allocation. Các file lịch sử nằm trong `db/migrations_archive/legacy/` và không được chạy cho database mới.
