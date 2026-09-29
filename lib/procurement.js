
export const PAYMENT_METHODS = Object.freeze({
  WECHAT: 'WeChat', ALIPAY: 'Alipay', BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt', OTHER: 'Khác'
});

export const DESTINATIONS = Object.freeze({ YUNNAN: 'Vân Nam', GUANGXI: 'Quảng Tây', OTHER: 'Khác' });


export const formatRmb = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(value || 0)) + ' ¥';
export const formatVnd = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' đ';
