"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
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
  Settings
} from 'lucide-react';
import { getSupabaseCredentials } from '../lib/supabaseClient';

export default function MainLayout({ children }) {
  const { user, logout } = useAuth();
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

  const isSupabaseConfigured = getSupabaseCredentials().isConfigured;

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
              <h2>CitiLap</h2>
              <span className="badge badge-pro">Warehouse Pro</span>
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

        <nav className="nav-menu">
          {/* Admin only */}
          {user?.role === 'ADMIN' && (
            <Link 
              href="/" 
              className="nav-item" 
              title={isCollapsed ? "Tổng Quan Dashboard" : ""}
            >
              <LayoutDashboard size={20} />
              {!isCollapsed && <span>Tổng Quan</span>}
            </Link>
          )}

          {/* All Roles */}
          <Link 
            href="/inventory" 
            className="nav-item"
            title={isCollapsed ? "Kho Laptop" : ""}
          >
            <Package size={20} />
            {!isCollapsed && <span>Kho Laptop</span>}
          </Link>

          {/* Admin and Sales */}
          {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
            <Link 
              href="/orders" 
              className="nav-item"
              title={isCollapsed ? "Đơn Hàng & Xuất Bán" : ""}
            >
              <ShoppingCart size={20} />
              {!isCollapsed && <span>Đơn Hàng & Xuất Bán</span>}
            </Link>
          )}

          {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
            <Link
              href="/payments"
              className="nav-item"
              title={isCollapsed ? "Thanh toán & Tài chính" : ""}
            >
              <BadgeDollarSign size={20} />
              {!isCollapsed && <span>Thanh toán & Tài chính</span>}
            </Link>
          )}

          {/* All Roles */}
          <Link 
            href="/warranty" 
            className="nav-item"
            title={isCollapsed ? "Bảo Hành & Đổi Trả" : ""}
          >
            <Wrench size={20} />
            {!isCollapsed && <span>Bảo Hành & Đổi Trả</span>}
          </Link>

          {/* Admin and Sales */}
          {(user?.role === 'ADMIN' || user?.role === 'SALES') && (
            <Link 
              href="/customers" 
              className="nav-item"
              title={isCollapsed ? "Khách Hàng" : ""}
            >
              <User size={20} />
              {!isCollapsed && <span>Khách Hàng</span>}
            </Link>
          )}

          {user?.role === 'ADMIN' && (
            <Link 
              href="/settings" 
              className="nav-item"
              title={isCollapsed ? "Cài đặt Thuộc tính" : ""}
            >
              <Settings size={20} />
              {!isCollapsed && <span>Cài đặt</span>}
            </Link>
          )}
        </nav>

        <div className="sidebar-footer">
          <div 
            className="user-profile-box"
            title={isCollapsed ? `${user?.name} (${user?.role})` : ""}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: '10px', 
              padding: isCollapsed ? '10px 0' : '10px 15px', 
              color: 'var(--text-main)', 
              fontSize: '14px', 
              marginBottom: '10px', 
              background: 'rgba(59, 130, 246, 0.08)', 
              borderRadius: '12px',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}
          >
            <User size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            {!isCollapsed && <span>{user?.name} ({user?.role})</span>}
          </div>
          
          <div
            title={isCollapsed ? (isSupabaseConfigured ? "Đang kết nối Supabase Cloud" : "LocalStorage trên trình duyệt này") : ""}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: '8px',
              padding: '8px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: '8px',
              marginBottom: '8px',
              background: isSupabaseConfigured ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              color: isSupabaseConfigured ? '#059669' : '#b45309',
              border: isSupabaseConfigured ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <Database size={15} />
            {!isCollapsed && (
              <span>{isSupabaseConfigured ? "🟢 Supabase Cloud" : "🟡 LocalStorage (trình duyệt này)"}</span>
            )}
          </div>
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
      <main className={`main-content ${isCollapsed ? 'collapsed' : ''}`}>
        {children}
      </main>
    </div>
  );
}
