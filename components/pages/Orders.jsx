"use client";
import { useColumnResize } from '@/lib/useColumnResize';
import { downloadExport } from '@/lib/downloadExport';
import { useState, useMemo, useRef, useDeferredValue, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useInventory, parseFlexibleFloat } from '../../context/InventoryContext';
import { labelToKey } from '../../lib/useFieldOptions';
import { SALES_ROLES } from '../../lib/roles.mjs';
import { useAuth } from '../../context/AuthContext';
import {
  ShoppingCart,
  Plus,
  Search,
  Calendar,
  Download,
  X,
  Check,
  History,
  TrendingUp,
  Package,
  MoreHorizontal,
  Edit3
} from 'lucide-react';
import ActivityTimeline from '../ActivityTimeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import InvoiceLink from '../InvoiceLink';
import InvoiceOrderFields from '../InvoiceOrderFields';
import OrderAllocation from '../OrderAllocation';
import CustomerFormModal from '../CustomerFormModal';
import OrderQuickNote from '../OrderQuickNote';
import RecordPaymentModal from '../RecordPaymentModal';
import { useSubmission } from '@/lib/useSubmission';
import { remainingOrderAmount, orderBalanceAfterDeposit } from '@/lib/orderPaymentAmounts.mjs';

const formatConfigText = (value) => String(value || '').replaceAll('/', '/\u200B');

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

