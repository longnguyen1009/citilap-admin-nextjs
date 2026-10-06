import { FIELD_OPTION_GROUPS } from './fieldOptions.js';

export function exportTable(type, records, { laptops = [], customers = [], accessories = [], options = [], batches = [], suppliers = [] } = {}) {
  const byId = rows => new Map(rows.map(row => [String(row.id), row]));
  const machines = byId(laptops), clients = byId(customers), gifts = byId(accessories);
  const purchases = byId(batches), vendors = byId(suppliers);
  const label = (group, value) => options.find(item => item.group_key === group && item.option_key === String(value))?.label
    ?? FIELD_OPTION_GROUPS[group]?.options.find(item => item.key === String(value))?.defaultLabel ?? value ?? '';
  const number = value => value == null || value === '' ? 0 : Number(value);
  const giftLabels = { none: 'Không tặng', mouse: 'Chuột', backpack: 'Balo', basic: 'Chuột + balo', full: 'Chuột, balo, lót chuột, túi chống sốc', custom: 'Tùy chọn' };
  // Each column owns its value getter: adding a heading cannot shift subsequent cells.
  const columns = type === 'orders' ? [
    ['ID đơn', row => row.id], ['Ngày tạo', row => row.created_date],
    ['SALE Online', row => label('saleOnline', row.sale_online)], ['SALE Offline', row => label('saleOffline', row.sale_offline)],
    ['Ghi chú đơn', row => row.note], ['ID máy', row => row.laptop_id || row.requested_laptop_id],
    ['Cấu hình máy', row => machines.get(String(row.laptop_id || row.requested_laptop_id))?.name],
    ['Serial', row => machines.get(String(row.laptop_id || row.requested_laptop_id))?.serial],
    ['Loại đơn', row => label('orderType', row.order_type)], ['Trạng thái đơn', row => label('orderStatus', row.order_status)],
    ['Thanh toán', row => label('paymentStatus', row.payment_status)], ['Phương thức thanh toán', row => label('paymentMethod', row.payment_method)],
    ['Trạng thái giao hàng', row => label('deliveryStatus', row.delivery_status)], ['Đơn vị gửi', row => label('shippingMethod', row.shipping_method)],
    ['Giá bán (triệu VNĐ)', row => number(row.sale_price)], ['Lợi nhuận (triệu VNĐ)', row => number(row.profit_vnd)],
    ['Tiền cọc (triệu VNĐ)', row => number(row.deposit_amount)], ['Ghi chú cọc', row => row.deposit_note],
    ['COD (triệu VNĐ)', row => number(row.cod_amount)], ['Đã thu (triệu VNĐ)', row => number(row.amount_paid)],
    ['Còn nợ (triệu VNĐ)', row => number(row.debt_amount)], ['Đối trừ thu cũ (VNĐ)', row => number(row.trade_in_credit_vnd)],
    ['ID khách', row => row.customer_id], ['Khách hàng', row => clients.get(String(row.customer_id))?.name || row.customer_info],
    ['Điện thoại', row => clients.get(String(row.customer_id))?.phone], ['Địa chỉ', row => row.customer_address || clients.get(String(row.customer_id))?.address],
    ['Mã vận đơn', row => row.tracking_code], ['Cài đặt', row => row.setup_note], ['Bảo hành', row => row.warranty],
    ['Quà tặng', row => Array.isArray(row.gift_accessory_ids) && row.gift_accessory_ids.length ? row.gift_accessory_ids.map(id => gifts.get(String(id))?.name || `Phụ kiện #${id}`).join('; ') : giftLabels[row.gift_preset] || row.gift_preset || ''],
    ['Ngày gửi', row => row.ship_date], ['Tháng', row => row.month_key],
  ] : [
    ['Ngày nhập', row => row.import_date], ['ID máy', row => row.id], ['SKU', row => row.sku], ['Tên máy', row => row.name],
    ['Kho', row => label('laptopLocation', row.location)], ['Phân loại', row => label('category', row.category)], ['Serial', row => row.serial],
    ['Sạc', row => label('chargerStatus', row.charger_status)], ['Pin (%)', row => row.battery_health],
    ['Nguồn nhập', row => row.source_type], ['Nhà cung cấp', row => vendors.get(String(purchases.get(String(row.purchase_batch_id))?.supplier_id))?.name || label('seller', row.seller)], ['Lô mua', row => purchases.get(String(row.purchase_batch_id))?.batch_code || row.purchase_batch_id],
    ['Ghi chú tình trạng', row => row.condition_note], ['Trạng thái', row => label('laptopStatus', row.status)],
    ['Giá mua (CNY)', row => number(row.purchase_price_rmb ?? row.price_rmb)], ['Ship (CNY)', row => number(row.shipping_rmb)],
    ['Tỷ giá (VNĐ/CNY)', row => number(row.purchase_exchange_rate ?? row.exchange_rate)], ['Giá nhập (triệu VNĐ)', row => number(row.import_price_vnd)],
    ['Giá bán thợ (triệu VNĐ)', row => number(row.wholesale_price_vnd)], ['Giá bán lẻ (triệu VNĐ)', row => number(row.retail_price_vnd)],
    ['Tracking TQ', row => row.tracking_code_cn], ['Ngày nhận', row => row.received_at],
    ['Bảo hành NCC', row => row.warranty_supplier], ['Tháng', row => row.month_key],
  ];
  return { headers: columns.map(([title]) => title), rows: records.map(row => columns.map(([, get]) => get(row) ?? '')) };
}

export function csvTable({ headers, rows }) {
  const cell = value => {
    const text = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
