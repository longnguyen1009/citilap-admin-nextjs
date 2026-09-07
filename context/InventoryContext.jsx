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
const SENSITIVE_LAPTOP_KEYS = ['priceRmb', 'shippingRmb', 'exchangeRate', 'importPriceVnd'];
const SENSITIVE_ORDER_KEYS = ['profitVnd'];

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
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.error(`Không thể đọc dữ liệu local: ${key}`, error);
    return fallback;
  }
};

const createLocalId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const todayVi = () => new Date().toLocaleDateString('vi-VN');

export const useInventory = () => useContext(InventoryContext);

export const DEFAULT_FORMULA_CONFIG = {
  shippingVnd: 400000,
  divisor: 1000000,
  defaultRate: 3550,
};

// ─── Helper nội bộ: đọc customConfig từ localStorage tại runtime ──────────────
const _cfg = () => {
  try { 
    const val = JSON.parse(localStorage.getItem(LOCAL_KEYS.appOptions) || '[]'); 
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
  if (isOrderCancelled(order, appOptions)) return false;
  const statusKey = labelToKey('orderStatus', order?.orderStatus, appOptions);
  return COMMITTED_ORDER_STATUS_KEYS.includes(statusKey);
};

export const isReservationActive = (order, appOptions = [], now = new Date()) => {
  if (!order?.laptopId || isOrderCancelled(order, appOptions) || isOrderCommitted(order, appOptions)) return false;
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
export const computeProfit = (importPriceVnd) => {
  return 0;
};

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
  const key = labelToKey('laptopStatus', status, _cfg());
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

const reconcileLaptopStatuses = (laptops, orders) => {
  const relatedOrders = new Map();
  orders.forEach((order) => {
    if (!order.laptopId) return;
    const key = String(order.laptopId);
    const related = relatedOrders.get(key) || [];
    related.push(order);
    relatedOrders.set(key, related);
  });

  return laptops.map((laptop) => {
    const statusKey = labelToKey('laptopStatus', laptop.status, _cfg());
    if (TECHNICAL_LAPTOP_STATUS_KEYS.includes(statusKey)) return { ...laptop, status: statusKey };

    const linkedOrders = relatedOrders.get(String(laptop.id)) || [];
    const opts = _cfg();
    if (linkedOrders.some(o => isOrderCommitted(o, opts))) {
      return { ...laptop, status: 'sold' };
    }
    if (linkedOrders.some(o => isReservationActive(o, opts))) {
      return { ...laptop, status: 'deposited' };
    }
    if (['deposited', 'sold'].includes(statusKey)) {
      return { ...laptop, status: 'available' };
    }
    return { ...laptop, status: statusKey };
  });
};

// Hàm lọc Kho Laptop theo Tháng (Tự động kế thừa máy chưa bán từ các tháng trước)
// FIX: Máy đã bán trong tháng hiện tại vẫn được hiển thị (dùa vào ngày của đơn hàng, không dùa vào ngày nhập máy)
export const filterLaptopsByMonth = (laptops, selectedMonth, orders = []) => {
  if (!selectedMonth || selectedMonth === 'ALL') return laptops;

  const targetKey = monthYearToKey(selectedMonth);

  // Build map: laptopId -> tháng bán (từ đơn hàng)
  // Lấy đơn mới nhất có liên kết máy & có ngày giao/tạo đơn
  const soldMonthByLaptopId = {};
  orders.forEach(order => {
    if (!order.laptopId) return;
    // Lấy ngày bán: ưu tiên createdDate (ngày chốt đơn) để đồng bộ với filterOrdersByMonth
    const saleDate = order.createdDate || order.shipDate;
    const saleMonth = parseMonthYear(saleDate, order.created_at || order.createdAt);
    if (!saleMonth) return;
    const saleKey = monthYearToKey(saleMonth);
    const existing = soldMonthByLaptopId[order.laptopId];
    // Lưu lại tháng bán mới nhất của máy (nếu có nhiều đơn, lấy tháng lớn nhất)
    if (!existing || saleKey > existing.key) {
      soldMonthByLaptopId[order.laptopId] = { key: saleKey, month: saleMonth };
    }
  });

  return laptops.filter(laptop => {
    const itemMonth = parseMonthYear(laptop.importDate, laptop.created_at || laptop.createdAt);
    const itemKey = monthYearToKey(itemMonth);

    // 1. Máy nhập đúng tháng được chọn -> Hiển thị
    if (itemKey === targetKey) return true;

    // 2. Máy nhập ở tháng SAU -> Không hiện ở tháng cũ
    if (itemKey > targetKey) return false;

    // 3. Máy nhập trước tháng được chọn:
    const soldInfo = soldMonthByLaptopId[laptop.id];

    if (soldInfo) {
      // Máy đã có đơn hàng liên kết
      if (soldInfo.key === targetKey) {
        // Bán đúng trong tháng này -> HIỈN THỊ
        return true;
      }
      if (soldInfo.key < targetKey) {
        // Bán trước tháng này -> KHÔNG HIỈN (xuất kho rồi)
        return false;
      }
      // soldInfo.key > targetKey: đơn hàng ở tương lai, máy vẫn tồn kho tại tháng này
      return !isInactiveStatus(laptop.status);
    }

    // Không có đơn hàng -> dựa vào trạng thái kho
    return !isInactiveStatus(laptop.status);
  });
};

// Hàm lọc Đơn Hàng theo Tháng
export const filterOrdersByMonth = (orders, selectedMonth) => {
  if (!selectedMonth || selectedMonth === 'ALL') return orders;

  const targetKey = monthYearToKey(selectedMonth);

  return orders.filter(order => {
    const orderMonth = parseMonthYear(order.createdDate, order.created_at || order.createdAt);
    const orderKey = monthYearToKey(orderMonth);
    return orderKey === targetKey;
  });
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
  const isAdmin = user?.role === 'ADMIN';

  const [laptops, setLaptops] = useState([]);
  const [orders, setOrders] = useState([]);
  const [warrantyCases, setWarrantyCases] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [cloudStatus, setCloudStatus] = useState('checking'); // 'checking', 'connected', 'error', 'disconnected'

  // Fetch initial data from Cloud — chỉ lấy columns cần thiết (giảm ~30-40% payload)
  const [appOptions, setAppOptions] = useState(() => {
    const saved = localStorage.getItem('citilap_app_options_v1');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });

  const updateAppOptions = async () => {
    const opts = await fetchAppOptionsFromCloud();
    if (opts) {
      setAppOptions(opts);
      localStorage.setItem('citilap_app_options_v1', JSON.stringify(opts));
    }
  };

  const [formulaConfig, setFormulaConfig] = useState(() => {
    const saved = localStorage.getItem(LOCAL_KEYS.formula);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return DEFAULT_FORMULA_CONFIG;
  });



  const updateFieldOptions = useCallback((groupKey, optionKey, newLabel) => {
    // Việc này giờ được quản lý ở Settings.jsx gọi API trực tiếp
    // Hàm này giữ lại để không báo lỗi nếu còn chỗ nào gọi
  }, []);

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


  useEffect(() => {
    // KHÔNG fetch nếu: chưa login, hoặc đang ở màn login
    if (!user) return;
    if (window.location.pathname === '/login') return;

    let unsubscribe = () => {};
    let cancelled = false;
    const loadCloudData = async () => {
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

      const [cloudLaptops, cloudOrders, cloudWarranty, cloudStock, cloudCustomers, cloudSettings, cloudOptions] = await Promise.all([
        fetchLaptopsFromCloud(),
        fetchOrdersFromCloud(),
        fetchWarrantyCasesFromCloud(),
        fetchStockMovementsFromCloud(),
        fetchCustomersFromCloud(),
        fetchAllSettings(),
        fetchAppOptionsFromCloud()
      ]);

      if (cancelled) return;

      if (cloudLaptops === null && cloudOrders === null) {
        setCloudStatus('error');
      } else {
        setCloudStatus('connected');
        if (cloudLaptops !== null) setLaptops(cloudLaptops);
        if (cloudOrders !== null) setOrders(cloudOrders);
        if (cloudWarranty !== null) setWarrantyCases(cloudWarranty);
        if (cloudStock !== null) setStockMovements(cloudStock);
        if (cloudCustomers !== null) setCustomers(cloudCustomers);

        // Load options từ bảng app_options
        if (cloudOptions && Array.isArray(cloudOptions)) {
          setAppOptions(cloudOptions);
          localStorage.setItem(LOCAL_KEYS.fieldOptions, JSON.stringify(cloudOptions));
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
            if (!order.laptopId || !isOrderCommitted(order)) return;
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
        fetchOrdersFromCloud().then(d => { if (d && !cancelled) setOrders(d); });
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
        fetchLaptopsFromCloud().then(d => {
          if (d && !cancelled) setLaptops(reconcileLaptopStatuses(d, orders));
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
  }, [user?.id]);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    return localStorage.getItem(LOCAL_KEYS.selectedMonth) || currentMonthStr;
  });

  useEffect(() => {
    if (selectedMonth) {
      localStorage.setItem(LOCAL_KEYS.selectedMonth, selectedMonth);
    }
  }, [selectedMonth]);

  // Trích xuất danh sách tất cả các tháng có dữ liệu
  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    monthSet.add(currentMonthStr);

    laptops.forEach(l => {
      const m = parseMonthYear(l.importDate, l.created_at || l.createdAt);
      if (m) monthSet.add(m);
    });

    orders.forEach(o => {
      const m = parseMonthYear(o.createdDate, o.created_at || o.createdAt);
      if (m) monthSet.add(m);
    });

    // Sắp xếp các tháng giảm dần (Mới nhất lên đầu)
    const sorted = Array.from(monthSet).sort((a, b) => monthYearToKey(b) - monthYearToKey(a));
    return sorted;
  }, [laptops, orders, currentMonthStr]);

  const filteredLaptops = useMemo(() => {
    return filterLaptopsByMonth(laptops, selectedMonth, orders);
  }, [laptops, selectedMonth, orders]);

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

  function applyAndSaveLaptopStatuses(nextOrders) {
    setLaptops(prev => {
      const nextLaptops = reconcileLaptopStatuses(prev, nextOrders);
      nextLaptops.forEach((nextLaptop, idx) => {
        const prevLaptop = prev[idx];
        if (prevLaptop && prevLaptop.id === nextLaptop.id && prevLaptop.status !== nextLaptop.status) {
          saveLaptopToCloud(nextLaptop);
        }
      });
      return nextLaptops;
    });
  }

  // Khi mở lại ứng dụng hoặc hết hạn giữ máy, trạng thái kho luôn được suy ra từ đơn hàng.
  useEffect(() => {
    const reconcile = () => applyAndSaveLaptopStatuses(orders);
    reconcile();
    const intervalId = window.setInterval(reconcile, 60 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [orders]);

  const addStockMovement = (entry) => {
    const newEntry = {
      id: createLocalId('STOCK'),
      createdAt: new Date().toISOString(),
      ...entry
    };
    setStockMovements(prev => [newEntry, ...prev].slice(0, 1000));
    saveStockMovementToCloud(newEntry);
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
      (isOrderCommitted(order) || isReservationActive(order))
    ));
    if (blockingOrder) return `Máy ${laptopId} đang thuộc đơn #${blockingOrder.id}.`;
    if (statusKey === 'sold') return `Máy ${laptopId} đã được bán.`;
    if (statusKey === 'deposited') return `Máy ${laptopId} đang được giữ chỗ.`;
    return '';
  };

  const getSelectableLaptops = (currentOrderId = null) => laptops.filter(laptop => (
    laptop.id == orders.find(order => String(order.id) === String(currentOrderId))?.laptopId ||
    !getLaptopAssignmentError(laptop.id, currentOrderId)
  ));

  // Bất biến tiền tệ: amountPaid >= depositAmount; debtAmount = salePrice - amountPaid.
  // Chỉ tính lại khi các trường tiền tệ thay đổi, tránh ghi đè giá trị thủ công hợp lệ.
  const MONEY_FIELDS = ['salePrice', 'depositAmount', 'amountPaid', 'debtAmount'];
  const normalizeMoney = (order) => {
    const salePrice = parseFlexibleFloat(order.salePrice);
    const depositAmount = parseFlexibleFloat(order.depositAmount);
    const amountPaid = Math.max(parseFlexibleFloat(order.amountPaid), depositAmount);
    const debtAmount = Math.max(0, salePrice - amountPaid);
    return { ...order, salePrice, depositAmount, amountPaid, debtAmount };
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
    const shouldReserve = normalized.laptopId && (
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
    // We only use this local id generation logic for offline or temporary UI state.
    let nextId = orders.length > 0 ? Math.max(...orders.map(o => parseInt(o.id, 10) || 1000)) + 1 : 1001;
    while (orders.some(order => String(order.id) === String(nextId))) nextId += 1;
    
    // Check for ID conflict only if explicitly passed
    if (orderData.id && orders.some(order => String(order.id) === String(orderData.id))) {
      return { ok: false, message: `Đơn hàng #${orderData.id} đã tồn tại.` };
    }
    
    const normalizedInput = normalizeMoney(normalizeOrderNumbers(orderData));
    const depositAmount = normalizedInput.depositAmount;
    const amountPaid = normalizedInput.amountPaid;
    const newOrder = normalizeReservation({
      id: orderData.id || nextId,
      createdDate: orderData.createdDate || todayVi(),
      saleOnline: labelToKey('saleOnline', orderData.saleOnline, _cfg()) || orderData.saleOnline || '',
      saleOffline: labelToKey('saleOffline', orderData.saleOffline, _cfg()) || orderData.saleOffline || '',
      note: orderData.note || [orderData.note1, orderData.note2].filter(Boolean).join(' - ') || '',
      shippingMethod: orderData.shippingMethod || 'viettelpost',
      orderStatus: orderData.orderStatus || 'new',
      paymentStatus: orderData.paymentStatus || 'unpaid',
      deliveryStatus: orderData.deliveryStatus || 'preparing',
      laptopId: orderData.laptopId || '',
      salePrice: normalizedInput.salePrice || 0,
      depositAmount,
      depositNote: orderData.depositNote || '',
      reservationExpiresAt: orderData.reservationExpiresAt || '',
      codAmount: normalizedInput.codAmount || 0,
      setupNote: orderData.setupNote || 'Cài cơ bản',
      warranty: orderData.warranty || '6 tháng',
      gifts: orderData.gifts || 'basic_gift',
      customerInfo: orderData.customerInfo || '',
      customerAddress: orderData.customerAddress || '',
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

    const assignmentError = getLaptopAssignmentError(newOrder.laptopId);
    if (assignmentError) return { ok: false, message: assignmentError };

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
    const savedData = await saveOrderToCloud(newOrder);
    if (!savedData) return { ok: false, message: 'Lỗi khi lưu lên cơ sở dữ liệu. Dữ liệu chưa được cập nhật.' };
    newOrder.id = savedData.id;

    const nextOrders = [newOrder, ...orders];
    setOrders(nextOrders);
    applyAndSaveLaptopStatuses(nextOrders);

    if (newOrder.laptopId) {
      addStockMovement({ laptopId: newOrder.laptopId, orderId: newOrder.id, type: isReservationActive(newOrder) ? 'GIỮ MÁY' : 'GÁN VÀO ĐƠN', note: `Đơn #${newOrder.id}` });
    }
    return { ok: true, order: newOrder };
  };

  const updateOrder = (id, rawUpdatedFields) => {
    const updatedFields = mapLabelsToKeys(rawUpdatedFields, appOptions);
    const currentOrder = orders.find(order => String(order.id) === String(id));
    if (!currentOrder) return { ok: false, message: 'Không tìm thấy đơn hàng.' };
    const normalizedFields = normalizeOrderNumbers(updatedFields);
    const moneyChanged = MONEY_FIELDS.some(field => field in normalizedFields);
    let merged = normalizeReservation({ ...currentOrder, ...normalizedFields, updatedAt: new Date().toISOString() });
    if (moneyChanged) merged = normalizeMoney(merged);

    // Recalculate profit if salePrice or laptopId changed
    if ('salePrice' in updatedFields || 'laptopId' in updatedFields) {
      if (merged.laptopId && merged.salePrice > 0) {
        const linkedLaptop = laptops.find(l => l.id == merged.laptopId);
        if (linkedLaptop && linkedLaptop.importPriceVnd > 0) {
          merged.profitVnd = parseFloat((merged.salePrice - linkedLaptop.importPriceVnd).toFixed(2));
        } else {
          merged.profitVnd = merged.salePrice;
        }
      } else {
        merged.profitVnd = 0;
      }
    }

    const isLocked = isOrderCommitted(currentOrder) || isOrderCancelled(currentOrder);
    if (isLocked && merged.laptopId !== currentOrder.laptopId) {
      return { ok: false, message: 'Đơn hàng đang ở trạng thái không cho phép thay đổi sản phẩm.' };
    }
    if (merged.laptopId !== currentOrder.laptopId) {
      const assignmentError = getLaptopAssignmentError(merged.laptopId, id);
      if (assignmentError) return { ok: false, message: assignmentError };
    }
    if (isOrderCommitted(merged) && !merged.laptopId) {
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

    // Optimistic update
    const nextOrders = orders.map(order => String(order.id) === String(id) ? merged : order);
    setOrders(nextOrders);
    applyAndSaveLaptopStatuses(nextOrders);
    
    // Fire and forget cloud save
    saveOrderToCloud(merged);
    
    if (merged.laptopId !== currentOrder.laptopId) {
      addStockMovement({ laptopId: currentOrder.laptopId, orderId: id, type: 'NHẢ MÁY', note: `Đổi máy sang ${merged.laptopId || 'chưa gán'}` });
      if (merged.laptopId) addStockMovement({ laptopId: merged.laptopId, orderId: id, type: 'GÁN VÀO ĐƠN', note: `Đơn #${id}` });
    }
    return { ok: true, order: merged };
  };

  // Giữ lịch sử đơn để sau này đối soát, thay cho xóa cứng.
  const cancelOrder = (id, reason = 'Hủy từ danh sách đơn hàng') => {
    const result = updateOrder(id, {
      orderStatus: D.orderCancelled,
      deliveryStatus: D.deliveryReturned,
      cancelReason: reason,
      cancelledAt: new Date().toISOString()
    });
    if (result.ok && result.order.laptopId) {
      addStockMovement({ laptopId: result.order.laptopId, orderId: id, type: 'NHẢ MÁY', note: reason });
    }
    return result;
  };

  const deleteOrder = (id) => cancelOrder(id);

  // Cập nhật công thức
  const updateFormulaConfig = (newConfig, recalculateAll = false) => {
    setFormulaConfig(newConfig);
    saveSetting('formula', newConfig);
    if (recalculateAll) {
      setLaptops(prev => prev.map(laptop => {
        const imp = computeImportPrice(laptop.priceRmb, laptop.shippingRmb, laptop.exchangeRate, newConfig);
        const prof = computeProfit(laptop.retailPriceVnd, laptop.wholesalePriceVnd, imp, laptop.customProfit);
        return { ...laptop, importPriceVnd: imp, profitVnd: prof };
      }));
    }
  };

  // Cập nhật từng laptop
  const updateLaptop = (id, updatedFields) => {
    const currentLaptop = laptops.find(laptop => laptop.id == id);
    if (!currentLaptop) return { ok: false, message: 'Không tìm thấy máy.' };
    const serial = String(updatedFields.serial ?? currentLaptop.serial ?? '').trim();
    const duplicatedSerial = serial && laptops.some(laptop => laptop.id !== id && String(laptop.serial || '').trim().toLowerCase() === serial.toLowerCase());
    if (duplicatedSerial) return { ok: false, message: `Serial ${serial} đã tồn tại ở một máy khác.` };

    const merged = { ...currentLaptop, ...updatedFields, serial, updatedAt: new Date().toISOString() };
    const explicitImportPrice = updatedFields.importPriceVnd !== undefined && updatedFields.importPriceVnd !== ''
      ? parseFlexibleFloat(updatedFields.importPriceVnd)
      : null;
    const importPriceVnd = explicitImportPrice ?? computeImportPrice(merged.priceRmb, merged.shippingRmb, merged.exchangeRate, formulaConfig);
    const profitVnd = computeProfit(merged.retailPriceVnd, merged.wholesalePriceVnd, importPriceVnd, merged.customProfit);
    const finalLaptop = { ...merged, importPriceVnd, profitVnd };
    
    // Optimistic update
    setLaptops(prev => prev.map(laptop => laptop.id == id ? finalLaptop : laptop));
    
    // Fire and forget cloud save
    saveLaptopToCloud(finalLaptop);

    // Tự động tính lại profit_vnd cho tất cả đơn hàng liên kết khi giá nhập thay đổi
    if (importPriceVnd !== currentLaptop.importPriceVnd) {
      setOrders(prevOrders => {
        const affectedOrders = prevOrders.filter(o => o.laptopId === id && o.isActive && o.salePrice > 0);
        if (affectedOrders.length === 0) return prevOrders;
        return prevOrders.map(o => {
          if (o.laptopId !== id || !o.isActive || o.salePrice <= 0) return o;
          const newProfitVnd = parseFloat((o.salePrice - finalLaptop.importPriceVnd).toFixed(2));
          if (newProfitVnd === o.profitVnd) return o;
          saveOrderToCloud({ ...o, profitVnd: newProfitVnd });
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
    // Generate a temporary ID for local logic/validation (e.g., #76), but we won't strictly enforce it for DB insertion.
    // If it's a completely new laptop without an explicit ID, we just omit ID when saving to DB.
    const nextNum = laptops.length > 0 
      ? Math.max(...laptops.map(l => parseInt(String(l.id).replace('#', '') || '0', 10))) + 1 
      : 76;
    let newId = laptopData.id || `#${nextNum}`;
    
    // Nếu mã tăng dần bị trùng (đa tab chưa sync), gắn thêm hậu tố ngẫu nhiên (chỉ dùng tạm thời)
    if (!laptopData.id && laptops.some(laptop => laptop.id == newId)) {
      newId = `#${nextNum}-${Math.random().toString(36).slice(2, 6)}`;
    }
    
    // Only check ID conflict if user explicitly passed a numeric ID
    if (laptopData.id && laptops.some(laptop => laptop.id == laptopData.id)) {
      return { ok: false, message: `Mã máy ${laptopData.id} đã tồn tại.` };
    }
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
      importDate: laptopData.importDate || new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      id: newId,
      serial,
      name: laptopData.name || '',
      location: laptopData.location || 'store',
      category: laptopData.category || laptopData.categoryId || null,
      conditionNote: laptopData.conditionNote || '',
      chargerStatus: laptopData.chargerStatus || 'with_charger',
      seller: laptopData.seller || '',
      status: laptopData.status || 'available',
      priceRmb: parseFloat(laptopData.priceRmb) || 0,
      shippingRmb: parseFloat(laptopData.shippingRmb) || 0,
      exchangeRate: parseFloat(laptopData.exchangeRate) || formulaConfig.defaultRate,
      importPriceVnd: imp,
      wholesalePriceVnd: parseFloat(laptopData.wholesalePriceVnd) || 0,
      retailPriceVnd: parseFloat(laptopData.retailPriceVnd) || 0,
      profitVnd: prof,
      trackingCode: laptopData.trackingCode || '',
      // Phase 2 fields
      batteryHealth: laptopData.batteryHealth || 100,
      isLocked: laptopData.isLocked || false,
      partsHistory: laptopData.partsHistory || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Bỏ ID tạm ra để Supabase tự generate (BIGINT IDENTITY)
    if (String(newItem.id).startsWith('#')) {
      newItem.id = undefined;
    }
    let savedData;
    try {
      savedData = await saveLaptopToCloud(newItem);
    } catch (err) {
      return { ok: false, message: `Lỗi DB: ${err.message}` };
    }
    if (!savedData) return { ok: false, message: 'Lỗi không xác định khi lưu lên DB.' };
    
    // Update with the real ID generated by the DB
    newItem.id = savedData.id;

    setLaptops(prev => [newItem, ...prev]);
    addStockMovement({ laptopId: newItem.id, type: 'NHẬP KHO', note: newItem.conditionNote || 'Tạo mới máy trong kho' });
    return { ok: true, laptop: newItem };
  };

  // Không xóa vật lý, đổi trạng thái và đánh dấu isActive = false (Soft Delete)
  const deleteLaptop = (id) => {
    if (orders.some(order => order.laptopId === id) || warrantyCases.some(item => item.laptopId === id)) {
      return { ok: false, message: 'Máy đã có lịch sử đơn hàng hoặc bảo hành, không thể xóa.' };
    }
    const target = laptops.find(l => l.id == id);
    if (target) {
      const softDeleted = { ...target, isActive: false, status: 'NGỪNG HOẠT ĐỘNG', updatedAt: new Date().toISOString() };
      setLaptops(prev => prev.map(l => l.id == id ? softDeleted : l));
      saveLaptopToCloud(softDeleted);
      addStockMovement({ laptopId: id, type: 'NGỪNG HOẠT ĐỘNG', note: 'Xóa mềm máy khỏi kho' });
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
    const saved = await saveCustomerToCloud(newCustomer);
    if (saved) {
      setCustomers(prev => prev.map(c => c.id == newCustomer.id ? saved : c));
    }
    return { ok: true, customer: saved || newCustomer };
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
    const saved = await saveCustomerToCloud(updated);
    if (saved) {
      setCustomers(prev => prev.map(c => c.id == id ? saved : c));
    }
    return { ok: true, customer: saved || updated };
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
      status: caseData.status || WARRANTY_CASE_STATUS_OPTIONS[0],
      diagnosis: caseData.diagnosis || '',
      resolution: caseData.resolution || '',
      repairCost: parseFlexibleFloat(caseData.repairCost),
      notes: caseData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!draftWarrantyCase.reportedIssue) return { ok: false, message: 'Cần ghi nhận lỗi khách báo khi tiếp nhận.' };

    const savedWarrantyCase = await saveWarrantyCaseToCloud(draftWarrantyCase);
    if (!savedWarrantyCase) return { ok: false, message: 'Không thể lưu phiếu bảo hành lên cloud.' };
    const warrantyCase = { ...draftWarrantyCase, ...savedWarrantyCase };

    setWarrantyCases(prev => [warrantyCase, ...prev]);
    
    const updatedLaptop = {
      ...laptop,
      conditionNote: `${laptop.conditionNote || ''}${laptop.conditionNote ? ' | ' : ''}BH ${warrantyCase.receivedDate}: ${warrantyCase.reportedIssue}`
    };
    setLaptops(prev => prev.map(item => item.id == laptop.id ? updatedLaptop : item));
    saveLaptopToCloud(updatedLaptop);
    
    addStockMovement({ laptopId: laptop.id, orderId: warrantyCase.orderId, warrantyCaseId: warrantyCase.id, type: 'TIẾP NHẬN BẢO HÀNH', note: warrantyCase.reportedIssue });
    return { ok: true, warrantyCase };
  };

  const updateWarrantyCase = (id, updates) => {
    const currentCase = warrantyCases.find(item => item.id == id);
    if (!currentCase) return { ok: false, message: 'Không tìm thấy phiếu bảo hành.' };
    const updatedCase = {
      ...currentCase,
      ...updates,
      repairCost: updates.repairCost === undefined ? currentCase.repairCost : parseFlexibleFloat(updates.repairCost),
      updatedAt: new Date().toISOString()
    };
    setWarrantyCases(prev => prev.map(item => item.id == id ? updatedCase : item));
    saveWarrantyCaseToCloud(updatedCase);

    const laptop = laptops.find(l => l.id == updatedCase.laptopId);
    if (laptop) {
      const updatedLaptop = {
        ...laptop,
        conditionNote: `${laptop.conditionNote || ''}${updates.diagnosis ? ` | KT: ${updates.diagnosis}` : ''}`
      };
      setLaptops(prev => prev.map(l => l.id == laptop.id ? updatedLaptop : l));
      saveLaptopToCloud(updatedLaptop);
    }
    
    addStockMovement({
      laptopId: updatedCase.laptopId,
      orderId: updatedCase.orderId,
      warrantyCaseId: id,
      type: `BẢO HÀNH: ${updatedCase.status}`,
      note: updatedCase.resolution || updatedCase.diagnosis || updatedCase.notes || ''
    });
    return { ok: true, warrantyCase: updatedCase };
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
        : computeProfit(imp);

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

  return (
    <InventoryContext.Provider value={{
      laptops: viewLaptops,
      orders,
      customers,
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
      getLaptopAssignmentError,
      updateLaptop,
      updateLaptopStatus,
      addLaptop,
      deleteLaptop,
      updateFormulaConfig,
      createOrder,
      addOrder,
      updateOrder,
      deleteOrder,
      cancelOrder,
      createCustomer,
      updateCustomer,
      createWarrantyCase,
      updateWarrantyCase,
      importSheetData
    }}>
      {children}
    </InventoryContext.Provider>
  );
};
