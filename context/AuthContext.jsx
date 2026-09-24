"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { fetchUsersFromCloud, saveUserToCloud, updateUserStatus } from '../lib/apiFetchers';
import { getMockUserRole, isMockAuthAllowed } from '../lib/authPolicy';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// Mock auth fallback khi Supabase chưa kết nối
const MOCK_USERS = {
  ADMIN: { id: 'mock-1', name: 'Quản Lý', role: 'ADMIN', email: 'admin@citilap.com' },
  TECH: { id: 'mock-2', name: 'Kỹ Thuật Viên', role: 'TECH', email: 'tech@citilap.com' },
  SALES: { id: 'mock-3', name: 'Nhân Viên Sale', role: 'SALES', email: 'sales@citilap.com' },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(getSupabaseClient()));
  const isSupabaseConnected = Boolean(getSupabaseClient());

  // Kiểm tra Supabase kết nối và khôi phục session
  const lastUserRef = React.useRef(null);
  const loadingProfileRef = React.useRef(false);

  const loadUserProfile = async (client, authUser) => {
    // signInWithPassword và onAuthStateChange có thể đến gần như cùng lúc.
    // Lời gọi sau phải chờ profile đang tải thay vì điều hướng khi user còn null.
    if (loadingProfileRef.current === authUser.id) {
      const startedAt = Date.now();
      while (loadingProfileRef.current === authUser.id && Date.now() - startedAt < 15000) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return Boolean(lastUserRef.current?.id === authUser.id);
    }
    loadingProfileRef.current = authUser.id;

    try {
      const { data: profile, error } = await client
        .from('user_profiles')
        .select('name, role, is_active')
        .eq('id', authUser.id)
        .single();

      let newUser;

      if (error || !profile) {
        await client.auth.signOut();
        lastUserRef.current = null;
        loadingProfileRef.current = false;
        setUser(null);
        setLoading(false);
        return false;
      } else if (!profile.is_active) {
        await client.auth.signOut();
        lastUserRef.current = null;
        loadingProfileRef.current = false;
        setUser(null);
        setLoading(false);
        return false;
      } else {
        newUser = {
          id: authUser.id,
          name: profile.name || authUser.email,
          role: profile.role,
          email: authUser.email,
        };
      }

      // Chỉ setUser nếu dữ liệu thực sự thay đổi
      const prev = lastUserRef.current;
      if (!prev || prev.id !== newUser.id || prev.name !== newUser.name || prev.role !== newUser.role) {
        lastUserRef.current = newUser;
        setUser(newUser);
      }
      return true;
    } catch (err) {
      console.error('Lỗi load user profile:', err);
      await client.auth.signOut().catch(() => {});
      lastUserRef.current = null;
      setUser(null);
      return false;
    } finally {
      loadingProfileRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    // Lấy session hiện tại
    client.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserProfile(client, session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen auth state changes — chỉ xử lý SIGNED_IN / SIGNED_OUT
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        loadUserProfile(client, session.user);
      } else if (event === 'SIGNED_OUT') {
        lastUserRef.current = null;
        setUser(null);
        setLoading(false);
      }
      // Bỏ qua INITIAL_SESSION, TOKEN_REFRESHED, PASSWORD_RECOVERY, USER_UPDATED
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Load user profile (role, name) từ user_profiles table
  // Dùng ref để tránh load trùng lặp khi onAuthStateChange fire nhiều lần
  // ─── Login với Supabase Auth ───────────────────────────────────────
  const login = async (email, password) => {
    const client = getSupabaseClient();
    if (!client) {
      if (!isMockAuthAllowed()) {
        return { ok: false, message: 'Supabase chưa được cấu hình.' };
      }
      const role = getMockUserRole(email);
      if (!role) {
        return { ok: false, message: 'Tài khoản mock không nằm trong allowlist.' };
      }
      const mockUser = MOCK_USERS[role];
      setUser(mockUser);
      localStorage.setItem('citilap_user', JSON.stringify(mockUser));
      return { ok: true };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        return { ok: false, message: error.message };
      }
      // Chờ profile load xong để user có giá trị trước khi navigate
      if (data.session?.user) {
        const profileReady = await loadUserProfile(client, data.session.user);
        if (!profileReady) return { ok: false, message: 'Không thể tải hồ sơ người dùng hoặc tài khoản đã bị khóa.' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  // ─── Mock login (fallback khi không có Supabase) ────────────────────
  const mockLogin = (role) => {
    if (!isMockAuthAllowed()) return false;
    const mockUser = MOCK_USERS[role];
    if (mockUser) {
      setUser(mockUser);
      localStorage.setItem('citilap_user', JSON.stringify(mockUser));
      return true;
    }
    return false;
  };

  // ─── Logout ─────────────────────────────────────────────────────────
  const logout = async () => {
    // Chỉ xóa dữ liệu thuộc CitiLap, không ảnh hưởng ứng dụng khác cùng origin.
    Object.keys(localStorage)
      .filter(key => key.startsWith('citilap_') || key === 'sidebar_collapsed')
      .forEach(key => localStorage.removeItem(key));

    // 2. Set null TRƯỚC để UI立即响应
    lastUserRef.current = null;
    setUser(null);

    // 3. Sign out Supabase (async, không await — chạy nền)
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut().catch(() => {});
    }
  };

  // ─── Tạo user mới (chỉ ADMIN) ─────────────────────────────────────
  const createUser = async (payload) => {
    try {
      const created = await saveUserToCloud(payload, false);
      return { ok: true, user: created };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  // ─── Danh sách users ───────────────────────────────────────────────
  const listUsers = useCallback(async () => {
    try {
      return (await fetchUsersFromCloud()) || [];
    } catch (error) {
      console.error('Lỗi listing users:', error);
      return [];
    }
  }, []);

  // ─── Vô hiệu hóa user ──────────────────────────────────────────────
  const deactivateUser = async (targetUserId) => {
    try {
      await updateUserStatus(targetUserId, false);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  // ─── Kích hoạt user ────────────────────────────────────────────────
  const activateUser = async (targetUserId) => {
    try {
      await updateUserStatus(targetUserId, true);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  // ─── Đổi mật khẩu user ────────────────────────────────────────────
  const changeUserPassword = async (targetUserId, newPassword) => {
    try {
      await saveUserToCloud({ id: targetUserId, password: newPassword }, true);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isSupabaseConnected,
      login,
      mockLogin,
      logout,
      createUser,
      listUsers,
      deactivateUser,
      activateUser,
      changeUserPassword,
    }}>
      {loading ? (
        <div className="auth-loading-screen" role="status" aria-live="polite">
          <div className="auth-loading-card">
            <span className="route-loading-mark"><span /></span>
            <strong>Đang khôi phục phiên làm việc</strong>
            <p>Đang xác thực tài khoản CitiLap…</p>
          </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
};
