"use client";
import React from 'react';
import { useInventory, isOrderCommitted, isReservationActive, isInactiveStatus } from '../../context/InventoryContext';
import { D, RESOLVED_WARRANTY_STATUS_KEYS } from '../../lib/fieldOptions';
import { labelToKey, getLabel } from '../../lib/useFieldOptions';
import { useAuth } from '../../context/AuthContext';
import { Box, CheckCircle2, ArrowUpRight, TrendingUp, RefreshCw, ShoppingBag, Calendar } from 'lucide-react';

export default function Dashboard() {
  const { 
    filteredLaptops: laptops, 
    filteredOrders: orders, 
    selectedMonth,
    availableMonths, 
    formulaConfig,
    warrantyCases,
    dynamicOptions,
    appOptions,
    customers
  } = useInventory();
  const { user } = useAuth();

  const statusLabels = dynamicOptions?.STATUS_OPTIONS || [];

  const availableLaptops = laptops.filter(l => !isInactiveStatus(l.status));
  const soldLaptops = laptops.filter(l => {
    const k = labelToKey('laptopStatus', l.status);
    return k === 'sold' || l.status === D.laptopSold;
  });
  const activeReservations = orders.filter(o => isReservationActive(o, appOptions));
  const openWarrantyCases = warrantyCases.filter(item => {
    const k = labelToKey('warrantyCaseStatus', item.status);
    return !RESOLVED_WARRANTY_STATUS_KEYS.includes(k) && !['HOÀN TẤT', 'ĐỔI MÁY', 'HOÀN TIỀN'].includes(item.status);
  });


  const totalCapitalVnd = laptops.reduce((sum, l) => sum + (l.importPriceVnd || 0), 0);
  const totalProfitVnd = laptops.reduce((sum, l) => sum + (l.profitVnd || 0), 0);
  const realizedProfitVnd = orders.filter(o => isOrderCommitted(o, appOptions)).reduce((sum, order) => {
    const laptop = laptops.find(item => item.id === order.laptopId);
    return sum + (Number(order.salePrice || 0) - Number(laptop?.importPriceVnd || 0) - Number(order.creditCardFee || 0));
  }, 0);

  // Group by category count
  const categoryCounts = laptops.reduce((acc, l) => {
    const label = getLabel('category', l.categoryId, appOptions);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="page-section">
      <div className="section-title">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp className="text-primary" size={26} /> Tổng Quan Hệ Thống CitiLap
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <Calendar size={14} style={{ color: '#64748b' }} />
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Kỳ:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1d4ed8' }}>{selectedMonth === 'ALL' ? 'Tất cả' : 'Tháng ' + selectedMonth}</span>
          </div>
          <p className="subtitle">
            Xin chào, {user?.name} ({user?.role}) &bull; Báo cáo: {selectedMonth === 'ALL' ? 'Tất cả các tháng' : `Tháng ${selectedMonth}`} &bull; Tỷ giá: {formulaConfig.defaultRate} RMB/VND
          </p>
        </div>
      </div>

      <div className="metrics-grid mt-4">
        <div className="metric-card glass">
          <div className="metric-icon blue">
            <Box size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Máy Trong Kho</span>
            <span className="metric-value">{availableLaptops.length} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>máy</small></span>
            <span className="metric-sub">{laptops.length} tổng nhập</span>
          </div>
        </div>

        <div className="metric-card glass">
          <div className="metric-icon green">
            <CheckCircle2 size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Đã Bán Ra</span>
            <span className="metric-value">{soldLaptops.length} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>máy</small></span>
            <span className="metric-sub">Doanh số ổn định</span>
          </div>
        </div>

        <div className="metric-card glass">
          <div className="metric-icon orange">
            <RefreshCw size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Đang Giữ Máy</span>
            <span className="metric-value">{activeReservations.length} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>đơn</small></span>
            <span className="metric-sub">Bảo hành đang xử lý: {openWarrantyCases.length}</span>
          </div>
        </div>

        <div className="metric-card glass">
          <div className="metric-icon purple">
            <ArrowUpRight size={24} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Lãi Đơn Đã Giao</span>
            <span className="metric-value">{realizedProfitVnd.toFixed(2)} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>tr VNĐ</small></span>
            <span className="metric-sub">Lãi dự kiến kho: {totalProfitVnd.toFixed(2)} tr · Vốn: {totalCapitalVnd.toFixed(2)} tr</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid mt-4">
        <div className="card glass">
          <div className="card-header">
            <h3><Box size={18} /> Phân Bổ Kho Theo Thương Hiệu / Dòng Máy</h3>
          </div>
          <div className="card-body">
            {Object.entries(categoryCounts).map(([cat, count]) => {
              const pct = Math.round((count / (laptops.length || 1)) * 100);
              return (
                <div key={cat} className="brand-progress-item">
                  <div className="brand-info">
                    <span>{cat}</span>
                    <span>{count} máy ({pct}%)</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card glass">
          <div className="card-header">
            <h3><ShoppingBag size={18} /> Trạng Thái Kho Chi Tiết</h3>
          </div>
          <div className="card-body">
            <div className="status-pills-grid">
              {statusLabels.map((lbl, idx) => (
                <div key={idx} className="status-chip">
                  <span className="name">{lbl}</span>
                  <span className="count">{laptops.filter(l => l.status === lbl).length}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>


      <div className="dashboard-grid mt-4">
        <div className="card glass">
          <div className="card-header">
            <h3 style={{ color: '#059669' }}><ShoppingBag size={18} /> Đơn Đang Chờ Thu COD</h3>
          </div>
          <div className="card-body">
            {orders.filter(o => o.codAmount > 0 && (o.paymentStatus === D.paymentCOD || labelToKey('paymentStatus', o.paymentStatus) === 'cod')).length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Không có đơn nào đang chờ COD.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {orders.filter(o => o.codAmount > 0 && (o.paymentStatus === D.paymentCOD || labelToKey('paymentStatus', o.paymentStatus) === 'cod')).map(o => (
                  <li key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                    <span><strong>#{o.id}</strong> - {customers.find(c => c.id === o.customerId)?.name || 'Khách lẻ'}</span>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>{Number(o.codAmount || 0).toFixed(2)}tr</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card glass">
          <div className="card-header">
            <h3 style={{ color: '#e11d48' }}><RefreshCw size={18} /> Máy Đang Bảo Hành</h3>
          </div>
          <div className="card-body">
            {openWarrantyCases.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Tuyệt vời, không có máy nào đang bảo hành.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {openWarrantyCases.map(wc => {
                  const l = laptops.find(x => x.id === wc.laptopId);
                  return (
                    <li key={wc.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>{wc.laptopId}</strong> - {l?.name || 'Không rõ máy'}</span>
                      <span style={{ color: '#e11d48', fontWeight: 'bold', fontSize: '0.85rem' }}>{wc.status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
