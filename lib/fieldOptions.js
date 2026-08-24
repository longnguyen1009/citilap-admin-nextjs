/**
 * fieldOptions.js — Cấu hình trung tâm cho tất cả danh sách dropdown
 *
 * Mỗi option group gồm:
 *   key:          Định danh nội bộ (STABLE, dùng trong logic & lưu vào DB)
 *   defaultLabel: Tên hiển thị mặc định (người dùng có thể đổi qua Settings)
 *   options:      Danh sách các lựa chọn, mỗi cái có key & defaultLabel
 *
 * QUAN TRỌNG: Không đổi giá trị `key` của bất kỳ option nào — logic nghiệp vụ
 * trong InventoryContext.jsx phụ thuộc vào các key này để so sánh trạng thái.
 */

export const FIELD_OPTION_GROUPS = {

  // ──────────────────────────────────────────────
  //  SẢN PHẨM (Laptop)
  // ──────────────────────────────────────────────

  laptopStatus: {
    key: 'laptopStatus',
    defaultLabel: 'Trạng thái máy',
    options: [
      { key: 'not_imported',  defaultLabel: 'Chưa nhập kho' },
      { key: 'available',     defaultLabel: 'Sẵn hàng (đã nhập kho)' },
      { key: 'deposited',     defaultLabel: 'Đã cọc (Giữ chỗ)' },
      { key: 'sold',          defaultLabel: 'Đã bán' },
      { key: 'returned_cn',   defaultLabel: 'Back lại TQ' },
      { key: 'repairing',     defaultLabel: 'Đang sửa chữa' },
      { key: 'skipped',       defaultLabel: 'Bỏ qua' },
    ],
  },

  laptopLocation: {
    key: 'laptopLocation',
    defaultLabel: 'Vị trí kho',
    options: [
      { key: 'store',   defaultLabel: 'CH' },
      { key: 'wh',      defaultLabel: 'KHO' },
      { key: 'wh_cn',   defaultLabel: 'KHO TQ' },
      { key: 'repair',  defaultLabel: 'Sửa chữa' },
    ],
  },

  chargerStatus: {
    key: 'chargerStatus',
    defaultLabel: 'Tình trạng sạc',
    options: [
      { key: 'with_charger',   defaultLabel: 'Có Sạc' },
      { key: 'no_charger',     defaultLabel: 'Không Sạc' },
      { key: 'shared_charger', defaultLabel: 'Sạc Lô' },
      { key: 'unchecked',      defaultLabel: 'Chưa Check' },
    ],
  },

  // Dùng chung cho Màn hình / Cam & Mic / Mainboard
  componentStatus: {
    key: 'componentStatus',
    defaultLabel: 'Tình trạng linh kiện',
    options: [
      { key: 'ok',    defaultLabel: 'OK' },
      { key: 'error', defaultLabel: 'Lỗi / Có vấn đề' },
    ],
  },

  // ──────────────────────────────────────────────
  //  ĐƠN HÀNG (Order)
  // ──────────────────────────────────────────────

  orderStatus: {
    key: 'orderStatus',
    defaultLabel: 'Trạng thái đơn hàng',
    options: [
      { key: 'new',       defaultLabel: 'MỚI TẠO' },
      { key: 'deposited', defaultLabel: 'ĐÃ CỌC / GIỮ MÁY' },
      { key: 'prepared',  defaultLabel: 'ĐÃ CHUẨN BỊ XONG' },
      { key: 'shipping',  defaultLabel: 'ĐANG GIAO HÀNG' },
      { key: 'done',      defaultLabel: 'HOÀN THÀNH' },
      { key: 'returned',  defaultLabel: 'BACK MÁY' },
      { key: 'cancelled', defaultLabel: 'HỦY ĐƠN' },
    ],
  },

  paymentStatus: {
    key: 'paymentStatus',
    defaultLabel: 'Trạng thái thanh toán',
    options: [
      { key: 'unpaid',    defaultLabel: 'CHƯA THANH TOÁN' },
      { key: 'deposited', defaultLabel: 'ĐÃ CỌC' },
      { key: 'cod',       defaultLabel: 'ĐANG CHỜ COD' },
      { key: 'paid',      defaultLabel: 'ĐÃ THANH TOÁN' },
      { key: 'refunded',  defaultLabel: 'ĐÃ HOÀN TIỀN' },
    ],
  },

  deliveryStatus: {
    key: 'deliveryStatus',
    defaultLabel: 'Trạng thái giao hàng',
    options: [
      { key: 'preparing', defaultLabel: 'ĐANG CHUẨN BỊ' },
      { key: 'shipped',   defaultLabel: 'ĐÃ GỬI HÀNG' },
      { key: 'delivered', defaultLabel: 'ĐÃ GIAO HÀNG' },
      { key: 'at_store',  defaultLabel: 'TẠI SHOP' },
      { key: 'returned',  defaultLabel: 'HOÀN HÀNG' },
    ],
  },

  orderType: {
    key: 'orderType',
    defaultLabel: 'Loại đơn hàng',
    options: [
      { key: 'retail',    defaultLabel: 'Bán lẻ (Retail)' },
      { key: 'wholesale', defaultLabel: 'Bán sỉ/Thợ (Wholesale)' },
      { key: 'trade_in',  defaultLabel: 'Thu cũ đổi mới (Trade-in)' },
    ],
  },

  paymentMethod: {
    key: 'paymentMethod',
    defaultLabel: 'Phương thức thanh toán',
    options: [
      { key: 'transfer_cash', defaultLabel: 'Chuyển khoản / Tiền mặt' },
      { key: 'card',          defaultLabel: 'Quẹt thẻ (Tốn phí)' },
      { key: 'installment',   defaultLabel: 'Trả góp' },
    ],
  },

  shippingMethod: {
    key: 'shippingMethod',
    defaultLabel: 'Phương thức vận chuyển',
    options: [
      { key: 'viettelpost',  defaultLabel: 'ViettelPost' },
      { key: 'shopee_spx',   defaultLabel: 'Shopee SPX' },
      { key: 'direct_store', defaultLabel: 'Trực tiếp Shop' },
      { key: 'hcm_agent',    defaultLabel: 'Nhờ HCM giao dịch' },
      { key: 'hai_an',       defaultLabel: 'Nhà xe Hải An' },
      { key: 'shared_car',   defaultLabel: 'Xe Ghép' },
      { key: 'direct_ship',  defaultLabel: 'Ship trực tiếp khách' },
      { key: 'bus',          defaultLabel: 'Xe khách' },
    ],
  },

  giftOptions: {
    key: 'giftOptions',
    defaultLabel: 'Quà tặng kèm',
    options: [
      { key: 'basic_gift', defaultLabel: 'quà cơ bản (balo + chuột)' },
      { key: 'no_gift',    defaultLabel: 'ko quà' },
      { key: 'mouse_only', defaultLabel: 'chỉ tặng chuột' },
      { key: 'bag_only',   defaultLabel: 'chỉ tặng balo' },
    ],
  },

  category: {
    key: 'category',
    defaultLabel: 'Phân loại sản phẩm',
    options: [
      { key: '1',  defaultLabel: 'LEGION 5 2023' },
      { key: '2',  defaultLabel: 'ROG G513 2022' },
      { key: '3',  defaultLabel: 'ROG Scar 2022' },
      { key: '4',  defaultLabel: 'ROG Zephyrus G14' },
      { key: '5',  defaultLabel: 'LEGION 5 Pro 2022' },
      { key: '6',  defaultLabel: 'LEGION 5 Pro 2023 - 2024' },
      { key: '7',  defaultLabel: 'LEGION Slim 7' },
      { key: '8',  defaultLabel: 'ASUS TUF Gaming' },
      { key: '9',  defaultLabel: 'ROG M16 / G16' },
      { key: '10', defaultLabel: 'ACER Nitro 5' },
    ],
  },

  saleOnline: {
    key: 'saleOnline',
    defaultLabel: 'Nhân viên sale online',
    options: [
      { key: '1',     defaultLabel: 'Thắng Tiktok' },
      { key: '2',     defaultLabel: 'Thắng Zalo' },
      { key: '3',     defaultLabel: 'Vương' },
      { key: '4',     defaultLabel: 'Quế Anh' },
      { key: '5',     defaultLabel: 'Quảng' },
      { key: '6',     defaultLabel: 'Linh' },
      { key: '7',     defaultLabel: 'Hoàng' },
      { key: '8',     defaultLabel: 'Tuấn' },
      { key: 'other', defaultLabel: 'Khác' },
    ],
  },

  seller: {
    key: 'seller',
    defaultLabel: 'Người bán / Nguồn nhập',
    options: [
      { key: 'guangzhou', defaultLabel: 'Guangzhou Tech' },
      { key: 'shenzhen', defaultLabel: 'Shenzhen Digital' },
      { key: 'beijing', defaultLabel: 'Beijing Digital' },
      { key: 'aming', defaultLabel: 'Shop TQ A-Ming' },
      { key: 'xiao', defaultLabel: 'Shop TQ Xiao' },
    ],
  },

  // ──────────────────────────────────────────────
  //  BẢO HÀNH (Warranty)
  // ──────────────────────────────────────────────

  warrantyCaseStatus: {
    key: 'warrantyCaseStatus',
    defaultLabel: 'Trạng thái phiếu bảo hành',
    options: [
      { key: 'received',   defaultLabel: 'TIẾP NHẬN' },
      { key: 'checking',   defaultLabel: 'ĐANG KIỂM TRA' },
      { key: 'wait_parts', defaultLabel: 'CHỜ LINH KIỆN' },
      { key: 'repairing',  defaultLabel: 'ĐANG SỬA' },
      { key: 'done',       defaultLabel: 'HOÀN TẤT' },
      { key: 'swap_device',defaultLabel: 'ĐỔI MÁY' },
      { key: 'refunded',   defaultLabel: 'HOÀN TIỀN' },
    ],
  },
};

