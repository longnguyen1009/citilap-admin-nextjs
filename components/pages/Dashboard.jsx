"use client";
import React, { useEffect, useState } from 'react';
import { useInventory, isOrderCommitted, isReservationActive, isInactiveStatus } from '../../context/InventoryContext';
import { getAuthHeaders } from '../../lib/apiFetchers';
import { D, RESOLVED_WARRANTY_STATUS_KEYS } from '../../lib/fieldOptions';
import { labelToKey, getLabel } from '../../lib/useFieldOptions';
import { useAuth } from '../../context/AuthContext';
import { Box, CheckCircle2, ArrowUpRight, TrendingUp, RefreshCw, ShoppingBag, Calendar, Truck, ShieldCheck, Wrench, RotateCcw, AlertTriangle, Timer, WalletCards } from 'lucide-react';

const vnd = value => new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
const count = value => Number(value || 0).toLocaleString('vi-VN');

function ExposureCard({ icon: Icon, label, value, meta, tone = 'blue' }) {
  return <article className={`management-stat ${tone}`}><div className="management-stat-icon"><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div></article>;
}

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
  const [management, setManagement] = useState(null);
  const [managementError, setManagementError] = useState('');

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/management-dashboard', { headers: await getAuthHeaders(), cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Không thể tải dashboard quản trị');
        if (active) setManagement(body);
      } catch (error) { if (active) setManagementError(error.message); }
    })();
    return () => { active = false; };
  }, [user?.role]);

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


  const totalCapitalVnd = availableLaptops.reduce((sum, l) => {
    const price = Number(l.importPriceVnd || 0);
    // Cap extreme values (likely test data) at 100 tr per unit
    return sum + (price > 0 && price < 100 ? price : 0);
  }, 0);
  const totalProfitVnd = availableLaptops.reduce((sum, l) => {
    const profit = Number(l.profitVnd || 0);
    return sum + (Math.abs(profit) < 100 ? profit : 0);
  }, 0);
  const realizedProfitVnd = orders.filter(o => isOrderCommitted(o, appOptions)).reduce((sum, order) => {
    const laptop = laptops.find(item => String(item.id) === String(order.laptopId));
    if (!laptop) return sum + Number(order.profitVnd || 0);
    return sum + (Number(order.salePrice || 0) - Number(laptop?.importPriceVnd || 0) - Number(order.creditCardFee || 0));
  }, 0);

  // Group by category count
  const categoryCounts = laptops.reduce((acc, l) => {
    const label = getLabel('category', l.category, appOptions);
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
            Xin chào, {user?.name} ({user?.role}) &bull; Báo cáo: {selectedMonth === 'ALL' ? 'Tất cả các tháng' : `Tháng ${selectedMonth}`} &bull; Tỷ giá: {formulaConfig?.defaultRate || 3550} RMB/VND
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

      {user?.role === 'ADMIN' && <section className="management-command-center">
        <div className="management-heading">
          <div><span className="management-kicker">OPERATIONAL CAPITAL VIEW</span><h2>Nhịp vận hành toàn kho</h2><p>Góc nhìn toàn thời gian · không phụ thuộc kỳ đang chọn · không phải số dư tiền mặt</p></div>
          {management?.generated_at && <time>Cập nhật {new Date(management.generated_at).toLocaleString('vi-VN')}</time>}
        </div>
        {managementError ? <div className="management-error"><AlertTriangle size={18}/>{managementError}. Hãy áp dụng migration Phase 7.</div> : !management ? <div className="management-loading">Đang tổng hợp dòng vốn và tuổi tồn…</div> : <>
          <div className="management-stats">
            <ExposureCard icon={WalletCards} label="Vốn tồn sẵn sàng" value={`${vnd(management.available.known_inventory_cost_vnd)} ₫`} meta={`${count(management.available.units)} máy · ${management.available.cost_complete} cost complete`} tone="emerald"/>
            <ExposureCard icon={Truck} label="Hàng đang luân chuyển" value={`${count(management.transit.units)} máy`} meta={`Purchase value ${vnd(management.transit.purchase_value_vnd)} ₫`} tone="blue"/>
            <ExposureCard icon={ShieldCheck} label="QC exposure" value={`${count((management.qc.waiting_qc?.units||0)+(management.qc.qc_in_progress?.units||0)+(management.qc.qc_failed?.units||0))} máy`} meta={`Known cost ${vnd(management.qc.known_cost_vnd)} ₫`} tone="amber"/>
            <ExposureCard icon={Wrench} label="Repair đang mở" value={`${count(management.repairs.active_jobs)} phiếu`} meta={`${management.repairs.waiting_parts} chờ linh kiện · ${vnd(management.repairs.accumulated_cost_vnd)} ₫`} tone="rose"/>
            <ExposureCard icon={RotateCcw} label="Nghĩa vụ nhà cung cấp" value={`${count(management.supplier_returns.pending)} phiếu`} meta={`Chờ hoàn ¥${count(management.supplier_returns.refund_pending_rmb)}`} tone="violet"/>
          </div>

          <div className="management-grid">
            <article className="management-panel aging-panel"><header><div><h3><Timer size={18}/> Tuổi tồn bán hàng</h3><p>Chỉ máy available, tính từ thời điểm QC PASS</p></div><div className="cost-quality"><b>{management.available.cost_complete}</b> đủ cost <span>·</span> <b>{management.available.cost_incomplete}</b> thiếu <span>·</span> <b>{management.available.legacy}</b> legacy</div></header><div className="aging-bars">{management.aging.map(bucket=>{const max=Math.max(...management.aging.map(x=>Number(x.units)),1);return <div className="aging-row" key={bucket.bucket_key}><span>{bucket.bucket_label}</span><div><i style={{width:`${Math.max(4,Number(bucket.units)/max*100)}%`}}/></div><strong>{bucket.units} máy</strong><small>{vnd(bucket.landed_cost_value)} ₫ · TB {bucket.average_age||0} ngày</small></div>})}{management.aging.length===0&&<p className="management-empty">Chưa có máy available có timestamp hợp lệ.</p>}</div>{management.available.missing_aging_timestamp>0&&<div className="data-caveat"><AlertTriangle size={15}/>{management.available.missing_aging_timestamp} máy available chưa có available_for_sale_at nên không được đoán tuổi tồn.</div>}</article>

            <article className="management-panel"><header><div><h3><Box size={18}/> Trạng thái vận hành</h3><p>Reserved được derive từ order đang khóa máy</p></div></header><div className="state-ledger">{[['available','Available'],['reserved','Reserved'],['waiting_qc','Waiting QC'],['qc_in_progress','QC in progress'],['qc_failed','QC failed'],['repair','Repair'],['supplier_return_pending','Return pending'],['supplier_returned','Returned'],['sold','Sold']].map(([key,label])=><div key={key}><span>{label}</span><strong>{count(management.state_summary[key])}</strong></div>)}</div><div className="operations-strip"><div><span>QC lâu nhất</span><b>{Math.max(management.qc.waiting_qc?.oldest_age||0,management.qc.qc_in_progress?.oldest_age||0,management.qc.qc_failed?.oldest_age||0)} ngày</b></div><div><span>Repair lâu nhất</span><b>{management.repairs.oldest_age||0} ngày</b></div><div><span>Chờ replacement</span><b>{management.supplier_returns.waiting_replacement||0}</b></div></div></article>
          </div>

          <article className="management-panel slow-panel"><header><div><h3><AlertTriangle size={18}/> Action Center · máy chậm bán</h3><p>Warning từ {management.thresholds.warning_days} ngày · Critical từ {management.thresholds.critical_days} ngày</p></div><b>{management.slow_moving.length} ưu tiên</b></header><div className="table-responsive"><table className="management-table"><thead><tr><th>Serial / Model</th><th>Tuổi available</th><th>Landed cost</th><th>Giá bán</th><th>Biên tiềm năng</th><th>Vị trí</th></tr></thead><tbody>{management.slow_moving.map(row=><tr key={row.laptop_id} className={row.age_days>=management.thresholds.critical_days?'critical':'warning'}><td><b>{row.serial||`#${row.laptop_id}`}</b><span>{row.model}</span></td><td><strong>{row.age_days} ngày</strong></td><td>{row.cost_status==='COMPLETE'?`${vnd(row.landed_cost_vnd)} ₫`:row.cost_status}</td><td>{vnd(row.selling_price_vnd)} ₫</td><td>{row.gross_margin_potential_vnd==null?'—':`${vnd(row.gross_margin_potential_vnd)} ₫`}</td><td>{row.location||'—'}</td></tr>)}</tbody></table>{management.slow_moving.length===0&&<p className="management-empty">Không có máy available quá ngưỡng cảnh báo.</p>}</div></article>
        </>}
      </section>}

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
              {statusLabels.map((stObj, idx) => { const lbl = stObj.label; return (
                <div key={idx} className="status-chip">
                  <span className="name">{lbl}</span>
                  <span className="count">{laptops.filter(l => labelToKey('laptopStatus', l.status) === stObj.key).length}</span>
                </div>
              ); })}
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
                  const l = laptops.find(x => String(x.id) === String(wc.laptopId));
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
