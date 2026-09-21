"use client";
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchLaptopsFromCloud, saveLaptopToCloud,
  fetchOrdersFromCloud, saveOrderToCloud,
  fetchWarrantyCasesFromCloud, saveWarrantyCaseToCloud,
  fetchStockMovementsFromCloud, saveStockMovementToCloud,
  fetchCustomersFromCloud, saveCustomerToCloud,
  fetchAllSettings, saveSetting,
  fetchAppOptionsFromCloud,
  fetchPaymentsFromCloud, savePaymentToCloud,
  getAuthHeaders,
  subscribeRealtimeChanges
} from '../lib/apiFetchers';
// removed manual map functions
import {
  FIELD_OPTION_GROUPS,
  COMMITTED_ORDER_STATUS_KEYS,
  CANCELLED_ORDER_STATUS_KEYS,
  DEPOSIT_ORDER_STATUS_KEYS,
  DEPOSIT_PAYMENT_STATUS_KEYS,
  TECHNICAL_LAPTOP_STATUS_KEYS,
  INACTIVE_LAPTOP_STATUS_KEYS,
  D,
} from '../lib/fieldOptions';
import { getOptionLabels, labelToKey, getOptions, getLabel, resolveLabel } from '../lib/useFieldOptions';
import { getSupabaseCredentials, getSupabaseClient } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

const InventoryContext = createContext();

// ─── Phân quyền data: ẩn thông tin nhạy cảm theo role ─────────────────
const SENSITIVE_LAPTOP_KEYS = ['priceRmb', 'shippingRmb', 'exchangeRate', 'importPriceVnd', 'wholesalePriceVnd', 'profitVnd', 'seller', 'warrantySupplier'];
const SENSITIVE_ORDER_KEYS = [
  'profitVnd', 'costSnapshotVnd', 'grossProfitSnapshotVnd',
  'directCostSnapshotVnd', 'netContributionSnapshotVnd',
  'costSnapshotStatus', 'costSnapshotReasons', 'costSnapshottedAt'
];

const filterSensitiveFields = (items, sensitiveKeys) => {
  if (!Array.isArray(items)) return items;
  return items.map(item => {
    const filtered = { ...item };
    sensitiveKeys.forEach(k => { delete filtered[k]; });
    return filtered;
  });
};

const LOCAL_KEYS = {
  formula: 'citilap_formula',
  appOptions: 'citilap_app_options_v1',
  selectedMonth: 'citilap_selected_month'
};

const readLocalArray = (key, fallback = []) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.error(`Không thể đọc dữ liệu local: ${key}`, error);
    return fallback;
  }
};

const createLocalId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const todayVi = () => new Date().toLocaleDateString('vi-VN');
const isValidDBId = (id) => (typeof id === 'number' && Number.isInteger(id) && id > 0)
  || (typeof id === 'string' && /^\d+$/.test(id) && Number(id) > 0);

export const useInventory = () => useContext(InventoryContext);

export const DEFAULT_FORMULA_CONFIG = {
  shippingVnd: 400000,
  divisor: 1000000,
  defaultRate: 3550,
};

// ─── Helper nội bộ: đọc customConfig từ localStorage tại runtime ──────────────
const _cfg = () => {
  if (typeof window === 'undefined') return [];
  try { 
    const val = JSON.parse(window.localStorage.getItem(LOCAL_KEYS.appOptions) || '[]');
    return Array.isArray(val) ? val : [];
  } catch { return []; }
};

// ─── Constant OPTIONS — tính động từ appOptions config ──────────────────────
// Dùng defaultLabel khi chưa có customization; sau khi user đổi tên thì refresh
// lấy label mới. Các trang (Inventory, Orders) vẫn import tên constant cũ bình thường.

export const STATUS_OPTIONS            = getOptionLabels('laptopStatus', _cfg());
export const LOCATION_OPTIONS          = getOptionLabels('laptopLocation', _cfg());
export const CHARGER_OPTIONS           = getOptionLabels('chargerStatus', _cfg());

// Danh mục thuộc tính Quản Lý Đơn Hàng
export const SALE_ONLINE_OPTIONS       = getOptionLabels('saleOnline', _cfg());
export const SALE_OFFLINE_OPTIONS      = getOptionLabels('saleOffline', _cfg());
export const SHIPPING_METHOD_OPTIONS   = getOptionLabels('shippingMethod', _cfg());
export const ORDER_STATUS_OPTIONS      = getOptionLabels('orderStatus', _cfg());
export const PAYMENT_STATUS_OPTIONS    = getOptionLabels('paymentStatus', _cfg());
export const DELIVERY_STATUS_OPTIONS   = getOptionLabels('deliveryStatus', _cfg());
export const GIFT_OPTIONS              = getOptionLabels('giftOptions', _cfg());
export const ORDER_TYPES               = getOptionLabels('orderType', _cfg());
export const PAYMENT_METHODS           = getOptionLabels('paymentMethod', _cfg());
export const WARRANTY_CASE_STATUS_OPTIONS = getOptionLabels('warrantyCaseStatus', _cfg());
export const SELLER_OPTIONS                = getOptionLabels('seller', _cfg());
export const CATEGORY_OPTIONS              = getOptionLabels('category', _cfg());

// Helper to get option_key from UUID
export const getOptionKeyById = (id, appOptions = []) => {
  if (!id) return null;
  const opt = appOptions.find(o => String(o.id) === String(id));
  return opt ? opt.option_key : id; // fallback to id if not found (for backwards compatibility if they are still strings)
};

export const isOrderCancelled = (order, appOptions = []) => {
  const statusKey = labelToKey('orderStatus', order?.orderStatus, appOptions);
  return CANCELLED_ORDER_STATUS_KEYS.includes(statusKey);
};

export const isOrderCommitted = (order, appOptions = []) => {
  if (!order || order.isActive === false) return false;
  if (isOrderCancelled(order, appOptions)) return false;
  const statusKey = labelToKey('orderStatus', order?.orderStatus, appOptions);
  return COMMITTED_ORDER_STATUS_KEYS.includes(statusKey);
};

export const isReservationActive = (order, appOptions = [], now = new Date()) => {
  const reservationTarget = order?.laptopId || order?.requestedLaptopId;
  if (!reservationTarget || order.isActive === false || isOrderCancelled(order, appOptions) || isOrderCommitted(order, appOptions)) return false;
  const statusKey  = labelToKey('orderStatus', order?.orderStatus, appOptions);
  const paymentKey = labelToKey('paymentStatus', order?.paymentStatus, appOptions);
  const hasDeposit = DEPOSIT_PAYMENT_STATUS_KEYS.includes(paymentKey)
    || DEPOSIT_ORDER_STATUS_KEYS.includes(statusKey);
  if (!hasDeposit) return false;
  if (!order.reservationExpiresAt) return true; // tương thích đơn cọc cũ
  const expiresAt = new Date(order.reservationExpiresAt);
  return Number.isNaN(expiresAt.getTime()) || expiresAt > now;
};


// Trợ lý đọc số thông minh: Hỗ trợ cả phẩy "," và chấm "." từ Google Sheet/Excel không bị trích xuất làm tròn
export const parseFlexibleFloat = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = String(val).trim();
  if (!str) return 0;

  // Xóa ký tự tiền tệ
  str = str.replace(/[¥đVND\s]/gi, '');

  if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

// Trợ lý tính Giá Nhập (triệu VNĐ) - Giữ chính xác con số tuyệt đối không cắt xén
export const computeImportPrice = (priceRmb, shippingRmb, exchangeRate, formulaConfig = DEFAULT_FORMULA_CONFIG) => {
  const p = parseFlexibleFloat(priceRmb);
  const s = parseFlexibleFloat(shippingRmb);
  const r = parseFlexibleFloat(exchangeRate) || formulaConfig.defaultRate || 3550;
  const extraVnd = formulaConfig.shippingVnd !== undefined ? parseFlexibleFloat(formulaConfig.shippingVnd) : 400000;
  const divisor = formulaConfig.divisor || 1000000;

  if (p === 0) return 0;
  const rawVnd = (p + s) * r + extraVnd;
  return Number((rawVnd / divisor).toFixed(2));
};

// Trợ lý tính Lợi Nhuận (triệu VNĐ) - Giữ chính xác con số tuyệt đối
export function computeProfit(retailPriceVnd, wholesalePriceVnd, importPriceVnd, customProfit) {
  if (arguments.length === 1) return 0;
  const salePrice = parseFlexibleFloat(retailPriceVnd) || parseFlexibleFloat(wholesalePriceVnd);
  const importPrice = parseFlexibleFloat(importPriceVnd);
  if (salePrice <= 0 || importPrice <= 0) return 0;
  if (customProfit !== undefined && customProfit !== null && customProfit !== '') {
    return parseFlexibleFloat(customProfit);
  }
  return Number((salePrice - importPrice).toFixed(2));
}