/**
 * Danh sách key của các trạng thái đơn hàng COMMITTED (đã chốt — máy bị giữ/bán)
 * Dùng bởi isOrderCommitted() trong InventoryContext.
 */
export const COMMITTED_ORDER_STATUS_KEYS = ['prepared', 'shipping', 'done'];

/**
 * Danh sách key của các trạng thái đơn hàng CANCELLED
 */
export const CANCELLED_ORDER_STATUS_KEYS = ['cancelled', 'returned'];

/**
 * Danh sách key đơn hàng & thanh toán có CỌC (giữ máy)
 */
export const DEPOSIT_ORDER_STATUS_KEYS = ['deposited'];
export const DEPOSIT_PAYMENT_STATUS_KEYS = ['deposited'];

/**
 * Danh sách key trạng thái laptop TECHNICAL (không bị reconcile ghi đè)
 */
export const TECHNICAL_LAPTOP_STATUS_KEYS = ['not_imported', 'repairing', 'returned_cn', 'skipped'];

/**
 * Danh sách key trạng thái laptop INACTIVE (đã xuất kho, không tính tồn kho)
 */
export const INACTIVE_LAPTOP_STATUS_KEYS = ['sold', 'returned_cn', 'skipped'];

/**
 * Key trạng thái bảo hành đã giải quyết xong
 */
