'use client';

import Link from 'next/link';
import { invoiceMoney } from '@/lib/invoiceClient';
import './invoice-document.css';

export default function InvoiceDocument({ invoice, getLabel, onBack }) {
  const snapshot = invoice.snapshot || {};
  const order = snapshot.order || {};
  const customer = snapshot.customer || {};
  const branch = snapshot.branch || {};
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const total = Number(snapshot.total || 0);
  const paid = Number(snapshot.paid || 0);
  const credit = Number(order.trade_in_credit_vnd || 0) / 1000000;
  const debt = Number(order.debt_amount ?? Math.max(total - paid - credit, 0));
  const label = (group, value) => getLabel(group, value) || value || '—';
  return <article className="sales-invoice-workspace">
    <nav className="invoice-no-print">{onBack ? <button type="button" className="btn btn-outline" onClick={onBack}>← Chi tiết hóa đơn</button> : <Link href={`/invoices/${invoice.id}`}>← Chi tiết hóa đơn</Link>}<button className="btn btn-primary" onClick={() => window.print()}>In A4 / Lưu PDF</button></nav>
    <div className="sales-invoice-document">
      <header className="sales-invoice-brand"><div><strong>CITILAP</strong><p>{branch.name || 'Cửa hàng laptop'}</p><p>{branch.address || 'Địa chỉ tiếp nhận: liên hệ chi nhánh bán hàng'}</p>{branch.phone && <p>Điện thoại: {branch.phone}</p>}</div><div><h1>HÓA ĐƠN BÁN HÀNG</h1><p>Số: HD{String(invoice.id).padStart(6, '0')} · Đơn #{invoice.order_id}</p><p>Ngày: {new Date(invoice.created_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p></div></header>
      <section className="sales-invoice-customer"><p><b>Khách hàng:</b> {customer.name || '—'}</p><p><b>Điện thoại:</b> {customer.phone || '—'}</p><p><b>Địa chỉ:</b> {order.customer_address || customer.address || '—'}</p><p><b>Nhân viên:</b> {label('saleOffline', order.sale_offline)} · <b>Thanh toán:</b> {label('paymentMethod', order.payment_method)}</p></section>
      <table className="sales-invoice-items"><thead><tr><th>STT</th><th>Sản phẩm / Serial</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.kind}-${item.id}-${index}`}><td>{index + 1}</td><td><b>{item.name}</b>{item.kind === 'gift' && <small>Quà tặng</small>}{item.serial && <small>Serial: {item.serial}</small>}</td><td>{item.quantity}</td><td>{invoiceMoney(item.price)}</td><td>{invoiceMoney(item.total)}</td></tr>)}</tbody></table>
      <section className="sales-invoice-settlement"><div><p><b>Bảo hành trên đơn:</b> {order.warranty || 'Chưa ghi thời hạn — cần xác nhận với cửa hàng'}</p>{order.setup_note && <p><b>Cài đặt bàn giao:</b> {order.setup_note}</p>}</div><dl><div><dt>Tổng tiền hàng</dt><dd>{invoiceMoney(total)}</dd></div><div><dt>Đã thanh toán</dt><dd>{invoiceMoney(paid)}</dd></div>{credit > 0 && <div><dt>Đối trừ thu cũ</dt><dd>{invoiceMoney(credit)}</dd></div>}<div><dt>Còn phải thanh toán</dt><dd>{invoiceMoney(debt)}</dd></div></dl></section>
      <section className="sales-invoice-terms"><h2>CAM KẾT BÀN GIAO & ĐIỀU KIỆN BẢO HÀNH</h2>
        <p>CitiLap bàn giao sản phẩm đúng model, cấu hình, serial và phụ kiện ghi trên hóa đơn. Quý khách kiểm tra ngoại hình, chức năng và phụ kiện trước khi thanh toán; lưu hóa đơn để đối chiếu khi bảo hành.</p>
        <p><b>Laptop mới:</b> Thời hạn bảo hành theo đơn hàng/phiếu bảo hành. Sản phẩm có bảo hành hãng được tiếp nhận theo điều kiện của hãng; các cam kết riêng của CitiLap áp dụng theo thỏa thuận bán hàng.</p>
        <p><b>Laptop cũ — bảo hành CitiLap:</b> Máy phải còn thời hạn bảo hành và nguyên tem CitiLap. Đổi máy miễn phí trong 15 ngày kể từ ngày mua khi có lỗi thuộc diện bảo hành. Sau thời gian này, linh kiện lỗi đủ điều kiện được sửa chữa hoặc thay thế miễn phí bằng linh kiện tương đương.</p>
        <p>Trường hợp phải đặt linh kiện: xử lý tối đa 01 tuần, không kể Chủ nhật và ngày lễ. Nếu chưa có linh kiện, hỗ trợ đổi máy tương tự; nếu khách không đồng ý, thời gian tìm máy cùng model/cấu hình để đổi tối đa 01 tháng.</p>
        <p>Với gói bảo hành 12 tháng: mainboard (CPU/GPU), RAM, ổ cứng và Wi-Fi được bảo hành 12 tháng; linh kiện còn lại được bảo hành 03 tháng. Màn hình được bảo hành điểm chết từ 05 điểm trở lên; cảm ứng màn hình bảo hành 01 tháng. Các gói khác áp dụng thời hạn ghi trên đơn.</p>
        <p><b>Không thuộc phạm vi bảo hành:</b> Hư hỏng do ẩm, vào nước, cháy nổ, tỳ đè, rơi vỡ, côn trùng; màn hình trầy xước, chảy mực hoặc thiết bị không còn tình trạng ban đầu do tác động bên ngoài.</p>
        <p>Hoàn tiền chỉ xem xét với lỗi thuộc diện bảo hành ở mainboard, CPU, RAM, GPU, ổ cứng hoặc màn hình; không áp dụng với máy trả góp. Giá nhập lại/đổi máy sau 15 ngày và khoản khấu trừ (nếu có) phải được hai bên xác nhận trước khi thực hiện.</p>
        <p><b>Tiếp nhận:</b> 9:30–12:00 và 13:30–17:30 hằng ngày, trừ Tết Nguyên Đán, tại chi nhánh bán hàng ghi trên hóa đơn. Vui lòng sao lưu dữ liệu trước khi gửi máy.</p>
      </section>
      <footer className="sales-invoice-signatures"><div><b>KHÁCH HÀNG</b><small>Kiểm tra và xác nhận bàn giao</small></div><div><b>ĐẠI DIỆN CITILAP</b><small>Ký, ghi rõ họ tên</small></div></footer>
    </div>
  </article>;
}
