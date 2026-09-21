export const PURCHASE_STATUSES = Object.freeze({
  DRAFT: 'Nháp', CONFIRMED: 'Đã xác nhận', PARTIALLY_PAID: 'Thanh toán một phần', PAID: 'Đã thanh toán',
  IN_TRANSIT_CN: 'Đang vận chuyển nội địa Trung Quốc', AT_CN_WAREHOUSE: 'Tại kho Trung Quốc',
  IN_TRANSIT_VN: 'Đang về Việt Nam', PARTIALLY_RECEIVED: 'Nhận một phần', RECEIVED: 'Đã nhận',
  CLOSED: 'Đã đóng', CANCELLED: 'Đã hủy'
});

export const PAYMENT_METHODS = Object.freeze({
  WECHAT: 'WeChat', ALIPAY: 'Alipay', BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt', OTHER: 'Khác'
});

export const DESTINATIONS = Object.freeze({ YUNNAN: 'Vân Nam', GUANGXI: 'Quảng Tây', OTHER: 'Khác' });

export const SHIPMENT_STATUSES = Object.freeze({ DRAFT:'Nháp', READY:'Sẵn sàng gửi', IN_TRANSIT:'Đang vận chuyển', AT_CHINA_WAREHOUSE:'Tại kho Trung Quốc', IN_TRANSIT_VN:'Đang về Việt Nam', PARTIALLY_RECEIVED:'Nhận một phần', RECEIVED:'Đã nhận đủ', DELAYED:'Chậm vận chuyển', CANCELLED:'Đã hủy' });
export const RECEIVING_EXCEPTION_TYPES = Object.freeze({ MISSING_ITEM:'Thiếu hàng', WRONG_SERIAL:'Sai serial', WRONG_MODEL:'Sai model', DAMAGED_PACKAGE:'Kiện hư hỏng', MISSING_CHARGER:'Thiếu sạc', UNEXPECTED_ITEM:'Hàng ngoài danh sách', OTHER:'Khác' });
export const LOGISTICS_LOCATIONS = Object.freeze({ SUPPLIER:'Nhà cung cấp', CHINA_YUNNAN:'Kho Vân Nam', CHINA_GUANGXI:'Kho Quảng Tây', VN_TRANSIT:'Đang về Việt Nam', BAC_NINH:'Bắc Ninh', HANOI:'Hà Nội', HCM:'Hồ Chí Minh' });

export const formatRmb = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(value || 0)) + ' ¥';
export const formatVnd = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' đ';
