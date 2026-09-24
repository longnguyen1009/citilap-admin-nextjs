"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  LogOut, 
  User,
  ChevronLeft,
  ChevronRight,
  Wrench,
          BadgeDollarSign,
  Database,
  Settings,
  FileText,
  MousePointer2,
  Truck,
  Building2,
  Landmark,
  Ship,
  PackageCheck,
  ClipboardCheck,
  PackageX,
  Calculator,
  WalletCards,
  CalendarClock,
  Repeat2,
  Trophy
} from 'lucide-react';

export default function MainLayout({ children }) {
  const { user, logout } = useAuth();
  const { dataLoading, loadingStage, cloudStatus } = useInventory();
  const navigate = useRouter();
  const pathname = usePathname();

  // Scroll to top khi chuyển trang
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Authenticate user
  useEffect(() => {
    if (!user) {
      navigate.replace('/login');
    }
  }, [user, navigate]);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate.push('/login');
  };

  if (!user) {
    return null; // Will redirect to /login via useEffect
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-icon" title="CitiLap Warehouse">
            <Package />
          </div>
          {!isCollapsed && (
            <div className="brand-text">
              <h2>KHO CITILAP</h2>
              <span className="brand-operator">
                <span>{user?.name || 'Nhân viên'}</span>
                <Database className={`database-status-icon is-${cloudStatus}`} size={14} aria-label={cloudStatus === 'connected' ? 'Database đã kết nối' : 'Trạng thái kết nối database'} />
              </span>
            </div>
          )}
          
          <button 
            type="button"
            className="sidebar-toggle-btn"
            onClick={toggleSidebar}
            title={isCollapsed ? "Mở rộng menu bên trái" : "Thu hẹp menu bên trái"}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="nav-menu" aria-label="Điều hướng nghiệp vụ">
          {user?.role === 'ADMIN' && (
            <Link 
              href="/" 
              aria-current={pathname === '/' ? 'page' : undefined}
              className="nav-item" 
              title={isCollapsed ? "Tổng Quan Dashboard" : ""}
            >
              <LayoutDashboard size={20} />
              {!isCollapsed && <span>Tổng Quan</span>}
            </Link>
          )}

          <div className="nav-section-label">{!isCollapsed && 'Vận hành kho'}</div>
          <Link 
            href="/inventory" 
            aria-current={pathname === '/inventory' ? 'page' : undefined}
              className="nav-item"
            title={isCollapsed ? "Kho Laptop" : ""}
          >
            <Package size={20} />
            {!isCollapsed && <span>Kho Laptop</span>}
          </Link>

          {['ADMIN','TECH','TECHNICAL'].includes(user?.role) && <Link href="/qc" aria-current={pathname === '/qc' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'QC kỹ thuật' : ''}><ClipboardCheck size={20}/>{!isCollapsed && <span>QC kỹ thuật</span>}</Link>}
          {['ADMIN','TECH','TECHNICAL'].includes(user?.role) && <Link href="/repairs" aria-current={pathname === '/repairs' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Sửa chữa kỹ thuật' : ''}><Wrench size={20}/>{!isCollapsed && <span>Sửa chữa kỹ thuật</span>}</Link>}

          {user?.role === 'ADMIN' && <div className="nav-section-label">{!isCollapsed && 'Nhập hàng'}</div>}
          {user?.role === 'ADMIN' && <Link href="/suppliers" aria-current={pathname === '/suppliers' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Nhà cung cấp' : ''}><Building2 size={20}/>{!isCollapsed && <span>Nhà cung cấp</span>}</Link>}
          {user?.role === 'ADMIN' && <Link href="/purchases" aria-current={pathname === '/purchases' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Lô mua hàng' : ''}><Truck size={20}/>{!isCollapsed && <span>Lô mua hàng</span>}</Link>}
          {user?.role === 'ADMIN' && <Link href="/shipments" aria-current={pathname.startsWith('/shipments') ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Vận chuyển TQ–VN' : ''}><Ship size={20}/>{!isCollapsed && <span>Vận chuyển TQ–VN</span>}</Link>}
          {user?.role === 'ADMIN' && <Link href="/receiving" aria-current={pathname === '/receiving' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Nhận hàng' : ''}><PackageCheck size={20}/>{!isCollapsed && <span>Nhận hàng</span>}</Link>}
          {user?.role === 'ADMIN' && <Link href="/supplier-returns" aria-current={pathname === '/supplier-returns' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Trả nhà cung cấp' : ''}><PackageX size={20}/>{!isCollapsed && <span>Trả nhà cung cấp</span>}</Link>}
          {user?.role === 'ADMIN' && <Link href="/costs" aria-current={pathname === '/costs' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Giá vốn thực tế' : ''}><Calculator size={20}/>{!isCollapsed && <span>Giá vốn thực tế</span>}</Link>}

          {['ADMIN','SALES','TECH','TECHNICAL'].includes(user?.role) && <div className="nav-section-label">{!isCollapsed && 'Bán hàng'}</div>}
          {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
            <Link 
              href="/orders" 
              aria-current={pathname === '/orders' ? 'page' : undefined}
              className="nav-item"
              title={isCollapsed ? "Đơn Hàng & Xuất Bán" : ""}
            >
              <ShoppingCart size={20} />
              {!isCollapsed && <span>Đơn Hàng & Xuất Bán</span>}
            </Link>
          )}

          {['ADMIN','SALES'].includes(user?.role) && <Link href="/reservations" aria-current={pathname === '/reservations' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Giữ máy' : ''}><CalendarClock size={20}/>{!isCollapsed && <span>Giữ máy</span>}</Link>}
          {['ADMIN','SALES','TECH','TECHNICAL'].includes(user?.role) && <Link href="/trade-ins" aria-current={pathname === '/trade-ins' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Thu cũ đổi mới' : ''}><Repeat2 size={20}/>{!isCollapsed && <span>Thu cũ đổi mới</span>}</Link>}
          {user?.role === 'ADMIN' && <Link href="/commissions" aria-current={pathname === '/commissions' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Hoa hồng' : ''}><Trophy size={20}/>{!isCollapsed && <span>Hoa hồng</span>}</Link>}

          {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
            <Link href="/customers" aria-current={pathname === '/customers' ? 'page' : undefined} className="nav-item" title={isCollapsed ? "Khách Hàng" : ""}>
              <User size={20} />
              {!isCollapsed && <span>Khách Hàng</span>}
            </Link>
          )}

          {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
            <Link href="/accessories" aria-current={pathname === '/accessories' ? 'page' : undefined} className="nav-item" title={isCollapsed ? "Phụ kiện" : ""}>
              <MousePointer2 size={20} />
              {!isCollapsed && <span>Phụ kiện</span>}
            </Link>
          )}

          {['ADMIN','SALES'].includes(user?.role) && <div className="nav-section-label">{!isCollapsed && 'Tài chính & chứng từ'}</div>}
          {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
            <Link
              href="/payments"
              aria-current={pathname === '/payments' ? 'page' : undefined}
              className="nav-item"
              title={isCollapsed ? "Thu tiền đơn hàng" : ""}
            >
              <BadgeDollarSign size={20} />
              {!isCollapsed && <span>Thu tiền đơn hàng</span>}
            </Link>
          )}

          {user?.role === 'ADMIN' && <Link href="/finance" aria-current={pathname.startsWith('/finance') ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Đối soát tài chính' : ''}><WalletCards size={20}/>{!isCollapsed && <span>Đối soát tài chính</span>}</Link>}
          {user?.role === 'ADMIN' && <Link href="/supplier-payments" aria-current={pathname === '/supplier-payments' ? 'page' : undefined} className="nav-item" title={isCollapsed ? 'Thanh toán NCC' : ''}><Landmark size={20}/>{!isCollapsed && <span>Thanh toán NCC</span>}</Link>}

          {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
            <Link href="/invoices" aria-current={pathname.startsWith('/invoices') ? 'page' : undefined} className="nav-item" title={isCollapsed ? "Hóa đơn" : ""}>
              <FileText size={20} />
              {!isCollapsed && <span>Hóa đơn</span>}
            </Link>
          )}

          <div className="nav-section-label">{!isCollapsed && 'Hậu mãi'}</div>
          <Link 
            href="/warranty" 
            aria-current={pathname === '/warranty' ? 'page' : undefined}
              className="nav-item"
            title={isCollapsed ? "Bảo Hành & Đổi Trả" : ""}
          >
            <Wrench size={20} />
            {!isCollapsed && <span>Bảo Hành & Đổi Trả</span>}
          </Link>

          {user?.role === 'ADMIN' && <div className="nav-section-label">{!isCollapsed && 'Quản trị'}</div>}
          {user?.role === 'ADMIN' && (
            <Link 
              href="/settings" 
              aria-current={pathname === '/settings' ? 'page' : undefined}
              className="nav-item"
              title={isCollapsed ? "Cài đặt Thuộc tính" : ""}
            >
              <Settings size={20} />
              {!isCollapsed && <span>Cài đặt</span>}
            </Link>
          )}
        </nav>

        <div className="sidebar-footer">
          <button 
            onClick={handleLogout} 
            className="btn btn-outline logout-btn" 
            title={isCollapsed ? "Đăng xuất tài khoản" : ""}
            style={{ 
              width: '100%', 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'center', 
              gap: '8px',
              padding: isCollapsed ? '0.65rem 0' : '0.65rem 1.2rem'
            }}
          >
            <LogOut size={16} /> {!isCollapsed && <span>Đăng xuất</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${isCollapsed ? 'collapsed' : ''} ${pathname === '/inventory' || pathname === '/orders' ? 'list-workspace' : ''}`}>
        <nav className="mobile-navigation" aria-label="Điều hướng trên điện thoại">
          <Link href="/inventory" aria-current={pathname === '/inventory' ? 'page' : undefined}><Package size={18} /> Kho laptop</Link>
          {(user?.role === 'ADMIN' || user?.role === 'SALES') && <Link href="/orders" aria-current={pathname === '/orders' ? 'page' : undefined}><ShoppingCart size={18} /> Đơn hàng</Link>}
          {(user?.role === 'ADMIN' || user?.role === 'SALES') && <Link href="/payments" aria-current={pathname === '/payments' ? 'page' : undefined}><BadgeDollarSign size={18} /> Thu tiền</Link>}
          {['TECH','TECHNICAL'].includes(user?.role) && <Link href="/qc" aria-current={pathname === '/qc' ? 'page' : undefined}><ClipboardCheck size={18} /> QC</Link>}
          <Link href="/warranty" aria-current={pathname === '/warranty' ? 'page' : undefined}><Wrench size={18} /> Bảo hành</Link>
          <button type="button" onClick={handleLogout} aria-label="Đăng xuất"><LogOut size={18} /></button>
        </nav>
        {dataLoading && (
          <div className="route-loading-overlay" role="status" aria-live="polite" aria-busy="true">
            <div className="route-loading-card">
              <span className="route-loading-mark"><span /></span>
              <strong>Đang đồng bộ dữ liệu</strong>
              <p>{loadingStage}</p>
              <div className="route-loading-bar"><span /></div>
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
