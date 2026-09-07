"use client";
import React, { useState, useMemo, useRef } from 'react';
import { useInventory, parseFlexibleFloat, isReservationActive, isOrderCommitted, isOrderCancelled } from '../../context/InventoryContext';
import { D } from '../../lib/fieldOptions';
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
  History
} from 'lucide-react';
import FixedHorizontalScrollbar from '../FixedHorizontalScrollbar';
import ActivityTimeline from '../ActivityTimeline';
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
  const [previousValue, setPreviousValue] = React.useState(incomingValue);
  const textareaRef = React.useRef(null);

  if (incomingValue !== previousValue) {
    setPreviousValue(incomingValue);
    setLocalValue(incomingValue);
  }

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
    getSelectableLaptops,
    getLaptopAssignmentError,
    getOptions,
    getLabel,
    cloudStatus
  } = useInventory();

  const { user } = useAuth();
  const tableContainerRef = useRef(null);

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
  const [showTimeline, setShowTimeline] = useState(false);

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
    discountAmount: '',
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
    return Object.values(colWidths).reduce((acc, curr) => acc + curr, 0) + 24; // Thêm 24px để tránh bị che bởi thanh cuộn dọc
  }, [colWidths]);

  // Đổi máy trực tiếp trên bảng Google Sheet
  const handleDirectChangeLaptop = (ordId, newLaptopId) => {
    // Check the current status of the order to see if it allows changing the laptop
    const currentOrder = allOrders.find(o => String(o.id) === String(ordId));
    if (!currentOrder) return;
    const isLocked = isOrderCommitted(currentOrder) || isOrderCancelled(currentOrder);
    if (isLocked) {
      alert('⛔ Đơn hàng đang ở trạng thái KHÔNG ĐƯỢC PHÉP thay đổi sản phẩm.\nVui lòng chuyển trạng thái đơn hàng về "MỚI TẠO" hoặc "ĐÃ CỌC" trước khi đổi máy.');
      return;
    }
    const selected = laptops.find(l => String(l.id) === String(newLaptopId));
    let updates = { laptopId: newLaptopId };
    if (selected) {
      const autoPrice = selected.retailPriceVnd || selected.wholesalePriceVnd;
      if (autoPrice) {
        updates.salePrice = autoPrice;
        updates.codAmount = autoPrice;
      }
    }
    const result = updateOrder(ordId, updates);
    if (!result.ok) alert(`⛔ ${result.message}`);
  };

  // Mở modal tạo đơn mới
  const handleOpenAdd = () => {
    setFormData({
      createdDate: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      saleOnline: SALE_ONLINE_OPTIONS[0],
      note: '',
      shippingMethod: SHIPPING_METHOD_OPTIONS[0],
      orderStatus: ORDER_STATUS_OPTIONS[0],
      paymentStatus: PAYMENT_STATUS_OPTIONS[0],
      deliveryStatus: DELIVERY_STATUS_OPTIONS[0],
      laptopId: '',
      salePrice: '',
      discountAmount: '',
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
      codAmount: autoPrice
    }));
  };

  // Submit Modal Form
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    const assignmentError = getLaptopAssignmentError(formData.laptopId);
    if (assignmentError) {
      alert(`⛔ ${assignmentError}`);
      return;
    }
    
    // Xử lý Thu cũ đổi mới
    let tradeInLaptopId = '';
    if (formData.orderType === 'Thu cũ đổi mới (Trade-in)' && formData.tradeInLaptopName && formData.tradeInPrice) {
      const result = await addLaptop({
        name: formData.tradeInLaptopName,
        category: 'Thu Cũ',
        status: D.laptopAvailable,
        importPriceVnd: parseFlexibleFloat(formData.tradeInPrice),
        conditionNote: 'Hàng thu lại từ khách (Trade-in)',
        location: 'CH'
      });
      if (!result.ok) {
        alert(`⛔ Không tạo được máy thu cũ: ${result.message}`);
        return;
      }
      tradeInLaptopId = result.laptop.id;
    }

    const result = await addOrder({ ...formData, tradeInLaptopId });
    if (!result.ok) {
      alert(`⛔ Không tạo được đơn: ${result.message}`);
      return;
    }
    alert(`🎉 Đã tạo thành công Đơn hàng mới #${result.order.id}!`);
    setIsModalOpen(false);
  };

  // Hủy đơn nhưng vẫn giữ lịch sử để đối soát.
  const handleDeleteOrder = (ordId) => {
    if (window.confirm(`Bạn có chắc chắn muốn hủy Đơn hàng #${ordId}? Lịch sử đơn vẫn được giữ để đối soát.`)) {
      const result = cancelOrder(ordId);
      if (!result.ok) alert(`⛔ ${result.message}`);
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
      alert('Không có dữ liệu đơn hàng để xuất!');
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
    const key = labelToKey('orderStatus', status);
    switch (key) {
      case 'done': return 'pill-success';
      case 'shipping': return 'pill-info';
      case 'prepared': return 'pill-warning';
      case 'cancelled':
      case 'returned': return 'pill-danger';
      default: return 'pill-neutral';
    }
  };

  const getPaymentStatusBadgeClass = (status) => {
    const key = labelToKey('paymentStatus', status);
    switch (key) {
      case 'paid': return 'pill-success';
      case 'deposited': return 'pill-warning';
      case 'unpaid': return 'pill-danger';
      case 'cod': return 'pill-purple';
      default: return 'pill-neutral';
    }
  };

  const getPaymentMethodBadgeClass = (method) => {
    const key = labelToKey('paymentMethod', method);
    switch (key) {
      case 'transfer_cash': return 'pill-info';
      case 'card': return 'pill-purple';
      case 'installment': return 'pill-info';
      case 'debt': return 'pill-danger';
      default: return 'pill-neutral';
    }
  };

  const getOrderRowStatusClass = (ord) => {
    // 1. Đã hoàn thành, thu tiền xong -> Màu xám
      if (isOrderCommitted(ord) && labelToKey('paymentStatus', ord.paymentStatus) === 'paid') {
      return 'order-row-completed';
    }
    // 2. Đang chờ COD, đang giao hàng -> Màu vàng
    if (isOrderCommitted(ord) ||
      labelToKey('deliveryStatus', ord.deliveryStatus) === 'shipped' ||
      labelToKey('deliveryStatus', ord.deliveryStatus) === 'delivered'
    ) {
      return 'order-row-shipping';
    }
    // 3. Hủy đơn / Back máy -> Màu đỏ nhạt
    if (isOrderCancelled(ord)) {
      return 'order-row-cancelled';
    }
    // 4. Đang chuẩn bị, chưa giao hàng (ĐÃ CHUẨN BỊ XONG, ĐÃ CỌC...) -> Màu hồng
    return 'order-row-preparing';
  };

  return (
    <section className="page-section">
      {/* SECTION HEADER */}
      <div className="section-title section-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>
            <ShoppingCart className="text-primary" size={24} /> Quản Lý Đơn Hàng & Xuất Bán ({filteredOrders.length} / {orders.length} đơn)
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <Calendar size={14} style={{ color: '#64748b' }} />
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Kỳ:</span>
            <select
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

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-outline" onClick={handleExportCSV}>
            <Download size={14} /> Xuất CSV / Excel
          </button>

          {(user?.role === 'ADMIN' || user?.role === 'SALES' || !user) && (
            <button className="btn btn-sm btn-success" onClick={handleOpenAdd}>
              <Plus size={16} /> Tạo Đơn Hàng Mới
            </button>
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
      <div className="card glass filter-card" style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
        <div className="filter-grid" style={{ gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="filter-item" style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>
              <Search size={13} style={{ display: 'inline', marginRight: '3px' }} /> Tìm kiếm thông minh
            </label>
            <input 
              type="text" 
              className="filter-input form-control"
              placeholder="Tìm theo ID (#1001), Tên/SĐT khách, Mã máy (#709), Note, Mã vận đơn..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-item">
            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>SALE Online</label>
            <select 
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
            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Trạng Thái Đơn</label>
            <select 
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
            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Trạng Thái Thanh Toán</label>
            <select 
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
            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Hình Thức Gửi Hàng</label>
            <select 
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
            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Phân Loại Sản Phẩm</label>
            <select 
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
      </div>

      {/* ORDERS DATA TABLE (CỘT TRẠNG THÁI & THÀNH TOÁN LÊN TRƯỚC GIÁ BÁN, GỘP GHI CHÚ) */}
      <div className="card glass p-0" style={{ overflow: 'hidden' }}>
        <div 
          className="inventory-table-container"
          ref={tableContainerRef}
        >
          <table className="data-table data-table-wide" style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}>
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
                <th style={{ width: '24px', minWidth: '24px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={22} className="empty-cell">
                    Không tìm thấy đơn hàng nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => {
                  const laptopObj = laptops.find(l => String(l.id) === String(ord.laptopId));
                  const noteValue = ord.note !== undefined ? ord.note : [ord.note1, ord.note2].filter(Boolean).join(' - ');

                  return (
                    <tr key={ord.id} className={getOrderRowStatusClass(ord)}>
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
                            value={ord.saleOnline} 
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
                            const lockedByOrder = isOrderCommitted(ord) || isOrderCancelled(ord);

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
                          {isReservationActive(ord) && ord.reservationExpiresAt && (
                            <div style={{ fontSize: '0.7rem', color: '#d97706', paddingLeft: '4px' }}>
                              Giữ tới: {new Date(ord.reservationExpiresAt).toLocaleString('vi-VN')}
                            </div>
                          )}
                          {(() => {
                            // Đơn vẫn ở trạng thái cọc nhưng đã hết hạn -> máy đã bị nhả về kho
                            const oKey = labelToKey('orderStatus', ord.orderStatus);
                            const pKey = labelToKey('paymentStatus', ord.paymentStatus);
                            const isDepositOrder = oKey === 'deposited' || pKey === 'deposited';
                            if (!ord.laptopId || !isDepositOrder || isOrderCommitted(ord) || isOrderCancelled(ord)) return null;
                            if (isReservationActive(ord)) return null;
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
                          className={`sheet-cell-select ${getOrderStatusBadgeClass(ord.orderStatus)}`}
                          style={{ fontWeight: 700, borderRadius: '4px' }}
                          value={getLabel('orderStatus', ord.orderStatus)}
                          onChange={(e) => updateOrder(ord.id, { orderStatus: e.target.value })}
                        >
                          {ORDER_STATUS_OPTIONS.map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </td>

                      {/* 7. THANH TOÁN (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                      <td style={{ width: `${colWidths.paymentStatus}px`, minWidth: `${colWidths.paymentStatus}px` }}>
                        <select
                          className={`sheet-cell-select ${getPaymentStatusBadgeClass(ord.paymentStatus)}`}
                          style={{ fontWeight: 700, borderRadius: '4px' }}
                          value={getLabel('paymentStatus', ord.paymentStatus)}
                          onChange={(e) => updateOrder(ord.id, { paymentStatus: e.target.value })}
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
                          value={getLabel('paymentMethod', ord.paymentMethod)}
                          onChange={(e) => updateOrder(ord.id, { paymentMethod: e.target.value })}
                        >
                          {PAYMENT_METHODS.map(pm => (
                            <option key={pm} value={pm}>{pm}</option>
                          ))}
                        </select>
                      </td>

                      {/* 8. GIAO HÀNG (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                      <td style={{ width: `${colWidths.deliveryStatus}px`, minWidth: `${colWidths.deliveryStatus}px` }}>
                        <select
                          className="sheet-cell-select"
                          value={getLabel('deliveryStatus', ord.deliveryStatus)}
                          onChange={(e) => updateOrder(ord.id, { deliveryStatus: e.target.value })}
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
                            value={getLabel('shippingMethod', ord.shippingMethod)}
                            onChange={(e) => updateOrder(ord.id, { shippingMethod: e.target.value })}
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
                          value={ord.customerId || ''} 
                          onChange={(val) => updateOrder(ord.id, { customerId: val })} 
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
                          value={getLabel('giftOptions', ord.gifts)}
                          onChange={(e) => updateOrder(ord.id, { gifts: e.target.value })}
                        >
                          {GIFT_OPTIONS.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </td>
                      {/* Cột đệm cuối bảng */}
                      <td style={{ width: '24px', minWidth: '24px' }}></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* THANH SCROLL NGANG CỐ ĐỊNH Ở ĐÁY MÀN HÌNH */}
      <FixedHorizontalScrollbar containerRef={tableContainerRef} totalWidth={totalTableWidth} />

      {/* MODAL TẠO ĐƠN HÀNG MỚI */}
      {isModalOpen && (
        <div className="modal-backdrop active">
          <div className="modal-box glass" style={{ maxWidth: '850px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingCart className="text-primary" size={20} />
                {formData.id ? `Chỉnh Sửa Đơn Hàng #${formData.id}` : 'Tạo Đơn Hàng Mới'}
              </h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {formData.id && (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowTimeline(!showTimeline)} style={{ height: '32px' }}>
                    <History size={14} style={{ marginRight: '6px' }} /> Lịch sử
                  </button>
                )}
                <button className="modal-close" type="button" onClick={() => setIsModalOpen(false)}>&times;</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'row', minHeight: '500px', maxHeight: '80vh', overflow: 'hidden' }}>
              <form onSubmit={handleSubmitForm} style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                
                {/* 1. Ngày tạo đơn */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>1. Ngày Tạo Đơn</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={toYMD(formData.createdDate)} 
                    onChange={e => setFormData({ ...formData, createdDate: toVnFormat(e.target.value) })} 
                    required 
                  />
                </div>

                {/* 3. SALE Online */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>3. SALE Online</label>
                  <select 
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
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#8b5cf6' }}>Loại Đơn Hàng</label>
                  <select 
                    className="form-control" 
                    value={formData.orderType} 
                    onChange={e => setFormData({ ...formData, orderType: e.target.value })}
                  >
                    {ORDER_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                
                {formData.orderType === 'Thu cũ đổi mới (Trade-in)' && (
                  <>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#10b981' }}>Tên Máy Khách Bán (Trade-in)</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={formData.tradeInLaptopName} 
                        onChange={e => setFormData({ ...formData, tradeInLaptopName: e.target.value })} 
                        placeholder="VD: Thinkpad T480s i5..."
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#10b981' }}>Giá Thu Lại (tr VNĐ)</label>
                      <input 
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
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>4. Ghi Chú Đơn Hàng</label>
                  <textarea 
                    className="form-control" 
                    rows={2}
                    value={formData.note} 
                    onChange={e => setFormData({ ...formData, note: e.target.value })} 
                    placeholder="Ghi chú chi tiết cho đơn hàng..."
                  />
                </div>

                {/* 10. Chọn Máy trong kho */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1d4ed8' }}>
                    10. Máy Trong Kho (ID & Cấu hình)
                  </label>
                  <select 
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
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>7. Trạng Thái Đơn Hàng</label>
                  <select 
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
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>8. Trạng Thái Thanh Toán</label>
                  <select 
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
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#ec4899' }}>Phương Thức TT</label>
                  <select 
                    className="form-control" 
                    value={formData.paymentMethod} 
                    onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                  >
                    {PAYMENT_METHODS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {formData.paymentMethod === 'Quẹt thẻ (Tốn phí)' && (
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#ec4899' }}>Phí Quẹt Thẻ (tr VNĐ)</label>
                    <input 
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
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>9. Trạng Thái Giao Hàng</label>
                  <select 
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
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>6. Phương Thức Gửi Hàng</label>
                  <select 
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
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#2563eb' }}>11. Giá Bán Thực Tế (triệu VNĐ)</label>
                  <input 
                    type="number" 
                    step="any" 
                    className="form-control" 
                    value={formData.salePrice} 
                    onChange={e => setFormData({ ...formData, salePrice: e.target.value })} 
                    placeholder="VD: 17.5"
                    required 
                  />
                </div>

                {/* 11b. GIẢM GIÁ */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#ef4444' }}>11b. Giảm Giá Khách Quen/Sale (triệu VNĐ)</label>
                  <input 
                    type="number" 
                    step="any" 
                    className="form-control" 
                    value={formData.discountAmount} 
                    onChange={e => setFormData({ ...formData, discountAmount: e.target.value })} 
                    placeholder="VD: 0.5"
                  />
                </div>

                {/* 12. CỌC */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#d97706' }}>12. Thông Tin Cọc</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.depositNote} 
                    onChange={e => setFormData({ ...formData, depositNote: e.target.value })} 
                    placeholder="VD: 500k VCB 08/08"
                  />
                </div>

                {formData.paymentStatus === D.paymentDeposit && (
                  <>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#d97706' }}>Số Tiền Cọc (triệu VNĐ)</label>
                      <input
                        type="number"
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
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#d97706' }}>Giữ Máy Đến</label>
                      <input
                        type="datetime-local"
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
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#059669' }}>13. Thu Hộ COD (triệu VNĐ)</label>
                  <input 
                    type="number" 
                    step="any" 
                    className="form-control" 
                    value={formData.codAmount} 
                    onChange={e => setFormData({ ...formData, codAmount: e.target.value })} 
                    placeholder="VD: 17.0"
                  />
                </div>

                {/* 17. KHÁCH HÀNG */}
                <div className="form-group" style={{ gridColumn: 'span 4' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    17. Khách Hàng <span style={{ color: 'var(--primary)', cursor: 'pointer', marginLeft: '10px' }} onClick={() => window.open('/customers', '_blank')}>+ Thêm mới</span>
                  </label>
                  <select 
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
                </div>

                {/* 18. GHI CHÚ KHÁCH HÀNG / YÊU CẦU ĐẶC BIỆT */}
                <div className="form-group" style={{ gridColumn: 'span 4' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>18. Ghi Chú Yêu Cầu Của Khách</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.customerNote} 
                    onChange={e => setFormData({ ...formData, customerNote: e.target.value })} 
                    placeholder="VD: Giao giờ hành chính, bọc kỹ..."
                  />
                </div>

                {/* 19. MÃ VẬN ĐƠN */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>19. Mã Vận Đơn (ViettelPost / SPX...)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.trackingCode} 
                    onChange={e => setFormData({ ...formData, trackingCode: e.target.value })} 
                    placeholder="VD: VT9988112233"
                  />
                </div>

                {/* 20. Ngày gửi hàng */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>20. Ngày Gửi Hàng Thực Tế</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={toYMD(formData.shipDate)} 
                    onChange={e => setFormData({ ...formData, shipDate: toVnFormat(e.target.value) })} 
                  />
                </div>

                {/* 14. CÀI ĐẶT */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>14. Yêu Cầu Cài Đặt</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.setupNote} 
                    onChange={e => setFormData({ ...formData, setupNote: e.target.value })} 
                    placeholder="VD: Cài Office 2021 + Photoshop"
                  />
                </div>

                {/* 15. Bảo hành */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>15. Thời Gian Bảo Hành</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.warranty} 
                    onChange={e => setFormData({ ...formData, warranty: e.target.value })} 
                    placeholder="VD: 6 tháng, 12 tháng..."
                  />
                </div>

                {/* 16. QUÀ TẶNG */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>16. Quà Tặng Kèm</label>
                  <select 
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

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
                  Hủy Bỏ
                </button>
                <button type="submit" className="btn btn-success">
                  <Check size={16} /> Lưu Tạo Đơn Hàng
                </button>
              </div>
            </form>
            
            {showTimeline && formData.id && (
              <div style={{ width: '350px', background: '#f8fafc', borderLeft: '1px solid var(--border-color)', overflowY: 'auto' }}>
                <ActivityTimeline entityType="ORDER" entityId={formData.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </section>
  );
}
