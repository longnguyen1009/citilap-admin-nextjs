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
      { key: 'in_transit',    defaultLabel: 'Chưa về hàng' },
      { key: 'waiting_qc',    defaultLabel: 'Chờ QC' },
      { key: 'available',     defaultLabel: 'Sẵn hàng' },
      { key: 'reserved',      defaultLabel: 'Đã giữ cho đơn' },
      { key: 'sold',          defaultLabel: 'Đã bán' },
      { key: 'supplier_return', defaultLabel: 'Back lại NCC' },
      { key: 'repair',        defaultLabel: 'Đang sửa chữa' },
      { key: 'ignored',       defaultLabel: 'Bỏ qua' },
    ],
  },

  laptopLocation: {
    key: 'laptopLocation',
    defaultLabel: 'Vị trí kho',
    options: [
      { key: 'store',   defaultLabel: 'CH' },
      { key: 'wh',      defaultLabel: 'KHO' },
      { key: 'media',    defaultLabel: 'MEDIA' },
      { key: 'repair',  defaultLabel: 'Sửa chữa' },
      { key: 'other',   defaultLabel: 'Vị trí khác' },
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
      { key: 'transfer_cash', defaultLabel: 'Chuyển khoản' },
      { key: 'cash',          defaultLabel: 'Tiền mặt' },
      { key: 'card',          defaultLabel: 'Quẹt thẻ' },
      { key: 'installment',   defaultLabel: 'Trả góp' },
    ],
  },

  shippingMethod: {
    key: 'shippingMethod',
    defaultLabel: 'Phương thức vận chuyển',
    options: [
      { key: 'direct_store', defaultLabel: 'Trực tiếp Shop' },
      { key: 'direct_ship',  defaultLabel: 'Ship trực tiếp khách' },
      { key: 'viettelpost',  defaultLabel: 'ViettelPost' },
      { key: 'shopee_spx',   defaultLabel: 'Shopee SPX' },
      { key: 'hcm_agent',    defaultLabel: 'Nhờ HCM giao dịch' },
      { key: 'hai_an',       defaultLabel: 'Nhà xe Hải An' },
      { key: 'shared_car',   defaultLabel: 'Xe Ghép' },
      { key: 'bus',          defaultLabel: 'Xe khách' },
    ],
  },

  category: {
    key: 'category',
    defaultLabel: 'Phân loại sản phẩm',
    options: [
      { key: 'legion_5_21_22', defaultLabel: 'Legion 5 21-22' },
      { key: 'legion_5_23_24', defaultLabel: 'Legion 5 23-24' },
      { key: 'legion_5_25_26', defaultLabel: 'Legion 5 25-26' },
      { key: 'legion_5_pro_21_22', defaultLabel: 'Legion 5 Pro 21-22' },
      { key: 'legion_5_pro_23_24', defaultLabel: 'Legion 5 Pro 23-24' },
      { key: 'legion_5_pro_25_26', defaultLabel: 'Legion 5 Pro 25-26' },
      { key: 'legion_7', defaultLabel: 'Legion 7' },
      { key: 'loq', defaultLabel: 'LOQ' },
      { key: 'acer_nitro_5_21_22', defaultLabel: 'Acer Nitro 5 21-22' },
      { key: 'acer_neo_16_23_25', defaultLabel: 'Acer Neo 16 23-25' },
      { key: 'rog_strix_g16_g18', defaultLabel: 'ROG Strix G16-G18' },
      { key: 'asus_zephyrus_g14_g16', defaultLabel: 'ASUS Zephyrus G14-G16' },
      { key: 'asus_tuf', defaultLabel: 'ASUS TUF' },
      { key: 'lenovo_other', defaultLabel: 'Lenovo khác' },
      { key: 'acer', defaultLabel: 'Acer' },
      { key: 'asus', defaultLabel: 'Asus' },
      { key: 'lenovo', defaultLabel: 'Lenovo' },
      { key: 'dell', defaultLabel: 'Dell' },
      { key: 'hp', defaultLabel: 'HP' },
      { key: 'msi', defaultLabel: 'MSI' },
      { key: 'razer', defaultLabel: 'Razer' },
      { key: 'macbook', defaultLabel: 'MacBook' },
      { key: 'huawei', defaultLabel: 'Huawei' },
      { key: 'xiaomi', defaultLabel: 'Xiaomi' },
      { key: 'other', defaultLabel: 'Phân loại khác' },
    ],
  },

  saleOnline: {
    key: 'saleOnline',
    defaultLabel: 'Nhân viên sale online',
    options: [],
  },

  saleOffline: {
    key: 'saleOffline',
    defaultLabel: 'Nhân viên sale offline',
    options: [],
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
export const TECHNICAL_LAPTOP_STATUS_KEYS = ['in_transit', 'waiting_qc', 'repair', 'supplier_return', 'ignored'];

/**
 * Danh sách key trạng thái laptop INACTIVE (đã xuất kho, không tính tồn kho)
 */
export const INACTIVE_LAPTOP_STATUS_KEYS = ['sold', 'supplier_return', 'ignored'];

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
  laptopDeposited:  DEFAULTS.laptopStatus.reserved,
  laptopNotIn:      DEFAULTS.laptopStatus.in_transit,
  laptopRepairing:  DEFAULTS.laptopStatus.repair,
  laptopReturnedCN: DEFAULTS.laptopStatus.supplier_return,
  laptopSkipped:    DEFAULTS.laptopStatus.ignored,

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

  // Warranty case
  warrantyCaseReceived: DEFAULTS.warrantyCaseStatus.received, // 'TIẾP NHẬN'
  warrantyCaseDone:     DEFAULTS.warrantyCaseStatus.done,     // 'HOÀN TẤT'
  warrantyCaseSwap:     DEFAULTS.warrantyCaseStatus.swap_device, // 'ĐỔI MÁY'
  warrantyCaseRefund:   DEFAULTS.warrantyCaseStatus.refunded, // 'HOÀN TIỀN'
};
