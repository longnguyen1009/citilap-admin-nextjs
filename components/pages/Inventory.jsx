"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  useInventory, 
  computeImportPrice, 
  computeProfit, 
  parseFlexibleFloat
} from '../../context/InventoryContext';
import { D } from '../../lib/fieldOptions';
import { labelToKey, getOptions, getLabel, usePresetConfigs } from '../../lib/useFieldOptions';
import { useAuth } from '../../context/AuthContext';
import { 
  Plus, Edit3, Trash2, Settings, RefreshCw, Download, Upload, 
  Search, Filter, ExternalLink, Calculator, Layers, Tag, Box, CheckCircle2, AlertTriangle, ArrowUpRight, Zap, ChevronDown, X, Activity, Calendar, History
} from 'lucide-react';
import TechCheckModal from '../TechCheckModal';
import FixedHorizontalScrollbar from '../FixedHorizontalScrollbar';
import ActivityTimeline from '../ActivityTimeline';

const toYMD = (vnDate) => {
  if (!vnDate) return '';
  if (vnDate.includes('-')) return vnDate;
  const parts = vnDate.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  return vnDate;
};

const toVnFormat = (ymd) => {
  if (!ymd) return '';
  if (ymd.includes('/')) return ymd;
  const parts = ymd.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return ymd;
};

