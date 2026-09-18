"use client";
import React, { useState, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { useInventory, parseFlexibleFloat, isReservationActive, isOrderCommitted, isOrderCancelled } from '../../context/InventoryContext';
import { labelToKey, getOptions, getLabel } from '../../lib/useFieldOptions';
import { useAuth } from '../../context/AuthContext';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  Calendar,
  Download,
  Trash2,
  X,
  Check,
  History,
  TrendingUp,
  Package
} from 'lucide-react';
import ActivityTimeline from '../ActivityTimeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
const toYMD = (vnDate) => {
  if (!vnDate) return '';
  if (vnDate.includes('-')) return vnDate;
  const parts = vnDate.split('/');
  if (parts.length >= 3) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${y}-${m}-${d}`;
  }
  return vnDate;
};

const toVnFormat = (ymd) => {
  if (!ymd) return '';
  if (ymd.includes('/')) return ymd;
  const parts = ymd.split('-');
  if (parts.length >= 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return ymd;
};

const EditableCell = ({ value, onChange, type = "text", rows, placeholder, className, style, step }) => {
  const incomingValue = value || '';
  const [localValue, setLocalValue] = React.useState(incomingValue);
  const textareaRef = React.useRef(null);

  // Sync external cell updates (for example, polling/reconciliation) into the editor.
  // This local draft is intentionally reset when the server value changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    setLocalValue(incomingValue);
  }, [incomingValue]);
  /* eslint-enable react-hooks/set-state-in-effect */

  React.useEffect(() => {
    if (type === 'textarea' && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localValue, type]);

  const handleBlur = () => {
    if (localValue !== incomingValue) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.target.blur();
    }
  };

  if (type === 'textarea') {
    return (
      <textarea
        ref={textareaRef}
        className={className}
        style={{ ...style, overflow: 'hidden', resize: 'none' }}
        rows={1}
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }

  if (type === 'date') {
    return (
      <input
        type="date"
        className={className}
        style={style}
        value={toYMD(localValue)}
        onChange={(e) => setLocalValue(toVnFormat(e.target.value))}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <input
      type={type}
      step={step}
      className={className}
      style={style}
      placeholder={placeholder}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

export default function Orders() {
  const { 
    laptops, 
    orders: allOrders,
    filteredOrders: orders,
    customers,
    selectedMonth,
    setSelectedMonth,
    availableMonths,
    addOrder,
    updateOrder, 
    cancelOrder,
    SALE_ONLINE_OPTIONS,
    SHIPPING_METHOD_OPTIONS,
    ORDER_STATUS_OPTIONS,
    PAYMENT_STATUS_OPTIONS,
    DELIVERY_STATUS_OPTIONS,
    GIFT_OPTIONS,
    ORDER_TYPES,
    PAYMENT_METHODS,
    addLaptop,
    createCustomer,
    getSelectableLaptops,
    getLaptopAssignmentError,
    getOptions,
    getLabel,
    cloudStatus,
    appOptions
  } = useInventory();

  const { user } = useAuth();
  const tableContainerRef = useRef(null);

  const getFormOptionKey = (groupKey, value) => {
    const option = getOptions(groupKey).find(item => item.key === String(value) || item.label === value);
    return option?.key || value;
  };
  const getFormOptionLabel = (groupKey, value, fallback = '') => {
    if (value == null || value === '') return fallback;
    const option = getOptions(groupKey).find(
      item => item.key === String(value) || item.label === String(value)
    );
    return option?.label || String(value);
  };
  const toKey = (groupKey, label) => getFormOptionKey(groupKey, label);
  const selectValue = (value) => value == null ? '' : String(value);

  const handleOrderStatusChange = (orderId, value) => {
    const statusKey = getFormOptionKey('orderStatus', value);
    // Xác nhận trước khi thay đổi trạng thái hủy/trả
    if (statusKey === 'cancelled') {
      if (!window.confirm(`Bạn có chắc chắn muốn HỦY đơn hàng #${orderId}?`)) return;
    }
    if (statusKey === 'returned') {
      if (!window.confirm(`Bạn có chắc chắn muốn ĐỔI TRẢ (BẢO HÀNH) đơn hàng #${orderId}?`)) return;
    }
    const updates = { orderStatus: statusKey };
    if (statusKey === 'cancelled') {
      updates.deliveryStatus = 'cancelled';
      updates.cancelledAt = new Date().toISOString();
      updates.cancelReason = 'Hủy từ danh sách đơn hàng';
    }
    if (statusKey === 'returned') {
      updates.deliveryStatus = 'returned';
      updates.returnedAt = new Date().toISOString();
      updates.returnReason = 'Đổi trả từ danh sách đơn hàng';
    }
    const result = updateOrder(orderId, updates);
    if (!result.ok) toast.error(result.message);
  };

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSaleOnline, setFilterSaleOnline] = useState('');
  const [filterOrderStatus, setFilterOrderStatus] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
  const [filterDeliveryStatus, setFilterDeliveryStatus] = useState('');
  const [filterShippingMethod, setFilterShippingMethod] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Modal State (cho nút "Tạo Đơn Hàng Mới")
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState('');
  const [showTimeline, setShowTimeline] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });

  // Form State cho Modal 20 trường thông tin
  const [formData, setFormData] = useState({
    createdDate: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    saleOnline: SALE_ONLINE_OPTIONS[0],
    note: '',
    shippingMethod: SHIPPING_METHOD_OPTIONS[0],
    orderStatus: ORDER_STATUS_OPTIONS[0],
    paymentStatus: PAYMENT_STATUS_OPTIONS[0],
    deliveryStatus: DELIVERY_STATUS_OPTIONS[0],
    laptopId: '',
    salePrice: '',
    depositAmount: '',
    depositNote: '',
    reservationExpiresAt: '',
    codAmount: '',
    setupNote: 'Cài cơ bản',
    warranty: '6 tháng',
    gifts: GIFT_OPTIONS[0],
    customerId: '',
    customerNote: '',
    trackingCode: '',
    shipDate: '',
    orderType: ORDER_TYPES ? ORDER_TYPES[0] : 'Bán lẻ (Retail)',
    paymentMethod: PAYMENT_METHODS ? PAYMENT_METHODS[0] : 'Chuyển khoản / Tiền mặt',
    
    tradeInLaptopName: '',
    tradeInPrice: '',
    creditCardFee: ''
  });

  // State quản lý độ rộng của từng cột (Trạng Thái Đơn, Thanh Toán, Gửi Hàng trước Giá Bán)
  const [colWidths, setColWidths] = useState({
    id: 70,
    createdDate: 135,
    note: 180,
    laptopId: 250,
    orderStatus: 165,
    paymentStatus: 160,
    paymentMethod: 165,
    deliveryStatus: 160,
    shippingMethod: 145,
    salePrice: 85,
    profitVnd: 95,
    depositNote: 125,
    codAmount: 85,
    customerId: 150,
    customerAddress: 170,
    setupNote: 120,
    warranty: 80,
    gifts: 145
  });

  const orderColumnKeys = useMemo(() => {
    const keys = [
      'id',
      'createdDate',
      'note',
      'laptopId',
      'orderStatus',
      'paymentStatus',
      'paymentMethod',
      'deliveryStatus',
      'shippingMethod',
      'salePrice'
    ];

    if (user?.role === 'ADMIN') {
      keys.push('profitVnd');
    }

    keys.push(
      'depositNote',
      'codAmount',
      'customerId',
      'customerAddress',
      'setupNote',
      'warranty',
      'gifts'
    );

    return keys;
  }, [user?.role]);

  const orderColumnCount = orderColumnKeys.length + 1;

  const startResizing = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colKey] || 100;

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(45, startWidth + delta);
      setColWidths(prev => ({
        ...prev,
        [colKey]: newWidth
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const totalTableWidth = useMemo(() => {
    return orderColumnKeys.reduce((total, key) => total + (colWidths[key] || 0), 0) + 64;
  }, [colWidths, orderColumnKeys]);

  // Đổi máy trực tiếp trên bảng Google Sheet
  const handleDirectChangeLaptop = (ordId, newLaptopId) => {
    // Check the current status of the order to see if it allows changing the laptop
    const currentOrder = allOrders.find(o => String(o.id) === String(ordId));
    if (!currentOrder) return;
    const isLocked = isOrderCommitted(currentOrder, appOptions) || isOrderCancelled(currentOrder, appOptions);
    if (isLocked) {
      toast.error('Đơn hàng đang ở trạng thái KHÔNG ĐƯỢC PHÉP thay đổi sản phẩm. Vui lòng chuyển trạng thái đơn hàng về "MỚI TẠO" hoặc "ĐÃ CỌC" trước khi đổi máy.');
      return;
    }
    const selected = laptops.find(l => String(l.id) === String(newLaptopId));
    let updates = { laptopId: newLaptopId };
    if (selected) {
      const autoPrice = selected.retailPriceVnd || selected.wholesalePriceVnd;
      if (autoPrice) {
        updates.salePrice = autoPrice;
        // Không tự động ghi đè codAmount — để người dùng tự quyết định COD
        // normalizeMoney sẽ tự clamp codAmount <= debtAmount
      }
    }
    const result = updateOrder(ordId, updates);
    if (!result.ok) toast.error(result.message);
  };

  // Mở modal tạo đơn mới
  const handleOpenAdd = () => {
    setSaveError('');
    setShowCustomerForm(false);
    setNewCustomer({ name: '', phone: '', address: '' });
    setFormData({
      createdDate: selectedMonth === 'ALL' ? new Date().toLocaleDateString('en-GB') : `01/${selectedMonth}`,
      saleOnline: SALE_ONLINE_OPTIONS[0],
      note: '',
      shippingMethod: SHIPPING_METHOD_OPTIONS[0],
      orderStatus: ORDER_STATUS_OPTIONS[0],
      paymentStatus: PAYMENT_STATUS_OPTIONS[0],
      deliveryStatus: DELIVERY_STATUS_OPTIONS[0],
      laptopId: '',
      salePrice: '',
      depositAmount: '',
      depositNote: '',
      reservationExpiresAt: '',
      codAmount: '',
      setupNote: 'Cài cơ bản',
      warranty: '6 tháng',
      gifts: GIFT_OPTIONS[0],
      customerId: '',
      customerNote: '',
      trackingCode: '',
      shipDate: '',
      orderType: ORDER_TYPES[0],
      paymentMethod: PAYMENT_METHODS[0],
      
      tradeInLaptopName: '',
      tradeInPrice: '',
      creditCardFee: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (order) => {
    setSaveError('');
    setShowCustomerForm(false);
    setNewCustomer({ name: '', phone: '', address: '' });
    setShowTimeline(false);
    setFormData({
      ...order,
      id: order.id,
      createdDate: order.createdDate || '',
      saleOnline: getFormOptionLabel('saleOnline', order.saleOnline, SALE_ONLINE_OPTIONS[0]),
      note: order.note || '',
      shippingMethod: getFormOptionLabel('shippingMethod', order.shippingMethod, SHIPPING_METHOD_OPTIONS[0]),
      orderStatus: getFormOptionLabel('orderStatus', order.orderStatus, ORDER_STATUS_OPTIONS[0]),
      paymentStatus: getFormOptionLabel('paymentStatus', order.paymentStatus, PAYMENT_STATUS_OPTIONS[0]),
      deliveryStatus: getFormOptionLabel('deliveryStatus', order.deliveryStatus, DELIVERY_STATUS_OPTIONS[0]),
      laptopId: order.laptopId || '',
      salePrice: order.salePrice ?? '',
      depositAmount: order.depositAmount ?? '',
      depositNote: order.depositNote || '',
      reservationExpiresAt: order.reservationExpiresAt || '',
      codAmount: order.codAmount ?? '',
      setupNote: order.setupNote || '',
      warranty: order.warranty || '',
      gifts: getFormOptionLabel('giftOptions', order.gifts, GIFT_OPTIONS[0]),
      customerId: order.customerId || '',
      customerNote: order.customerNote || '',
      trackingCode: order.trackingCode || '',
      shipDate: order.shipDate || '',
      orderType: getFormOptionLabel('orderType', order.orderType, ORDER_TYPES[0]),
      paymentMethod: getFormOptionLabel('paymentMethod', order.paymentMethod, PAYMENT_METHODS[0]),
      tradeInLaptopName: '',
      tradeInPrice: '',
      creditCardFee: order.creditCardFee ?? ''
    });
    setIsModalOpen(true);
  };

  const handleCreateCustomer = async () => {
    const payload = {
      name: newCustomer.name.trim(),
      phone: newCustomer.phone.trim(),
      address: newCustomer.address.trim()
    };
    if (!payload.name) {
      toast.error('Vui lòng nhập tên khách hàng.');
      return;
    }
    const result = await createCustomer(payload);
    if (!result?.ok) {
      toast.error(`Không tạo được khách hàng: ${result?.message || 'Lỗi không xác định.'}`);
      return;
    }
    setFormData(prev => ({ ...prev, customerId: String(result.customer.id) }));
    setNewCustomer({ name: '', phone: '', address: '' });
    setShowCustomerForm(false);
  };

  // Select Laptop trong Modal Form
  const handleSelectLaptopChange = (laptopId) => {
    const selected = laptops.find(l => String(l.id) === String(laptopId));
    let autoPrice = formData.salePrice;
    if (selected) {
      autoPrice = selected.retailPriceVnd || selected.wholesalePriceVnd || formData.salePrice;
    }
    setFormData(prev => ({
      ...prev,
      laptopId,
      salePrice: autoPrice,
      // Không tự động ghi đè codAmount — để người dùng tự quyết định COD
    }));
  };

  // Submit Modal Form
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    setSaveError('');
    const assignmentError = getLaptopAssignmentError(formData.laptopId, formData.id);
    if (assignmentError) {
      setSaveError(assignmentError);
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    try {
    const finalSalePrice = parseFlexibleFloat(formData.salePrice);
    const finalAmountPaid = parseFlexibleFloat(formData.depositAmount);
    const finalDebtAmount = Math.max(0, finalSalePrice - finalAmountPaid);
    const finalCodAmount = Math.min(parseFlexibleFloat(formData.codAmount), finalDebtAmount);
    
    // Xử lý Thu cũ đổi mới
    let tradeInLaptopId = '';
    if (getFormOptionKey('orderType', formData.orderType) === 'trade_in' && formData.tradeInLaptopName && formData.tradeInPrice) {
      const result = await addLaptop({
        name: formData.tradeInLaptopName,
        category: 'Thu Cũ',
        status: 'available',
        importPriceVnd: parseFlexibleFloat(formData.tradeInPrice),
        conditionNote: 'Hàng thu lại từ khách (Trade-in)',
        location: 'store'
      });
      if (!result.ok) {
        setSaveError(`Không tạo được máy thu cũ: ${result.message}`);
        return;
      }
      tradeInLaptopId = result.laptop.id;
    }

    const orderPayload = {
      ...formData,
      salePrice: finalSalePrice,
      codAmount: finalCodAmount,
      tradeInLaptopId
    };
    const result = formData.id
      ? await updateOrder(formData.id, orderPayload, { awaitPersistence: true })
      : await addOrder(orderPayload);
    if (!result.ok) {
      setSaveError(`Không lưu được đơn: ${result.message}`);
      return;
    }
    toast.success(formData.id
      ? `Đã cập nhật đơn hàng #${formData.id}.`
      : `Đã tạo đơn hàng #${result.order.id}.`);
    setIsModalOpen(false);
    } catch (error) {
      setSaveError(error.message || 'Không thể lưu đơn. Vui lòng thử lại.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // Hủy đơn nhưng vẫn giữ lịch sử để đối soát.
  const handleDeleteOrder = (ordId) => {
    if (window.confirm(`Bạn có chắc chắn muốn hủy Đơn hàng #${ordId}? Lịch sử đơn vẫn được giữ để đối soát.`)) {
      const result = cancelOrder(ordId);
      if (!result.ok) toast.error(result.message);
    }
  };

  // Lọc Đơn Hàng Thông Minh
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchId = String(o.id).toLowerCase().includes(term);
        const matchCustomer = String(o.customerId || '').toLowerCase().includes(term);
        const matchLaptop = String(o.laptopId || '').toLowerCase().includes(term);
        const matchTracking = String(o.trackingCode || '').toLowerCase().includes(term);
        const matchAddress = String(o.customerAddress || '').toLowerCase().includes(term);
        const matchNote = String(o.note || o.note1 || o.note2 || '').toLowerCase().includes(term);
        if (!matchId && !matchCustomer && !matchLaptop && !matchTracking && !matchAddress && !matchNote) return false;
      }

      if (filterSaleOnline && labelToKey('saleOnline', o.saleOnline) !== labelToKey('saleOnline', filterSaleOnline)) return false;
      if (filterOrderStatus && o.orderStatus !== labelToKey('orderStatus', filterOrderStatus)) return false;
      if (filterPaymentStatus && o.paymentStatus !== labelToKey('paymentStatus', filterPaymentStatus)) return false;
      if (filterDeliveryStatus && o.deliveryStatus !== labelToKey('deliveryStatus', filterDeliveryStatus)) return false;
      if (filterShippingMethod && labelToKey('shippingMethod', o.shippingMethod) !== labelToKey('shippingMethod', filterShippingMethod)) return false;

      // Lọc theo Phân Loại Sản Phẩm (join từ danh sách máy)
      if (filterCategory) {
        const laptopObj = laptops.find(l => String(l.id) === String(o.laptopId));
        if (!laptopObj || labelToKey('category', laptopObj.category) !== labelToKey('category', filterCategory)) return false;
      }

      return true;
    }).sort((a, b) => {
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  }, [orders, laptops, searchTerm, filterSaleOnline, filterOrderStatus, filterPaymentStatus, filterDeliveryStatus, filterShippingMethod, filterCategory]);

  // Xuất file CSV Đơn Hàng
  const handleExportCSV = () => {
    if (orders.length === 0) {
      toast.error('Không có dữ liệu đơn hàng để xuất!');
      return;
    }
    const isAdmin = user?.role === 'ADMIN';
    const headers = [
      'ID Đơn', 'Ngày Tạo', 'SALE Online', 'Ghi Chú', 'Mã Máy (ID)', 'Cấu Hình Máy',
      'Trạng Thái Đơn', 'Trạng Thái Thanh Toán', 'Phương Thức TT', 'Trạng Thái Giao Hàng', 'Gửi Hàng',
      'Giá Bán (tr)',
      ...(isAdmin ? ['Lợi Nhuận (tr)'] : []),
      'Cọc', 'Thu Hộ COD (tr)', 'Thông Tin Khách', 'Địa Chỉ', 'Mã Vận Đơn', 'Cài Đặt', 'Bảo Hành', 'Quà Tặng', 'Ngày Gửi'
    ];

    const rows = filteredOrders.map(o => {
      const laptopObj = laptops.find(l => l.id === o.laptopId);
      const noteText = o.note || [o.note1, o.note2].filter(Boolean).join(' - ') || '';
      const base = [
        o.id,
        `"${o.createdDate || ''}"`,
        `"${o.saleOnline || ''}"`,
        `"${noteText}"`,
        `"${o.laptopId || ''}"`,
        `"${laptopObj?.name || ''}"`,
        `"${o.orderStatus || ''}"`,
        `"${o.paymentStatus || ''}"`,
        `"${o.paymentMethod || ''}"`,
        `"${o.deliveryStatus || ''}"`,
        `"${o.shippingMethod || ''}"`,
        o.salePrice || 0,
      ];
      const profit = isAdmin
        ? [(laptopObj && o.salePrice ? Number((parseFlexibleFloat(o.salePrice) - parseFlexibleFloat(laptopObj.importPriceVnd)).toFixed(2)) : '')]
        : [];
      const rest = [
        `"${o.depositNote || ''}"`,
        o.codAmount || 0,
        `"${o.customerId || ''}"`,
        `"${o.customerAddress || ''}"`,
        `"${o.trackingCode || ''}"`,
        `"${o.setupNote || ''}"`,
        `"${o.warranty || ''}"`,
        `"${o.gifts || ''}"`,
        `"${o.shipDate || ''}"`
      ];
      return [...base, ...profit, ...rest];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `CitiLap_DonHang_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Badge Style Utilities
  const getOrderStatusBadgeClass = (status) => {
    const key = labelToKey('orderStatus', status, appOptions);
    switch (key) {
      case 'done': return 'pill-gray';
      case 'shipping': return 'pill-info';
      case 'prepared': return 'pill-warning';
      case 'new': return 'pill-white';
      case 'deposited': return 'pill-warning';
      case 'cancelled':
      case 'returned': return 'pill-gray';
      default: return 'pill-white';
    }
  };

  const getPaymentStatusBadgeClass = (status) => {
    const key = labelToKey('paymentStatus', status, appOptions);
    switch (key) {
      case 'paid': return 'pill-success';
      case 'deposited': return 'pill-warning';
      case 'unpaid': return 'pill-danger';
      case 'cod': return 'pill-purple';
      default: return 'pill-neutral';
    }
  };

  const getPaymentMethodBadgeClass = (method) => {
    const key = labelToKey('paymentMethod', method, appOptions);
    switch (key) {
      case 'transfer_cash': return 'pill-info';
      case 'card': return 'pill-purple';
      case 'installment': return 'pill-info';
      case 'debt': return 'pill-danger';
      default: return 'pill-neutral';
    }
  };

  const getDeliveryStatusBadgeClass = (status) => {
    const key = labelToKey('deliveryStatus', status, appOptions);
    switch (key) {
      case 'delivered': return 'pill-success';
      case 'shipped': return 'pill-purple';
      case 'preparing': return 'pill-warning';
      case 'returned': return 'pill-danger';
      default: return 'pill-neutral';
    }
  };

  const getOrderRowStatusClass = (ord) => {
    const statusKey = labelToKey('orderStatus', ord.orderStatus, appOptions);
    switch (statusKey) {
      case 'done': return 'order-row-completed';
      case 'cancelled': return 'order-row-cancelled';
      case 'returned': return 'order-row-returned';
      case 'shipping': return 'order-row-shipping';
      case 'prepared': return 'order-row-preparing';
      case 'new': return 'order-row-new';
      case 'deposited': return 'order-row-deposited';
      default: return 'order-row-other';
    }
  };

  return (
    <section className="page-section list-workspace-page">
      {/* SECTION HEADER */}
      <div className="section-title section-header list-page-header">
        <div>
          <h1 className="list-page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>
            <ShoppingCart className="text-primary" size={24} /> Quản Lý Đơn Hàng & Xuất Bán ({filteredOrders.length} / {orders.length} đơn)
          </h1>
          <div className="list-period" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <Calendar size={14} style={{ color: '#64748b' }} />
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Kỳ:</span>
            <select
              aria-label="Tháng đơn hàng"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', cursor: 'pointer' }}
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
              <option value="ALL">Tất Cả Các Tháng</option>
            </select>
          </div>
        </div>

        <div className="section-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download size={14} /> Xuất CSV / Excel
          </Button>

          {(user?.role === 'ADMIN' || user?.role === 'SALES' || !user) && (
            <Button data-testid="order-add-button" variant="default" size="sm" onClick={handleOpenAdd}>
              <Plus size={16} /> Tạo Đơn Hàng Mới
            </Button>
          )}
        </div>
      </div>

      {cloudStatus === 'checking' && (
        <div className="sync-indicator checking" style={{ marginBottom: '0.75rem' }}>
          <span className="sync-spinner"></span>
          Đang kết nối cloud...
        </div>
      )}

      {/* FILTER & SEARCH CARD */}
      <div className="card glass filter-card orders-filter-card" style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
        <div className="filter-grid orders-filter-grid" style={{ gap: '0.75rem' }}>
          <div className="filter-item" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="order-field-1" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>
              <Search size={13} style={{ display: 'inline', marginRight: '3px' }} /> Tìm kiếm thông minh
            </label>
            <Input id="order-field-1"
              type="text"
              placeholder="Tìm theo ID (#1001), Tên/SĐT khách, Mã máy (#709), Note, Mã vận đơn..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-item">
            <label htmlFor="order-field-2" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>SALE Online</label>
            <select id="order-field-2"
              className="form-control filter-input"
              value={filterSaleOnline} 
              onChange={e => setFilterSaleOnline(e.target.value)}
            >
              <option value="">-- Tất cả SALE --</option>
              {SALE_ONLINE_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="order-field-3" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Trạng Thái Đơn</label>
            <select id="order-field-3"
              className="form-control filter-input"
              value={filterOrderStatus} 
              onChange={e => setFilterOrderStatus(e.target.value)}
            >
              <option value="">-- Tất cả Trạng Thái --</option>
              {ORDER_STATUS_OPTIONS.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="order-field-4" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Trạng Thái Thanh Toán</label>
            <select id="order-field-4"
              className="form-control filter-input"
              value={filterPaymentStatus} 
              onChange={e => setFilterPaymentStatus(e.target.value)}
            >
              <option value="">-- Tất cả Thanh Toán --</option>
              {PAYMENT_STATUS_OPTIONS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="order-field-5" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Hình Thức Gửi Hàng</label>
            <select id="order-field-5"
              className="form-control filter-input"
              value={filterShippingMethod} 
              onChange={e => setFilterShippingMethod(e.target.value)}
            >
              <option value="">-- Tất cả Gửi Hàng --</option>
              {SHIPPING_METHOD_OPTIONS.map(sm => (
                <option key={sm} value={sm}>{sm}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="order-field-6" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Phân Loại Sản Phẩm</label>
            <select id="order-field-6"
              className="form-control filter-input"
              value={filterCategory} 
              onChange={e => setFilterCategory(e.target.value)}
            >
              <option value="">-- Tất cả Phân Loại --</option>
              {getOptions('category').map(opt => (
                <option key={opt.key} value={opt.label}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      <div className="list-summary-strip" aria-label="Tóm tắt đơn hàng">
        <div className="list-summary-item">
          <div className="summary-icon"><Package size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Đang hiển thị</span>
            <strong className="summary-value">{filteredOrders.length}/{orders.length}</strong>
          </div>
        </div>
        <div className="list-summary-item list-summary-item-warning">
          <div className="summary-icon"><TrendingUp size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Chờ thanh toán</span>
            <strong className="summary-value">{orders.filter(order => ['unpaid', 'deposited', 'cod'].includes(labelToKey('paymentStatus', order.paymentStatus))).length}</strong>
          </div>
        </div>
        <div className="list-summary-item list-summary-item-success">
          <div className="summary-icon"><Check size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Hoàn thành</span>
            <strong className="summary-value">{orders.filter(order => labelToKey('orderStatus', order.orderStatus) === 'done').length}</strong>
          </div>
        </div>
      </div>
      </div>


      {/* ORDERS DATA TABLE (CỘT TRẠNG THÁI & THÀNH TOÁN LÊN TRƯỚC GIÁ BÁN, GỘP GHI CHÚ) */}
      <div className="card glass p-0 list-table-card orders-list-card">
        <div 
          className="inventory-table-container list-table-scroll orders-table-container"
          ref={tableContainerRef}
        >
          <table className={`data-table data-table-wide orders-list-table ${user?.role === 'ADMIN' ? 'is-admin' : ''}`} aria-label="Order list" style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}>
            <thead>
              <tr>
                <th className="sticky-col-1" style={{ width: `${colWidths.id}px`, minWidth: `${colWidths.id}px`, position: 'relative' }}>
                  ID Đơn
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'id')} title="Kéo để chỉnh rộng hẹp cột ID" />
                </th>
                <th className="sticky-col-2" style={{ width: `${colWidths.createdDate}px`, minWidth: `${colWidths.createdDate}px`, position: 'relative', left: `${colWidths.id}px` }}>
                  Ngày tạo & SALE
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'createdDate')} title="Kéo để chỉnh rộng hẹp cột Ngày tạo & SALE" />
                </th>
                
                {/* 4. GỘP 2 CỘT GHI CHÚ THÀNH 1 CỘT "GHI CHÚ" */}
                <th style={{ width: `${colWidths.note}px`, minWidth: `${colWidths.note}px`, position: 'relative' }}>
                  Ghi Chú
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'note')} title="Kéo để chỉnh rộng hẹp cột Ghi Chú" />
                </th>

                {/* 5. CỘT "MÁY" 2 DÒNG (DÒNG 1: SELECTOR ID, DÒNG 2: TÊN CẤU HÌNH) */}
                <th style={{ width: `${colWidths.laptopId}px`, minWidth: `${colWidths.laptopId}px`, position: 'relative' }}>
                  Máy (ID & Cấu Hình)
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'laptopId')} title="Kéo để chỉnh rộng hẹp cột Máy" />
                </th>

                {/* 6. TRẠNG THÁI ĐƠN HÀNG (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                <th style={{ width: `${colWidths.orderStatus}px`, minWidth: `${colWidths.orderStatus}px`, position: 'relative' }}>
                  Trạng Thái Đơn
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'orderStatus')} title="Kéo để chỉnh rộng hẹp cột Trạng Thái Đơn" />
                </th>

                {/* 7. THANH TOÁN (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                <th style={{ width: `${colWidths.paymentStatus}px`, minWidth: `${colWidths.paymentStatus}px`, position: 'relative' }}>
                  Thanh Toán
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'paymentStatus')} title="Kéo để chỉnh rộng hẹp cột Thanh Toán" />
                </th>

                {/* PHƯƠNG THỨC THANH TOÁN */}
                <th style={{ width: `${colWidths.paymentMethod}px`, minWidth: `${colWidths.paymentMethod}px`, position: 'relative' }}>
                  Phương Thức TT
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'paymentMethod')} title="Kéo để chỉnh rộng hẹp cột Phương Thức TT" />
                </th>

                {/* 8. GIAO HÀNG (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                <th style={{ width: `${colWidths.deliveryStatus}px`, minWidth: `${colWidths.deliveryStatus}px`, position: 'relative' }}>
                  Giao Hàng
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'deliveryStatus')} title="Kéo để chỉnh rộng hẹp cột Giao Hàng" />
                </th>

                {/* 9. NGÀY & GỬI HÀNG (GỘP CHUNG) */}
                <th style={{ width: `${colWidths.shippingMethod}px`, minWidth: `${colWidths.shippingMethod}px`, position: 'relative' }}>
                  Ngày & Gửi Hàng
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'shippingMethod')} title="Kéo để chỉnh rộng hẹp cột Ngày & Gửi Hàng" />
                </th>

                {/* 10. GIÁ BÁN (TR) */}
                <th style={{ width: `${colWidths.salePrice}px`, minWidth: `${colWidths.salePrice}px`, color: '#2563eb', position: 'relative' }}>
                  Giá Bán (tr)
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'salePrice')} title="Kéo để chỉnh rộng hẹp cột Giá bán" />
                </th>

                {/* 10b. LỢI NHUẬN (TR) — chỉ ADMIN: giá bán - giá nhập */}
                {user?.role === 'ADMIN' && (
                  <th style={{ width: `${colWidths.profitVnd}px`, minWidth: `${colWidths.profitVnd}px`, color: '#34d399', position: 'relative' }}>
                    Lợi Nhuận (tr)
                    <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'profitVnd')} title="Kéo để chỉnh rộng hẹp cột Lợi nhuận" />
                  </th>
                )}

                {/* 11. CỌC */}
                <th style={{ width: `${colWidths.depositNote}px`, minWidth: `${colWidths.depositNote}px`, color: '#d97706', position: 'relative' }}>
                  Cọc
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'depositNote')} title="Kéo để chỉnh rộng hẹp cột Cọc" />
                </th>

                {/* 12. THU HỘ COD */}
                <th style={{ width: `${colWidths.codAmount}px`, minWidth: `${colWidths.codAmount}px`, color: '#059669', position: 'relative' }}>
                  Thu hộ COD
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'codAmount')} title="Kéo để chỉnh rộng hẹp cột Thu hộ" />
                </th>

                <th style={{ width: `${colWidths.customerId}px`, minWidth: `${colWidths.customerId}px`, position: 'relative' }}>
                  Thông Tin Khách
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'customerId')} title="Kéo để chỉnh rộng hẹp cột Khách" />
                </th>
                <th style={{ width: `${colWidths.customerAddress}px`, minWidth: `${colWidths.customerAddress}px`, position: 'relative' }}>
                  Địa Chỉ
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'customerAddress')} title="Kéo để chỉnh rộng hẹp cột Địa Chỉ" />
                </th>

                <th style={{ width: `${colWidths.setupNote}px`, minWidth: `${colWidths.setupNote}px`, position: 'relative' }}>
                  Cài Đặt
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'setupNote')} title="Kéo để chỉnh rộng hẹp cột Cài Đặt" />
                </th>
                <th style={{ width: `${colWidths.warranty}px`, minWidth: `${colWidths.warranty}px`, position: 'relative' }}>
                  Bảo Hành
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'warranty')} title="Kéo để chỉnh rộng hẹp cột Bảo Hành" />
                </th>
                <th style={{ width: `${colWidths.gifts}px`, minWidth: `${colWidths.gifts}px`, position: 'relative' }}>
                  Quà Tặng
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'gifts')} title="Kéo để chỉnh rộng hẹp cột Quà Tặng" />
                </th>
                <th style={{ width: '64px', minWidth: '64px' }}>Sửa</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={orderColumnCount} className="empty-cell">
                    Không tìm thấy đơn hàng nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => {
                  const laptopObj = laptops.find(l => String(l.id) === String(ord.laptopId));
                  const noteValue = ord.note !== undefined ? ord.note : [ord.note1, ord.note2].filter(Boolean).join(' - ');

                  return (
                    <tr key={ord.id} data-testid={`order-row-${ord.id}`} className={getOrderRowStatusClass(ord)}>
                      {/* ID Đơn */}
                      <td className="sticky-col-1" style={{ width: `${colWidths.id}px`, minWidth: `${colWidths.id}px`, fontWeight: 800, color: 'var(--primary)' }}>
                        #{ord.id}
                      </td>

                      {/* Ngày tạo, SALE Online (Gộp chung) */}
                      <td className="sticky-col-2" style={{ width: `${colWidths.createdDate}px`, minWidth: `${colWidths.createdDate}px`, left: `${colWidths.id}px` }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <div style={{ flex: 1 }}>
                              <EditableCell 
                                type="date"
                                className="sheet-cell-input"
                                value={ord.createdDate || ''} 
                                onChange={(val) => updateOrder(ord.id, { createdDate: val })} 
                              />
                            </div>
                          </div>
                          <select 
                            className="sheet-cell-select"
                            style={{ fontWeight: 700, color: '#0369a1' }}
                            value={selectValue(ord.saleOnline)}
                            onChange={(e) => updateOrder(ord.id, { saleOnline: e.target.value })}
                          >
                            {getOptions('saleOnline').map(s => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* 4. GHI CHÚ GỘP 1 CỘT (TEXTBOX 3 HÀNG THOÁNG MÁT) */}
                      <td style={{ width: `${colWidths.note}px`, minWidth: `${colWidths.note}px` }}>
                        <EditableCell 
                          type="textarea"
                          className="sheet-cell-textarea"
                          rows={3}
                          style={{ color: 'var(--text-muted)' }}
                          value={noteValue || ''} 
                          onChange={(val) => updateOrder(ord.id, { note: val })} 
                          placeholder="Ghi chú đơn hàng..."
                        />
                      </td>


                      {/* 5. CỘT MÁY: 2 DÒNG THOÁNG MÁT (DÒNG 1: SELECTOR ID, DÒNG 2: TÊN CẤU HÌNH) */}
                      <td style={{ width: `${colWidths.laptopId}px`, minWidth: `${colWidths.laptopId}px`, padding: '0.3rem 0.4rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {/* Dòng 1: Dropdown chọn ID Máy - khóa khi đơn đã xác định sản phẩm */}
                          {(() => {
                            const lockedByDelivery = ['shipped', 'delivered'].includes(labelToKey('deliveryStatus', ord.deliveryStatus));
                            const lockedByPayment = labelToKey('paymentStatus', ord.paymentStatus) === 'paid';
                            const lockedByOrder = isOrderCommitted(ord, appOptions) || isOrderCancelled(ord, appOptions);

                            const isLocked = lockedByDelivery || lockedByPayment || lockedByOrder;

                            // Xác định lý do khóa để hiển thị tooltip rõ ràng
                            const lockReason = lockedByDelivery
                              ? `Giao hàng: "${ord.deliveryStatus}"`
                              : lockedByOrder
                              ? `Trạng thái đơn: "${ord.orderStatus}"`
                              : lockedByPayment
                              ? `Thanh toán: "${ord.paymentStatus}"`
                              : '';

                            return (

                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <select 
                                  className="sheet-cell-select"
                                  style={{ 
                                    fontWeight: 800, 
                                    color: isLocked ? '#64748b' : '#1d4ed8', 
                                    fontSize: '0.82rem', 
                                    height: '22px',
                                    flex: 1,
                                    cursor: isLocked ? 'not-allowed' : 'pointer',
                                    opacity: isLocked ? 0.75 : 1,
                                    background: isLocked ? 'rgba(100,116,139,0.08)' : undefined
                                  }}
                                  value={ord.laptopId || ''} 
                                  onChange={(e) => handleDirectChangeLaptop(ord.id, e.target.value)}
                                  disabled={isLocked}
                                  title={isLocked ? `🔒 Không được đổi máy — ${lockReason}` : 'Chọn máy cho đơn hàng'}
                                >
                                  <option value="">- Chưa gán máy -</option>
                                  {getSelectableLaptops(ord.id).map(l => (
                                    <option key={l.id} value={l.id}>
                                      {l.id} - {l.name} ({l.status})
                                    </option>
                                  ))}
                                </select>
                                {isLocked && (
                                  <span title={`Không được đổi máy — ${lockReason}`} style={{ fontSize: '0.75rem', flexShrink: 0 }}>🔒</span>
                                )}
                              </div>
                            );
                          })()}

                          {/* Dòng 2: Tên cấu hình máy tự động trích xuất từ kho */}
                          <div 
                            style={{ fontSize: '0.72rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2, paddingLeft: '4px', fontWeight: 500 }}
                            title={laptopObj?.name || 'Chưa chọn máy'}
                          >
                            {laptopObj ? laptopObj.name : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Tên cấu hình máy...</span>}
                          </div>
                          {isReservationActive(ord, appOptions) && ord.reservationExpiresAt && (
                            <div style={{ fontSize: '0.7rem', color: '#d97706', paddingLeft: '4px' }}>
                              Giữ tới: {new Date(ord.reservationExpiresAt).toLocaleString('vi-VN')}
                            </div>
                          )}
                          {(() => {
                            // Đơn vẫn ở trạng thái cọc nhưng đã hết hạn -> máy đã bị nhả về kho
                            const oKey = labelToKey('orderStatus', ord.orderStatus);
                            const pKey = labelToKey('paymentStatus', ord.paymentStatus);
                            const isDepositOrder = oKey === 'deposited' || pKey === 'deposited';
                            if (!ord.laptopId || !isDepositOrder || isOrderCommitted(ord, appOptions) || isOrderCancelled(ord, appOptions)) return null;
                            if (isReservationActive(ord, appOptions)) return null;
                            return (
                              <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 700, paddingLeft: '4px' }}
                                title='Đơn giữ chỗ đã hết hạn — máy đã được nhả về kho. Hãy gia hạn giữ máy hoặc hủy đơn.'>
                                ⚠️ Hết hạn giữ máy
                              </div>
                            );
                          })()}
                        </div>
                      </td>


                      {/* 6. TRẠNG THÁI ĐƠN (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                      <td style={{ width: `${colWidths.orderStatus}px`, minWidth: `${colWidths.orderStatus}px` }}>
                        <select
                          data-testid={`order-status-cell-${ord.id}`}
                          className={`sheet-cell-select ${getOrderStatusBadgeClass(ord.orderStatus)}`}
                          style={{ fontWeight: 700, borderRadius: '4px' }}
                          value={selectValue(getLabel('orderStatus', ord.orderStatus))}
                          onChange={(e) => handleOrderStatusChange(ord.id, e.target.value)}
                        >
                          {ORDER_STATUS_OPTIONS.map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </td>

                      {/* 7. THANH TOÁN (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                      <td style={{ width: `${colWidths.paymentStatus}px`, minWidth: `${colWidths.paymentStatus}px` }}>
                        <select
                          data-testid={`order-payment-cell-${ord.id}`}
                          className={`sheet-cell-select ${getPaymentStatusBadgeClass(ord.paymentStatus)}`}
                          style={{ fontWeight: 700, borderRadius: '4px' }}
                          value={selectValue(getLabel('paymentStatus', ord.paymentStatus))}
                          onChange={(e) => updateOrder(ord.id, { paymentStatus: toKey('paymentStatus', e.target.value) })}
                        >
                          {PAYMENT_STATUS_OPTIONS.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>

                      {/* PHƯƠNG THỨC THANH TOÁN */}
                      <td style={{ width: `${colWidths.paymentMethod}px`, minWidth: `${colWidths.paymentMethod}px` }}>
                        <select
                          className={`sheet-cell-select ${getPaymentMethodBadgeClass(ord.paymentMethod)}`}
                          style={{ fontWeight: 600, borderRadius: '4px' }}
                          value={selectValue(getLabel('paymentMethod', ord.paymentMethod))}
                          onChange={(e) => updateOrder(ord.id, { paymentMethod: toKey('paymentMethod', e.target.value) })}
                        >
                          {PAYMENT_METHODS.map(pm => (
                            <option key={pm} value={pm}>{pm}</option>
                          ))}
                        </select>
                      </td>

                      {/* 8. GIAO HÀNG (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                      <td style={{ width: `${colWidths.deliveryStatus}px`, minWidth: `${colWidths.deliveryStatus}px` }}>
                        <select
                          data-testid={`order-delivery-cell-${ord.id}`}
                          className={`sheet-cell-select ${getDeliveryStatusBadgeClass(ord.deliveryStatus)}`}
                          style={{ fontWeight: 700, borderRadius: '4px' }}
                          value={selectValue(getLabel('deliveryStatus', ord.deliveryStatus))}
                          onChange={(e) => updateOrder(ord.id, { deliveryStatus: toKey('deliveryStatus', e.target.value) })}
                        >
                          {DELIVERY_STATUS_OPTIONS.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </td>

                      {/* 9. GỬI HÀNG & VẬN ĐƠN (GỘP CHUNG) */}
                      <td style={{ width: `${colWidths.shippingMethod}px`, minWidth: `${colWidths.shippingMethod}px` }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <select
                            className="sheet-cell-select"
                            style={{ fontWeight: 600 }}
                            value={selectValue(getLabel('shippingMethod', ord.shippingMethod))}
                            onChange={(e) => updateOrder(ord.id, { shippingMethod: toKey('shippingMethod', e.target.value) })}
                          >
                            {SHIPPING_METHOD_OPTIONS.map(sm => (
                              <option key={sm} value={sm}>{sm}</option>
                            ))}
                          </select>
                          <EditableCell 
                            type="date"
                            className="sheet-cell-input"
                            value={ord.shipDate || ''} 
                            onChange={(val) => updateOrder(ord.id, { shipDate: val })} 
                            placeholder="Ngày gửi..."
                          />
                          {(['viettelpost', 'shopee_spx'].includes(labelToKey('shippingMethod', ord.shippingMethod))) && (
                            <EditableCell 
                              type="text"
                              className="sheet-cell-input"
                              style={{ fontFamily: 'monospace', fontSize: '0.75rem', marginTop: '2px', border: '1px dashed #cbd5e1' }}
                              value={ord.trackingCode || ''} 
                              onChange={(val) => updateOrder(ord.id, { trackingCode: val })} 
                              placeholder="Nhập mã vận đơn..."
                            />
                          )}
                        </div>
                      </td>

                      {/* 10. GIÁ BÁN (TR) */}
                      <td style={{ width: `${colWidths.salePrice}px`, minWidth: `${colWidths.salePrice}px` }}>
                        <EditableCell 
                          type="number" 
                          step="any" 
                          className="sheet-cell-input"
                          style={{ fontWeight: 800, color: '#2563eb' }}
                          value={ord.salePrice !== undefined ? ord.salePrice : ''} 
                          onChange={(val) => updateOrder(ord.id, { salePrice: val })} 
                        />
                      </td>

                      {/* 10b. LỢI NHUẬN (TR) — chỉ ADMIN: giá bán - giá nhập của máy */}
                      {user?.role === 'ADMIN' && (
                        <td style={{ width: `${colWidths.profitVnd}px`, minWidth: `${colWidths.profitVnd}px`, fontWeight: 800, color: '#059669' }}>
                          {laptopObj && ord.salePrice
                            ? Number((parseFlexibleFloat(ord.salePrice) - parseFlexibleFloat(laptopObj.importPriceVnd)).toFixed(2))
                            : '-'}
                        </td>
                      )}

                      {/* 11. CỌC (TEXTBOX 3 HÀNG THOÁNG MÁT) */}
                      <td style={{ width: `${colWidths.depositNote}px`, minWidth: `${colWidths.depositNote}px` }}>
                        <EditableCell 
                          type="textarea"
                          className="sheet-cell-textarea"
                          rows={3}
                          style={{ fontWeight: 600, color: '#d97706' }}
                          value={ord.depositNote || ''} 
                          onChange={(val) => updateOrder(ord.id, { depositNote: val })} 
                          placeholder="500k VCB 08/08..."
                        />
                      </td>

                      {/* 12. THU HỘ COD (TR) */}
                      <td style={{ width: `${colWidths.codAmount}px`, minWidth: `${colWidths.codAmount}px` }}>
                        <EditableCell 
                          type="number" 
                          step="any" 
                          className="sheet-cell-input"
                          style={{ fontWeight: 800, color: '#059669' }}
                          value={ord.codAmount !== undefined ? ord.codAmount : ''} 
                          onChange={(val) => updateOrder(ord.id, { codAmount: val })} 
                        />
                      </td>

                      {/* Thông Tin Khách */}
                      <td style={{ width: `${colWidths.customerId}px`, minWidth: `${colWidths.customerId}px` }}>
                        <EditableCell 
                          type="textarea"
                          className="sheet-cell-textarea"
                          rows={3}
                          style={{ fontWeight: 600 }}
                          value={ord.customerInfo || customers.find(customer => String(customer.id) === String(ord.customerId))?.name || ''}
                          onChange={(val) => updateOrder(ord.id, { customerInfo: val })}
                          placeholder="Tên - SĐT..."
                        />
                      </td>

                      {/* Địa Chỉ */}
                      <td style={{ width: `${colWidths.customerAddress}px`, minWidth: `${colWidths.customerAddress}px` }}>
                        <EditableCell 
                          type="textarea"
                          className="sheet-cell-textarea"
                          rows={3}
                          style={{ color: 'var(--text-muted)' }}
                          value={ord.customerAddress || ''}
                          onChange={(val) => updateOrder(ord.id, { customerAddress: val })}
                          placeholder="Địa chỉ..."
                        />
                      </td>



                      {/* Cài Đặt */}
                      <td style={{ width: `${colWidths.setupNote}px`, minWidth: `${colWidths.setupNote}px` }}>
                        <EditableCell 
                          type="textarea"
                          className="sheet-cell-textarea"
                          value={ord.setupNote || ''} 
                          onChange={(val) => updateOrder(ord.id, { setupNote: val })} 
                          placeholder="Cài đặt..."
                        />
                      </td>

                      {/* Bảo Hành */}
                      <td style={{ width: `${colWidths.warranty}px`, minWidth: `${colWidths.warranty}px` }}>
                        <EditableCell 
                          type="textarea"
                          className="sheet-cell-textarea"
                          value={ord.warranty || ''} 
                          onChange={(val) => updateOrder(ord.id, { warranty: val })} 
                          placeholder="6 tháng..."
                        />
                      </td>

                      {/* Quà Tặng */}
                      <td style={{ width: `${colWidths.gifts}px`, minWidth: `${colWidths.gifts}px` }}>
                        <select
                          className="sheet-cell-select"
                          value={selectValue(getLabel('giftOptions', ord.gifts))}
                          onChange={(e) => updateOrder(ord.id, { gifts: e.target.value })}
                        >
                          {GIFT_OPTIONS.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </td>
                      {/* Mở form sửa chi tiết */}
                      <td className="order-actions-cell" style={{ width: '64px', minWidth: '64px', textAlign: 'center' }}>
                        <div className="order-row-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          data-testid={`order-edit-button-${ord.id}`}
                          onClick={() => handleOpenEdit(ord)}
                          title="Chỉnh sửa đơn hàng"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                          data-testid={`order-cancel-button-${ord.id}`}
                          onClick={() => handleDeleteOrder(ord.id)}
                          title="Hủy đơn hàng"
                        >
                          <Trash2 size={14} />
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* THANH SCROLL NGANG CỐ ĐỊNH Ở ĐÁY MÀN HÌNH */}


      {/* MODAL TẠO ĐƠN HÀNG MỚI */}
      {isModalOpen && (
        <Modal
          open={isModalOpen}
          onOpenChange={(o) => !o && !isSaving && setIsModalOpen(false)}
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingCart className="text-primary" size={20} />
              {formData.id ? `Chỉnh Sửa Đơn Hàng #${formData.id}` : 'Tạo Đơn Hàng Mới'}
            </span>
          }
          maxWidth="max-w-5xl"
          description={formData.id ? 'Cập nhật đơn hàng trong kỳ đã lưu.' : `Lưu vào tháng ${selectedMonth === 'ALL' ? 'theo ngày tạo đơn' : selectedMonth}.`}
          footer={null}
        >
            <div className="modal-header" style={{ display: 'none' }} />
            <div className="order-modal-scroll">
              <form onSubmit={handleSubmitForm} className="order-modal-form">
                <div className="order-modal-grid">
                
                {/* 1. Ngày tạo đơn */}
                <div className="form-group">
                  <label htmlFor="order-field-7" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Ngày Tạo Đơn</label>
                  <input id="order-field-7"
                    type="date" 
                    data-testid="order-created-date-input"
                    className="form-control" 
                    value={toYMD(formData.createdDate)} 
                    onChange={e => setFormData({ ...formData, createdDate: toVnFormat(e.target.value) })} 
                    required 
                  />
                </div>

                {/* 3. SALE Online */}
                <div className="form-group">
                  <label htmlFor="order-field-8" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>SALE Online</label>
                  <select id="order-field-8"
                    data-testid="order-sale-online-select"
                    className="form-control" 
                    value={formData.saleOnline} 
                    onChange={e => setFormData({ ...formData, saleOnline: e.target.value })}
                  >
                    {SALE_ONLINE_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Phân loại Đơn hàng (Phase 2) */}
                <div className="form-group">
                  <label htmlFor="order-field-9" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#8b5cf6' }}>Loại Đơn Hàng</label>
                  <select id="order-field-9"
                    data-testid="order-type-select"
                    className="form-control" 
                    value={formData.orderType} 
                    onChange={e => setFormData({ ...formData, orderType: e.target.value })}
                  >
                    {ORDER_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                
                {getFormOptionKey('orderType', formData.orderType) === 'trade_in' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="order-field-10" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#10b981' }}>Tên Máy Khách Bán (Trade-in)</label>
                      <input id="order-field-10"
                        type="text" 
                        className="form-control" 
                        value={formData.tradeInLaptopName} 
                        onChange={e => setFormData({ ...formData, tradeInLaptopName: e.target.value })} 
                        placeholder="VD: Thinkpad T480s i5..."
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="order-field-11" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#10b981' }}>Giá Thu Lại (tr VNĐ)</label>
                      <input id="order-field-11"
                        type="number" step="any"
                        className="form-control" 
                        value={formData.tradeInPrice} 
                        onChange={e => setFormData({ ...formData, tradeInPrice: e.target.value })} 
                        placeholder="VD: 5.5"
                        required 
                      />
                    </div>
                  </>
                )}

                {/* 4. GHI CHÚ ĐƠN HÀNG (GỘP THÀNH 1 THÀNH PHẦN) */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label htmlFor="order-field-12" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Ghi Chú Đơn Hàng</label>
                  <textarea id="order-field-12"
                    data-testid="order-note-input"
                    className="form-control" 
                    rows={2}
                    value={formData.note} 
                    onChange={e => setFormData({ ...formData, note: e.target.value })} 
                    placeholder="Ghi chú chi tiết cho đơn hàng..."
                  />
                </div>

                {/* 10. Chọn Máy trong kho */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label htmlFor="order-field-13" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1d4ed8' }}>
                    10. Máy Trong Kho (ID & Cấu hình)
                  </label>
                  <select id="order-field-13"
                    data-testid="order-laptop-select"
                    className="form-control" 
                    value={formData.laptopId} 
                    onChange={e => handleSelectLaptopChange(e.target.value)}
                  >
                    <option value="">-- Chưa chọn / chưa gán máy --</option>
                    {getSelectableLaptops(formData.id)
                      .filter(l => l.id === formData.laptopId || labelToKey('laptopStatus', l.status) === 'available')
                      .map(l => (
                      <option key={l.id} value={l.id}>
                        {l.id} - {l.name} ({l.location}) - NY: {l.retailPriceVnd || l.wholesalePriceVnd || 0}tr
                      </option>
                    ))}
                  </select>
                </div>

                {/* 7. TRẠNG THÁI ĐƠN */}
                <div className="form-group">
                  <label htmlFor="order-field-14" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Trạng Thái Đơn Hàng</label>
                  <select id="order-field-14"
                    data-testid="order-status-select"
                    className="form-control" 
                    value={formData.orderStatus} 
                    onChange={e => setFormData({ ...formData, orderStatus: e.target.value })}
                  >
                    {ORDER_STATUS_OPTIONS.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {/* 8. TRẠNG THÁI Thanh toán */}
                <div className="form-group">
                  <label htmlFor="order-field-15" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Trạng Thái Thanh Toán</label>
                  <select id="order-field-15"
                    data-testid="order-payment-status-select"
                    className="form-control" 
                    value={formData.paymentStatus} 
                    onChange={e => setFormData({ ...formData, paymentStatus: e.target.value })}
                  >
                    {PAYMENT_STATUS_OPTIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Phương thức thanh toán (Phase 2) */}
                <div className="form-group">
                  <label htmlFor="order-field-16" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#ec4899' }}>Phương Thức TT</label>
                  <select id="order-field-16"
                    data-testid="order-payment-method-select"
                    className="form-control" 
                    value={formData.paymentMethod} 
                    onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                  >
                    {PAYMENT_METHODS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {getFormOptionKey('paymentMethod', formData.paymentMethod) === 'card' && (
                  <div className="form-group">
                    <label htmlFor="order-field-17" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#ec4899' }}>Phí Quẹt Thẻ (tr VNĐ)</label>
                    <input id="order-field-17"
                      type="number" step="any"
                      className="form-control" 
                      value={formData.creditCardFee} 
                      onChange={e => setFormData({ ...formData, creditCardFee: e.target.value })} 
                      placeholder="VD: 0.4"
                    />
                  </div>
                )}
                
                {/* 9. Trạng thái giao hàng */}
                <div className="form-group">
                  <label htmlFor="order-field-18" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Trạng Thái Giao Hàng</label>
                  <select id="order-field-18"
                    data-testid="order-delivery-status-select"
                    className="form-control" 
                    value={formData.deliveryStatus} 
                    onChange={e => setFormData({ ...formData, deliveryStatus: e.target.value })}
                  >
                    {DELIVERY_STATUS_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* 6. GỬI HÀNG */}
                <div className="form-group">
                  <label htmlFor="order-field-19" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Phương Thức Gửi Hàng</label>
                  <select id="order-field-19"
                    data-testid="order-shipping-method-select"
                    className="form-control" 
                    value={formData.shippingMethod} 
                    onChange={e => setFormData({ ...formData, shippingMethod: e.target.value })}
                  >
                    {SHIPPING_METHOD_OPTIONS.map(sm => (
                      <option key={sm} value={sm}>{sm}</option>
                    ))}
                  </select>
                </div>

                {/* 11. GIÁ BÁN */}
                  <div className="form-group">
                  <label htmlFor="order-field-20" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#2563eb' }}>Giá Bán Thực Tế (triệu VNĐ)</label>
                  <input id="order-field-20"
                    type="number" 
                    min="0"
                        data-testid="order-sale-price-input"
                    step="any" 
                    className="form-control" 
                    value={formData.salePrice} 
                    onChange={e => setFormData({ ...formData, salePrice: e.target.value })} 
                    placeholder="VD: 17.5"
                    required 
                  />
                </div>

                {/* 12. CỌC */}
                <div className="form-group">
                  <label htmlFor="order-field-21" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#d97706' }}>Thông Tin Cọc</label>
                  <input id="order-field-21"
                    type="text" 
                    data-testid="order-deposit-note-input"
                    className="form-control" 
                    value={formData.depositNote} 
                    onChange={e => setFormData({ ...formData, depositNote: e.target.value })} 
                    placeholder="VD: 500k VCB 08/08"
                  />
                </div>

                {getFormOptionKey('paymentStatus', formData.paymentStatus) === 'deposited' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="order-field-22" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#d97706' }}>Số Tiền Cọc (triệu VNĐ)</label>
                      <input id="order-field-22"
                        type="number"
                        data-testid="order-deposit-amount-input"
                        step="any"
                        min="0.01"
                        className="form-control"
                        value={formData.depositAmount}
                        onChange={e => setFormData({ ...formData, depositAmount: e.target.value })}
                        placeholder="VD: 1"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="order-field-23" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#d97706' }}>Giữ Máy Đến</label>
                      <input id="order-field-23"
                        type="datetime-local"
                        data-testid="order-reservation-input"
                        className="form-control"
                        value={formData.reservationExpiresAt}
                        onChange={e => setFormData({ ...formData, reservationExpiresAt: e.target.value })}
                        title="Để trống: hệ thống mặc định giữ 48 giờ"
                      />
                      <small style={{ color: 'var(--text-muted)' }}>Để trống sẽ tự giữ trong 48 giờ.</small>
                    </div>
                  </>
                )}

                {/* 13. THU HỘ COD */}
                <div className="form-group">
                  <label htmlFor="order-field-24" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#059669' }}>Thu Hộ COD (triệu VNĐ)</label>
                  <input id="order-field-24"
                    type="number" 
                    min="0"
                        data-testid="order-cod-amount-input"
                    step="any" 
                    className="form-control" 
                    value={formData.codAmount} 
                    onChange={e => setFormData({ ...formData, codAmount: e.target.value })} 
                    placeholder="VD: 17.0"
                  />
                </div>

                {/* 17. KHÁCH HÀNG */}
                <div className="form-group" style={{ gridColumn: 'span 4' }}>
                  <label htmlFor="order-field-25" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    17. Khách Hàng <button type="button" className="inline-add-button" onClick={() => setShowCustomerForm(prev => !prev)}>{showCustomerForm ? '× Đóng' : '+ Thêm mới'}</button>
                  </label>
                  <select id="order-field-25"
                    data-testid="order-customer-select"
                    className="form-control" 
                    value={formData.customerId} 
                    onChange={e => setFormData({ ...formData, customerId: e.target.value })} 
                    required 
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
                    ))}
                  </select>
                  {showCustomerForm && (
                    <div className="inline-customer-form">
                      <input
                        data-testid="order-new-customer-name-input"
                        className="form-control"
                        placeholder="Tên khách hàng"
                        value={newCustomer.name}
                        onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                      />
                      <input
                        data-testid="order-new-customer-phone-input"
                        className="form-control"
                        placeholder="Số điện thoại"
                        value={newCustomer.phone}
                        onChange={e => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                      />
                      <input
                        data-testid="order-new-customer-address-input"
                        className="form-control"
                        placeholder="Địa chỉ"
                        value={newCustomer.address}
                        onChange={e => setNewCustomer(prev => ({ ...prev, address: e.target.value }))}
                      />
                      <Button type="button" size="sm" data-testid="order-new-customer-save-button" onClick={handleCreateCustomer}>Lưu khách hàng</Button>
                    </div>
                  )}
                </div>

                {/* 18. GHI CHÚ KHÁCH HÀNG / YÊU CẦU ĐẶC BIỆT */}
                <div className="form-group" style={{ gridColumn: 'span 4' }}>
                  <label htmlFor="order-field-26" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Ghi Chú Yêu Cầu Của Khách</label>
                  <input id="order-field-26"
                    type="text" 
                    data-testid="order-customer-note-input"
                    className="form-control" 
                    value={formData.customerNote} 
                    onChange={e => setFormData({ ...formData, customerNote: e.target.value })} 
                    placeholder="VD: Giao giờ hành chính, bọc kỹ..."
                  />
                </div>

                {/* 19. MÃ VẬN ĐƠN */}
                <div className="form-group">
                  <label htmlFor="order-field-27" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Mã Vận Đơn (ViettelPost / SPX...)</label>
                  <input id="order-field-27"
                    type="text" 
                    data-testid="order-tracking-input"
                    className="form-control" 
                    value={formData.trackingCode} 
                    onChange={e => setFormData({ ...formData, trackingCode: e.target.value })} 
                    placeholder="VD: VT9988112233"
                  />
                </div>

                {/* 20. Ngày gửi hàng */}
                <div className="form-group">
                  <label htmlFor="order-field-28" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Ngày Gửi Hàng Thực Tế</label>
                  <input id="order-field-28"
                    type="date" 
                    data-testid="order-ship-date-input"
                    className="form-control" 
                    value={toYMD(formData.shipDate)} 
                    onChange={e => setFormData({ ...formData, shipDate: toVnFormat(e.target.value) })} 
                  />
                </div>

                {/* 14. CÀI ĐẶT */}
                <div className="form-group">
                  <label htmlFor="order-field-29" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Yêu Cầu Cài Đặt</label>
                  <input id="order-field-29"
                    type="text" 
                    data-testid="order-setup-note-input"
                    className="form-control" 
                    value={formData.setupNote} 
                    onChange={e => setFormData({ ...formData, setupNote: e.target.value })} 
                    placeholder="VD: Cài Office 2021 + Photoshop"
                  />
                </div>

                {/* 15. Bảo hành */}
                <div className="form-group">
                  <label htmlFor="order-field-30" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Thời Gian Bảo Hành</label>
                  <input id="order-field-30"
                    type="text" 
                    data-testid="order-warranty-input"
                    className="form-control" 
                    value={formData.warranty} 
                    onChange={e => setFormData({ ...formData, warranty: e.target.value })} 
                    placeholder="VD: 6 tháng, 12 tháng..."
                  />
                </div>

                {/* 16. QUÀ TẶNG */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label htmlFor="order-field-31" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Quà Tặng Kèm</label>
                  <select id="order-field-31"
                    data-testid="order-gift-select"
                    className="form-control" 
                    value={formData.gifts} 
                    onChange={e => setFormData({ ...formData, gifts: e.target.value })}
                  >
                    {GIFT_OPTIONS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {formData.id && (
                    <Button type="button" variant="outline" onClick={() => setShowTimeline(!showTimeline)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <History size={14} /> {showTimeline ? 'Ẩn lịch sử' : 'Lịch sử'}
                    </Button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {saveError && <p role="alert" className="form-save-error">{saveError}</p>}
                  <Button type="button" variant="outline" disabled={isSaving} onClick={() => setIsModalOpen(false)}>
                    Hủy Bỏ
                  </Button>
                  <Button type="submit" disabled={isSaving} data-testid="order-save-button">
                    <Check size={16} /> {isSaving ? 'Đang lưu...' : formData.id ? 'Lưu thay đổi' : 'Lưu Tạo Đơn Hàng'}
                  </Button>
                </div>
              </div>
            </form>

            {showTimeline && formData.id && (
              <div className="order-modal-timeline">
                <ActivityTimeline entityType="ORDER" entityId={formData.id} />
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