// Trợ lý chuyển đổi Ngày thành chuỗi Tháng/Năm (VD: "08/2026")
export const parseMonthYear = (dateStr, fallbackTimestamp) => {
  if (!dateStr && !fallbackTimestamp) {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }

  const str = String(dateStr || '').trim();
  const slashParts = str.split('/');
  if (slashParts.length === 3) {
    // DD/MM/YYYY
    const m = slashParts[1].padStart(2, '0');
    const y = slashParts[2].length === 2 ? `20${slashParts[2]}` : slashParts[2];
    return `${m}/${y}`;
  } else if (slashParts.length === 2) {
    if (slashParts[1].length === 4) {
      // MM/YYYY
      return `${slashParts[0].padStart(2, '0')}/${slashParts[1]}`;
    } else {
      // DD/MM -> lấy năm từ fallbackTimestamp hoặc năm hiện tại
      const m = slashParts[1].padStart(2, '0');
      let y = new Date().getFullYear();
      if (fallbackTimestamp) {
        const d = new Date(fallbackTimestamp);
        if (!isNaN(d.getTime())) y = d.getFullYear();
      }
      return `${m}/${y}`;
    }
  }

  if (fallbackTimestamp || dateStr) {
    const d = new Date(fallbackTimestamp || dateStr);
    if (!isNaN(d.getTime())) {
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
  }

  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
};

export const monthYearToKey = (myStr) => {
  if (!myStr || myStr === 'ALL') return 0;
  const [m, y] = String(myStr).split('/');
  if (!m || !y) return 0;
  return parseInt(y, 10) * 100 + parseInt(m, 10);
};

// Kiểm tra trạng thái máy đã xuất khỏi kho
export const isInactiveStatus = (status) => {
  if (!status) return false;
  const key = labelToKey('laptopStatus', status, _cfg()) || String(status).trim().toLowerCase();
  return INACTIVE_LAPTOP_STATUS_KEYS.includes(key);
};

// Chuẩn hóa trạng thái máy tránh sai khác chữ hoa/thường hoặc tên cũ
export const normalizeLaptopStatus = (status) => {
  if (!status) return D.laptopAvailable;
  const s = String(status).trim();
  if (s.toLowerCase() === 'bỏ qua' || s.toLowerCase() === 'skipped') return D.laptopSkipped;
  if (s.toLowerCase().includes('back') && s.toLowerCase().includes('tq')) return D.laptopReturnedCN;
  if (s.toLowerCase().includes('đang sửa') || s.toLowerCase().includes('vỡ') || s.toLowerCase().includes('móp') || s.toLowerCase().includes('bảo hành')) return D.laptopRepairing;
  if (s.toLowerCase().includes('thu hồi') || s.toLowerCase().includes('back tiền')) return D.laptopReturnedCN;
  if (s.toLowerCase().includes('đã bán') || s.toLowerCase() === 'sold') return D.laptopSold;
  if (s.toLowerCase().includes('chưa nhập')) return D.laptopNotIn;
  if (s.toLowerCase().includes('sẵn hàng') || s.toLowerCase().includes('đã nhập kho')) return D.laptopAvailable;
  if (s.toLowerCase().includes('đã cọc') || s.toLowerCase().includes('giữ chỗ')) return D.laptopDeposited;
  return status;
};

// TECHNICAL_STATUSES — bao gồm cả key nội bộ lẫn defaultLabel để nhận dữ liệu cũ
const TECHNICAL_STATUSES = new Set(
  TECHNICAL_LAPTOP_STATUS_KEYS.flatMap(k => {
    const opt = FIELD_OPTION_GROUPS.laptopStatus.options.find(o => o.key === k);
    return opt ? [k, opt.defaultLabel] : [k];
  })
);

const reconcileLaptopStatuses = (laptops, orders, scopeMonth = 'ALL') => {
  const relatedOrders = new Map();
  orders.forEach((order) => {
    const references = [order.laptopId, order.requestedLaptopId].filter(Boolean);
    references.forEach(referenceId => {
      const key = String(referenceId);
      const related = relatedOrders.get(key) || [];
      if (!related.some(item => String(item.id) === String(order.id))) related.push(order);
      relatedOrders.set(key, related);
    });
  });

  return laptops.map((laptop) => {
    const linkedOrders = relatedOrders.get(String(laptop.id)) || [];
    if (scopeMonth && scopeMonth !== 'ALL') {
      const itemMonth = parseMonthYear(laptop.importDate, laptop.created_at || laptop.createdAt);
      if (monthYearToKey(itemMonth) !== monthYearToKey(scopeMonth) && linkedOrders.length === 0) {
        // Đơn lịch sử không nằm trong truy vấn tháng hiện tại, giữ nguyên trạng thái DB.
        return laptop;
      }
    }

    const statusKey = labelToKey('laptopStatus', laptop.status, _cfg());
    if (TECHNICAL_LAPTOP_STATUS_KEYS.includes(statusKey)) return { ...laptop, status: statusKey };

    const opts = _cfg();
    if (linkedOrders.some(o => String(o.laptopId) === String(laptop.id) && isOrderCommitted(o, opts))) {
      return { ...laptop, status: 'sold', isLocked: true };
    }
    const hasPhysicalReservation = linkedOrders.some(o => (
      String(o.laptopId) === String(laptop.id) && isReservationActive(o, opts)
    ));
    const hasDepositReference = linkedOrders.some(o => (
      String(o.requestedLaptopId) === String(laptop.id) && isReservationActive(o, opts)
    ));
    if (hasPhysicalReservation || hasDepositReference) {
      return { ...laptop, status: 'deposited', isLocked: hasPhysicalReservation };
    }

    // Dữ liệu orders thường chỉ chứa tháng đang xem. Không tìm thấy order
    // trong tập dữ liệu này không chứng minh laptop không còn được sử dụng:
    // order liên kết có thể nằm ở tháng khác. Vì vậy phải giữ trạng thái API.
    if (linkedOrders.length === 0) {
      return { ...laptop, status: statusKey || laptop.status };
    }

    // Chỉ trả máy về sẵn hàng khi thực sự có order liên kết trong tập dữ liệu
    // và tất cả các order đó đã hủy/trả/hết giữ chỗ.
    if (['deposited', 'sold'].includes(statusKey)) {
      return { ...laptop, status: 'available', isLocked: false };
    }
    return { ...laptop, status: statusKey, isLocked: false };
  });
};

// Hàm lọc Kho Laptop theo Tháng — server đã trả đúng dữ liệu theo month_key
// Chỉ cần match monthKey trên client (phòng khi load ALL mode)
export const filterLaptopsByMonth = (laptops, selectedMonth) => {
  if (!selectedMonth || selectedMonth === 'ALL') return laptops;
  return laptops.filter(l => l.monthKey === selectedMonth);
};

// Hàm lọc Đơn Hàng theo Tháng — server đã trả đúng dữ liệu theo month_key
export const filterOrdersByMonth = (orders, selectedMonth) => {
  if (!selectedMonth || selectedMonth === 'ALL') return orders;
  return orders.filter(o => o.monthKey === selectedMonth && o.isActive !== false);
};

// Dữ liệu mẫu giàu có ban đầu với danh sách Trạng Thái Mới
const initialLaptops = [
  { importDate: '01/07/2026', id: '#101', serial: 'SN-LEG5-2023-1001', name: 'Legion 5 2023 R7-7735HS/16GB/512GB/RTX 4060 165Hz', location: 'store', category: '1', conditionNote: 'Máy mới đẹp 99%, test full chức năng OK', chargerStatus: 'with_charger', seller: 'Shop TQ A-Ming', status: 'available', priceRmb: 4800, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 17.617,  profitVnd: 3.383, trackingCode: 'SF1428571001' },
  { importDate: '02/07/2026', id: '#102', serial: 'SN-LEG5-2023-1002', name: 'Legion 5 2023 R7-7840H/16GB/1TB/RTX 4060 2.5K 165Hz', location: 'store', category: '1', conditionNote: 'Đã xuất kho chốt đơn cho khách', chargerStatus: 'with_charger', seller: 'Guangzhou Tech', status: 'sold', priceRmb: 5200, shippingRmb: 60, exchangeRate: 3550, importPriceVnd: 19.097,  profitVnd: 3.403, trackingCode: 'SF1428571002' },
  { importDate: '03/07/2026', id: '#103', serial: 'SN-ROG-G513-2003', name: 'Asus ROG Strix G513 2022 R7-6800H/16GB/512GB/RTX 3060 300Hz', location: 'store', category: '2', conditionNote: 'Khách đã cọc 2tr giữ chỗ tại shop', chargerStatus: 'with_charger', seller: 'Shop TQ A-Ming', status: 'deposited', priceRmb: 4300, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 15.842,  profitVnd: 2.658, trackingCode: 'YT9081273003' },
  { importDate: '05/07/2026', id: '#104', serial: 'SN-ROG-G513-2004', name: 'Asus ROG Strix G513 2022 R9-6900HX/16GB/1TB/RTX 3070Ti 2K', location: 'wh', category: '2', conditionNote: 'Tồn kho tổng, ngoại hình rất đẹp', chargerStatus: 'with_charger', seller: 'Shenzhen Digital', status: 'available', priceRmb: 5100, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 18.682,  profitVnd: 3.318, trackingCode: 'YT9081273004' },
  { importDate: '06/07/2026', id: '#105', serial: 'SN-SCAR-2022-3005', name: 'Asus ROG Strix Scar 15 2022 i9-12900H/32GB/1TB/RTX 307.5K', location: 'store', category: '3', conditionNote: 'Đã bán cho khách HN thanh toán quẹt thẻ', chargerStatus: 'with_charger', seller: 'Beijing Digital', status: 'sold', priceRmb: 6500, shippingRmb: 60, exchangeRate: 3550, importPriceVnd: 23.712,  profitVnd: 3.788, trackingCode: 'ZTO88773005' },
  { importDate: '08/07/2026', id: '#106', serial: 'SN-SCAR-2022-3006', name: 'Asus ROG Strix Scar 17 2022 i9-12900H/32GB/1TB/RTX 3080 240Hz', location: 'wh', category: '3', conditionNote: 'Hàng VIP nguyên bản chưa qua sửa chữa', chargerStatus: 'with_charger', seller: 'Guangzhou Tech', status: 'available', priceRmb: 7200, shippingRmb: 70, exchangeRate: 3550, importPriceVnd: 26.295,  profitVnd: 4.205, trackingCode: 'ZTO88773006' },
  { importDate: '10/07/2026', id: '#107', serial: 'SN-ZEP-G14-4007', name: 'Asus ROG Zephyrus G14 2022 R7-6800HS/16GB/512GB/RX 6700S', location: 'store', category: '4', conditionNote: 'Máy mỏng nhẹ cao cấp, pin 95%', chargerStatus: 'with_charger', seller: 'Shop TQ Xiao', status: 'available', priceRmb: 4100, shippingRmb: 40, exchangeRate: 3550, importPriceVnd: 15.114,  profitVnd: 2.686, trackingCode: 'SF99814007' },
  { importDate: '12/07/2026', id: '#108', serial: 'SN-ZEP-G14-4008', name: 'Asus ROG Zephyrus G14 2023 R9-7940HS/16GB/1TB/RTX 4060 QHD+', location: 'wh_cn', category: '4', conditionNote: 'Đang vận chuyển từ kho Trung Quốc về', chargerStatus: 'with_charger', seller: 'Shenzhen Digital', status: 'not_imported', priceRmb: 5900, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 21.522,  profitVnd: 3.478, trackingCode: 'SF99814008' },
  { importDate: '14/07/2026', id: '#109', serial: 'SN-LEG5PRO-5009', name: 'Legion 5 Pro 2022 R7-6800H/16GB/512GB/RTX 3060 2.5K 165Hz', location: 'store', category: '5', conditionNote: 'Đã bán thành công gửi COD Hải Phòng', chargerStatus: 'with_charger', seller: 'Shop TQ A-Ming', status: 'sold', priceRmb: 4600, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 16.907,  profitVnd: 2.893, trackingCode: 'STO11225009' },
  { importDate: '15/07/2026', id: '#110', serial: 'SN-LEG5PRO-5010', name: 'Legion 5 Pro 2022 i7-12700H/16GB/512GB/RTX 3070 2.5K 165Hz', location: 'store', category: '5', conditionNote: 'Khách đặt cọc 3tr chờ lấy cuối tuần', chargerStatus: 'with_charger', seller: 'Shop TQ A-Ming', status: 'deposited', priceRmb: 5000, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 18.327,  profitVnd: 3.173, trackingCode: 'STO11225010' },
  { importDate: '18/07/2026', id: '#111', serial: 'SN-LEG5PRO-6011', name: 'Legion 5 Pro 2023 R7-7745HX/16GB/1TB/RTX 4060 2.5K 240Hz', location: 'store', category: '6', conditionNote: 'Đã đóng gói gửi ViettelPost chờ thu COD', chargerStatus: 'with_charger', seller: 'Guangzhou Tech', status: 'available', priceRmb: 5600, shippingRmb: 60, exchangeRate: 3550, importPriceVnd: 20.517,  profitVnd: 3.283, trackingCode: 'SF88996011' },
  { importDate: '20/07/2026', id: '#112', serial: 'SN-LEG5PRO-6012', name: 'Legion 5 Pro 2024 i7-14650HX/16GB/1TB/RTX 4060 2.5K 240Hz', location: 'wh', category: '6', conditionNote: 'Đang chuẩn bị hàng xuất kho nhà xe', chargerStatus: 'with_charger', seller: 'Shenzhen Digital', status: 'available', priceRmb: 6100, shippingRmb: 60, exchangeRate: 3550, importPriceVnd: 22.292,  profitVnd: 3.608, trackingCode: 'SF88996012' },
  { importDate: '22/07/2026', id: '#113', serial: 'SN-SLIM7-7013', name: 'Legion Slim 7 2022 R7-6800H/16GB/512GB/RX 6800S 2.5K', location: 'repair', category: '7', conditionNote: 'Lỗi màn giật sọc nhẹ, đang nhờ kỹ thuật kiểm tra', chargerStatus: 'shared_charger', seller: 'Shop TQ Xiao', status: 'repairing', priceRmb: 4500, shippingRmb: 40, exchangeRate: 3550, importPriceVnd: 16.532,  profitVnd: 2.968, trackingCode: 'ZTO99117013' },
  { importDate: '25/07/2026', id: '#114', serial: 'SN-SLIM7-7014', name: 'Legion Slim 7 2023 R7-7840HS/16GB/1TB/RTX 4060 3.2K 165Hz', location: 'store', category: '7', conditionNote: 'Máy siêu mỏng đẹp 99.9%, sạc zin đi kèm', chargerStatus: 'with_charger', seller: 'Beijing Digital', status: 'available', priceRmb: 5800, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 21.167,  profitVnd: 3.333, trackingCode: 'ZTO99117014' },
  { importDate: '28/07/2026', id: '#115', serial: 'SN-TUF-8015', name: 'Asus TUF Gaming A15 2023 R7-7735HS/16GB/512GB/RTX 4060 144Hz', location: 'store', category: '8', conditionNote: 'Đã bán trả góp xong cho khách Đà Nẵng', chargerStatus: 'with_charger', seller: 'Shop TQ A-Ming', status: 'sold', priceRmb: 4200, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 15.487,  profitVnd: 2.513, trackingCode: 'SF11228015' },
  { importDate: '30/07/2026', id: '#116', serial: 'SN-TUF-8016', name: 'Asus TUF Gaming F15 2023 i7-13620H/16GB/512GB/RTX 4060 144Hz', location: 'wh', category: '8', conditionNote: 'Hàng chuẩn zin fullbox', chargerStatus: 'with_charger', seller: 'Guangzhou Tech', status: 'available', priceRmb: 4400, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 16.197,  profitVnd: 2.603, trackingCode: 'SF11228016' },
  { importDate: '01/08/2026', id: '#117', serial: 'SN-ROG-M16-9017', name: 'Asus ROG Strix M16 2023 i7-13700H/16GB/1TB/RTX 4060 QHD+ 240Hz', location: 'store', category: '9', conditionNote: 'Màn Nebulae siêu đẹp, test ok', chargerStatus: 'with_charger', seller: 'Shenzhen Digital', status: 'available', priceRmb: 6000, shippingRmb: 60, exchangeRate: 3550, importPriceVnd: 21.937,  profitVnd: 3.563, trackingCode: 'YT88119017' },
  { importDate: '02/08/2026', id: '#118', serial: 'SN-ROG-G16-9018', name: 'Asus ROG Strix G16 2023 i7-13650HX/16GB/512GB/RTX 4060 FHD+', location: 'wh_cn', category: '9', conditionNote: 'Đang xếp lịch ghép xe TQ chở về', chargerStatus: 'with_charger', seller: 'Shop TQ Xiao', status: 'not_imported', priceRmb: 5700, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 20.812,  profitVnd: 3.188, trackingCode: 'YT88119018' },
  { importDate: '03/08/2026', id: '#119', serial: 'SN-NITRO5-1019', name: 'Acer Nitro 5 2022 i5-12500H/16GB/512GB/RTX 3050Ti 144Hz', location: 'wh_cn', category: '10', conditionNote: 'Vỡ vỏ móp sườn, back lại xưởng TQ', chargerStatus: 'no_charger', seller: 'Shop TQ Xiao', status: 'returned_cn', priceRmb: 3100, shippingRmb: 30, exchangeRate: 3550, importPriceVnd: 11.582,  profitVnd: 1.618, trackingCode: 'SF77661019' },
  { importDate: '05/08/2026', id: '#120', serial: 'SN-NITRO5-1020', name: 'Acer Nitro 5 2023 R7-6800H/16GB/512GB/RTX 3060 FHD 165Hz', location: 'store', category: '10', conditionNote: 'Đã hủy đơn hoàn về kho chờ bán lại', chargerStatus: 'with_charger', seller: 'Beijing Digital', status: 'available', priceRmb: 3800, shippingRmb: 40, exchangeRate: 3550, importPriceVnd: 14.047,  profitVnd: 2.153, trackingCode: 'SF77661020' },
  { importDate: '06/08/2026', id: '#121', serial: 'SN-LEG5-2023-1021', name: 'Legion 5 2023 R7-7735HS/16GB/1TB/RTX 4050 165Hz', location: 'store', category: '1', conditionNote: 'Sẵn hàng tại showroom', chargerStatus: 'with_charger', seller: 'Shop TQ A-Ming', status: 'available', priceRmb: 4400, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 16.197,  profitVnd: 2.403, trackingCode: 'SF1428571021' },
  { importDate: '08/08/2026', id: '#122', serial: 'SN-ROG-G513-2022', name: 'Asus ROG Strix G513 2022 R7-6800H/16GB/512GB/RTX 3050Ti', location: 'wh', category: '2', conditionNote: 'Sẵn hàng kho tổng', chargerStatus: 'with_charger', seller: 'Guangzhou Tech', status: 'available', priceRmb: 3900, shippingRmb: 40, exchangeRate: 3550, importPriceVnd: 14.402,  profitVnd: 2.398, trackingCode: 'YT9081272022' },
  { importDate: '10/08/2026', id: '#123', serial: 'SN-SCAR-2022-3023', name: 'Asus ROG Strix Scar 15 2022 i7-12700H/16GB/512GB/RTX 3070Ti', location: 'store', category: '3', conditionNote: 'Đẹp nét zin test kĩ', chargerStatus: 'with_charger', seller: 'Shenzhen Digital', status: 'available', priceRmb: 5800, shippingRmb: 60, exchangeRate: 3550, importPriceVnd: 21.227,  profitVnd: 3.573, trackingCode: 'ZTO88773023' },
  { importDate: '11/08/2026', id: '#124', serial: 'SN-ZEP-G14-4024', name: 'Asus ROG Zephyrus G14 2022 R9-6900HS/16GB/1TB/RX 6800S 120Hz', location: 'store', category: '4', conditionNote: 'Bỏ qua do nguồn hàng không chuyển được', chargerStatus: 'with_charger', seller: 'Shop TQ Xiao', status: 'skipped', priceRmb: 4600, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 16.907,  profitVnd: 2.593, trackingCode: 'SF99814024' },
  { importDate: '12/08/2026', id: '#125', serial: 'SN-LEG5PRO-5025', name: 'Legion 5 Pro 2022 R7-6800H/32GB/1TB/RTX 3070 2.5K 165Hz', location: 'wh', category: '5', conditionNote: 'RAM 32GB dung lượng cao', chargerStatus: 'with_charger', seller: 'Shop TQ A-Ming', status: 'available', priceRmb: 5200, shippingRmb: 50, exchangeRate: 3550, importPriceVnd: 19.037,  profitVnd: 3.163, trackingCode: 'STO11225025' },
  { importDate: '13/08/2026', id: '#126', serial: 'SN-LEG5PRO-6026', name: 'Legion 5 Pro 2023 R9-7945HX/32GB/1TB/RTX 4070 2.5K 240Hz', location: 'store', category: '6', conditionNote: 'Cấu hình khủng nhất phân khúc', chargerStatus: 'with_charger', seller: 'Guangzhou Tech', status: 'available', priceRmb: 7500, shippingRmb: 70, exchangeRate: 3550, importPriceVnd: 27.352,  profitVnd: 4.148, trackingCode: 'SF88996026' },
  { importDate: '14/08/2026', id: '#127', serial: 'SN-SLIM7-7027', name: 'Legion Slim 7 2023 i7-13700H/16GB/1TB/RTX 4060 3.2K 165Hz', location: 'wh_cn', category: '7', conditionNote: 'Đang làm thủ tục hải quan nhập', chargerStatus: 'with_charger', seller: 'Beijing Digital', status: 'not_imported', priceRmb: 6200, shippingRmb: 60, exchangeRate: 3550, importPriceVnd: 22.647,  profitVnd: 3.553, trackingCode: 'ZTO99117027' },
  { importDate: '15/08/2026', id: '#128', serial: 'SN-TUF-8028', name: 'Asus TUF Gaming A15 2022 R7-6800H/16GB/512GB/RTX 3060 144Hz', location: 'store', category: '8', conditionNote: 'Hàng tuyển chọn đẹp keng', chargerStatus: 'with_charger', seller: 'Shop TQ A-Ming', status: 'available', priceRmb: 3800, shippingRmb: 40, exchangeRate: 3550, importPriceVnd: 14.047,  profitVnd: 2.453, trackingCode: 'SF11228028' },
  { importDate: '15/08/2026', id: '#129', serial: 'SN-ROG-G16-9029', name: 'Asus ROG Strix G16 2024 i7-14650HX/16GB/1TB/RTX 4060 FHD+', location: 'store', category: '9', conditionNote: 'Đời 2024 mới nhất fullbox', chargerStatus: 'with_charger', seller: 'Shenzhen Digital', status: 'available', priceRmb: 6300, shippingRmb: 60, exchangeRate: 3550, importPriceVnd: 23.002,  profitVnd: 3.798, trackingCode: 'YT88119029' },
  { importDate: '16/08/2026', id: '#130', serial: 'SN-NITRO5-1030', name: 'Acer Nitro 5 2022 i7-12700H/16GB/512GB/RTX 3060 FHD 165Hz', location: 'store', category: '10', conditionNote: 'Máy khỏe giá cực rẻ', chargerStatus: 'with_charger', seller: 'Beijing Digital', status: 'available', priceRmb: 3950, shippingRmb: 40, exchangeRate: 3550, importPriceVnd: 14.579,  profitVnd: 2.421, trackingCode: 'SF77661030' }
];

const initialOrders = [
  { id: 1001, createdDate: '02/08/2026', saleOnline: '1', laptopId: '#102', salePrice: 22.5, depositAmount: 0, depositNote: '', orderStatus: 'done', paymentStatus: 'paid', deliveryStatus: 'delivered', orderType: 'retail', paymentMethod: 'transfer_cash', shippingMethod: 'viettelpost', gifts: 'basic_gift', customerId: '', trackingCode: 'VT1001HV', shipDate: '03/08/2026', setupNote: 'Cài Win 11 Pro + Office', warranty: '12 tháng', laptopLocked: true },
  { id: 1002, createdDate: '05/08/2026', saleOnline: '2', laptopId: '#105', salePrice: 27.5, depositAmount: 0, depositNote: '', orderStatus: 'done', paymentStatus: 'paid', deliveryStatus: 'delivered', orderType: 'retail', paymentMethod: 'card', shippingMethod: 'direct_store', gifts: 'basic_gift', customerId: '', trackingCode: 'STORE-1002', shipDate: '05/08/2026', setupNote: 'Cài bộ Adobe Full', warranty: '12 tháng', laptopLocked: true },
  { id: 1003, createdDate: '08/08/2026', saleOnline: '3', laptopId: '#109', salePrice: 19.8, depositAmount: 0, depositNote: '', orderStatus: 'done', paymentStatus: 'paid', deliveryStatus: 'delivered', orderType: 'retail', paymentMethod: 'transfer_cash', shippingMethod: 'shopee_spx', gifts: 'basic_gift', customerId: '', trackingCode: 'SPX901003', shipDate: '09/08/2026', setupNote: 'Cài phím cơ bản', warranty: '12 tháng', laptopLocked: true },
  { id: 1004, createdDate: '10/08/2026', saleOnline: '4', laptopId: '#115', salePrice: 18.0, depositAmount: 0, depositNote: '', orderStatus: 'done', paymentStatus: 'paid', deliveryStatus: 'delivered', orderType: 'retail', paymentMethod: 'installment', shippingMethod: 'viettelpost', gifts: 'basic_gift', customerId: '', trackingCode: 'VT1004DN', shipDate: '11/08/2026', setupNote: 'Trả góp HomeCredit', warranty: '12 tháng', laptopLocked: true },
  { id: 1005, createdDate: '12/08/2026', saleOnline: '5', laptopId: '#103', salePrice: 18.5, depositAmount: 2.0, depositNote: 'Cọc 2tr VCB 12/08', orderStatus: 'deposited', paymentStatus: 'deposited', deliveryStatus: 'preparing', orderType: 'retail', paymentMethod: 'transfer_cash', shippingMethod: 'direct_store', gifts: 'basic_gift', customerId: '', trackingCode: '', shipDate: '', setupNote: 'Hẹn lấy máy thứ 7', warranty: '12 tháng', laptopLocked: false },
  { id: 1006, createdDate: '13/08/2026', saleOnline: '6', laptopId: '#110', salePrice: 21.5, depositAmount: 3.0, depositNote: 'Cọc 3tr Techcombank', orderStatus: 'deposited', paymentStatus: 'deposited', deliveryStatus: 'preparing', orderType: 'retail', paymentMethod: 'transfer_cash', shippingMethod: 'viettelpost', gifts: 'basic_gift', customerId: '', trackingCode: '', shipDate: '', setupNote: 'Chờ giao tận nơi', warranty: '12 tháng', laptopLocked: false },
  { id: 1007, createdDate: '14/08/2026', saleOnline: '7', laptopId: '#111', salePrice: 23.8, codAmount: 21.8, depositAmount: 2.0, depositNote: 'Cọc 2tr MB', orderStatus: 'shipping', paymentStatus: 'cod', deliveryStatus: 'shipped', orderType: 'retail', paymentMethod: 'transfer_cash', shippingMethod: 'viettelpost', gifts: 'basic_gift', customerId: '', trackingCode: 'VT1007HN', shipDate: '14/08/2026', setupNote: 'Đã gửi COD', warranty: '12 tháng', laptopLocked: true },
  { id: 1008, createdDate: '15/08/2026', saleOnline: '8', laptopId: '#112', salePrice: 25.9, codAmount: 23.9, depositAmount: 2.0, depositNote: 'Cọc 2tr BIDV', orderStatus: 'prepared', paymentStatus: 'deposited', deliveryStatus: 'preparing', orderType: 'retail', paymentMethod: 'transfer_cash', shippingMethod: 'hai_an', gifts: 'basic_gift', customerId: '', trackingCode: 'HA1008TH', shipDate: '15/08/2026', setupNote: 'Gửi nhà xe Hải An', warranty: '12 tháng', laptopLocked: false },
  { id: 1009, createdDate: '16/08/2026', saleOnline: '1', laptopId: '#114', salePrice: 24.5, depositAmount: 0, depositNote: '', orderStatus: 'new', paymentStatus: 'unpaid', deliveryStatus: 'preparing', orderType: 'retail', paymentMethod: 'transfer_cash', shippingMethod: 'direct_store', gifts: 'basic_gift', customerId: '', trackingCode: '', shipDate: '', setupNote: 'Tạo đơn chờ tư vấn', warranty: '12 tháng', laptopLocked: false },
  { id: 1010, createdDate: '16/08/2026', saleOnline: '2', laptopId: '#120', salePrice: 16.2, depositAmount: 0, depositNote: '', orderStatus: 'cancelled', paymentStatus: 'unpaid', deliveryStatus: 'returned', orderType: 'retail', paymentMethod: 'transfer_cash', shippingMethod: 'viettelpost', gifts: 'no_gift', customerId: '', trackingCode: '', shipDate: '', setupNote: 'Khách đổi ý hủy đơn', warranty: '12 tháng', laptopLocked: false }
];

export const InventoryProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const isAdmin = user?.role === 'ADMIN';

  const [laptops, setLaptops] = useState([]);
  const [orders, setOrders] = useState([]);
  const [warrantyCases, setWarrantyCases] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [cloudStatus, setCloudStatus] = useState('checking'); // 'checking', 'connected', 'error', 'disconnected'
  const ordersRef = React.useRef(orders);
  const orderMutationVersions = React.useRef(new Map());

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Fetch initial data from Cloud — chỉ lấy columns cần thiết (giảm ~30-40% payload)
  const [appOptions, setAppOptions] = useState(() => {
    return readLocalArray(LOCAL_KEYS.appOptions);
  });
  const appOptionsRef = React.useRef(appOptions);

  useEffect(() => {
    appOptionsRef.current = appOptions;
  }, [appOptions]);

  const updateAppOptions = useCallback(async () => {
    const opts = await fetchAppOptionsFromCloud();
    if (opts) {
      setAppOptions(opts);
      if (typeof window !== 'undefined') window.localStorage.setItem(LOCAL_KEYS.appOptions, JSON.stringify(opts));
    }
  }, []);

  const [formulaConfig, setFormulaConfig] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_FORMULA_CONFIG;
    const saved = window.localStorage.getItem(LOCAL_KEYS.formula);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return DEFAULT_FORMULA_CONFIG;
  });



  const updateFieldOptions = useCallback(async (groupKey, optionKey, newLabel) => {
    const response = await fetch('/api/options', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ group_key: groupKey, option_key: optionKey, label: newLabel })
    });
    if (!response.ok) return false;
    await updateAppOptions();
    return true;
  }, [updateAppOptions]);

  const resetFieldOptionsGroup = useCallback((groupKey) => {
    // Không dùng nữa, Settings.jsx đã lo
  }, []);

  const resetAllFieldOptions = useCallback(() => {
    // Không dùng nữa
  }, []);

  // Computed option arrays — reactive to appOptions changes
  const dynamicOptions = useMemo(() => ({
    STATUS_OPTIONS:             getOptions('laptopStatus', appOptions),
    LOCATION_OPTIONS:           getOptions('laptopLocation', appOptions),
    CHARGER_OPTIONS:            getOptions('chargerStatus', appOptions),
    COMPONENT_STATUS_OPTIONS:   getOptions('componentStatus', appOptions),
    SALE_ONLINE_OPTIONS:        getOptionLabels('saleOnline', appOptions),
    SALE_OFFLINE_OPTIONS:       getOptionLabels('saleOffline', appOptions),
    SHIPPING_METHOD_OPTIONS:    getOptionLabels('shippingMethod', appOptions),
    ORDER_STATUS_OPTIONS:       getOptionLabels('orderStatus', appOptions),
    PAYMENT_STATUS_OPTIONS:     getOptionLabels('paymentStatus', appOptions),
    DELIVERY_STATUS_OPTIONS:    getOptionLabels('deliveryStatus', appOptions),
    GIFT_OPTIONS:               getOptionLabels('giftOptions', appOptions),
    ORDER_TYPES:                getOptionLabels('orderType', appOptions),
    PAYMENT_METHODS:            getOptionLabels('paymentMethod', appOptions),
    WARRANTY_CASE_STATUS_OPTIONS: getOptions('warrantyCaseStatus', appOptions),
    SELLER_OPTIONS:             getOptions('seller', appOptions),
    CATEGORY_OPTIONS:           getOptions('category', appOptions),
  }), [appOptions]);

  // Quản lý Kỳ/Tháng làm việc
  const now = new Date();
  const currentMonthStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (typeof window === 'undefined') return currentMonthStr;
    return window.localStorage.getItem(LOCAL_KEYS.selectedMonth) || currentMonthStr;
  });
  const [knownMonths, setKnownMonths] = useState(() => [currentMonthStr]);

  useEffect(() => {
    if (selectedMonth) {
      localStorage.setItem(LOCAL_KEYS.selectedMonth, selectedMonth);
    }
  }, [selectedMonth]);

  useEffect(() => {
    // KHÔNG fetch nếu: chưa login, hoặc đang ở màn login
    // Chỉ tải dữ liệu khi đã có user. Không dựa vào pathname vì router có thể
    // vẫn đang ở /login trong lúc chuyển hướng sau đăng nhập.
    if (!userId) {
      return;
    }

    let unsubscribe = () => {};
    let cancelled = false;
    const monthQuery = selectedMonth === 'ALL'
      ? { all: true }
      : { monthKey: selectedMonth };
    const loadCloudData = async () => {
      setCloudStatus('checking');
      const { url, anonKey } = getSupabaseCredentials();
      if (!url || !anonKey) {
        setCloudStatus('disconnected');
        return;
      }

      // Kiểm tra session Supabase trực tiếp — prevents leak khi logout
      const client = getSupabaseClient();
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (!session || cancelled) return;
      }

      const safeFetch = (fn) => fn().catch(() => null);
      const [cloudLaptops, cloudOrders, cloudWarranty, cloudStock, cloudCustomers, cloudSettings, cloudOptions, cloudPayments] = await Promise.all([
        safeFetch(() => fetchLaptopsFromCloud(monthQuery)),
        safeFetch(() => fetchOrdersFromCloud(monthQuery)),
        safeFetch(() => fetchWarrantyCasesFromCloud()),
        safeFetch(() => fetchStockMovementsFromCloud()),
        safeFetch(() => fetchCustomersFromCloud()),
        safeFetch(() => fetchAllSettings()),
        safeFetch(() => fetchAppOptionsFromCloud()),
        safeFetch(() => fetchPaymentsFromCloud())
      ]);

      if (cancelled) return;

      const observedMonths = [
        ...(Array.isArray(cloudLaptops) ? cloudLaptops.map(laptop => laptop.monthKey || parseMonthYear(laptop.importDate, laptop.created_at || laptop.createdAt)) : []),
        ...(Array.isArray(cloudOrders) ? cloudOrders.map(order => order.monthKey || parseMonthYear(order.createdDate, order.created_at || order.createdAt)) : []),
        selectedMonth !== 'ALL' ? selectedMonth : null
      ].filter(Boolean);
      setKnownMonths(prev => {
        const next = Array.from(new Set([...prev, ...observedMonths]));
        return next.length === prev.length ? prev : next;
      });

      if (cloudLaptops === null && cloudOrders === null) {
        setCloudStatus('error');
      } else {
        setCloudStatus('connected');
        if (cloudLaptops !== null) setLaptops(cloudLaptops);
        if (cloudOrders !== null) setOrders(cloudOrders);
        if (cloudWarranty !== null) setWarrantyCases(cloudWarranty);
        if (cloudStock !== null) setStockMovements(cloudStock);
        if (cloudCustomers !== null) setCustomers(cloudCustomers);
        if (cloudPayments !== null) setPayments(cloudPayments);

        // Load options từ bảng app_options
        if (cloudOptions && Array.isArray(cloudOptions)) {
          setAppOptions(cloudOptions);
          localStorage.setItem(LOCAL_KEYS.appOptions, JSON.stringify(cloudOptions));
        }

        if (cloudSettings) {
          if (cloudSettings.formula) {
            setFormulaConfig(prev => JSON.stringify(prev) === JSON.stringify(cloudSettings.formula) ? prev : cloudSettings.formula);
            localStorage.setItem(LOCAL_KEYS.formula, JSON.stringify(cloudSettings.formula));
          }
        }

        // Đối soát: phát hiện máy bị gán vào nhiều đơn đã chốt (dữ liệu lịch sử lỗi)
        if (cloudOrders !== null) {
          const committedByLaptop = new Map();
          cloudOrders.forEach(order => {
            if (!order.laptopId || !isOrderCommitted(order, appOptionsRef.current)) return;
            const list = committedByLaptop.get(order.laptopId) || [];
            list.push(order.id);
            committedByLaptop.set(order.laptopId, list);
          });
          const conflicts = [...committedByLaptop.entries()].filter(([, ids]) => ids.length > 1);
          if (conflicts.length > 0) {
            console.warn('⚠️ Đối soát: máy đang thuộc nhiều đơn đã chốt — cần kiểm tra lại dữ liệu:', conflicts);
          }
        }
      }
    };

    loadCloudData();
    const refreshIntervalId = window.setInterval(loadCloudData, 60 * 1000);

    // Realtime: patch trực tiếp từ payload thay vì refetch toàn bộ
    // Cross-fetch (laptop↔orders) cần throttle để tránh chain reaction
    let lastCrossFetchLaptop = 0;
    let lastCrossFetchOrder = 0;
    const CROSS_FETCH_THROTTLE_MS = 3000;

    const handleRealtimeLaptop = (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload;
      if (eventType === 'INSERT' && newRow) {
        const mapped = newRow;
        setLaptops(prev => {
          if (prev.some(l => l.id == mapped.id)) return prev;
          return [mapped, ...prev];
        });
      } else if (eventType === 'UPDATE' && newRow) {
        const mapped = newRow;
        setLaptops(prev => prev.map(l => l.id == mapped.id ? mapped : l));
      } else if (eventType === 'DELETE' && oldRow) {
        setLaptops(prev => prev.filter(l => l.id !== oldRow.id));
      }
      // Laptop thay đổi → reconcile status cần orders mới nhất (throttle)
      const now = Date.now();
      if (now - lastCrossFetchLaptop > CROSS_FETCH_THROTTLE_MS) {
        lastCrossFetchLaptop = now;
        fetchOrdersFromCloud(monthQuery).then(d => { if (d && !cancelled) setOrders(d); });
      }
    };

    const handleRealtimeOrder = (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload;
      if (eventType === 'INSERT' && newRow) {
        const mapped = newRow;
        setOrders(prev => {
          if (prev.some(o => o.id == mapped.id)) return prev;
          return [mapped, ...prev];
        });
      } else if (eventType === 'UPDATE' && newRow) {
        const mapped = newRow;
        setOrders(prev => prev.map(o => o.id == mapped.id ? mapped : o));
      } else if (eventType === 'DELETE' && oldRow) {
        setOrders(prev => prev.filter(o => o.id !== oldRow.id));
      }
      // Order thay đổi → reconcile laptop status (throttle)
      const now = Date.now();
      if (now - lastCrossFetchOrder > CROSS_FETCH_THROTTLE_MS) {
        lastCrossFetchOrder = now;
        fetchLaptopsFromCloud(monthQuery).then(d => {
          if (d && !cancelled) setLaptops(reconcileLaptopStatuses(d, ordersRef.current, selectedMonth));
        });
      }
    };

    unsubscribe = subscribeRealtimeChanges(
      handleRealtimeLaptop,
      handleRealtimeOrder,
      () => fetchWarrantyCasesFromCloud().then(d => d !== null && setWarrantyCases(d)),
      () => {
        fetchAllSettings().then(settings => {
          if (!settings) return;
          if (settings.formula) {
            setFormulaConfig(prev => JSON.stringify(prev) === JSON.stringify(settings.formula) ? prev : settings.formula);
            localStorage.setItem(LOCAL_KEYS.formula, JSON.stringify(settings.formula));
          }
        });

        fetchAppOptionsFromCloud().then(opts => {
          if (opts && Array.isArray(opts)) {
            setAppOptions(prev => JSON.stringify(prev) === JSON.stringify(opts) ? prev : opts);
            localStorage.setItem('citilap_app_options_v1', JSON.stringify(opts));
          }
        });
      }
    );

    return () => { cancelled = true; window.clearInterval(refreshIntervalId); unsubscribe(); };
  }, [userId, selectedMonth]);

  // Discover historical periods independently of the currently filtered dataset.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getAuthHeaders().then(headers => fetch('/api/months', { headers }))
      .then(response => response.ok ? response.json() : [])
      .then(months => {
        if (!cancelled && Array.isArray(months)) {
          setKnownMonths(prev => [...new Set([...prev, ...months])]);
        }
      }).catch(error => console.error('Không thể tải danh sách tháng:', error));
    return () => { cancelled = true; };
  }, [userId]);

  // Trích xuất danh sách tất cả các tháng có dữ liệu
  const availableMonths = useMemo(() => {
    const monthSet = new Set(knownMonths);
    monthSet.add(currentMonthStr);
    if (selectedMonth && selectedMonth !== 'ALL') monthSet.add(selectedMonth);

    laptops.forEach(l => {
      const m = l.monthKey || parseMonthYear(l.importDate, l.created_at || l.createdAt);
      if (m) monthSet.add(m);
    });

    orders.forEach(o => {
      const m = o.monthKey || parseMonthYear(o.createdDate, o.created_at || o.createdAt);
      if (m) monthSet.add(m);
    });

    // Sắp xếp các tháng giảm dần (Mới nhất lên đầu)
    const sorted = Array.from(monthSet).sort((a, b) => monthYearToKey(b) - monthYearToKey(a));
    return sorted;
  }, [knownMonths, laptops, orders, selectedMonth, currentMonthStr]);

  const filteredLaptops = useMemo(() => {
    return filterLaptopsByMonth(laptops, selectedMonth);
  }, [laptops, selectedMonth]);

  const filteredOrders = useMemo(() => {
    return filterOrdersByMonth(orders, selectedMonth);
  }, [orders, selectedMonth]);

  // ─── View data: lọc sensitive fields theo role (chỉ dùng cho UI) ─────
  const viewLaptops = useMemo(() => {
    return isAdmin ? laptops : filterSensitiveFields(laptops, SENSITIVE_LAPTOP_KEYS);
  }, [laptops, isAdmin]);

  const viewFilteredLaptops = useMemo(() => {
    return isAdmin ? filteredLaptops : filterSensitiveFields(filteredLaptops, SENSITIVE_LAPTOP_KEYS);
  }, [filteredLaptops, isAdmin]);

  const viewFilteredOrders = useMemo(() => {
    return isAdmin ? filteredOrders : filterSensitiveFields(filteredOrders, SENSITIVE_ORDER_KEYS);
  }, [filteredOrders, isAdmin]);

  useEffect(() => {
    localStorage.setItem(LOCAL_KEYS.formula, JSON.stringify(formulaConfig));
  }, [formulaConfig]);

  const applyAndSaveLaptopStatuses = useCallback((nextOrders, persist = true) => {
    setLaptops(prev => {
      const nextLaptops = reconcileLaptopStatuses(prev, nextOrders, selectedMonth);
      if (persist) {
        nextLaptops.forEach((nextLaptop, idx) => {
          const prevLaptop = prev[idx];
          if (prevLaptop && prevLaptop.id === nextLaptop.id && !nextLaptop.isLocked
            && (prevLaptop.status !== nextLaptop.status || prevLaptop.isLocked !== nextLaptop.isLocked)) {
            // Chỉ gửi các trường trạng thái. Gửi toàn bộ laptop ở đây có thể
            // vô tình kèm giá đã làm tròn trên client và bị API chặn đối với
            // máy đã bán/khóa, dù mục đích chỉ là đồng bộ trạng thái.
            void saveLaptopToCloud({
              id: nextLaptop.id,
              status: nextLaptop.status,
              isLocked: nextLaptop.isLocked,
            }).catch(error => console.error('Không thể đồng bộ trạng thái máy:', error));
          }
        });
      }
      return nextLaptops;
    });
  }, [selectedMonth]);

  // Khi mở lại ứng dụng, chỉ đối soát trạng thái trên client. Laptops và orders
  // được tải song song nên không được ghi ngược lên server trong lượt đầu: nếu
  // orders chưa về, máy đã bán có thể tạm bị hiểu nhầm là không còn đơn liên kết.
  // Tác vụ định kỳ sau đó mới lưu thay đổi thực sự (ví dụ hết hạn giữ máy).
  useEffect(() => {
    const initialReconcileId = window.setTimeout(
      () => applyAndSaveLaptopStatuses(orders, false),
      0
    );
    const intervalId = window.setInterval(
      () => applyAndSaveLaptopStatuses(orders, true),
      60 * 60 * 1000
    );
    return () => {
      window.clearTimeout(initialReconcileId);
      window.clearInterval(intervalId);
    };
  }, [orders, applyAndSaveLaptopStatuses]);

  const addStockMovement = (entry) => {
    const newEntry = {
      id: createLocalId('STOCK'),
      createdAt: new Date().toISOString(),
      ...entry
    };
    setStockMovements(prev => [newEntry, ...prev].slice(0, 1000));
    void saveStockMovementToCloud(newEntry).catch(error => console.error('Không thể lưu lịch sử kho:', error));
  };

  const recordPayment = async (paymentData) => {
    try {
      const result = await savePaymentToCloud(paymentData);
      if (result?.payment) setPayments(prev => [result.payment, ...prev]);
      if (result?.order) {
        setOrders(prev => prev.map(order => String(order.id) === String(result.order.id) ? result.order : order));
      }
      if (result?.laptop) {
        setLaptops(prev => prev.map(laptop => String(laptop.id) === String(result.laptop.id) ? result.laptop : laptop));
      }
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, message: error.message || 'Không thể ghi nhận thanh toán.' };
    }
  };

  const getLaptopAssignmentError = (laptopId, currentOrderId = null) => {
    if (!laptopId) return '';
    const laptop = laptops.find(l => String(l.id) === String(laptopId));
    if (!laptop) return 'Không tìm thấy máy trong kho.';
    const statusKey = labelToKey('laptopStatus', laptop.status, _cfg());
    if (TECHNICAL_LAPTOP_STATUS_KEYS.includes(statusKey)) return `Máy ${laptopId} đang ở trạng thái “${getLabel('laptopStatus', statusKey)}”.`;

    const blockingOrder = orders.find(order => (
      String(order.id) !== String(currentOrderId) &&
      String(order.laptopId) === String(laptopId) &&
      (isOrderCommitted(order, appOptions) || isReservationActive(order, appOptions))
    ));
    if (blockingOrder) return `Máy ${laptopId} đang thuộc đơn #${blockingOrder.id}.`;
    const currentOrder = currentOrderId
      ? orders.find(order => String(order.id) === String(currentOrderId))
      : null;
    const belongsToCurrentOrder = currentOrder && String(currentOrder.laptopId) === String(laptopId);
    if (statusKey === 'sold' && !belongsToCurrentOrder) return `Máy ${laptopId} đã được bán.`;
    // A stale laptop status can remain "deposited" after legacy deposit rows
    // were moved to requestedLaptopId. With no active order physically using
    // laptopId, allow allocation and let reconciliation refresh the status.
    return '';
  };

  const getSelectableLaptops = (currentOrderId = null) => filterLaptopsByMonth(laptops, selectedMonth).filter(laptop => (
    laptop.id == orders.find(order => String(order.id) === String(currentOrderId))?.laptopId ||
    !getLaptopAssignmentError(laptop.id, currentOrderId)
  ));

  // A deposit can reference a machine already referenced by another deposit.
  // It becomes an exclusive allocation only after laptopId is assigned.
  const getDepositReferenceLaptops = (currentRequestedId = null) => filterLaptopsByMonth(laptops, selectedMonth)
    .filter(laptop => laptop.isActive !== false
      && (labelToKey('laptopStatus', laptop.status, _cfg()) !== 'sold'
        || String(laptop.id) === String(currentRequestedId)));

  // Bất biến tiền tệ: amountPaid >= depositAmount; debtAmount = salePrice - amountPaid.
  // Chỉ tính lại khi các trường tiền tệ thay đổi, tránh ghi đè giá trị thủ công hợp lệ.
  const MONEY_FIELDS = ['salePrice', 'depositAmount', 'amountPaid', 'debtAmount'];
  const normalizeMoney = (order) => {
    const salePrice = parseFlexibleFloat(order.salePrice);
    const depositAmount = Math.min(salePrice, Math.max(parseFlexibleFloat(order.depositAmount), 0));
    const amountPaid = Math.min(salePrice, Math.max(parseFlexibleFloat(order.amountPaid), depositAmount));
    const debtAmount = Math.max(0, salePrice - amountPaid);
    const codAmount = Math.min(debtAmount, Math.max(parseFlexibleFloat(order.codAmount), 0));
    return { ...order, salePrice, depositAmount, amountPaid, debtAmount, codAmount };
  };

  const normalizeOrderNumbers = (fields) => {
    const numericFields = ['salePrice', 'depositAmount', 'codAmount', 'amountPaid', 'debtAmount', 'creditCardFee'];
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => (
      numericFields.includes(key) ? [key, parseFlexibleFloat(value)] : [key, value]
    )));
  };

  const normalizeReservation = (order) => {
    const normalized = { ...order };
    const pKey = labelToKey('paymentStatus', normalized.paymentStatus, _cfg());
    const oKey = labelToKey('orderStatus', normalized.orderStatus, _cfg());
    const reservationTarget = normalized.laptopId || normalized.requestedLaptopId;
    const shouldReserve = reservationTarget && (
      pKey === 'deposited' || oKey === 'deposited'
    );
    if (shouldReserve && !normalized.reservationExpiresAt) {
      normalized.reservationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    }
    if (shouldReserve && oKey === 'new') {
      normalized.orderStatus = 'deposited';
    }
    return normalized;
  };

  const applyOrderList = (nextOrders) => {
    setOrders(nextOrders);
    applyAndSaveLaptopStatuses(nextOrders);
  };

  // Tạo đơn không khóa máy khi mới tạo. Máy chỉ chuyển sang giữ chỗ khi có cọc.