export default function Inventory() {
  const { 
    laptops: allLaptops,
    filteredLaptops: laptops,
    selectedMonth,
    setSelectedMonth,
    availableMonths,
    parseMonthYear,
    formulaConfig, 
    updateLaptop, 
    addLaptop, 
    deleteLaptop, 
    updateFormulaConfig,
    importSheetData,
    getLabel,
    getOptions,
    cloudStatus,
    SELLER_OPTIONS,
    CATEGORY_OPTIONS,
    LOCATION_OPTIONS,
    STATUS_OPTIONS,
    CHARGER_OPTIONS,
    updateFieldOptions,
    fieldOptionsConfig
  } = useInventory();
  
  const { user } = useAuth();

  // State tìm kiếm & lọc
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCats, setSelectedCats] = useState([]); // Multi-select cho Phân loại
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [warehouseDateFrom, setWarehouseDateFrom] = useState('');
  const [warehouseDateTo, setWarehouseDateTo] = useState('');

  // Ref đóng dropdown khi nhấp ra ngoài
  const catDropdownRef = useRef(null);

  // Ref cho khung bảng sản phẩm
  const tableContainerRef = useRef(null);

  // State quản lý độ rộng của từng cột (Mặc định chuẩn kích thước như ảnh yêu cầu của User)
  const [colWidths, setColWidths] = useState({
    id: 65,
    importDate: 48,
    name: 420,
    location: 95,
    category: 180,
    cycleCount: 70,
    warrantySupplier: 100,
    conditionNote: 220,
    serial: 90,
    chargerStatus: 100,
    seller: 120,
    status: 160,
    priceRmb: 80,
    shippingRmb: 75,
    exchangeRate: 70,
    importPriceVnd: 95,
    trackingCode: 160,
    actions: 70
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
    return Object.values(colWidths).reduce((acc, curr) => acc + curr, 0);
  }, [colWidths]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(event.target)) {
        setIsCatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [editingLaptop, setEditingLaptop] = useState(null);
  const [isTechCheckModalOpen, setIsTechCheckModalOpen] = useState(false);
  const [techCheckLaptop, setTechCheckLaptop] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);

  // Form State cho Thêm / Sửa Laptop
  const emptyForm = {
    importDate: new Date().toLocaleDateString('en-GB'),
    warehouseDate: '',
    id: '',
    serial: '',
    name: '',
    location: LOCATION_OPTIONS[0]?.key || 'wh_vn',
    category: CATEGORY_OPTIONS[0]?.key || '',
    cycleCount: '',
    warrantySupplier: '',
    conditionNote: '',
    chargerStatus: CHARGER_OPTIONS[0]?.key || 'with_charger',
    seller: SELLER_OPTIONS[0]?.key || '',
    status: D.laptopAvailable,
    priceRmb: '',
    shippingRmb: '',
    exchangeRate: formulaConfig.defaultRate || 3550,
    importPriceVnd: '',
    importPriceManuallyEdited: false,
    trackingCode: ''
  };

  const [formData, setFormData] = useState(emptyForm);

  // Preset configs (cấu hình mẫu cho tên máy)
  const { presets: presetConfigs } = usePresetConfigs();
  const [showPresets, setShowPresets] = useState(false);

  // Lọc presets theo tên đang nhập
  const matchedPresets = useMemo(() => {
    const name = String(formData.name || '').trim().toLowerCase();
    if (!name) return [];
    return Object.entries(presetConfigs).filter(([key, val]) =>
      String(key).toLowerCase().includes(name) || String(val).toLowerCase().includes(name)
    );
  }, [formData.name, presetConfigs]);

  // Formula Form State
  const [formulaForm, setFormulaForm] = useState({
    shippingVnd: formulaConfig.shippingVnd,
    defaultRate: formulaConfig.defaultRate,
    recalculateAll: false
  });

  // Category new tag input state
    
  // Trợ lý chọn Class màu cho HÀNG sản phẩm theo Trạng Thái
  const getRowStatusClass = (status) => {
    const key = labelToKey('laptopStatus', status);
    switch (key) {
      case 'not_imported': return 'row-chua-nhap';
      case 'available': return 'row-san-hang';
      case 'repairing': return 'row-dang-sua';
      case 'deposited': return 'row-da-coc';
      case 'sold': return 'row-other';
      default: return 'row-other';
    }
  };

  // Trợ lý chọn Class màu cho Phân Loại
  const getCategoryBadgeClass = (category) => {
    if (!category) return 'pill-badge pill-neutral';
    const label = getLabel('category', category) || String(category);
    const cat = String(label).toUpperCase();
    if (cat.includes('LEGION 5 PRO')) return 'pill-badge pill-success';
    if (cat.includes('LEGION SLIM')) return 'pill-badge pill-danger';
    if (cat.includes('LEGION')) return 'pill-badge pill-danger';
    if (cat.includes('ROG')) return 'pill-badge pill-neutral';
    if (cat.includes('ZEPHYRUS') || cat.includes('TUF') || cat.includes('ASUS')) return 'pill-badge pill-info';
    if (cat.includes('ACER')) return 'pill-badge pill-info';
    return 'pill-badge pill-neutral';
  };

  // Trợ lý chọn Class màu cho Status Badge
  const getStatusBadgeClass = (status) => {
    const key = labelToKey('laptopStatus', status);
    switch (key) {
      case 'not_imported': return 'pill-badge pill-warning';
      case 'available': return 'pill-badge pill-success';
      case 'repairing': return 'pill-badge pill-warning';
      case 'sold': return 'pill-badge pill-neutral';
      case 'returned_cn': return 'pill-badge pill-neutral';
      case 'deposited': return 'pill-badge pill-info';
      default: return 'pill-badge pill-warning';
    }
  };

  // Trợ lý chọn Class màu cho Location
  const getLocationBadgeClass = (loc) => {
    const key = labelToKey('laptopLocation', loc);
    switch (key) {
      case 'store': return 'pill-badge pill-success';
      case 'wh': return 'pill-badge pill-info';
      case 'wh_cn': return 'pill-badge pill-purple';
      case 'repair': return 'pill-badge pill-warning';
      default: return 'pill-badge pill-info';
    }
  };

  // Trợ lý chọn Class màu cho Sạc
  const getChargerBadgeClass = (chargerStatus) => {
    const key = labelToKey('chargerStatus', chargerStatus);
    switch (key) {
      case 'yes': return 'pill-badge pill-success';
      case 'no': return 'pill-badge pill-danger';
      case 'fake': return 'pill-badge pill-warning';
      case 'untested': return 'pill-badge pill-neutral';
      default: return 'pill-badge pill-success';
    }
  };


  // Trợ lý chọn Class màu cho Người bán (dạng badge pill)
  const getSellerBadgeClass = (seller) => {
    if (!seller) return { bg: '#f1f5f9', color: '#64748b' };
    const s = String(seller).toLowerCase();
    if (s.includes('guangzhou')) return { bg: '#dbeafe', color: '#1d4ed8' };
    if (s.includes('shenzhen')) return { bg: '#d1fae5', color: '#065f46' };
    if (s.includes('beijing')) return { bg: '#ede9fe', color: '#5b21b6' };
    if (s.includes('a-ming') || s.includes('aming')) return { bg: '#ffedd5', color: '#c2410c' };
    if (s.includes('xiao')) return { bg: '#ccfbf1', color: '#0f766e' };
    return { bg: '#f1f5f9', color: '#475569' };
  };

  // Tính toán chỉ số tổng quan
  const stats = useMemo(() => {
    const totalCount = laptops.length;
    const availableCount = laptops.filter(l => l.status === 'available' || l.status === 'Chưa bán' || l.status === 'Đã nhập kho').length;
    const soldCount = laptops.filter(l => l.status === 'sold' || l.status === D.laptopSold).length;
    const totalImportValueVnd = laptops.reduce((sum, l) => sum + (l.importPriceVnd || 0), 0);

    return { totalCount, availableCount, soldCount, totalImportValueVnd };
  }, [laptops]);

  // Lọc dữ liệu theo Search Term & Dropdowns (Multi-select Phân loại)
  const filteredLaptops = useMemo(() => {
    return laptops.filter(laptop => {
      const matchSearch = 
        !searchTerm ||
        String(laptop.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(laptop.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(laptop.serial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(laptop.seller || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(laptop.trackingCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(laptop.conditionNote || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(laptop.importDate || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(laptop.warehouseDate || '').toLowerCase().includes(searchTerm.toLowerCase());

      const laptopCatKey = laptop.category;
      const matchCat = selectedCats.length === 0 || selectedCats.includes(laptopCatKey);
      const matchLoc = selectedLoc === 'ALL' || laptop.location === selectedLoc || labelToKey('laptopLocation', laptop.location, fieldOptionsConfig) === selectedLoc;
      const matchStatus = selectedStatus === 'ALL' || laptop.status === selectedStatus || labelToKey('laptopStatus', laptop.status, fieldOptionsConfig) === selectedStatus;

      const matchWarehouseDate = (() => {
        if (!warehouseDateFrom && !warehouseDateTo) return true;
        const wDate = laptop.warehouseDate;
        if (!wDate) return false;
        const toComparable = (d) => {
          if (!d) return null;
          if (d.includes('/')) {
            const [dd, mm, yyyy] = d.split('/');
            return yyyy + '-' + mm.padStart(2, '0') + '-' + dd.padStart(2, '0');
          }
          return d;
        };
        const w = toComparable(wDate);
        const from = toComparable(warehouseDateFrom);
        const to = toComparable(warehouseDateTo);
        if (from && w < from) return false;
        if (to && w > to) return false;
        return true;
      })();

      return matchSearch && matchCat && matchLoc && matchStatus && matchWarehouseDate;
    }).sort((a, b) => {
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  }, [laptops, searchTerm, selectedCats, selectedLoc, selectedStatus, warehouseDateFrom, warehouseDateTo, fieldOptionsConfig]);

  // Trợ lý Bật/Tắt Phân loại trong Multi-Select
  const toggleCategorySelect = (cat) => {
    if (selectedCats.includes(cat)) {
      setSelectedCats(prev => prev.filter(c => c !== cat));
    } else {
      setSelectedCats(prev => [...prev, cat]);
    }
  };

  const clearCategorySelect = () => {
    setSelectedCats([]);
  };

  // Mở Modal Thêm mới
  const handleOpenAdd = () => {
    setEditingLaptop(null);
    setFormData({
      ...emptyForm,
      category: CATEGORY_OPTIONS[0]?.key || '',
      exchangeRate: formulaConfig.defaultRate
    });
    // Reset presetConfigs is no longer needed since it uses usePresetConfigs hook
    setIsAddModalOpen(true);
  };

  // Mở Modal Chỉnh Sửa
  const handleOpenEdit = (laptop) => {
    setEditingLaptop(laptop);
    setFormData({
      importDate: laptop.importDate || '',
      warehouseDate: laptop.warehouseDate || '',
      id: laptop.id || '',
      serial: laptop.serial || '',
      name: laptop.name || '',
      location: laptop.location || D.locStore,
      category: laptop.category || CATEGORY_OPTIONS[0]?.key || '',
      cycleCount: laptop.cycleCount || '',
      warrantySupplier: laptop.warrantySupplier || '',
      conditionNote: laptop.conditionNote || '',
      chargerStatus: laptop.chargerStatus || D.chargerWith,
      seller: laptop.seller || '',
      status: laptop.status || D.laptopAvailable,
      priceRmb: laptop.priceRmb || '',
      shippingRmb: laptop.shippingRmb || '',
      exchangeRate: laptop.exchangeRate || formulaConfig.defaultRate,
      importPriceVnd: laptop.importPriceVnd || '',
      importPriceManuallyEdited: Boolean(laptop.importPriceVnd && Number(laptop.importPriceVnd) !== computeImportPrice(laptop.priceRmb, laptop.shippingRmb, laptop.exchangeRate || formulaConfig.defaultRate, formulaConfig)),
      trackingCode: laptop.trackingCode || ''
    });
    setIsAddModalOpen(true);
    setShowTimeline(false);
  };

  // Lưu Form Thêm / Sửa
  const handleSaveLaptop = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Vui lòng nhập Tên Máy!');
      return;
    }

    const computedPayload = !formData.importPriceManuallyEdited && liveImportPrice > 0
      ? { ...formData, importPriceVnd: liveImportPrice }
      : formData;
    if (editingLaptop) {
      const result = await updateLaptop(editingLaptop.id, computedPayload);
      if (!result.ok) {
        alert(`⛔ ${result.message}`);
        return;
      }
    } else {
      const result = await addLaptop(computedPayload);
      if (!result.ok) {
        alert(`⛔ ${result.message}`);
        return;
      }
    }
    setIsAddModalOpen(false);
  };

  // Xóa Laptop
  const handleDelete = (id) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa máy ${id} khỏi kho?`)) {
      const result = deleteLaptop(id);
      if (!result.ok) alert(`⛔ ${result.message}`);
    }
  };

  // Lưu cấu hình Công thức
  const handleSaveFormula = (e) => {
    e.preventDefault();
    updateFormulaConfig({
      ...formulaConfig,
      shippingVnd: parseFloat(formulaForm.shippingVnd) || 400000,
      defaultRate: parseFloat(formulaForm.defaultRate) || 3550
    }, formulaForm.recalculateAll);
    setIsFormulaModalOpen(false);
    alert('Đã cập nhật công thức tính Giá Nhập thành công!');
  };

  // Thêm Phân loại danh mục mới
  const handleAddCategorySubmit = async (e) => {
    e.preventDefault();
    if (newCatInput.trim()) {
      const newLabel = newCatInput.trim();
      const newKey = String(Date.now());
      const saved = await updateFieldOptions('category', newKey, newLabel);
      if (!saved) {
        alert('Không thể thêm phân loại lên cloud.');
        return;
      }
      setFormData(prev => ({ ...prev, category: newKey }));
      setNewCatInput('');
      setShowAddCatInput(false);
    }
  };

  // Live preview của Giá Nhập trong Form
  const liveImportPrice = computeImportPrice(
    formData.priceRmb,
    formData.shippingRmb,
    formData.exchangeRate,
    formulaConfig
  );

  // Xuất file CSV (Khớp chính xác 20 cột của Google Sheet)
  const handleExportCSV = () => {
    const isAdmin = user?.role === 'ADMIN';
    const headers = [
      "Ngày nhập", "NO", "Tên", "Vị trí kho", "", "Phân Loại",
      "SERIAL", "Tình trạng Sạc", "Tình trạng", "Người bán", "Tình Trạng Note", "Trạng thái bán",
      ...(isAdmin ? ["Giá tệ", "Phí vc nội địa", "Tỷ giá tệ", "Giá Nhập"] : []),
      "Giá bán thợ", "giá bán lẻ", "Mã đơn vận"
    ];

    const csvRows = [
      headers.join(','),
      ...laptops.map(l => {
        const base = [
          `"${l.importDate}"`, `"${l.id}"`, `"${l.name.replace(/"/g, '""')}"`, `"${l.location}"`, '""', `"${getLabel('category', l.category)}"`,
          `"${l.serial || ''}"`, `"${l.chargerStatus || D.chargerWith}"`, '""', `"${l.seller}"`, `"${(l.conditionNote || '').replace(/"/g, '""')}"`, `"${l.status}"`,
        ];
        const financial = isAdmin
          ? [l.priceRmb, l.shippingRmb, l.exchangeRate, l.importPriceVnd]
          : [];
        const selling = [`"${l.trackingCode}"`];
        return [...base, ...financial, ...selling].join(',');
      })
    ];

    const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kho_CitiLap_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const [sheetUrlInput, setSheetUrlInput] = useState(
    'https://docs.google.com/spreadsheets/d/1QuHlL_ld8jEFasiIpDSDmRogYkrhs9f1-Ngewzwk0UI/edit?gid=1444306295#gid=1444306295'
  );
  const [isSyncing, setIsSyncing] = useState(false);

  // Kéo dữ liệu 1-Click trực tiếp từ link Google Sheet (Cấu trúc 20 cột chuẩn)
  const handleSyncDirectGoogleSheet = async () => {
    try {
      setIsSyncing(true);
      const matchDoc = sheetUrlInput.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const matchGid = sheetUrlInput.match(/gid=([0-9]+)/);
      
      const docId = matchDoc ? matchDoc[1] : '1QuHlL_ld8jEFasiIpDSDmRogYkrhs9f1-Ngewzwk0UI';
      const gid = matchGid ? matchGid[1] : '1444306295';

      const exportUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid}`;

      const res = await fetch(exportUrl);
      const text = await res.text();

      if (text.includes('<!DOCTYPE html>') || text.includes('login') || text.includes('Google Accounts')) {
        alert(
          '⚠️ File Google Sheet hiện đang để chế độ "Hạn chế" (Riêng tư).\\n\\n' +
          'Để ứng dụng kéo dữ liệu tự động 1-Click:\\n' +
          '1. Mở file Google Sheet của bạn\\n' +
          '2. Bấm nút "Chia sẻ" (Share) ở góc trên bên phải\\n' +
          '3. Đổi từ "Hạn chế" sang "Bất kỳ ai có đường liên kết" (Anyone with the link can view)\\n' +
          '4. Thử bấm lại nút "Kéo Dữ Liệu Ngay" nhé!'
        );
        setIsSyncing(false);
        return;
      }

      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length <= 1) {
        alert('File Google Sheet rỗng hoặc chưa có dữ liệu!');
        setIsSyncing(false);
        return;
      }

      const parsed = lines.slice(1).map((line, idx) => {
        // Parse CSV với dấu phẩy và ngoặc kép
        const cols = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/);
        const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());

        return {
          importDate: clean[0] || '08/07',
          id: clean[1] || `#${idx + 75}`,
          name: clean[2] || '',
          location: clean[3] || D.locStore,
                                  category: labelToKey('category', clean[5], fieldOptionsConfig) || CATEGORY_OPTIONS[0]?.key || '',
          serial: clean[6] || '',
          chargerStatus: clean[7] || D.chargerWith,
          seller: clean[9] || '',
          conditionNote: clean[10] || clean[8] || '',
          status: clean[11] || D.laptopAvailable,
          priceRmb: parseFlexibleFloat(clean[12]),
          shippingRmb: parseFlexibleFloat(clean[13]),
          exchangeRate: parseFlexibleFloat(clean[14]),
          importPriceVnd: clean[15] !== undefined && clean[15] !== '' ? parseFlexibleFloat(clean[15]) : undefined,
          profitVnd: clean[18] !== undefined && clean[18] !== '' ? parseFlexibleFloat(clean[18]) : undefined,
          trackingCode: clean[19] || ''
        };
      });

      const result = await importSheetData(parsed);
      setIsSyncing(false);
      setIsSyncModalOpen(false);
      alert(result.ok
        ? `🎉 Đã đồng bộ ${result.imported} sản phẩm lên cloud.`
        : `⚠️ Đã lưu ${result.imported || 0}/${parsed.length} sản phẩm. ${result.message || ''}`);
    } catch (err) {
      console.error(err);
      alert('Không thể kết nối đến Google Sheet. Vui lòng kiểm tra lại quyền Chia sẻ của Sheet!');
      setIsSyncing(false);
    }
  };

  return (
    <section className="page-section">
      {/* COMPACT SECTION HEADER */}
      <div className="section-title section-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>
            <Box className="text-primary" size={24} /> Quản Lý Kho Laptop CitiLap
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
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setIsSyncModalOpen(true)}>
            <RefreshCw size={14} /> Google Sheet
          </button>

          <button className="btn btn-sm btn-success" onClick={handleOpenAdd}>
            <Plus size={16} /> Thêm Máy Mới
          </button>
        </div>
      </div>

      {cloudStatus === 'checking' && (
        <div className="sync-indicator checking" style={{ marginBottom: '0.75rem' }}>
          <span className="sync-spinner"></span>
          Đang kết nối cloud...
        </div>
      )}

      {cloudStatus === 'disconnected' && (
        <div className="alert-banner error">
          <AlertTriangle size={18} />
          <div>
            <strong>Chưa kết nối Supabase Cloud!</strong> Mọi dữ liệu (Kho máy, Đơn hàng) hiện tại đang là dữ liệu giả lập (mock data) và sẽ KHÔNG ĐƯỢC LƯU LÊN MẠNG. Dữ liệu sẽ <strong>MẤT</strong> khi tải lại trang.<br/>
            Vui lòng vào <strong>Hệ Thống -&gt; Cấu hình Cloud (Supabase)</strong> để nhập thông tin kết nối ngay.
          </div>
        </div>
      )}

      {cloudStatus === 'error' && (
        <div className="alert-banner warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Lỗi tải dữ liệu Supabase!</strong> Ứng dụng đang dùng dữ liệu mẫu. Nếu bạn vừa cập nhật Serial hoặc các cột mà chưa đồng bộ DB, vui lòng chạy lệnh <code>ALTER TABLE laptops ADD COLUMN serial VARCHAR(100);</code> trong SQL Editor.
          </div>
        </div>
      )}

      {/* COMPACT FILTER & SEARCH CARD */}
      <div className="card glass filter-card" style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
        <div className="filter-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
          <div className="filter-item" style={{ flex: '1 1 220px' }}>
            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}><Search size={13} style={{ display: 'inline', marginRight: '3px' }} /> Tìm kiếm thông minh</label>
            <input 
              type="text" 
              className="filter-input"
              placeholder="Tìm theo Tên máy, Mã ID, Serial, Mã vận đơn, Ngày nhập..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* MULTI-SELECT BỘ LỌC PHÂN LOẠI MÁY (DẠNG XỔ XUỐNG DIRECT INLINE DROPDOWN) */}
          <div className="filter-item" ref={catDropdownRef} style={{ flex: '0 1 170px', position: 'relative' }}>
            <label style={{ fontSize: '0.75rem', marginBottom: '0.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span><Tag size={13} style={{ display: 'inline', marginRight: '3px' }} /> Phân loại máy (Chọn nhiều)</span>
            </label>
            
            <button
              type="button"
              onClick={() => setIsCatDropdownOpen(prev => !prev)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                fontSize: '0.85rem',
                textAlign: 'left',
                background: selectedCats.length > 0 ? '#eff6ff' : '#ffffff',
                border: selectedCats.length > 0 ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                borderRadius: '6px',
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                color: selectedCats.length > 0 ? '#1d4ed8' : '#1e293b'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selectedCats.length > 0 ? 700 : 400 }}>
                {selectedCats.length === 0 
                  ? `-- Tất cả Phân loại (${CATEGORY_OPTIONS.length}) --` 
                  : `Đã chọn (${selectedCats.length}) phân loại`}
              </span>
              <ChevronDown size={14} style={{ color: selectedCats.length > 0 ? '#1d4ed8' : '#64748b', flexShrink: 0 }} />
            </button>

            {/* MENU XỔ XUỐNG TRỰC TIẾP */}
            {isCatDropdownOpen && (
              <div 
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  width: '320px',
                  zIndex: 9999,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
                  padding: '8px',
                  marginTop: '4px'
                }}
              >
                <div 
                  style={{
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center',
                    padding: '6px 8px',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    color: selectedCats.length === 0 ? 'var(--primary)' : '#475569',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    background: selectedCats.length === 0 ? '#eff6ff' : 'transparent',
                    marginBottom: '4px'
                  }}
                  onClick={() => setSelectedCats([])}
                >
                  <span>✓ Xem Tất Cả Phân Loại ({CATEGORY_OPTIONS.length})</span>
                  {selectedCats.length > 0 && (
                    <span style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 600 }}>Bỏ chọn</span>
                  )}
                </div>

                <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />

                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {getOptions('category').map(catOpt => {
                    const catKey = catOpt.key;
                    const catLabel = catOpt.label;
                    const isChecked = selectedCats.includes(catKey);
                    const count = laptops.filter(l => String(l.category) === String(catKey)).length;
                    return (
                      <label
                        key={catKey}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justify: 'space-between',
                          padding: '6px 8px',
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          background: isChecked ? '#eff6ff' : 'transparent',
                          marginBottom: '2px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCategorySelect(catKey)}
                            style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                          />
                          <span style={{ fontWeight: isChecked ? 700 : 400, color: isChecked ? 'var(--primary)' : '#1e293b' }}>
                            {catLabel}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', background: isChecked ? '#dbeafe' : '#f1f5f9', padding: '1px 6px', borderRadius: '10px' }}>
                          {count} máy
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="filter-item" style={{ flex: '0 1 130px' }}>
            <label style={{ fontSize: '0.72rem', marginBottom: '0.15rem' }}><Layers size={11} style={{ display: 'inline', marginRight: '3px' }} /> Vị trí kho</label>
            <select className="filter-input" value={selectedLoc} onChange={e => setSelectedLoc(e.target.value)}>
              <option value="ALL">-- Tất cả Vị trí --</option>
              {getOptions('laptopLocation').map(loc => (
                <option key={loc.key} value={loc.key}>{loc.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-item" style={{ flex: '0 1 140px' }}>
            <label style={{ fontSize: '0.72rem', marginBottom: '0.15rem' }}><Filter size={11} style={{ display: 'inline', marginRight: '2px' }} /> Trạng thái</label>
            <select className="filter-input" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
              <option value="ALL">-- Tất cả Trạng thái --</option>
              {getOptions('laptopStatus').map(st => (
                <option key={st.key} value={st.key}>{st.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-item" style={{ flex: '0 1 150px' }}>
            <label style={{ fontSize: '0.72rem', marginBottom: '0.15rem' }}><Filter size={11} style={{ display: 'inline', marginRight: '2px' }} /> Từ ngày</label>
            <input type="date" style={{ padding: '0.35rem 0.5rem', fontSize: '0.82rem', width: '100%' }} value={warehouseDateFrom} onChange={e => setWarehouseDateFrom(e.target.value)} />
          </div>
          <div className="filter-item" style={{ flex: '0 1 150px' }}>
            <label style={{ fontSize: '0.72rem', marginBottom: '0.15rem' }}><Filter size={11} style={{ display: 'inline', marginRight: '2px' }} /> Đến ngày</label>
            <input type="date" style={{ padding: '0.35rem 0.5rem', fontSize: '0.82rem', width: '100%' }} value={warehouseDateTo} onChange={e => setWarehouseDateTo(e.target.value)} />
          </div>
        </div>

        {/* THẺ TAG HIỂN THỊ CÁC PHÂN LOẠI ĐANG ĐƯỢC CHỌN LỌC */}
        {selectedCats.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Đang lọc theo {selectedCats.length} nhãn:</span>
            {selectedCats.map(cat => (
              <span 
                key={cat} 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  background: '#2563eb',
                  color: '#ffffff',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
              >
                {getLabel('category', cat)}
                <X 
                  size={12} 
                  style={{ cursor: 'pointer' }} 
                  onClick={() => toggleCategorySelect(cat)} 
                />
              </span>
            ))}
            <button 
              className="btn btn-sm btn-outline" 
              style={{ padding: '1px 8px', fontSize: '0.72rem', marginLeft: '4px' }}
              onClick={clearCategorySelect}
            >
              Xóa tất cả bộ lọc nhãn
            </button>
          </div>
        )}
      </div>

      {/* DATA TABLE (RESPONSIVE INCL SERIAL & CHARGER) */}
      <div className="card glass p-0" style={{ overflowX: 'auto' }}>
        <div 
          className="inventory-table-container"
          ref={tableContainerRef}
        >
          <table className="data-table data-table-wide" style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}>
            <thead>
              <tr>
                <th className="sticky-col-1" style={{ width: `${colWidths.id}px`, minWidth: `${colWidths.id}px`, position: 'relative', textAlign: 'center' }}>
                  Mã ID
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'id')} title="Kéo để chỉnh rộng hẹp cột Mã ID" />
                </th>
                <th className="sticky-col-2" style={{ width: `${colWidths.actions}px`, minWidth: `${colWidths.actions}px`, textAlign: 'center', position: 'relative', left: `${colWidths.id}px` }}>
                  Thao tác
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'actions')} title="Kéo để chỉnh rộng hẹp cột Thao tác" />
                </th>
                <th style={{ width: `${colWidths.importDate}px`, minWidth: `${colWidths.importDate}px`, position: 'relative', textAlign: 'center', lineHeight: '1.1' }}>
                  Ngày<br/>nhập
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'importDate')} title="Kéo để chỉnh rộng hẹp cột Ngày nhập" />
                </th>
                <th style={{ width: `${colWidths.name}px`, minWidth: `${colWidths.name}px`, position: 'relative' }}>
                  Tên máy
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'name')} title="Kéo để chỉnh rộng hẹp cột Tên máy" />
                </th>
                <th style={{ width: `${colWidths.status}px`, minWidth: `${colWidths.status}px`, position: 'relative' }}>
                  Trạng thái
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'status')} title="Kéo để chỉnh rộng hẹp cột Trạng thái" />
                </th>
                <th style={{ width: `${colWidths.category}px`, minWidth: `${colWidths.category}px`, position: 'relative' }}>
                  Phân loại
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'category')} title="Kéo để chỉnh rộng hẹp cột Phân loại" />
                </th>
                <th style={{ width: `${colWidths.conditionNote}px`, minWidth: `${colWidths.conditionNote}px`, position: 'relative' }}>
                  Tình trạng & Ghi chú
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'conditionNote')} title="Kéo để chỉnh rộng hẹp cột Ghi chú" />
                </th>
                <th style={{ width: `${colWidths.serial}px`, minWidth: `${colWidths.serial}px`, position: 'relative' }}>
                  Số Serial
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'serial')} title="Kéo để chỉnh rộng hẹp cột Serial" />
                </th>
                <th style={{ width: `${colWidths.chargerStatus}px`, minWidth: `${colWidths.chargerStatus}px`, position: 'relative' }}>
                  Sạc
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'chargerStatus')} title="Kéo để chỉnh rộng hẹp cột Sạc" />
                </th>
                <th style={{ width: `${colWidths.seller}px`, minWidth: `${colWidths.seller}px`, position: 'relative' }}>
                  Người bán
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'seller')} title="Kéo để chỉnh rộng hẹp cột Người bán" />
                </th>
                <th style={{ width: `${colWidths.location}px`, minWidth: `${colWidths.location}px`, position: 'relative' }}>
                  Vị trí
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'location')} title="Kéo để chỉnh rộng hẹp cột Vị trí" />
                </th>
                {user?.role === 'ADMIN' && (
                  <>
                    <th style={{ width: `${colWidths.priceRmb}px`, minWidth: `${colWidths.priceRmb}px`, position: 'relative', textAlign: 'center' }}>
                      Giá tệ
                      <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'priceRmb')} title="Kéo để chỉnh rộng hẹp cột Giá tệ" />
                    </th>
                    <th style={{ width: `${colWidths.shippingRmb}px`, minWidth: `${colWidths.shippingRmb}px`, position: 'relative', textAlign: 'center' }}>
                      Phí VC
                      <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'shippingRmb')} title="Kéo để chỉnh rộng hẹp cột Phí VC" />
                    </th>
                    <th style={{ width: `${colWidths.exchangeRate}px`, minWidth: `${colWidths.exchangeRate}px`, position: 'relative', textAlign: 'center' }}>
                      Tỷ giá
                      <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'exchangeRate')} title="Kéo để chỉnh rộng hẹp cột Tỷ giá" />
                    </th>
                    <th style={{ width: `${colWidths.importPriceVnd}px`, minWidth: `${colWidths.importPriceVnd}px`, color: '#60a5fa', position: 'relative', textAlign: 'center' }}>
                      Giá Nhập (tr)
                      <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'importPriceVnd')} title="Kéo để chỉnh rộng hẹp cột Giá Nhập" />
                    </th>
                  </>
                )}
                {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
                  <>
                  </>
                )}
                <th style={{ width: `${colWidths.trackingCode}px`, minWidth: `${colWidths.trackingCode}px`, position: 'relative' }}>
                  Mã đơn vận
                  <div className="col-resizer" onMouseDown={(e) => startResizing(e, 'trackingCode')} title="Kéo để chỉnh rộng hẹp cột Mã đơn vận" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLaptops.length === 0 ? (
                <tr>
                  <td colSpan={19} className="empty-cell">
                    Không tìm thấy máy nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredLaptops.map((l, index) => (
                  <tr key={l.id || index} className={getRowStatusClass(l.status)}>
                    <td className="sticky-col-1" style={{ width: `${colWidths.id}px`, minWidth: `${colWidths.id}px`, fontWeight: 800, color: 'var(--primary)', textAlign: 'center' }}>{l.id}</td>
                    <td className="sticky-col-2" style={{ width: `${colWidths.actions}px`, minWidth: `${colWidths.actions}px`, textAlign: 'center', left: `${colWidths.id}px` }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        style={{ padding: '1px 6px', fontSize: '0.72rem', height: '22px', lineHeight: 1 }}
                        title="Sửa chi tiết máy"
                        onClick={() => handleOpenEdit(l)}
                      >
                        <Edit3 size={12} /> Sửa
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ padding: '1px 6px', fontSize: '0.72rem', height: '22px', lineHeight: 1 }}
                        title="Kiểm tra kỹ thuật"
                        onClick={() => {
                          setTechCheckLaptop(l);
                          setIsTechCheckModalOpen(true);
                        }}
                      >
                        <Activity size={12} /> Test
                      </button>
                      </div>
                    </td>
                    <td style={{ width: `${colWidths.importDate}px`, minWidth: `${colWidths.importDate}px`, textAlign: 'center', fontSize: '0.78rem' }}>
                      {(() => {
                        if (!l.importDate) return null;
                        const parts = String(l.importDate).split('/');
                        if (parts.length === 3) {
                          const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                          const currentYear = new Date().getFullYear().toString();
                          return (
                            <>
                              <div>{parts[0]}/{parts[1]}</div>
                              {y !== currentYear && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{y}</div>}
                            </>
                          );
                        }
                        return <div>{l.importDate}</div>;
                      })()}
                    </td>
                    <td style={{ width: `${colWidths.name}px`, minWidth: `${colWidths.name}px`, fontWeight: 600, whiteSpace: 'normal', wordBreak: 'break-word' }} title={l.name}>{l.name}</td>
                    <td style={{ width: `${colWidths.status}px`, minWidth: `${colWidths.status}px` }}>
                      <span className={`status-badge ${getStatusBadgeClass(l.status)}`}>
                        {getLabel('laptopStatus', l.status)}
                      </span>
                    </td>
                    <td style={{ width: `${colWidths.category}px`, minWidth: `${colWidths.category}px` }}>
                      <span className={`cat-badge ${getCategoryBadgeClass(l.category)}`}>
                        {getLabel('category', l.category)}
                      </span>
                    </td>
                    <td style={{ width: `${colWidths.conditionNote}px`, minWidth: `${colWidths.conditionNote}px`, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <div style={{display: 'flex', gap: '3px', marginBottom: '2px', flexWrap: 'wrap', alignItems: 'center'}}>
                        <span style={{fontWeight: 700, color: l.batteryHealth < 80 ? '#ef4444' : '#10b981'}}>Pin:{l.batteryHealth || 100}%</span>
                        {l.screenStatus && (
                          <><span style={{color: '#94a3b8'}}>·</span> <span style={{fontWeight: 700, color: l.screenStatus === 'ok' || l.screenStatus === 'OK' ? '#10b981' : '#ef4444'}}>M:{getLabel('componentStatus', l.screenStatus)}</span></>
                        )}
                        {l.cameraMicStatus && (
                          <><span style={{color: '#94a3b8'}}>·</span> <span style={{fontWeight: 700, color: l.cameraMicStatus === 'ok' || l.cameraMicStatus === 'OK' ? '#10b981' : '#ef4444'}}>C:{getLabel('componentStatus', l.cameraMicStatus)}</span></>
                        )}
                        {l.mainboardStatus && (
                          <><span style={{color: '#94a3b8'}}>·</span> <span style={{fontWeight: 700, color: l.mainboardStatus === 'ok' || l.mainboardStatus === 'OK' ? '#10b981' : '#ef4444'}}>Mn:{getLabel('componentStatus', l.mainboardStatus)}</span></>
                        )}
                        {l.isLocked && <><span style={{color: '#94a3b8'}}>·</span> <span style={{fontWeight: 700, color: '#ef4444'}}>KHOA</span></>}
                      </div>
                      <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', fontSize: '0.72rem', opacity: 0.8 }} title={l.conditionNote}>{l.conditionNote || '-'}</div>
                    </td>
                    <td style={{ width: `${colWidths.serial}px`, minWidth: `${colWidths.serial}px`, fontFamily: 'monospace', fontSize: '0.78rem', color: '#475569', whiteSpace: 'normal', wordBreak: 'break-word' }} title={l.serial}>
                      {l.serial || '-'}
                    </td>
                    <td style={{ width: `${colWidths.chargerStatus}px`, minWidth: `${colWidths.chargerStatus}px` }}>
                      <span className={`charger-badge ${getChargerBadgeClass(l.chargerStatus)}`}>
                        {getLabel('chargerStatus', l.chargerStatus)}
                      </span>
                    </td>
                    <td style={{ width: `${colWidths.seller}px`, minWidth: `${colWidths.seller}px` }} title={l.seller}>
                      {(() => {
                        const sc = getSellerBadgeClass(l.seller);
                        return l.seller ? (
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                            {getLabel('seller', l.seller)}
                          </span>
                        ) : <span style={{ color: '#94a3b8' }}>-</span>;
                      })()}
                    </td>
                    <td style={{ width: `${colWidths.location}px`, minWidth: `${colWidths.location}px` }}>
                      <span className={`loc-badge ${getLocationBadgeClass(l.location)}`}>
                        {getLabel('laptopLocation', l.location)}
                      </span>
                    </td>
                    {user?.role === 'ADMIN' && (
                      <>
                        <td style={{ width: `${colWidths.priceRmb}px`, minWidth: `${colWidths.priceRmb}px`, fontWeight: 600, textAlign: 'center' }}>{Number(l.priceRmb || 0).toFixed(2)}</td>
                        <td style={{ width: `${colWidths.shippingRmb}px`, minWidth: `${colWidths.shippingRmb}px`, textAlign: 'center' }}>{Number(l.shippingRmb || 0).toFixed(2)}</td>
                        <td style={{ width: `${colWidths.exchangeRate}px`, minWidth: `${colWidths.exchangeRate}px`, color: 'var(--text-muted)', textAlign: 'center' }}>{l.exchangeRate}</td>
                        <td style={{ width: `${colWidths.importPriceVnd}px`, minWidth: `${colWidths.importPriceVnd}px`, fontWeight: 800, color: '#2563eb', textAlign: 'center' }}>
                          {l.importPriceVnd !== undefined && l.importPriceVnd !== '' ? Number(l.importPriceVnd).toFixed(2) : '-'}
                        </td>
                      </>
                    )}

                    {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
                      <>
                      </>
                    )}


                    <td style={{ width: `${colWidths.trackingCode}px`, minWidth: `${colWidths.trackingCode}px`, fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'normal', wordBreak: 'break-word' }} title={l.trackingCode}>{l.trackingCode || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* THANH SCROLL NGANG CỐ ĐỊNH Ở ĐÁY MÀN HÌNH */}
      <FixedHorizontalScrollbar containerRef={tableContainerRef} totalWidth={totalTableWidth} />

      {/* MODAL THÊM / SỬA CHI TIẾT LAPTOP */}
      {isAddModalOpen && (
        <div className="modal-backdrop active">
          <div className="modal-box glass" style={{ maxWidth: '880px' }}>
            <div className="modal-header">
              <h3>{editingLaptop ? `Chỉnh Sửa Máy ${editingLaptop.id}` : 'Thêm Máy Mới Vào Kho'}</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {editingLaptop && (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowTimeline(!showTimeline)} style={{ height: '32px' }}>
                    <History size={14} style={{ marginRight: '6px' }} /> Lịch sử
                  </button>
                )}
                <button className="modal-close" onClick={() => setIsAddModalOpen(false)}>&times;</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'row', minHeight: '500px', maxHeight: '80vh', overflow: 'hidden' }}>
              <form onSubmit={handleSaveLaptop} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div className="modal-body" style={{ flex: 1 }}>
                {/* SECTION 1: THÔNG TIN CƠ BẢN */}
                <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Box size={16} /> 1. Thông Tin Máy & Phân Loại
                </h4>
                
                <div className="form-row mt-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  <div className="form-group">
                    <label>Mã ID</label>
                    <input 
                      type="text" 
                      value={formData.id} 
                      onChange={e => setFormData({ ...formData, id: e.target.value })}
                      placeholder="#75" 
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Ngày nhập (T.Quốc)</label>
                    <input 
                      type="date" 
                      value={toYMD(formData.importDate)} 
                      onChange={e => setFormData({ ...formData, importDate: toVnFormat(e.target.value) })}
                      className="form-control"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Ngày nhập kho</label>
                    <input 
                      type="date" 
                      value={toYMD(formData.warehouseDate)} 
                      onChange={e => setFormData({ ...formData, warehouseDate: toVnFormat(e.target.value) })}
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Trạng thái máy</label>
                    <select 
                      value={formData.status} 
                      onChange={e => setFormData({ ...formData, status: e.target.value })}
                      className="form-control"
                    >
                      {STATUS_OPTIONS.map(st => (
<option key={st.key} value={st.key}>{st.label}</option>
))}
                    </select>
                  </div>
                </div>

                <div className="form-row mt-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  <div className="form-group">
                    <label>Phân loại máy</label>
                    <select 
                      value={formData.category} 
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      className="form-control"
                      style={{ width: '100%' }}
                    >
                      {CATEGORY_OPTIONS.map(cat => (
<option key={cat.key} value={cat.key}>{cat.label}</option>
))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Nguồn nhập</label>
                    <select 
                      value={formData.seller} 
                      onChange={e => setFormData({ ...formData, seller: e.target.value })}
                      className="form-control"
                    >
                      {SELLER_OPTIONS.map(sl => (
<option key={sl.key} value={sl.key}>{sl.label}</option>
))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Số Serial (SN)</label>
                    <input 
                      type="text" 
                      value={formData.serial} 
                      onChange={e => setFormData({ ...formData, serial: e.target.value })}
                      placeholder="SN12345678" 
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Mã đơn vận</label>
                    <input 
                      type="text" 
                      value={formData.trackingCode} 
                      onChange={e => setFormData({ ...formData, trackingCode: e.target.value })}
                      placeholder="SF123456" 
                      className="form-control"
                    />
                  </div>
                </div>

                <div className="form-group mt-3" style={{ position: 'relative' }}>
                  <label>Tên máy & Cấu hình chi tiết *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    onFocus={() => setShowPresets(true)}
                    onBlur={() => setTimeout(() => setShowPresets(false), 200)}
                    placeholder="Legion 5 2022 R7000P R5-6600H/16/512/3050Ti/2.5K 165Hz"
                  />
                  {/* Dropdown gợi ý cấu hình mẫu */}
                  {showPresets && matchedPresets.length > 0 && (
                    <div style={{
                      position: 'absolute', zIndex: 100, left: 0, right: 0, top: '100%', marginTop: '4px',
                      maxHeight: '180px', overflowY: 'auto',
                      background: '#fff', border: '1.5px solid #3b82f6',
                      borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    }}>
                      {matchedPresets.map(([key, val]) => (
                        <div
                          key={key}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFormData(prev => ({ ...prev, name: val }));
                            setShowPresets(false);
                          }}
                          style={{
                            padding: '8px 12px', cursor: 'pointer', fontSize: '0.82rem',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex', justifyContent: 'space-between', gap: '8px',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          <strong style={{ color: '#1e40af', flexShrink: 0 }}>{key}</strong>
                          <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SECTION 2: KHO & TRẠNG THÁI */}
                <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', marginTop: '1.25rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={16} /> 2. Vị Trí Kho, Sạc & Trạng Thái Máy
                </h4>

                <div className="form-row mt-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                  <div className="form-group">
                    <label>Vị trí kho</label>
                    <select 
                      value={formData.location} 
                      onChange={e => setFormData({ ...formData, location: e.target.value })}
                      className="form-control"
                    >
                      {LOCATION_OPTIONS.map(loc => (
<option key={loc.key} value={loc.key}>{loc.label}</option>
))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label><Zap size={13} style={{ display: 'inline', color: '#fbbf24' }} /> Tình trạng Sạc</label>
                    <select 
                      value={formData.chargerStatus} 
                      onChange={e => setFormData({ ...formData, chargerStatus: e.target.value })}
                      className="form-control"
                    >
                      {CHARGER_OPTIONS.map(ch => (
<option key={ch.key} value={ch.key}>{ch.label}</option>
))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Sạc Pin (Cycle Count)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={formData.cycleCount} 
                      onChange={e => setFormData({ ...formData, cycleCount: e.target.value })} 
                      placeholder="Số lần sạc..." 
                    />
                  </div>

                  <div className="form-group">
                    <label>Hạn BH Nguồn (TQ/US)</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={formData.warrantySupplier} 
                      onChange={e => setFormData({ ...formData, warrantySupplier: e.target.value })} 
                      placeholder="VD: 25/12/2026..." 
                    />
                  </div>
                </div>

                <div className="form-group mt-3">
                  <label>Ghi chú check máy / Tình trạng ngoại hình</label>
                  <textarea 
                    rows={3}
                    value={formData.conditionNote} 
                    onChange={e => setFormData({ ...formData, conditionNote: e.target.value })}
                    placeholder="Máy đẹp 99%, pin 98%, màn không xước, test full chức năng OK..." 
                  />
                </div>


                {/* SECTION 3: TÀI CHÍNH (GIÁ NHẬP, GIÁ BÁN & LỢI NHUẬN) — chỉ ADMIN */}
                {user?.role === 'ADMIN' && (<>
                <h4 style={{ fontSize: '0.9rem', color: '#60a5fa', marginTop: '1.25rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calculator size={16} /> 3. Tài Chính (Giá Nhập, Giá Bán & Lợi Nhuận)
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                    <div className="form-group">
                      <label>Giá tệ (¥)</label>
                      <input 
                        type="number" 
                        step="any"
                        value={formData.priceRmb} 
                        onChange={e => setFormData({ ...formData, priceRmb: e.target.value })}
                        placeholder="4200" 
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label>Phí VC nội địa (¥)</label>
                      <input 
                        type="number" 
                        step="any"
                        value={formData.shippingRmb} 
                        onChange={e => setFormData({ ...formData, shippingRmb: e.target.value })}
                        placeholder="50" 
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label>Tỷ giá tệ</label>
                      <input 
                        type="number" 
                        step="any"
                        value={formData.exchangeRate} 
                        onChange={e => setFormData({ ...formData, exchangeRate: e.target.value })}
                        placeholder="3550" 
                        className="form-control"
                      />
                    </div>

                    <div className="form-group" style={{ position: 'relative' }}>
                      <label style={{ color: '#60a5fa', fontWeight: 700 }}>
                        Giá Nhập (tr)
                        <span style={{ fontSize: '0.65rem', fontWeight: 400, color: '#94a3b8', marginLeft: '4px' }}>
                          {formData.importPriceManuallyEdited ? '(tự nhập)' : '(tự tính)'}
                        </span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        className="form-control"
                        value={formData.importPriceVnd}
                        onChange={e => setFormData({ ...formData, importPriceVnd: e.target.value, importPriceManuallyEdited: true })}
                        placeholder={liveImportPrice > 0 ? liveImportPrice : 'Tự tính từ giá tệ'}
                        style={{ fontWeight: 800, color: '#2563eb', fontSize: '1rem' }}
                      />
                    </div>
                  </div>

                </div>

                </>)}
              </div>

              <div className="modal-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsAddModalOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-success">Lưu Thông Tin Máy</button>
              </div>
            </form>
            
            {showTimeline && editingLaptop && (
              <div style={{ width: '350px', background: '#f8fafc', borderLeft: '1px solid var(--border-color)', overflowY: 'auto' }}>
                <ActivityTimeline entityType="LAPTOP" entityId={editingLaptop.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    )}

      {/* MODAL CẤU HÌNH CÔNG THỨC GIÁ NHẬP */}
      {isFormulaModalOpen && (
        <div className="modal-backdrop active">
          <div className="modal-box glass" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3><Calculator size={18} style={{ display: 'inline', marginRight: '6px' }} /> Cấu Hình Công Thức Tính Giá Nhập</h3>
              <button className="modal-close" onClick={() => setIsFormulaModalOpen(false)}>&times;</button>
            </div>

            <form onSubmit={handleSaveFormula}>
              <div className="modal-body">
                <div className="formula-box">
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Công thức hiện tại đang áp dụng:</div>
                  <div className="formula-expression">
                    Giá Nhập (triệu) = ((Giá Tệ + Phí VC Tệ) * Tỷ Giá + {(formulaForm.shippingVnd).toLocaleString('vi-VN')}đ) / 1.000.000
                  </div>
                </div>

                <div className="form-group mt-3">
                  <label>Phí Vận Chuyển Cố Định (VNĐ) - Cộng thêm mỗi máy</label>
                  <input 
                    type="number" 
                    required
                    value={formulaForm.shippingVnd} 
                    onChange={e => setFormulaForm({ ...formulaForm, shippingVnd: e.target.value })}
                    placeholder="400000" 
                  />
                  <small style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                    Mặc định là 400.000đ (phí vận chuyển từ Trung Quốc về kho Việt Nam).
                  </small>
                </div>

                <div className="form-group mt-3">
                  <label>Tỷ Giá Mặc Định (RMB/VND)</label>
                  <input 
                    type="number" 
                    required
                    value={formulaForm.defaultRate} 
                    onChange={e => setFormulaForm({ ...formulaForm, defaultRate: e.target.value })}
                    placeholder="3550" 
                  />
                </div>

                <div className="form-group mt-3" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    id="recalcCheck"
                    checked={formulaForm.recalculateAll} 
                    onChange={e => setFormulaForm({ ...formulaForm, recalculateAll: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <label htmlFor="recalcCheck" style={{ cursor: 'pointer', margin: 0 }}>
                    Áp dụng và tính toán lại Giá Nhập & Lợi Nhuận cho toàn bộ máy hiện có trong kho.
                  </label>
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsFormulaModalOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu Cấu Hình</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ĐỒNG BỘ GOOGLE SHEET */}
      {isSyncModalOpen && (
        <div className="modal-backdrop active">
          <div className="modal-box glass" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3><RefreshCw size={18} style={{ display: 'inline', marginRight: '6px' }} /> Đồng Bộ Google Sheet Dữ Liệu Kho</h3>
              <button className="modal-close" onClick={() => setIsSyncModalOpen(false)}>&times;</button>
            </div>

            <div className="modal-body">
              {/* 1-CLICK DIRECT GOOGLE SHEET SYNC CARD */}
              <div style={{ background: 'rgba(37, 99, 235, 0.08)', padding: '1.25rem', borderRadius: '10px', border: '1.5px solid rgba(37, 99, 235, 0.3)', marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '1.05rem', color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={18} /> Đồng Bộ 1-Click Tự Động Từ Link Google Sheet
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Đã cấu hình tự động kết nối đường dẫn Google Sheet của bạn:
                </p>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
                  <input 
                    type="text" 
                    value={sheetUrlInput} 
                    onChange={e => setSheetUrlInput(e.target.value)}
                    style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff' }}
                  />
                  <button 
                    className="btn btn-primary" 
                    disabled={isSyncing}
                    onClick={handleSyncDirectGoogleSheet}
                  >
                    {isSyncing ? 'Đang Tải...' : '⚡ Kéo Dữ Liệu Ngay'}
                  </button>
                </div>

                <div style={{ fontSize: '0.8rem', background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#475569' }}>
                  💡 <b>Lưu ý quan trọng để kéo dữ liệu tự động 1-Click:</b>
                  <br />
                  Nếu bấm nút bị báo lỗi Hạn chế, bạn chỉ cần mở file Google Sheet của bạn &rarr; Bấm <b>Chia sẻ (Share)</b> ở góc trên bên phải &rarr; Đổi quyền truy cập chung thành <b>&quot;Bất kỳ ai có đường liên kết&quot; (Anyone with the link can view)</b>.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '1rem' }}>
                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontSize: '0.95rem', color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Download size={16} /> Tải dữ liệu về Excel/CSV
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Xuất đầy đủ 18 cột dữ liệu kho máy ra file .CSV.
                  </p>
                  <button className="btn btn-sm btn-outline" style={{ width: '100%' }} onClick={handleExportCSV}>
                    Tải File CSV Kho
                  </button>
                </div>

                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontSize: '0.95rem', color: 'var(--success)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Upload size={16} /> Nhập Thủ Công File CSV
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Nếu muốn tải file .CSV từ máy tính nạp vào web.
                  </p>
                  <label className="btn btn-sm btn-success" style={{ width: '100%', textAlign: 'center', cursor: 'pointer' }}>
                    Chọn File CSV
                    <input 
                      type="file" 
                      accept=".csv" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = async (event) => {
                            try {
                              const text = event.target.result;
                              const lines = text.split('\n').filter(l => l.trim());
                              const parsed = lines.slice(1).map((line, idx) => {
                                const cols = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/);
                                const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());
                                return {
                                  importDate: clean[0] || '08/07',
                                  id: clean[1] || `#${idx + 75}`,
                                  name: clean[2] || '',
                                  location: clean[3] || D.locStore,
                                                          category: labelToKey('category', clean[5], fieldOptionsConfig) || CATEGORY_OPTIONS[0]?.key || '',
                                  serial: clean[6] || '',
                                  chargerStatus: clean[7] || D.chargerWith,
                                  seller: clean[9] || '',
                                  conditionNote: clean[10] || clean[8] || '',
                                  status: clean[11] || D.laptopAvailable,
                                  priceRmb: parseFlexibleFloat(clean[12]),
                                  shippingRmb: parseFlexibleFloat(clean[13]),
                                  exchangeRate: parseFlexibleFloat(clean[14]),
                                  importPriceVnd: clean[15] !== undefined && clean[15] !== '' ? parseFlexibleFloat(clean[15]) : undefined,
                                  profitVnd: clean[18] !== undefined && clean[18] !== '' ? parseFlexibleFloat(clean[18]) : undefined,
                                  trackingCode: clean[19] || ''
                                };
                              });
                              const result = await importSheetData(parsed);
                              setIsSyncModalOpen(false);
                              alert(result.ok
                                ? `Đã nhập thành công ${result.imported} dòng máy lên cloud.`
                                : `⚠️ Đã lưu ${result.imported || 0}/${parsed.length} dòng. ${result.message || ''}`);
                            } catch (err) {
                              alert('Lỗi khi đọc file CSV!');
                            }
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="apps-script-instructions mt-4">
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.5rem' }}>
                  📌 Hướng dẫn liên kết tự động trực tiếp qua Apps Script:
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Trong Google Sheet của bạn, mở <b>Tiện ích mở rộng (Extensions) &rarr; Apps Script</b> và dán đoạn code sau để xuất JSON API:
                </p>
                <pre>
{`function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    result.push({
      id: data[i][0],
      importDate: data[i][1],
      serial: data[i][2],
      name: data[i][3],
      location: data[i][4],
      category: labelToKey('category', data[i][5], fieldOptionsConfig) || CATEGORY_OPTIONS[0]?.key || '',
      chargerStatus: data[i][6],
      conditionNote: data[i][7],
      seller: data[i][8],
      status: data[i][9],
      priceRmb: data[i][10],
      shippingRmb: data[i][11],
      exchangeRate: data[i][12],
      trackingCode: data[i][17]
    });
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}`}
                </pre>
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-outline" onClick={() => setIsSyncModalOpen(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
      {/* TECH CHECK MODAL */}
      <TechCheckModal
        key={`${techCheckLaptop?.id || 'none'}-${isTechCheckModalOpen}`}
        isOpen={isTechCheckModalOpen}
        onClose={() => setIsTechCheckModalOpen(false)}
        laptop={techCheckLaptop}
        onSave={(id, updates) => {
          updateLaptop(id, updates);
          setIsTechCheckModalOpen(false);
        }}
      />
    </section>
  );
}