export default function Orders() {
  const [editingCustomer, setEditingCustomer] = useState(null);
  const customerSubmission = useSubmission();
  const [allocationOrder, setAllocationOrder] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const { 
    laptops, 
    dataLoading,
    filteredOrders: orders,
    customers,
    selectedMonth,
    setSelectedMonth,
    availableMonths,
    addOrder,
    updateOrder, 
    SALE_ONLINE_OPTIONS,
    SALE_OFFLINE_OPTIONS,
    SHIPPING_METHOD_OPTIONS,
    ORDER_STATUS_OPTIONS,
    PAYMENT_STATUS_OPTIONS,
    DELIVERY_STATUS_OPTIONS,
    ORDER_TYPES,
    PAYMENT_METHODS,
    createCustomer,
    updateCustomer,
    getSelectableLaptops,
    getDepositReferenceLaptops,
    getLaptopAssignmentError,
    getOptions,
    getLabel,
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
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
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
    saleOnline: '',
    saleOffline: '',
    note: '',
    shippingMethod: SHIPPING_METHOD_OPTIONS[0],
    orderStatus: getFormOptionLabel('orderStatus', 'new'),
    paymentStatus: PAYMENT_STATUS_OPTIONS[0],
    deliveryStatus: DELIVERY_STATUS_OPTIONS[0],
    laptopId: '',
    salePrice: '',
    depositAmount: '',
    depositNote: '',
    codAmount: '',
    setupNote: 'Cài cơ bản',
    warranty: '6 tháng',
    branchId: '',
    giftPreset: '',
    giftAccessoryIds: [],
    customerId: '',
    customerNote: '',
    trackingCode: '',
    shipDate: '',
    orderType: ORDER_TYPES ? ORDER_TYPES[0] : 'Bán lẻ (Retail)',
    paymentMethod: PAYMENT_METHODS ? PAYMENT_METHODS[0] : 'Chuyển khoản / Tiền mặt',
    
    tradeInLaptopName: '',
    tradeInSerial: '',
    tradeInPrice: '',
    creditCardFee: ''
  });
  const [laptopPickerSearch, setLaptopPickerSearch] = useState('');
  const [openActionMenuId, setOpenActionMenuId] = useState(null);

  useEffect(() => {
    const closeActionMenu = (event) => {
      if (!event.target.closest('.inventory-action-menu')) setOpenActionMenuId(null);
    };
    document.addEventListener('pointerdown', closeActionMenu);
    return () => document.removeEventListener('pointerdown', closeActionMenu);
  }, []);

  // State quản lý độ rộng của từng cột (Trạng Thái Đơn, Thanh Toán, Gửi Hàng trước Giá Bán)
  const [colWidths, setColWidths] = useState({
    id: 70,
    actions: 76,
    createdDate: 110,
    note: 190,
    laptopId: 480,
    orderStatus: 120,
    paymentStatus: 180,
    paymentMethod: 100,
    deliveryStatus: 115,
    shippingMethod: 200,
    salePrice: 90,
    profitVnd: 85,
    depositNote: 80,
    codAmount: 90,
    customerId: 185,
    customerAddress: 215,
    setupNote: 120,
    warranty: 100,
  });

  const orderColumnKeys = useMemo(() => {
    const keys = [
      'id',
      'actions',
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
    );

    return keys;
  }, [user?.role]);

  const orderColumnCount = orderColumnKeys.length;

  const startResizing = useColumnResize(colWidths, setColWidths);

  const totalTableWidth = useMemo(() => {
    return orderColumnKeys.reduce((total, key) => total + (colWidths[key] || 0), 0);
  }, [colWidths, orderColumnKeys]);

  // Mở modal tạo đơn mới
  const handleOpenAdd = () => {
    setSaveError('');
    setLaptopPickerSearch('');
    setShowCustomerForm(false);
    setNewCustomer({ name: '', phone: '', address: '' });
    setFormData({
      createdDate: selectedMonth === 'ALL' || selectedMonth === new Date().toLocaleDateString('en-GB', { month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }) ? new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }) : '',
      saleOnline: '',
      saleOffline: '',
      note: '',
      shippingMethod: SHIPPING_METHOD_OPTIONS[0],
      orderStatus: getFormOptionLabel('orderStatus', 'new'),
      paymentStatus: PAYMENT_STATUS_OPTIONS[0],
      deliveryStatus: DELIVERY_STATUS_OPTIONS[0],
      laptopId: '',
      requestedLaptopId: '',
      requestedConfiguration: '',
      requestedCategory: '',
      salePrice: '',
      depositAmount: '',
      depositNote: '',
      codAmount: '',
      setupNote: 'Cài cơ bản',
      warranty: '6 tháng',
      branchId: '',
      giftPreset: '',
      giftAccessoryIds: [],
      customerId: '',
      customerNote: '',
      trackingCode: '',
      shipDate: '',
      orderType: ORDER_TYPES[0],
      paymentMethod: PAYMENT_METHODS[0],
      
      tradeInLaptopName: '',
      tradeInSerial: '',
      tradeInPrice: '',
      creditCardFee: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (order) => {
    setSaveError('');
    setLaptopPickerSearch('');
    setShowCustomerForm(false);
    setNewCustomer({ name: '', phone: '', address: '' });
    setShowTimeline(false);
    setFormData({
      ...order,
      id: order.id,
      createdDate: order.createdDate || '',
      saleOnline: getFormOptionLabel('saleOnline', order.saleOnline),
      saleOffline: getFormOptionLabel('saleOffline', order.saleOffline),
      note: order.note || '',
      shippingMethod: getFormOptionLabel('shippingMethod', order.shippingMethod, SHIPPING_METHOD_OPTIONS[0]),
      orderStatus: getFormOptionLabel('orderStatus', order.orderStatus, ORDER_STATUS_OPTIONS[0]),
      paymentStatus: getFormOptionLabel('paymentStatus', order.paymentStatus, PAYMENT_STATUS_OPTIONS[0]),
      deliveryStatus: getFormOptionLabel('deliveryStatus', order.deliveryStatus, DELIVERY_STATUS_OPTIONS[0]),
      laptopId: order.laptopId || '',
      requestedLaptopId: order.requestedLaptopId || '',
      requestedConfiguration: order.requestedConfiguration || '',
      requestedCategory: order.requestedCategory || '',
      salePrice: order.salePrice ?? '',
      depositAmount: order.depositAmount ?? '',
      depositNote: order.depositNote || '',
      codAmount: order.codAmount ?? '',
      setupNote: order.setupNote || '',
      warranty: order.warranty || '',
      branchId: order.branchId || '',
      giftPreset: order.giftPreset || '',
      giftAccessoryIds: Array.isArray(order.giftAccessoryIds) ? order.giftAccessoryIds : [],
      customerId: order.customerId || '',
      customerNote: order.customerNote || '',
      trackingCode: order.trackingCode || '',
      shipDate: order.shipDate || '',
      orderType: getFormOptionLabel('orderType', order.orderType, ORDER_TYPES[0]),
      paymentMethod: getFormOptionLabel('paymentMethod', order.paymentMethod, PAYMENT_METHODS[0]),
      tradeInLaptopName: order.tradeInLaptopId ? (laptops.find(item => String(item.id) === String(order.tradeInLaptopId))?.name || '') : '',
      tradeInSerial: order.tradeInLaptopId ? (laptops.find(item => String(item.id) === String(order.tradeInLaptopId))?.serial || '') : '',
      tradeInPrice: order.tradeInLaptopId ? (laptops.find(item => String(item.id) === String(order.tradeInLaptopId))?.importPriceVnd || '') : '',
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
    const isDepositReference = !formData.laptopId;
    setFormData(prev => ({
      ...prev,
      laptopId: isDepositReference ? '' : laptopId,
      requestedLaptopId: laptopId || prev.requestedLaptopId || '',
      requestedConfiguration: selected?.name || prev.requestedConfiguration || '',
      requestedCategory: selected?.category || prev.requestedCategory || '',
      salePrice: autoPrice,
      codAmount: remainingOrderAmount({ ...prev, salePrice: autoPrice }),
    }));
  };

  const handleDraftDepositFieldChange = (field, value) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
  };

  const getLaptopPickerOptions = () => {
    const isDepositReference = !formData.laptopId;
    const selectedId = formData.laptopId || formData.requestedLaptopId || '';
    const source = isDepositReference
      ? getDepositReferenceLaptops(formData.requestedLaptopId)
      : getSelectableLaptops(formData.id).filter(laptop => (
        String(laptop.id) === String(formData.laptopId)
        || labelToKey('laptopStatus', laptop.status) === 'available'
      ));
    const term = laptopPickerSearch.trim().toLocaleLowerCase('vi-VN');
    if (!term) return source;
    return source.filter(laptop => [laptop.id, laptop.name, laptop.serial]
      .some(value => String(value ?? '').toLocaleLowerCase('vi-VN').includes(term))
      || String(laptop.id) === String(selectedId));
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
    const finalCodAmount = remainingOrderAmount({ ...formData, salePrice: finalSalePrice });
    
    const orderPayload = {
      ...formData,
      salePrice: finalSalePrice,
      codAmount: finalCodAmount
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

  // Lọc Đơn Hàng Thông Minh
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (deferredSearchTerm) {
        // Search consistently across identifiers and customer details. Customer
        // names/phones may live on the order snapshot (`customerInfo`) or in the
        // linked customer record, so include both sources.
        const normalizeSearch = (value) => String(value ?? '').trim().toLocaleLowerCase('vi-VN');
        const term = normalizeSearch(deferredSearchTerm);
        const customer = customers.find(item => String(item.id) === String(o.customerId));
        const matchId = normalizeSearch(o.id).includes(term);
        const matchCustomer = [
          o.customerId,
          o.customerInfo,
          customer?.name,
          customer?.phone,
          customer?.phoneNumber,
        ].some(value => normalizeSearch(value).includes(term));
        const matchLaptop = normalizeSearch(o.laptopId).includes(term);
        const matchTracking = normalizeSearch(o.trackingCode).includes(term);
        const matchAddress = normalizeSearch(o.customerAddress).includes(term);
        const matchNote = normalizeSearch(o.note || o.note1 || o.note2).includes(term);
        if (!matchId && !matchCustomer && !matchLaptop && !matchTracking && !matchAddress && !matchNote) return false;
      }

      if (filterSaleOnline && labelToKey('saleOnline', o.saleOnline, appOptions) !== labelToKey('saleOnline', filterSaleOnline, appOptions)) return false;
      if (filterOrderStatus && labelToKey('orderStatus', o.orderStatus, appOptions) !== labelToKey('orderStatus', filterOrderStatus, appOptions)) return false;
      if (filterPaymentStatus && labelToKey('paymentStatus', o.paymentStatus, appOptions) !== labelToKey('paymentStatus', filterPaymentStatus, appOptions)) return false;
      if (filterDeliveryStatus && labelToKey('deliveryStatus', o.deliveryStatus, appOptions) !== labelToKey('deliveryStatus', filterDeliveryStatus, appOptions)) return false;
      if (filterShippingMethod && labelToKey('shippingMethod', o.shippingMethod, appOptions) !== labelToKey('shippingMethod', filterShippingMethod, appOptions)) return false;

      // Lọc theo Phân Loại Sản Phẩm (join từ danh sách máy)
      if (filterCategory) {
        const laptopObj = laptops.find(l => String(l.id) === String(o.laptopId));
        if (!laptopObj || labelToKey('category', laptopObj.category, appOptions) !== labelToKey('category', filterCategory, appOptions)) return false;
      }

      return true;
    }).sort((a, b) => {
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  }, [orders, laptops, customers, deferredSearchTerm, filterSaleOnline, filterOrderStatus, filterPaymentStatus, filterDeliveryStatus, filterShippingMethod, filterCategory, appOptions]);


  const hasActiveFilters = Boolean(
    searchTerm || filterSaleOnline || filterOrderStatus || filterPaymentStatus || filterDeliveryStatus || filterShippingMethod || filterCategory
  );

  // Xuất file CSV Đơn Hàng
  const [exporting, setExporting] = useState(false);
  const handleExportCSV = async (format = 'csv') => {
    if (user?.role !== 'ADMIN' || exporting) return;
    setExporting(true);
    try { await downloadExport('orders', format, filteredOrders.map(row => row.id)); }
    catch (error) { toast.error(error.message); }
    finally { setExporting(false); }
  };
  // Badge Style Utilities
  const getOrderStatusBadgeClass = (status) => {
    const key = labelToKey('orderStatus', status, appOptions);
    switch (key) {
      case 'done': return 'pill-success';
      case 'shipping': return 'pill-warning';
      case 'prepared': return 'pill-warning';
      case 'new': return 'pill-white';
      case 'deposited': return 'pill-purple';
      case 'cancelled':
      case 'returned': return 'pill-gray';
      default: return 'pill-white';
    }
  };

  const getPaymentStatusBadgeClass = (status) => {
    const key = labelToKey('paymentStatus', status, appOptions);
    switch (key) {
      case 'paid': return 'pill-success';
      case 'deposited': return 'pill-purple';
      case 'cod': return 'pill-warning';
      case 'unpaid': return 'pill-danger';
      case 'refunded': return 'pill-danger';
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
      {allocationOrder && <OrderAllocation order={allocationOrder} onClose={() => setAllocationOrder(null)} />}
      {/* SECTION HEADER */}
      <div className="section-title section-header list-page-header orders-page-header">
        <div className="workspace-heading">
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
          {user?.role === 'ADMIN' && <><Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExportCSV('csv')}><Download size={14} /> CSV</Button><Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExportCSV('xlsx')}><Download size={14} /> Excel (.xlsx)</Button></>}

          {(SALES_ROLES.includes(user?.role) || !user) && (
            <Button data-testid="order-add-button" variant="default" size="sm" onClick={handleOpenAdd}>
              <Plus size={16} /> Tạo Đơn Hàng Mới
            </Button>
          )}
        </div>
      </div>

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
            <strong className="summary-value">{orders.filter(order => ['unpaid', 'deposited', 'cod'].includes(labelToKey('paymentStatus', order.paymentStatus, appOptions))).length}</strong>
          </div>
        </div>
        <div className="list-summary-item list-summary-item-success">
          <div className="summary-icon"><Check size={15} /></div>
          <div className="summary-text">
            <span className="summary-label">Hoàn thành</span>
            <strong className="summary-value">{orders.filter(order => labelToKey('orderStatus', order.orderStatus, appOptions) === 'done').length}</strong>
          </div>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            className="filter-reset-button orders-filter-reset"
            onClick={() => {
              setSearchTerm('');
              setFilterSaleOnline('');
              setFilterOrderStatus('');
              setFilterPaymentStatus('');
              setFilterDeliveryStatus('');
              setFilterShippingMethod('');
              setFilterCategory('');
            }}
          >
            <X size={13} /> Xóa bộ lọc
          </button>
        )}
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
                <th className="sticky-col-1" style={{ width: `${colWidths.id}px`, minWidth: `${colWidths.id}px`, position: 'relative', textAlign: 'center' }}>
                  ID Đơn
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột ID" aria-valuemin={45} aria-valuenow={colWidths.id || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, id: Math.max(45, (previous.id || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'id')} title="Kéo để chỉnh rộng hẹp cột ID" />
                </th>
                <th className="sticky-col-2" style={{ width: `${colWidths.actions}px`, minWidth: `${colWidths.actions}px`, textAlign: 'center', position: 'relative', left: `${colWidths.id}px` }}>
                  Thao tác
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Thao tác" aria-valuemin={45} aria-valuenow={colWidths.actions || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, actions: Math.max(45, (previous.actions || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'actions')} title="Kéo để chỉnh rộng hẹp cột Thao tác" />
                </th>
                <th style={{ width: `${colWidths.createdDate}px`, minWidth: `${colWidths.createdDate}px`, position: 'relative' }}>
                  Ngày tạo & SALE
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Ngày tạo & SALE" aria-valuemin={45} aria-valuenow={colWidths.createdDate || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, createdDate: Math.max(45, (previous.createdDate || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'createdDate')} title="Kéo để chỉnh rộng hẹp cột Ngày tạo & SALE" />
                </th>
                
                {/* 4. GỘP 2 CỘT GHI CHÚ THÀNH 1 CỘT "GHI CHÚ" */}
                <th style={{ width: `${colWidths.note}px`, minWidth: `${colWidths.note}px`, position: 'relative' }}>
                  Ghi Chú
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Ghi Chú" aria-valuemin={45} aria-valuenow={colWidths.note || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, note: Math.max(45, (previous.note || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'note')} title="Kéo để chỉnh rộng hẹp cột Ghi Chú" />
                </th>

                {/* 5. CỘT "MÁY" 2 DÒNG (DÒNG 1: SELECTOR ID, DÒNG 2: TÊN CẤU HÌNH) */}
                <th style={{ width: `${colWidths.laptopId}px`, minWidth: `${colWidths.laptopId}px`, position: 'relative' }}>
                  Máy (ID & Cấu Hình)
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Máy" aria-valuemin={45} aria-valuenow={colWidths.laptopId || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, laptopId: Math.max(45, (previous.laptopId || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'laptopId')} title="Kéo để chỉnh rộng hẹp cột Máy" />
                </th>

                {/* 6. TRẠNG THÁI ĐƠN HÀNG (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                <th style={{ width: `${colWidths.orderStatus}px`, minWidth: `${colWidths.orderStatus}px`, position: 'relative' }}>
                  Trạng Thái Đơn
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Trạng Thái Đơn" aria-valuemin={45} aria-valuenow={colWidths.orderStatus || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, orderStatus: Math.max(45, (previous.orderStatus || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'orderStatus')} title="Kéo để chỉnh rộng hẹp cột Trạng Thái Đơn" />
                </th>

                {/* 7. THANH TOÁN (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                <th style={{ width: `${colWidths.paymentStatus}px`, minWidth: `${colWidths.paymentStatus}px`, position: 'relative' }}>
                  Thanh Toán
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Thanh Toán" aria-valuemin={45} aria-valuenow={colWidths.paymentStatus || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, paymentStatus: Math.max(45, (previous.paymentStatus || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'paymentStatus')} title="Kéo để chỉnh rộng hẹp cột Thanh Toán" />
                </th>

                {/* PHƯƠNG THỨC THANH TOÁN */}
                <th style={{ width: `${colWidths.paymentMethod}px`, minWidth: `${colWidths.paymentMethod}px`, position: 'relative' }}>
                  Phương Thức TT
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Phương Thức TT" aria-valuemin={45} aria-valuenow={colWidths.paymentMethod || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, paymentMethod: Math.max(45, (previous.paymentMethod || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'paymentMethod')} title="Kéo để chỉnh rộng hẹp cột Phương Thức TT" />
                </th>

                {/* 8. GIAO HÀNG (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                <th style={{ width: `${colWidths.deliveryStatus}px`, minWidth: `${colWidths.deliveryStatus}px`, position: 'relative' }}>
                  Giao Hàng
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Giao Hàng" aria-valuemin={45} aria-valuenow={colWidths.deliveryStatus || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, deliveryStatus: Math.max(45, (previous.deliveryStatus || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'deliveryStatus')} title="Kéo để chỉnh rộng hẹp cột Giao Hàng" />
                </th>

                {/* 9. NGÀY & GỬI HÀNG (GỘP CHUNG) */}
                <th style={{ width: `${colWidths.shippingMethod}px`, minWidth: `${colWidths.shippingMethod}px`, position: 'relative' }}>
                  Ngày & Gửi Hàng
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Ngày & Gửi Hàng" aria-valuemin={45} aria-valuenow={colWidths.shippingMethod || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, shippingMethod: Math.max(45, (previous.shippingMethod || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'shippingMethod')} title="Kéo để chỉnh rộng hẹp cột Ngày & Gửi Hàng" />
                </th>

                {/* 10. GIÁ BÁN (TR) */}
                <th style={{ width: `${colWidths.salePrice}px`, minWidth: `${colWidths.salePrice}px`, color: '#2563eb', position: 'relative' }}>
                  Giá Bán (tr)
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Giá bán" aria-valuemin={45} aria-valuenow={colWidths.salePrice || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, salePrice: Math.max(45, (previous.salePrice || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'salePrice')} title="Kéo để chỉnh rộng hẹp cột Giá bán" />
                </th>

                {/* 10b. LỢI NHUẬN (TR) — chỉ ADMIN: giá bán - giá nhập */}
                {user?.role === 'ADMIN' && (
                  <th style={{ width: `${colWidths.profitVnd}px`, minWidth: `${colWidths.profitVnd}px`, color: '#34d399', position: 'relative' }}>
                    Lợi Nhuận (tr)
                    <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Lợi nhuận" aria-valuemin={45} aria-valuenow={colWidths.profitVnd || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, profitVnd: Math.max(45, (previous.profitVnd || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'profitVnd')} title="Kéo để chỉnh rộng hẹp cột Lợi nhuận" />
                  </th>
                )}

                {/* 11. CỌC */}
                <th style={{ width: `${colWidths.depositNote}px`, minWidth: `${colWidths.depositNote}px`, color: '#d97706', position: 'relative' }}>
                  Cọc
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Cọc" aria-valuemin={45} aria-valuenow={colWidths.depositNote || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, depositNote: Math.max(45, (previous.depositNote || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'depositNote')} title="Kéo để chỉnh rộng hẹp cột Cọc" />
                </th>

                {/* 12. THU HỘ COD */}
                <th style={{ width: `${colWidths.codAmount}px`, minWidth: `${colWidths.codAmount}px`, color: '#059669', position: 'relative' }}>
                  Thu hộ COD
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Thu hộ" aria-valuemin={45} aria-valuenow={colWidths.codAmount || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, codAmount: Math.max(45, (previous.codAmount || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'codAmount')} title="Kéo để chỉnh rộng hẹp cột Thu hộ" />
                </th>

                <th style={{ width: `${colWidths.customerId}px`, minWidth: `${colWidths.customerId}px`, position: 'relative' }}>
                  Thông Tin Khách
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Khách" aria-valuemin={45} aria-valuenow={colWidths.customerId || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, customerId: Math.max(45, (previous.customerId || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'customerId')} title="Kéo để chỉnh rộng hẹp cột Khách" />
                </th>
                <th style={{ width: `${colWidths.customerAddress}px`, minWidth: `${colWidths.customerAddress}px`, position: 'relative' }}>
                  Địa Chỉ
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Địa Chỉ" aria-valuemin={45} aria-valuenow={colWidths.customerAddress || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, customerAddress: Math.max(45, (previous.customerAddress || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'customerAddress')} title="Kéo để chỉnh rộng hẹp cột Địa Chỉ" />
                </th>

                <th style={{ width: `${colWidths.setupNote}px`, minWidth: `${colWidths.setupNote}px`, position: 'relative' }}>
                  Cài Đặt
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Cài Đặt" aria-valuemin={45} aria-valuenow={colWidths.setupNote || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, setupNote: Math.max(45, (previous.setupNote || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'setupNote')} title="Kéo để chỉnh rộng hẹp cột Cài Đặt" />
                </th>
                <th style={{ width: `${colWidths.warranty}px`, minWidth: `${colWidths.warranty}px`, position: 'relative' }}>
                  Bảo Hành
                  <div className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0} aria-label="Kéo để chỉnh rộng hẹp cột Bảo Hành" aria-valuemin={45} aria-valuenow={colWidths.warranty || 100} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setColWidths(previous => ({ ...previous, warranty: Math.max(45, (previous.warranty || 100) + (e.key === "ArrowRight" ? 10 : -10)) })); } }} onPointerDown={(e) => startResizing(e, 'warranty')} title="Kéo để chỉnh rộng hẹp cột Bảo Hành" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={orderColumnCount} className="empty-cell">
                    {dataLoading ? 'Đang tải đơn hàng…' : 'Không tìm thấy đơn hàng nào phù hợp với bộ lọc.'}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => {
                  const laptopObj = laptops.find(l => String(l.id) === String(ord.laptopId || ord.requestedLaptopId));
                  const linkedCustomer = customers.find(customer => String(customer.id) === String(ord.customerId));
                  const noteValue = ord.note !== undefined ? ord.note : [ord.note1, ord.note2].filter(Boolean).join(' - ');
                  const showAllocationDetails = ['new', 'deposited'].includes(
                    labelToKey('orderStatus', ord.orderStatus, appOptions)
                  );

                  return (
                    <tr key={ord.id} data-testid={`order-row-${ord.id}`} className={getOrderRowStatusClass(ord)}>
                      {/* ID Đơn */}
                      <td className="sticky-col-1" style={{ width: `${colWidths.id}px`, minWidth: `${colWidths.id}px`, fontWeight: 800, color: '#111827', textAlign: 'center' }}>
                        #{ord.id}
                      </td>

                      {/* Thao tác */}
                      <td className="sticky-col-2" style={{ width: `${colWidths.actions}px`, minWidth: `${colWidths.actions}px`, textAlign: 'center', left: `${colWidths.id}px` }}>
                        <details
                          className="inventory-action-menu"
                          open={openActionMenuId === ord.id}
                          onToggle={(event) => {
                            if (event.currentTarget.open) setOpenActionMenuId(ord.id);
                            else setOpenActionMenuId((current) => current === ord.id ? null : current);
                          }}
                        >
                          <summary aria-label={`Thao tác đơn hàng #${ord.id}`} title="Thao tác"><MoreHorizontal size={18} /></summary>
                          <div>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              data-testid={`order-edit-button-${ord.id}`}
                              onClick={() => {
                                setOpenActionMenuId(null);
                                handleOpenEdit(ord);
                              }}
                              title="Chỉnh sửa đơn hàng"
                            >
                              <Edit3 size={13} /> Sửa
                            </button>
                            <InvoiceLink
                              orderId={ord.id}
                              invoiceId={ord.invoiceId}
                              issue
                              eligible={['shipping', 'done'].includes(labelToKey('orderStatus', ord.orderStatus, appOptions))}
                            />
                          </div>
                        </details>
                      </td>

                      <td style={{ width: colWidths.createdDate, minWidth: colWidths.createdDate }}>
                        <div className="order-display-text">{toVnFormat(ord.createdDate) || '—'}</div>
                        {ord.saleOnline && <strong>{getLabel('saleOnline', ord.saleOnline)}</strong>}
                        {ord.saleOffline && <div>{getLabel('saleOffline', ord.saleOffline)}</div>}
                      </td>
                      <td style={{ width: colWidths.note, minWidth: colWidths.note }}>
                        <OrderQuickNote key={`${ord.id}:${noteValue}`} orderId={ord.id} value={noteValue} onSave={note => updateOrder(ord.id, { note }, { awaitPersistence: true })} />
                      </td>
                      <td style={{ width: colWidths.laptopId, minWidth: colWidths.laptopId }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                          <div className="order-display-text" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                            {ord.laptopId && <><span className="order-id-card">#{ord.laptopId}</span>{' '}</>}
                            {formatConfigText(laptopObj?.name || ord.requestedConfiguration || '—')}
                          </div>
                          {!ord.laptopId && showAllocationDetails && (
                            <button type="button" className="btn btn-outline" onClick={() => setAllocationOrder(ord)}>
                              Phân máy
                            </button>
                          )}
                          {ord.laptopId && showAllocationDetails && (
                            <button type="button" className="btn btn-outline" onClick={() => setAllocationOrder(ord)}>
                              Đổi máy
                            </button>
                          )}
                          {ord.reservation && <a className="phase9-inline-link warning" href={`/reservations?q=${encodeURIComponent(ord.reservation.reservationCode)}`}>{ord.reservation.reservationCode} · {ord.reservation.status}</a>}
                          {ord.tradeIn && <a className="phase9-inline-link" href={`/trade-ins?q=${encodeURIComponent(ord.tradeIn.tradeInCode)}`}>Thu cũ {ord.tradeIn.tradeInCode}</a>}
                        </div>
                      </td>
                      <td style={{ width: colWidths.orderStatus, minWidth: colWidths.orderStatus }}>
                        <span data-testid={`order-status-cell-${ord.id}`} className={`status-badge ${getOrderStatusBadgeClass(ord.orderStatus)}`}>{getLabel('orderStatus', ord.orderStatus)}</span>
                      </td>

                      {/* 7. THANH TOÁN (ĐƯA LÊN TRƯỚC GIÁ BÁN) */}
                      <td className="order-payment-cell" style={{ width: `${colWidths.paymentStatus}px`, minWidth: `${colWidths.paymentStatus}px` }}>
                        <span
                          data-testid={`order-payment-cell-${ord.id}`}
                          className={`status-badge ${getPaymentStatusBadgeClass(ord.paymentStatus)}`}
                          title="Trạng thái được cập nhật từ lịch sử thu tiền"
                        >
                          {getLabel('paymentStatus', ord.paymentStatus)}
                        </span>
                        <div className="phase9-cell-meta">{labelToKey('paymentStatus', ord.paymentStatus, appOptions) === 'paid'
                          ? `Đã thu đủ ${Number(ord.amountPaid || 0).toLocaleString('vi-VN')} triệu`
                          : `Đã thu ${Number(ord.amountPaid || 0).toLocaleString('vi-VN')} triệu, còn ${remainingOrderAmount(ord).toLocaleString('vi-VN')} triệu`}</div>
                        {ord.isActive !== false && Number(ord.debtAmount || 0) > 0 && (
                          <button
                            type="button"
                            className="phase9-inline-link"
                            onClick={() => setPaymentOrder(ord)}
                          >
                            Mở thu tiền
                          </button>
                        )}
                      </td>

                      <td style={{ width: colWidths.paymentMethod, minWidth: colWidths.paymentMethod }}><span className={`status-badge ${getPaymentMethodBadgeClass(ord.paymentMethod)}`}>{getLabel('paymentMethod', ord.paymentMethod)}</span></td>
                      <td style={{ width: colWidths.deliveryStatus, minWidth: colWidths.deliveryStatus }}><span data-testid={`order-delivery-cell-${ord.id}`} className={`status-badge ${getDeliveryStatusBadgeClass(ord.deliveryStatus)}`}>{getLabel('deliveryStatus', ord.deliveryStatus)}</span></td>
                      <td style={{ width: colWidths.shippingMethod, minWidth: colWidths.shippingMethod }}>
                        <div className="order-display-text">{getLabel('shippingMethod', ord.shippingMethod) || '—'}</div>
                        {ord.shipDate && <div>{toVnFormat(ord.shipDate)}</div>}
                        {ord.trackingCode && <div className="order-display-text">{ord.trackingCode}</div>}
                      </td>

                      {/* 10. GIÁ BÁN (TR) */}
                      <td className="order-sale-price-cell" style={{ width: `${colWidths.salePrice}px`, minWidth: `${colWidths.salePrice}px`, textAlign: 'center' }}>
                        <strong title="Bấm Sửa để thay đổi giá bán">{Number(ord.salePrice || 0).toLocaleString('vi-VN')}</strong>
                      </td>

                      {/* 10b. LỢI NHUẬN (TR) — chỉ ADMIN: giá bán - giá nhập của máy */}
                      {user?.role === 'ADMIN' && (
                        <td style={{ width: `${colWidths.profitVnd}px`, minWidth: `${colWidths.profitVnd}px`, fontWeight: 800, color: '#059669', textAlign: 'center' }}>
                          {!ord.laptopId ? '-' : ord.profitVnd != null
                            ? Number(ord.profitVnd).toFixed(2)
                            : laptopObj && ord.salePrice
                              ? Number((parseFlexibleFloat(ord.salePrice) - parseFlexibleFloat(laptopObj.importPriceVnd)).toFixed(2)).toFixed(2)
                              : '-'}
                        </td>
                      )}

                      {/* 11. CỌC (TEXTBOX 3 HÀNG THOÁNG MÁT) */}
                      <td style={{ width: `${colWidths.depositNote}px`, minWidth: `${colWidths.depositNote}px` }}>
                        <div style={{ textAlign: 'center' }} title="Cọc lấy từ lịch sử Thu tiền; chỉ admin được sửa giao dịch">
                          <strong>{Number(ord.depositAmount || 0).toLocaleString('vi-VN')}</strong>
                        </div>
                      </td>

                      {/* 12. THU HỘ COD (TR) */}
                      <td style={{ width: `${colWidths.codAmount}px`, minWidth: `${colWidths.codAmount}px` }}>
                        <div style={{ textAlign: 'center' }} title="Giá bán trừ tổng tiền cọc"><strong>{orderBalanceAfterDeposit(ord).toLocaleString('vi-VN')}</strong></div>
                      </td>

                      <td style={{ width: colWidths.customerId, minWidth: colWidths.customerId }}><div className="order-display-text">{linkedCustomer ? [linkedCustomer.name, linkedCustomer.phone].filter(Boolean).join('\n') : ord.customerInfo || '—'}</div></td>
                      <td style={{ width: colWidths.customerAddress, minWidth: colWidths.customerAddress }}><div className="order-display-text">{linkedCustomer ? linkedCustomer.address || '—' : ord.customerAddress || '—'}</div></td>
                      <td style={{ width: colWidths.setupNote, minWidth: colWidths.setupNote }}><div className="order-display-text">{ord.setupNote || '—'}</div></td>
                      <td style={{ width: colWidths.warranty, minWidth: colWidths.warranty }}><div className="order-display-text">{ord.warranty || '—'}</div></td>

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
          description={formData.id ? undefined : `Lưu vào tháng ${selectedMonth === 'ALL' ? 'theo ngày tạo đơn' : selectedMonth}.`}
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
                    <option value="">Không chọn SALE Online</option>{SALE_ONLINE_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="order-sale-offline" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>SALE Offline</label>
                  <select id="order-sale-offline" className="form-control" value={formData.saleOffline} onChange={e => setFormData({ ...formData, saleOffline: e.target.value })}>
                    <option value="">Không chọn SALE Offline</option>{SALE_OFFLINE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
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
                    disabled={Boolean(formData.id) && getFormOptionKey('orderType', formData.orderType) === 'trade_in'}
                  >
                    {ORDER_TYPES.filter(t => (
                      getFormOptionKey('orderType', formData.orderType) === 'trade_in'
                      || getFormOptionKey('orderType', t) !== 'trade_in'
                    )).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {!formData.id && (
                    <Link
                      href="/trade-ins"
                      data-testid="order-trade-in-workflow-link"
                      style={{ display: 'inline-block', marginTop: '0.45rem', fontSize: '0.78rem', color: '#2563eb', fontWeight: 600 }}
                    >
                      Thu cũ đổi mới được tạo tại mục Thu cũ
                    </Link>
                  )}
                </div>
                
                {formData.id && getFormOptionKey('orderType', formData.orderType) === 'trade_in' && (
                  <>
                    {formData.tradeInLaptopId && <div className="order-linked-trade-in" style={{ gridColumn: 'span 2' }}>
                      Máy thu cũ đã liên kết: <strong>#{formData.tradeInLaptopId} · {formData.tradeInLaptopName || 'Chưa có tên'}</strong>
                    </div>}
                    <div className="form-group">
                      <label htmlFor="order-field-10" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#10b981' }}>Tên Máy Khách Bán (Trade-in)</label>
                      <input id="order-field-10"
                        type="text" 
                        className="form-control" 
                        value={formData.tradeInLaptopName} 
                        onChange={e => setFormData({ ...formData, tradeInLaptopName: e.target.value })} 
                        placeholder="VD: Thinkpad T480s i5..."
                        disabled
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="order-trade-in-serial" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#10b981' }}>Serial Máy Thu Cũ</label>
                      <input id="order-trade-in-serial" type="text" className="form-control" value={formData.tradeInSerial} disabled placeholder="Nhập serial để tránh trùng máy" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="order-field-11" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#10b981' }}>Giá Thu Lại (tr VNĐ)</label>
                      <input id="order-field-11"
                        type="number" step="any"
                        className="form-control" 
                        value={formData.tradeInPrice} 
                        onChange={e => setFormData({ ...formData, tradeInPrice: e.target.value })} 
                        placeholder="VD: 5.5"
                        min="0.01"
                        disabled
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                    <label htmlFor="order-field-13" className="form-label" style={{ flex: 1, marginBottom: 0, fontWeight: 600, fontSize: '0.8rem', color: '#1d4ed8' }}>
                      Cấu hình tham khảo (chưa phân máy)
                    </label>
                    <Input
                      data-testid="order-laptop-search"
                      value={laptopPickerSearch}
                      onChange={e => setLaptopPickerSearch(e.target.value)}
                      placeholder="Tìm ID, cấu hình hoặc serial..."
                      aria-label="Tìm máy theo ID, cấu hình hoặc serial"
                      style={{ width: 'min(360px, 48%)', height: '34px' }}
                    />
                  </div>
                  <select id="order-field-13"
                    data-testid="order-laptop-select"
                    className="form-control" 
                    value={formData.laptopId || formData.requestedLaptopId || ''}
                    onChange={e => handleSelectLaptopChange(e.target.value)}
                  >
                    <option value="">-- Chưa chọn / chưa gán máy --</option>
                    {getLaptopPickerOptions().map(l => (
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
                    onChange={e => handleDraftDepositFieldChange('orderStatus', e.target.value)}
                  >
                    {ORDER_STATUS_OPTIONS.filter(st => formData.id || getFormOptionKey('orderStatus', st) === 'new').map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {/* 8. TRẠNG THÁI Thanh toán */}
                <div className="form-group">
                  <label htmlFor="order-field-15" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Trạng Thái Thanh Toán</label>
                  <div id="order-field-15" data-testid="order-payment-status-readonly" className={`form-control ${getPaymentStatusBadgeClass(formData.id ? formData.paymentStatus : PAYMENT_STATUS_OPTIONS[0])}`} aria-readonly="true">
                    {formData.id ? formData.paymentStatus : PAYMENT_STATUS_OPTIONS[0]}
                  </div>
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
                    min="0.01"
                        data-testid="order-sale-price-input"
                    step="0.01"
                    className="form-control" 
                    value={formData.salePrice} 
                    onChange={e => setFormData({ ...formData, salePrice: e.target.value })}
                    placeholder="VD: 17.5"
                    required 
                  />
                </div>

                {(
                  <>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#d97706' }}>Tiền Cọc Đã Ghi Nhận</label>
                      <div className="form-control" aria-readonly="true">{Number(formData.depositAmount || 0).toFixed(2)} triệu VNĐ</div>
                    </div>
                  </>
                )}

                {/* 13. THU HỘ COD */}
                <div className="form-group">
                  <label htmlFor="order-field-24" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#059669' }}>Thu Hộ COD (triệu VNĐ)</label>
                  <input id="order-field-24"
                    type="number" 
                    min="0"
                    readOnly
                        data-testid="order-cod-amount-input"
                    step="any" 
                    className="form-control" 
                    value={orderBalanceAfterDeposit(formData)}
                    placeholder="VD: 17.0"
                  />
                </div>

                {/* 17. KHÁCH HÀNG */}
                <div className="form-group" style={{ gridColumn: 'span 4' }}>
                  <label htmlFor="order-field-25" className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    Khách Hàng <button type="button" className="inline-add-button" onClick={() => setShowCustomerForm(prev => !prev)}>{showCustomerForm ? '× Đóng' : '+ Thêm mới'}</button>
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select id="order-field-25"
                    data-testid="order-customer-select"
                    className="form-control" 
                    value={formData.customerId} 
                    onChange={e => {
                      const customer = customers.find(item => String(item.id) === e.target.value);
                      setFormData({ ...formData, customerId: e.target.value, customerInfo: customer ? [customer.name, customer.phone].filter(Boolean).join('\n') : '', customerAddress: customer?.address || '' });
                    }}
                    required 
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" disabled={!formData.customerId} onClick={() => {
                    const customer = customers.find(item => String(item.id) === String(formData.customerId));
                    if (customer) setEditingCustomer({ ...customer, name: customer.name || '', phone: customer.phone || '', address: customer.address || '' });
                  }}>Sửa khách hàng</Button>
                  </div>
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

                <InvoiceOrderFields value={formData} onChange={setFormData} />

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
      {editingCustomer && <CustomerFormModal isModalOpen setIsModalOpen={open => { if (!open) setEditingCustomer(null); }} formData={editingCustomer} setFormData={setEditingCustomer} submission={customerSubmission} handleSave={event => {
        event.preventDefault();
        event.stopPropagation();
        customerSubmission.run(async () => {
          const result = await updateCustomer(editingCustomer.id, { name: editingCustomer.name, phone: editingCustomer.phone, address: editingCustomer.address });
          if (!result?.ok) { toast.error(result?.message || 'Không lưu được khách hàng.'); return; }
          setFormData(current => ({ ...current, customerInfo: [editingCustomer.name, editingCustomer.phone].filter(Boolean).join('\n'), customerAddress: editingCustomer.address }));
          setEditingCustomer(null);
        });
      }} />}
      {paymentOrder && (
        <RecordPaymentModal
          key={paymentOrder.id}
          open={Boolean(paymentOrder)}
          initialOrderId={paymentOrder.id}
          onClose={() => setPaymentOrder(null)}
        />
      )}
    </section>
  );
}