const mapLabelsToKeys = (fields, appOpts) => {
  const result = { ...fields };
  const mapping = {
    orderStatus: 'orderStatus',
    paymentStatus: 'paymentStatus',
    deliveryStatus: 'deliveryStatus',
    orderType: 'orderType',
    shippingMethod: 'shippingMethod',
    paymentMethod: 'paymentMethod',
    saleOnline: 'saleOnline',
    saleOffline: 'saleOffline',
    gifts: 'giftOptions'
  };
  for (const [field, group] of Object.entries(mapping)) {
    if (result[field]) {
      result[field] = labelToKey(group, result[field], appOpts) || result[field];
    }
  }
  return result;
};

  const addOrder = async (rawOrderData) => {
    const orderData = mapLabelsToKeys(rawOrderData, appOptions);

    const normalizedInput = normalizeMoney(normalizeOrderNumbers(orderData));
    const depositAmount = normalizedInput.depositAmount;
    const amountPaid = normalizedInput.amountPaid;
    const selectedCustomer = customers.find(customer => String(customer.id) === String(orderData.customerId));
    const customerSummary = selectedCustomer
      ? [selectedCustomer.name, selectedCustomer.phone].filter(Boolean).join(' - ')
      : '';
    const depositIntent = DEPOSIT_ORDER_STATUS_KEYS.includes(labelToKey('orderStatus', orderData.orderStatus, _cfg()))
      || DEPOSIT_PAYMENT_STATUS_KEYS.includes(labelToKey('paymentStatus', orderData.paymentStatus, _cfg()));
    const requestedLaptopId = orderData.requestedLaptopId || (depositIntent ? orderData.laptopId : '');
    const newOrder = normalizeReservation({
      monthKey: orderData.monthKey || (selectedMonth === 'ALL' ? parseMonthYear(orderData.createdDate || todayVi()) : selectedMonth),
      id: orderData.id,
      createdDate: orderData.createdDate || todayVi(),
      saleOnline: labelToKey('saleOnline', orderData.saleOnline, _cfg()) || orderData.saleOnline || '',
      saleOffline: labelToKey('saleOffline', orderData.saleOffline, _cfg()) || orderData.saleOffline || '',
      note: [orderData.note, orderData.customerNote, orderData.note1, orderData.note2].filter(Boolean).join(' - '),
      shippingMethod: orderData.shippingMethod || 'viettelpost',
      orderStatus: orderData.orderStatus || 'new',
      paymentStatus: orderData.paymentStatus || 'unpaid',
      deliveryStatus: orderData.deliveryStatus || 'preparing',
      laptopId: depositIntent && !orderData.requestedLaptopId ? '' : (orderData.laptopId || ''),
      requestedLaptopId,
      salePrice: normalizedInput.salePrice || 0,
      depositAmount,
      depositNote: orderData.depositNote || '',
      reservationExpiresAt: orderData.reservationExpiresAt || '',
      codAmount: normalizedInput.codAmount || 0,
      setupNote: orderData.setupNote || 'Cài cơ bản',
      warranty: orderData.warranty || '6 tháng',
      gifts: orderData.gifts || 'basic_gift',
      branchId: orderData.branchId || null,
      giftPreset: orderData.giftPreset || '',
      giftAccessoryIds: Array.isArray(orderData.giftAccessoryIds) ? orderData.giftAccessoryIds : [],
      customerInfo: orderData.customerInfo || customerSummary,
      customerAddress: orderData.customerAddress || selectedCustomer?.address || '',
      customerId: orderData.customerId || null,
      trackingCode: orderData.trackingCode || '',
      shipDate: orderData.shipDate || '',
      orderType: orderData.orderType || 'retail',
      paymentMethod: orderData.paymentMethod || 'transfer_cash',
      amountPaid,
      debtAmount: normalizedInput.debtAmount || 0,
      tradeInLaptopId: orderData.tradeInLaptopId || '',
      creditCardFee: normalizedInput.creditCardFee || 0,
      laptopLocked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (isOrderCommitted(newOrder, appOptions) && !newOrder.laptopId && newOrder.requestedLaptopId) {
      newOrder.laptopId = newOrder.requestedLaptopId;
    }
    const assignmentError = getLaptopAssignmentError(newOrder.laptopId);
    if (assignmentError) return { ok: false, message: assignmentError };
    if (isOrderCommitted(newOrder, appOptions) && !newOrder.laptopId) {
      return { ok: false, message: 'Phải gán máy trước khi chuyển sang giao hàng/hoàn thành.' };
    }

    // Tính profit_vnd = salePrice - giá nhập máy liên kết
    if (newOrder.laptopId && newOrder.salePrice > 0) {
      const linkedLaptop = laptops.find(l => l.id == newOrder.laptopId);
      if (linkedLaptop && linkedLaptop.importPriceVnd > 0) {
        newOrder.profitVnd = parseFloat((newOrder.salePrice - linkedLaptop.importPriceVnd).toFixed(2));
      }
    }

    // Omit ID to let DB generate BIGINT IDENTITY
    if (!orderData.id) {
      newOrder.id = undefined;
    }
    let savedData;
    try {
      savedData = await saveOrderToCloud(newOrder);
    } catch (error) {
      return { ok: false, message: error.message || 'Không thể lưu đơn hàng lên cloud.' };
    }
    if (!savedData) return { ok: false, message: 'Lỗi khi lưu lên cơ sở dữ liệu. Dữ liệu chưa được cập nhật.' };
    const persistedOrder = savedData.order || savedData;
    Object.assign(newOrder, persistedOrder);
    newOrder.id = persistedOrder.id;

    const nextOrders = [newOrder, ...orders];
    setOrders(nextOrders);
    if (savedData.inventoryApplied && savedData.laptop) {
      setLaptops(prev => prev.map(laptop => String(laptop.id) === String(savedData.laptop.id) ? savedData.laptop : laptop));
    } else {
      applyAndSaveLaptopStatuses(nextOrders);
    }

    if (Array.isArray(savedData.payments) && savedData.payments.length > 0) {
      setPayments(prev => [
        ...savedData.payments,
        ...prev.filter(payment => !savedData.payments.some(item => String(item.id) === String(payment.id)))
      ]);
    }

    if (newOrder.laptopId && !savedData.inventoryApplied) {
      addStockMovement({ laptopId: newOrder.laptopId, orderId: newOrder.id, type: isReservationActive(newOrder, appOptions) ? 'GIỮ MÁY' : 'GÁN VÀO ĐƠN', note: `Đơn #${newOrder.id}` });
    }
    return { ok: true, order: newOrder };
  };

  const updateOrder = (id, rawUpdatedFields, { awaitPersistence = false } = {}) => {
    const updatedFields = mapLabelsToKeys(rawUpdatedFields, appOptions);
    const currentOrder = orders.find(order => String(order.id) === String(id));
    if (!currentOrder) return { ok: false, message: 'Không tìm thấy đơn hàng.' };
    const normalizedFields = normalizeOrderNumbers(updatedFields);
    const moneyChanged = MONEY_FIELDS.some(field => field in normalizedFields)
      || 'paymentStatus' in normalizedFields;
    let merged = normalizeReservation({ ...currentOrder, ...normalizedFields, updatedAt: new Date().toISOString() });
    if (moneyChanged) merged = normalizeMoney(merged);

    // Moving a committed order back to a deposit releases the physical unit.
    // Preserve the requested product so the order still records what was
    // deposited, while laptopId becomes available for another order.
    const physicalLaptopToRelease = merged.laptopId || currentOrder.laptopId;
    const releasingPhysicalLaptop = isOrderCommitted(currentOrder, appOptions)
      && !isOrderCommitted(merged, appOptions)
      && physicalLaptopToRelease;
    if (releasingPhysicalLaptop) {
      merged.requestedLaptopId = merged.requestedLaptopId || physicalLaptopToRelease;
      merged.laptopId = '';
      merged.laptopLocked = false;
    }

    // Converting a deposit into a committed order allocates the requested
    // machine. The normal laptop conflict check below then makes this atomic.
    if (isOrderCommitted(merged, appOptions) && !merged.laptopId && merged.requestedLaptopId) {
      merged.laptopId = merged.requestedLaptopId;
    }

    const isLocked = isOrderCommitted(currentOrder, appOptions) || isOrderCancelled(currentOrder, appOptions);
    if (isLocked && !releasingPhysicalLaptop && merged.laptopId !== currentOrder.laptopId) {
      return { ok: false, message: 'Đơn hàng đang ở trạng thái không cho phép thay đổi sản phẩm.' };
    }
    if (merged.laptopId !== currentOrder.laptopId) {
      const assignmentError = getLaptopAssignmentError(merged.laptopId, id);
      if (assignmentError) return { ok: false, message: assignmentError };
    }
    if (isOrderCommitted(merged, appOptions) && !merged.laptopId) {
      return { ok: false, message: 'Phải gán máy trước khi chuyển sang giao hàng/hoàn thành.' };
    }

    // Tính lại profit_vnd khi salePrice hoặc laptopId thay đổi
    if ('salePrice' in normalizedFields || 'laptopId' in normalizedFields) {
      if (merged.laptopId && merged.salePrice > 0) {
        const linkedLaptop = laptops.find(l => l.id == merged.laptopId);
        if (linkedLaptop && linkedLaptop.importPriceVnd > 0) {
          merged.profitVnd = parseFloat((merged.salePrice - linkedLaptop.importPriceVnd).toFixed(2));
        }
      } else {
        merged.profitVnd = 0;
      }
    }

    // Optimistic update với version guard chống race condition
    const orderKey = String(id);
    const mutationVersion = (orderMutationVersions.current.get(orderKey) || 0) + 1;
    orderMutationVersions.current.set(orderKey, mutationVersion);
    const isLatestMutation = () => orderMutationVersions.current.get(orderKey) === mutationVersion;

    const nextOrders = orders.map(order => String(order.id) === String(id) ? merged : order);
    setOrders(nextOrders);
    applyAndSaveLaptopStatuses(nextOrders, false);
    if (releasingPhysicalLaptop) {
      setLaptops(prev => prev.map(laptop => String(laptop.id) === String(physicalLaptopToRelease)
        ? { ...laptop, status: merged.requestedLaptopId ? 'deposited' : 'available', isLocked: false }
        : laptop));
    }

    const persistence = saveOrderToCloud(merged).then(savedData => {
      if (!isLatestMutation()) return; // Có mutation mới hơn, bỏ qua response cũ
      const persistedOrder = savedData?.order || savedData;
      setOrders(prev => prev.map(order => String(order.id) === String(id) ? persistedOrder : order));
      setLaptops(prev => {
        let next = prev;
        if (savedData?.previousLaptop) {
          next = next.map(laptop => String(laptop.id) === String(savedData.previousLaptop.id) ? savedData.previousLaptop : laptop);
        }
        if (savedData?.laptop) {
          next = next.map(laptop => String(laptop.id) === String(savedData.laptop.id) ? savedData.laptop : laptop);
        }
        if (releasingPhysicalLaptop) {
          next = next.map(laptop => String(laptop.id) === String(physicalLaptopToRelease)
            ? { ...laptop, status: merged.requestedLaptopId ? 'deposited' : 'available', isLocked: false }
            : laptop);
        }
        return next;
      });
      return { ok: true, order: persistedOrder };
    }).catch(error => {
      if (!isLatestMutation()) return; // Có mutation mới hơn, không rollback đè
      setOrders(prev => prev.map(order => String(order.id) === String(id) ? currentOrder : order));
      applyAndSaveLaptopStatuses(orders, false);
      const message = error?.message || 'Không thể cập nhật đơn hàng.';
      if (!awaitPersistence) {
        // Lazy import to avoid circular dependency
        import('react-hot-toast').then(mod => mod.default.error(message));
      }
      return { ok: false, message };
    });
    return awaitPersistence ? persistence : { ok: true, order: merged };
  };

  // Giữ lịch sử đơn để sau này đối soát, thay cho xóa cứng.
  const cancelOrder = (id, reason = 'Hủy từ danh sách đơn hàng') => {
    const result = updateOrder(id, {
      orderStatus: 'cancelled',
      deliveryStatus: 'returned',
      cancelReason: reason,
      cancelledAt: new Date().toISOString()
    });
    return result;
  };

  const deleteOrder = (id) => cancelOrder(id);

  // Cập nhật công thức
  const updateFormulaConfig = async (newConfig, recalculateAll = false) => {
    const previousConfig = formulaConfig;
    try {
      await saveSetting('formula', newConfig);
    } catch (error) {
      return { ok: false, message: error.message || 'Không thể lưu công thức.' };
    }
    setFormulaConfig(newConfig);
    if (recalculateAll) {
      let recalculated;
      setLaptops(prev => {
        recalculated = prev.map(laptop => {
          const imp = computeImportPrice(laptop.priceRmb, laptop.shippingRmb, laptop.exchangeRate, newConfig);
          const prof = computeProfit(laptop.retailPriceVnd, laptop.wholesalePriceVnd, imp, laptop.customProfit);
          return { ...laptop, importPriceVnd: imp, profitVnd: prof };
        });
        return recalculated;
      });
      // Persist to cloud outside setState updater to avoid fire-and-forget inside reducer
      if (recalculated) {
        void Promise.all(recalculated
          .filter(laptop => !laptop.isLocked)
          .map(laptop => saveLaptopToCloud(laptop)))
          .catch(error => {
            setFormulaConfig(previousConfig);
            console.error('Không thể lưu lại giá nhập sau khi đổi công thức:', error);
          });
      }
    }
    return { ok: true, config: newConfig };
  };

  // Cập nhật từng laptop
  const updateLaptop = (id, updatedFields) => {
    const currentLaptop = laptops.find(laptop => laptop.id == id);
    if (!currentLaptop) return { ok: false, message: 'Không tìm thấy máy.' };
    const lockedProtectedFields = ['priceRmb', 'shippingRmb', 'exchangeRate', 'importPriceVnd', 'wholesalePriceVnd', 'retailPriceVnd'];
    const currentStatusKey = labelToKey('laptopStatus', currentLaptop.status);
    if (currentStatusKey === 'sold' && ['name', 'serial'].some(field => (
      updatedFields[field] !== undefined
      && String(updatedFields[field] ?? '').trim() !== String(currentLaptop[field] ?? '').trim()
    ))) {
      return { ok: false, message: 'Laptop đã bán không thể thay đổi tên máy hoặc số serial.' };
    }
    if ((currentLaptop.isLocked || currentStatusKey === 'sold') && lockedProtectedFields.some(field => (
      updatedFields[field] !== undefined && Number(updatedFields[field]) !== Number(currentLaptop[field])
    ))) {
      return { ok: false, message: `Không thể thay đổi giá trên laptop đã khóa (${currentLaptop.status}). Chỉ có thể sửa số serial và tên.` };
    }
    const serial = String(updatedFields.serial ?? currentLaptop.serial ?? '').trim();
    const duplicatedSerial = serial && laptops.some(laptop => laptop.id !== id && String(laptop.serial || '').trim().toLowerCase() === serial.toLowerCase());
    if (duplicatedSerial) return { ok: false, message: `Serial ${serial} đã tồn tại ở một máy khác.` };

    const merged = { ...currentLaptop, ...updatedFields, serial, updatedAt: new Date().toISOString() };
    const explicitImportPrice = updatedFields.importPriceVnd !== undefined && updatedFields.importPriceVnd !== ''
      ? parseFlexibleFloat(updatedFields.importPriceVnd)
      : null;
    const importPriceVnd = explicitImportPrice ?? computeImportPrice(merged.priceRmb, merged.shippingRmb, merged.exchangeRate, formulaConfig);
    const explicitWholesalePrice = updatedFields.wholesalePriceVnd !== undefined && updatedFields.wholesalePriceVnd !== ''
      ? parseFlexibleFloat(updatedFields.wholesalePriceVnd)
      : parseFlexibleFloat(merged.wholesalePriceVnd);
    const explicitRetailPrice = updatedFields.retailPriceVnd !== undefined && updatedFields.retailPriceVnd !== ''
      ? parseFlexibleFloat(updatedFields.retailPriceVnd)
      : parseFlexibleFloat(merged.retailPriceVnd);
    const profitVnd = computeProfit(explicitRetailPrice, explicitWholesalePrice, importPriceVnd, merged.customProfit);
    const finalLaptop = {
      ...merged,
      importPriceVnd,
      profitVnd,
      wholesalePriceVnd: explicitWholesalePrice,
      retailPriceVnd: explicitRetailPrice
    };
    
    // Optimistic update
    setLaptops(prev => prev.map(laptop => laptop.id == id ? finalLaptop : laptop));
    
    // Fire and forget cloud save
    void saveLaptopToCloud(finalLaptop).catch(error => {
      setLaptops(prev => prev.map(laptop => laptop.id == id ? currentLaptop : laptop));
      console.error('Không thể đồng bộ máy:', error);
    });

    // Tự động tính lại profit_vnd cho tất cả đơn hàng liên kết khi giá nhập thay đổi
    if (importPriceVnd !== currentLaptop.importPriceVnd) {
      setOrders(prevOrders => {
        const affectedOrders = prevOrders.filter(o => String(o.laptopId) === String(id) && o.isActive && o.salePrice > 0);
        if (affectedOrders.length === 0) return prevOrders;
        return prevOrders.map(o => {
          if (String(o.laptopId) !== String(id) || !o.isActive || o.salePrice <= 0) return o;
          const newProfitVnd = parseFloat((o.salePrice - finalLaptop.importPriceVnd).toFixed(2));
          if (newProfitVnd === o.profitVnd) return o;
          void saveOrderToCloud({ ...o, profitVnd: newProfitVnd }).catch(error => console.error('Không thể cập nhật lợi nhuận đơn:', error));
          return { ...o, profitVnd: newProfitVnd };
        });
      });
    }

    if (currentLaptop.status !== finalLaptop.status || currentLaptop.location !== finalLaptop.location) {
      addStockMovement({
        laptopId: id,
        type: 'CẬP NHẬT KHO',
        note: `${currentLaptop.status} → ${finalLaptop.status}; ${currentLaptop.location} → ${finalLaptop.location}`
      });
    }
    return { ok: true, laptop: finalLaptop };
  };

  // Cập nhật nhanh Trạng thái & Note
  const updateLaptopStatus = (id, newStatus, note = '') => {
    return updateLaptop(id, { status: newStatus, conditionNote: note || laptops.find(laptop => laptop.id == id)?.conditionNote });
  };

  // Thêm máy mới
  const addLaptop = async (laptopData) => {
    const name = String(laptopData.name || '').trim();
    if (!name) return { ok: false, message: 'Tên sản phẩm không được để trống.' };

    const serial = String(laptopData.serial || '').trim();
    if (serial && laptops.some(laptop => String(laptop.serial || '').trim().toLowerCase() === serial.toLowerCase())) {
      return { ok: false, message: `Serial ${serial} đã tồn tại ở một máy khác.` };
    }

    const explicitImportPrice = laptopData.importPriceVnd !== undefined && laptopData.importPriceVnd !== ''
      ? parseFlexibleFloat(laptopData.importPriceVnd)
      : null;
    const imp = explicitImportPrice ?? computeImportPrice(laptopData.priceRmb, laptopData.shippingRmb, laptopData.exchangeRate, formulaConfig);
    const prof = computeProfit(laptopData.retailPriceVnd, laptopData.wholesalePriceVnd, imp, laptopData.customProfit);

    const newItem = {
      monthKey: laptopData.monthKey || (selectedMonth === 'ALL' ? parseMonthYear(laptopData.importDate || todayVi()) : selectedMonth),
      importDate: laptopData.importDate || todayVi(),
      warehouseDate: laptopData.warehouseDate || '',
      warrantySupplier: laptopData.warrantySupplier || '',
      id: laptopData.id,
      serial,
      name,
      location: labelToKey('laptopLocation', laptopData.location, _cfg()) || laptopData.location || 'store',
      category: labelToKey('category', laptopData.category || laptopData.categoryId, _cfg()) || laptopData.category || laptopData.categoryId || null,
      conditionNote: laptopData.conditionNote || '',
      chargerStatus: labelToKey('chargerStatus', laptopData.chargerStatus, _cfg()) || laptopData.chargerStatus || 'with_charger',
      seller: laptopData.seller || '',
      status: labelToKey('laptopStatus', laptopData.status, _cfg()) || laptopData.status || 'available',
      priceRmb: parseFlexibleFloat(laptopData.priceRmb),
      shippingRmb: parseFlexibleFloat(laptopData.shippingRmb),
      exchangeRate: parseFlexibleFloat(laptopData.exchangeRate) || formulaConfig.defaultRate,
      importPriceVnd: imp,
      wholesalePriceVnd: parseFlexibleFloat(laptopData.wholesalePriceVnd),
      retailPriceVnd: parseFlexibleFloat(laptopData.retailPriceVnd),
      profitVnd: prof,
      trackingCode: laptopData.trackingCode || '',
      // Phase 2 fields
      batteryHealth: laptopData.batteryHealth === undefined || laptopData.batteryHealth === ''
        ? 100
        : parseFlexibleFloat(laptopData.batteryHealth),
      isLocked: laptopData.isLocked || false,
      partsHistory: laptopData.partsHistory || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Loại bỏ ID không hợp lệ để database tự sinh
    if (!isValidDBId(String(newItem.id))) {
      newItem.id = undefined;
    }
    let savedData;
    try {
      savedData = await saveLaptopToCloud(newItem, { create: true });
    } catch (err) {
      return { ok: false, message: `Lỗi DB: ${err.message}` };
    }
    if (!savedData) return { ok: false, message: 'Lỗi không xác định khi lưu lên DB.' };
    
    // Use the server-normalized row so the first render matches the next reload.
    const persistedLaptop = { ...newItem, ...savedData, id: savedData.id };
    setLaptops(prev => [persistedLaptop, ...prev.filter(item => String(item.id) !== String(persistedLaptop.id))]);
    addStockMovement({ laptopId: persistedLaptop.id, type: 'NHẬP KHO', note: persistedLaptop.conditionNote || 'Tạo mới máy trong kho' });
    return { ok: true, laptop: persistedLaptop };
  };

  // Không xóa vật lý, đổi trạng thái và đánh dấu isActive = false (Soft Delete)
  const deleteLaptop = (id) => {
    if (orders.some(order => String(order.laptopId) === String(id)) || warrantyCases.some(item => String(item.laptopId) === String(id))) {
      return { ok: false, message: 'Máy đã có lịch sử đơn hàng hoặc bảo hành, không thể xóa.' };
    }
    const target = laptops.find(l => l.id == id);
    if (target) {
      const softDeleted = { ...target, isActive: false, status: 'inactive', updatedAt: new Date().toISOString() };
      setLaptops(prev => prev.map(l => l.id == id ? softDeleted : l));
      void saveLaptopToCloud(softDeleted).catch(error => console.error('Không thể ngừng hoạt động máy:', error));
      addStockMovement({ laptopId: id, type: 'DEACTIVATED', note: 'Xóa mềm máy khỏi kho' });
    }
    return { ok: true };
  };

  const createCustomer = async (customerData) => {
    const newCustomer = {
      id: createLocalId('CUST'),
      name: customerData.name || '',
      phone: customerData.phone || '',
      address: customerData.address || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setCustomers(prev => [newCustomer, ...prev]);
    let saved;
    try {
      saved = await saveCustomerToCloud(newCustomer);
    } catch (error) {
      setCustomers(prev => prev.filter(c => String(c.id) !== String(newCustomer.id)));
      return { ok: false, message: error.message || 'Không thể lưu khách hàng lên cloud.' };
    }
    setCustomers(prev => prev.map(c => String(c.id) === String(newCustomer.id) ? saved : c));
    return { ok: true, customer: saved };
  };

  const updateCustomer = async (id, updates) => {
    const current = customers.find(c => c.id == id);
    if (!current) return { ok: false, message: 'Không tìm thấy khách hàng' };
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    setCustomers(prev => prev.map(c => c.id == id ? updated : c));
    let saved;
    try {
      saved = await saveCustomerToCloud(updated);
    } catch (error) {
      setCustomers(prev => prev.map(c => String(c.id) === String(id) ? current : c));
      return { ok: false, message: error.message || 'Không thể cập nhật khách hàng lên cloud.' };
    }
    setCustomers(prev => prev.map(c => String(c.id) === String(id) ? saved : c));
    return { ok: true, customer: saved };
  };

  const createWarrantyCase = async (caseData) => {
    const laptop = laptops.find(item => item.id == caseData.laptopId);
    if (!laptop) return { ok: false, message: 'Hãy chọn đúng máy cần tiếp nhận bảo hành.' };
    const linkedOrder = orders.find(order => String(order.id) === String(caseData.orderId));
    const draftWarrantyCase = {
      id: createLocalId('BH'),
      laptopId: laptop.id,
      orderId: linkedOrder?.id || '',
      customerInfo: caseData.customerInfo || linkedOrder?.customerInfo || '',
      receivedDate: caseData.receivedDate || todayVi(),
      reportedIssue: caseData.reportedIssue?.trim() || '',
      status: caseData.status || 'received',
      resolvedDate: RESOLVED_WARRANTY_STATUS_KEYS.includes(labelToKey('warrantyCaseStatus', caseData.status || 'received', appOptions))
        ? (caseData.resolvedDate || todayVi()) : '',
      diagnosis: caseData.diagnosis || '',
      resolution: caseData.resolution || '',
      repairCost: parseFlexibleFloat(caseData.repairCost),
      notes: caseData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!draftWarrantyCase.reportedIssue) return { ok: false, message: 'Cần ghi nhận lỗi khách báo khi tiếp nhận.' };

    let savedWarrantyCase;
    try {
      savedWarrantyCase = await saveWarrantyCaseToCloud(draftWarrantyCase);
    } catch (error) {
      return { ok: false, message: error.message || 'Không thể lưu phiếu bảo hành lên cloud.' };
    }
    if (!savedWarrantyCase) return { ok: false, message: 'Không thể lưu phiếu bảo hành lên cloud.' };
    const warrantyCase = { ...draftWarrantyCase, ...savedWarrantyCase };

    setWarrantyCases(prev => [warrantyCase, ...prev]);
    
    const updatedLaptop = {
      ...laptop,
      conditionNote: `${laptop.conditionNote || ''}${laptop.conditionNote ? ' | ' : ''}BH ${warrantyCase.receivedDate}: ${warrantyCase.reportedIssue}`
    };
    setLaptops(prev => prev.map(item => item.id == laptop.id ? updatedLaptop : item));
    try {
      await saveLaptopToCloud({
        id: laptop.id, name: laptop.name, serial: laptop.serial,
        conditionNote: updatedLaptop.conditionNote
      });
    } catch (error) {
      setLaptops(prev => prev.map(item => item.id == laptop.id
        ? { ...item, conditionNote: laptop.conditionNote } : item));
      import('react-hot-toast').then(mod => mod.default.error(
        `Phiếu bảo hành #${warrantyCase.id} đã lưu, nhưng chưa cập nhật được ghi chú máy: ${error.message}`
      ));
    }
    
    addStockMovement({ laptopId: laptop.id, orderId: warrantyCase.orderId, warrantyCaseId: warrantyCase.id, type: 'TIẾP NHẬN BẢO HÀNH', note: warrantyCase.reportedIssue });
    return { ok: true, warrantyCase };
  };

  const updateWarrantyCase = async (id, updates) => {
    const currentCase = warrantyCases.find(item => item.id == id);
    if (!currentCase) return { ok: false, message: 'Không tìm thấy phiếu bảo hành.' };
    const nextStatus = updates.status === undefined ? currentCase.status : updates.status;
    const isResolved = RESOLVED_WARRANTY_STATUS_KEYS.includes(labelToKey('warrantyCaseStatus', nextStatus, appOptions));
    const updatedCase = {
      ...currentCase,
      ...updates,
      resolvedDate: isResolved ? (updates.resolvedDate || currentCase.resolvedDate || todayVi()) : '',
      repairCost: updates.repairCost === undefined ? currentCase.repairCost : parseFlexibleFloat(updates.repairCost),
      updatedAt: new Date().toISOString()
    };
    setWarrantyCases(prev => prev.map(item => item.id == id ? updatedCase : item));
    let savedCase;
    try {
      savedCase = await saveWarrantyCaseToCloud(updatedCase);
    } catch (error) {
      setWarrantyCases(prev => prev.map(item => item.id == id ? currentCase : item));
      return { ok: false, message: error.message || 'Không thể cập nhật phiếu bảo hành.' };
    }
    if (!savedCase) {
      setWarrantyCases(prev => prev.map(item => item.id == id ? currentCase : item));
      return { ok: false, message: 'Không thể cập nhật phiếu bảo hành.' };
    }
    setWarrantyCases(prev => prev.map(item => item.id == id ? savedCase : item));

    const laptop = laptops.find(l => l.id == updatedCase.laptopId);
    if (laptop && updates.diagnosis) {
      const diagnosisTag = updates.diagnosis ? ` | KT: ${updates.diagnosis}` : '';
      const alreadyHasDiagnosis = diagnosisTag && laptop.conditionNote?.includes(diagnosisTag);
      const updatedLaptop = {
        ...laptop,
        conditionNote: `${laptop.conditionNote || ''}${alreadyHasDiagnosis ? '' : diagnosisTag}`
      };
      setLaptops(prev => prev.map(l => l.id == laptop.id ? updatedLaptop : l));
      void saveLaptopToCloud({
        id: laptop.id, name: laptop.name, serial: laptop.serial,
        conditionNote: updatedLaptop.conditionNote
      }).catch(error => {
        setLaptops(prev => prev.map(item => item.id == laptop.id
          ? { ...item, conditionNote: laptop.conditionNote } : item));
        import('react-hot-toast').then(mod => mod.default.error(`Chưa cập nhật được ghi chú máy bảo hành: ${error.message}`));
      });
    }
    
    addStockMovement({
      laptopId: updatedCase.laptopId,
      orderId: updatedCase.orderId,
      warrantyCaseId: id,
      type: `BẢO HÀNH: ${updatedCase.status}`,
      note: updatedCase.resolution || updatedCase.diagnosis || updatedCase.notes || ''
    });
    return { ok: true, warrantyCase: savedCase };
  };

  // Tạo đơn hàng cũ
  const createOrder = (laptopId, customer, price) => {
    addOrder({
      laptopId,
      customerInfo: customer,
      salePrice: price
    });
  };

  // Import từ Google Sheet JSON/CSV Data (BẮT BUỘC có Tên sản phẩm mới tính là tồn tại)
  
  const importSheetData = async (items) => {
    if (!Array.isArray(items)) return { ok: false, message: 'Dữ liệu import không hợp lệ.' };
    const validItems = items.filter(item => 
      item && 
      item.name && 
      typeof item.name === 'string' && 
      item.name.trim() !== '' && 
      item.name.trim().toLowerCase() !== 'tên' &&
      item.name.trim() !== '-'
    );

    const formatted = validItems.map((item, index) => {
      const pRmb = parseFlexibleFloat(item.priceRmb);
      const sRmb = parseFlexibleFloat(item.shippingRmb);
      const rate = parseFlexibleFloat(item.exchangeRate) || formulaConfig.defaultRate;
      const wPrice = 0;
      const rPrice = 0;

      const sheetImp = (item.importPriceVnd !== undefined && item.importPriceVnd !== '') ? parseFlexibleFloat(item.importPriceVnd) : undefined;
      const sheetProf = (item.profitVnd !== undefined && item.profitVnd !== '') ? parseFlexibleFloat(item.profitVnd) : undefined;

      const imp = (sheetImp !== undefined && !isNaN(sheetImp) && sheetImp > 0)
        ? sheetImp 
        : computeImportPrice(pRmb, sRmb, rate, formulaConfig);

      const prof = (sheetProf !== undefined && !isNaN(sheetProf) && sheetProf !== 0)
        ? sheetProf 
        : computeProfit(0, 0, imp);

      return {
        importDate: item.importDate || '08/07',
        id: item.id || `#${index + 75}`,
        serial: item.serial || '',
        name: item.name.trim(),
        location: labelToKey('laptopLocation', item.location, _cfg()) || 'store',
        category: item.category || 'ASUS',
        conditionNote: item.conditionNote || '',
        chargerStatus: labelToKey('chargerStatus', item.chargerStatus, _cfg()) || 'with_charger',
        seller: item.seller || '',
        status: labelToKey('laptopStatus', item.status, _cfg()) || 'available',
        priceRmb: pRmb,
        shippingRmb: sRmb,
        exchangeRate: rate,
        importPriceVnd: imp,
        wholesalePriceVnd: wPrice > 0 ? wPrice : '',
        retailPriceVnd: rPrice > 0 ? rPrice : '',
        
        profitVnd: prof,
        trackingCode: item.trackingCode || ''
      };
    });
    const results = await Promise.allSettled(formatted.map(item => saveLaptopToCloud(item)));
    const saved = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);
    if (saved.length > 0) {
      setLaptops(prev => {
        const merged = new Map(prev.map(laptop => [String(laptop.id), laptop]));
        saved.forEach(laptop => merged.set(String(laptop.id), laptop));
        return Array.from(merged.values());
      });
    }
    const failed = formatted.length - saved.length;
    return failed === 0
      ? { ok: true, imported: saved.length }
      : { ok: false, imported: saved.length, failed, message: `${failed} dòng không thể lưu lên cloud.` };
  };

  // ─── Chuyển tháng mới ───
  // Gọi API month-roll để chuyển các item chưa hoàn thành sang tháng mới,
  // sau đó refresh dữ liệu và đổi selectedMonth.
  const rollToNewMonth = useCallback(async (newMonthKey) => {
    try {
      const res = await fetch('/api/month-roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAuthHeaders() },
        body: JSON.stringify({ monthKey: newMonthKey })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, message: data.error || 'Chuyển tháng thất bại.' };
      }
      const targetMonthKey = data.monthKey || newMonthKey;
      // Refresh dữ liệu từ server với tháng mới
      const monthQuery = { monthKey: targetMonthKey };
      const safeFetch = (fn) => fn().catch(() => null);
      const [newLaptops, newOrders] = await Promise.all([
        safeFetch(() => fetchLaptopsFromCloud(monthQuery)),
        safeFetch(() => fetchOrdersFromCloud(monthQuery)),
      ]);
      if (newLaptops !== null) setLaptops(newLaptops);
      if (newOrders !== null) setOrders(newOrders);
      setSelectedMonth(targetMonthKey);
      return {
        ok: true,
        laptopsMoved: data.laptopsMoved,
        ordersMoved: data.ordersMoved,
        monthKey: targetMonthKey,
      };
    } catch (err) {
      return { ok: false, message: err?.message || 'Lỗi khi chuyển tháng.' };
    }
  }, [setSelectedMonth]);

  return (
    <InventoryContext.Provider value={{
      laptops: viewLaptops,
      orders,
      customers,
      payments,
      warrantyCases,
      stockMovements,
      filteredLaptops: viewFilteredLaptops,
      filteredOrders: viewFilteredOrders,
      isAdmin,
      cloudStatus,
      selectedMonth,
      setSelectedMonth,
      availableMonths,
      parseMonthYear,
      formulaConfig,
      fieldOptionsConfig: appOptions,
      ...dynamicOptions,
      // ─── Field Options Config (label customization) ──────────────────────
      appOptions,
      dynamicOptions,
      getLabel: (groupKey, key) => getLabel(groupKey, key, appOptions),
      getOptions: (groupKey) => getOptions(groupKey, appOptions),
      updateAppOptions,
      updateFieldOptions,
      resetFieldOptionsGroup,
      resetAllFieldOptions,
      // ────────────────────────────────────────────────────────────────────
      getSelectableLaptops,
      getDepositReferenceLaptops,
      getLaptopAssignmentError,
      updateLaptop,
      updateLaptopStatus,
      addLaptop,
      deleteLaptop,
      updateFormulaConfig,
      createOrder,
      addOrder,
      updateOrder,
      recordPayment,
      deleteOrder,
      cancelOrder,
      createCustomer,
      updateCustomer,
      createWarrantyCase,
      updateWarrantyCase,
      importSheetData,
      rollToNewMonth
    }}>
      {children}
    </InventoryContext.Provider>
  );
};
