"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchUsersFromCloud, saveUserToCloud, updateUserStatus } from '../lib/apiFetchers';
import { getMockUserRole, isMockAuthAllowed } from '../lib/authPolicy';

const AuthContext = createContext();
const AUTH_REQUEST_TIMEOUT_MS = 10000;
const MOCK_USERS = {
  ADMIN: { id: 'mock-1', name: 'Quản Lý', role: 'ADMIN', email: 'admin@citilap.com' },
  TECHNICAL: { id: 'mock-2', name: 'Kỹ Thuật Viên', role: 'TECHNICAL', email: 'tech@citilap.com' },
  SALES: { id: 'mock-3', name: 'Nhân Viên Sale', role: 'SALES', email: 'sales@citilap.com' },
  SALES_TECH: { id: 'mock-4', name: 'Sale + Kỹ Thuật', role: 'SALES_TECH', email: 'sales-tech@citilap.com' },
};

const withTimeout = async (url, options, message) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(message), AUTH_REQUEST_TIMEOUT_MS);
  try { return await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timer); }
};

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAuthConfigured = true;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await withTimeout('/api/auth/session', {}, 'Quá thời gian khôi phục phiên');
        const data = await response.json().catch(() => ({}));
        if (active) setUser(response.ok ? data.user || null : null);
      } catch (error) {
        if (active && error?.name !== 'AbortError') console.error('Không thể khôi phục phiên:', error);
        if (active) setUser(null);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const login = async (email, password) => {
    try {
      const response = await withTimeout('/api/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      }, 'Quá thời gian đăng nhập');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, message: data.error || 'Không thể đăng nhập' };
      setUser(data.user);
      return { ok: true, user: data.user };
    } catch (error) { return { ok: false, message: error.name === 'AbortError' ? 'Quá thời gian đăng nhập' : error.message }; }
  };

  const mockLogin = role => {
    if (!isMockAuthAllowed()) return false;
    const mockUser = MOCK_USERS[getMockUserRole(role) || role];
    if (!mockUser) return false;
    setUser(mockUser);
    localStorage.setItem('citilap_user', JSON.stringify(mockUser));
    return true;
  };

  const logout = async () => {
    setUser(null);
    try {
      Object.keys(sessionStorage).filter(key => key.startsWith('citilap_')).forEach(key => sessionStorage.removeItem(key));
      Object.keys(localStorage).filter(key => key.startsWith('citilap_') || key === 'sidebar_collapsed').forEach(key => localStorage.removeItem(key));
    } catch { /* Storage can be unavailable. */ }
    await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
  };

  const createUser = async payload => {
    try { return { ok: true, user: await saveUserToCloud(payload, false) }; }
    catch (error) { return { ok: false, message: error.message }; }
  };
  const listUsers = useCallback(async () => {
    try { return (await fetchUsersFromCloud()) || []; }
    catch (error) { console.error('Lỗi listing users:', error); return []; }
  }, []);
  const setUserActive = async (id, isActive) => {
    try { await updateUserStatus(id, isActive); return { ok: true }; }
    catch (error) { return { ok: false, message: error.message }; }
  };
  const changeUserPassword = async (id, password) => {
    try { await saveUserToCloud({ id, password }, true); return { ok: true }; }
    catch (error) { return { ok: false, message: error.message }; }
  };

  return <AuthContext.Provider value={{
    user, loading, isAuthConfigured, login, mockLogin, logout, createUser, listUsers,
    deactivateUser: id => setUserActive(id, false), activateUser: id => setUserActive(id, true), changeUserPassword,
  }}>
    {loading ? <div className="auth-loading-screen" role="status" aria-live="polite">
      <div className="auth-loading-card"><span className="route-loading-mark"><span /></span>
        <strong>Đang khôi phục phiên làm việc</strong><p>Đang xác thực tài khoản CitiLap…</p>
      </div>
    </div> : children}
  </AuthContext.Provider>;
};