export const RESOLVED_WARRANTY_STATUS_KEYS = ['done', 'swap_device', 'refunded'];

// ─── DEFAULTS ────────────────────────────────────────────────────────────────
// Tra cứu defaultLabel theo groupKey + optionKey, không cần hook hay localStorage.
// Dùng trong: dbService.js, InventoryContext.jsx, bất kỳ file không-React nào.
//
// Ví dụ: DEFAULTS.laptopStatus.available → 'Sẵn hàng (đã nhập kho)'
//         DEFAULTS.chargerStatus.with_charger → 'Có Sạc'

export const DEFAULTS = Object.freeze(
  Object.fromEntries(
    Object.entries(FIELD_OPTION_GROUPS).map(([groupKey, group]) => [
      groupKey,
      Object.freeze(Object.fromEntries(group.options.map(o => [o.key, o.defaultLabel])))
    ])
  )
);

// Shorthand aliases cho các trường dùng nhiều nhất (tự cập nhật khi đổi defaultLabel)
export const D = {
  // Laptop status
  laptopAvailable:  DEFAULTS.laptopStatus.available,      // 'Sẵn hàng (đã nhập kho)'
  laptopSold:       DEFAULTS.laptopStatus.sold,            // 'Đã bán'
  laptopDeposited:  DEFAULTS.laptopStatus.deposited,       // 'Đã cọc (Giữ chỗ)'
  laptopNotIn:      DEFAULTS.laptopStatus.not_imported,    // 'Chưa nhập kho'
  laptopRepairing:  DEFAULTS.laptopStatus.repairing,       // 'Đang sửa chữa'
  laptopReturnedCN: DEFAULTS.laptopStatus.returned_cn,     // 'Back lại TQ'
  laptopSkipped:    DEFAULTS.laptopStatus.skipped,         // 'Bỏ qua'

  // Laptop location
  locStore:   DEFAULTS.laptopLocation.store,   // 'CH'
  locWH:      DEFAULTS.laptopLocation.wh,      // 'KHO'
  locWHCN:    DEFAULTS.laptopLocation.wh_cn,   // 'KHO TQ'
  locRepair:  DEFAULTS.laptopLocation.repair,  // 'Sửa chữa'

  // Charger
  chargerWith:    DEFAULTS.chargerStatus.with_charger,    // 'Có Sạc'
  chargerWithout: DEFAULTS.chargerStatus.no_charger,      // 'Không Sạc'
  chargerShared:  DEFAULTS.chargerStatus.shared_charger,  // 'Sạc Lô'
  chargerUnknown: DEFAULTS.chargerStatus.unchecked,        // 'Chưa Check'

  // Component (màn hình, cam, mainboard)
  componentOK:    DEFAULTS.componentStatus.ok,    // 'OK'
  componentError: DEFAULTS.componentStatus.error, // 'Lỗi / Có vấn đề'

  // Order status
  orderNew:       DEFAULTS.orderStatus.new,        // 'MỚI TẠO'
  orderDeposited: DEFAULTS.orderStatus.deposited,  // 'ĐÃ CỌC / GIỮ MÁY'
  orderPrepared:  DEFAULTS.orderStatus.prepared,   // 'ĐÃ CHUẨN BỊ XONG'
  orderShipping:  DEFAULTS.orderStatus.shipping,   // 'ĐANG GIAO HÀNG'
  orderDone:      DEFAULTS.orderStatus.done,       // 'HOÀN THÀNH'
  orderReturned:  DEFAULTS.orderStatus.returned,   // 'BACK MÁY'
  orderCancelled: DEFAULTS.orderStatus.cancelled,  // 'HỦY ĐƠN'

  // Payment status
  paymentUnpaid:   DEFAULTS.paymentStatus.unpaid,     // 'CHƯA THANH TOÁN'
  paymentDeposit:  DEFAULTS.paymentStatus.deposited,  // 'ĐÃ CỌC'
  paymentCOD:      DEFAULTS.paymentStatus.cod,        // 'ĐANG CHỜ COD'
  paymentPaid:     DEFAULTS.paymentStatus.paid,       // 'ĐÃ THANH TOÁN'
  paymentRefunded: DEFAULTS.paymentStatus.refunded,   // 'ĐÃ HOÀN TIỀN'

  // Delivery status
  deliveryPreparing: DEFAULTS.deliveryStatus.preparing, // 'ĐANG CHUẨN BỊ'
  deliveryShipped:   DEFAULTS.deliveryStatus.shipped,   // 'ĐÃ GỬI HÀNG'
  deliveryDelivered: DEFAULTS.deliveryStatus.delivered, // 'ĐÃ GIAO HÀNG'
  deliveryAtStore:   DEFAULTS.deliveryStatus.at_store,  // 'TẠI SHOP'
  deliveryReturned:  DEFAULTS.deliveryStatus.returned,  // 'HOÀN HÀNG'

  // Order type
  orderRetail:    DEFAULTS.orderType.retail,     // 'Bán lẻ (Retail)'
  orderWholesale: DEFAULTS.orderType.wholesale,  // 'Bán sỉ/Thợ (Wholesale)'
  orderTradeIn:   DEFAULTS.orderType.trade_in,   // 'Thu cũ đổi mới (Trade-in)'

  // Payment method
  payMethodTransfer:    DEFAULTS.paymentMethod.transfer_cash, // 'Chuyển khoản / Tiền mặt'
  payMethodCard:        DEFAULTS.paymentMethod.card,          // 'Quẹt thẻ (Tốn phí)'
  payMethodInstallment: DEFAULTS.paymentMethod.installment,   // 'Trả góp'
  payMethodDebt:        DEFAULTS.paymentMethod.debt,          // 'Nợ (Công nợ)'

  // Shipping method
  shipViettelpost:  DEFAULTS.shippingMethod.viettelpost,   // 'ViettelPost'
  shipSPX:          DEFAULTS.shippingMethod.shopee_spx,    // 'Shopee SPX'
  shipDirect:       DEFAULTS.shippingMethod.direct_store,  // 'Trực tiếp Shop'

  // Gift
  giftBasic:  DEFAULTS.giftOptions.basic_gift,  // 'quà cơ bản (balo + chuột)'
  giftNone:   DEFAULTS.giftOptions.no_gift,      // 'ko quà'

  // Warranty case
  warrantyCaseReceived: DEFAULTS.warrantyCaseStatus.received, // 'TIẾP NHẬN'
  warrantyCaseDone:     DEFAULTS.warrantyCaseStatus.done,     // 'HOÀN TẤT'
  warrantyCaseSwap:     DEFAULTS.warrantyCaseStatus.swap_device, // 'ĐỔI MÁY'
  warrantyCaseRefund:   DEFAULTS.warrantyCaseStatus.refunded, // 'HOÀN TIỀN'
};
