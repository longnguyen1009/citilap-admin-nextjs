"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';

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
    // Nếu đang load cho cùng user → bỏ qua (tránh race condition login + onAuthStateChange)
    if (loadingProfileRef.current === authUser.id) return;
    loadingProfileRef.current = authUser.id;

    try {
      const { data: profile, error } = await client
        .from('user_profiles')
        .select('name, role, is_active')
        .eq('id', authUser.id)
        .single();

      let newUser;

      if (error || !profile) {
        // Không tự cấp quyền ở client. Profile phải được ADMIN tạo ở server.
        const metaName = authUser.user_metadata?.name || authUser.email?.split('@')[0] || '';
        newUser = {
          id: authUser.id,
          name: metaName || authUser.email,
          role: 'STAFF',
          email: authUser.email,
        };
      } else if (!profile.is_active) {
        await client.auth.signOut();
        lastUserRef.current = null;
        loadingProfileRef.current = false;
        setUser(null);
        setLoading(false);
        return;
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
    } catch (err) {
      console.error('Lỗi load user profile:', err);
      const newUser = {
        id: authUser.id,
        name: authUser.email,
        role: 'SALES',
        email: authUser.email,
      };
      if (!lastUserRef.current || lastUserRef.current.id !== newUser.id) {
        lastUserRef.current = newUser;
        setUser(newUser);
      }
    }
    loadingProfileRef.current = false;
    setLoading(false);
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
      if (process.env.NEXT_PUBLIC_ALLOW_MOCK_AUTH !== 'true') {
        return { ok: false, message: 'Supabase chưa được cấu hình.' };
      }
      // Mock auth chỉ dành cho môi trường phát triển được bật rõ ràng.
      const role = email.includes('admin') ? 'ADMIN' : email.includes('tech') ? 'TECH' : 'SALES';
      const mockUser = MOCK_USERS[role];
      setUser(mockUser);
      localStorage.setItem('citilap_user', JSON.stringify(mockUser));
      return { ok: true };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        return { ok: false, message: error.message };
      }
      // Chờ profile load xong để user có giá trị trước khi navigate
      if (data.session?.user) {
        await loadUserProfile(client, data.session.user);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  // ─── Mock login (fallback khi không có Supabase) ────────────────────
  const mockLogin = (role) => {
    if (process.env.NEXT_PUBLIC_ALLOW_MOCK_AUTH !== 'true') return false;
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
      client.auth.signOut().catch(() => {});
    }
  };

  // ─── Tạo user mới (chỉ ADMIN) ─────────────────────────────────────
  const createUser = async () => ({ ok: false, message: 'Hãy dùng màn hình quản lý người dùng để tạo tài khoản.' });

  // ─── Danh sách users ───────────────────────────────────────────────
  const listUsers = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Lỗi listing users:', error);
        return [];
      }
      return data || [];
    } catch {
      return [];
    }
  }, []);

  // ─── Vô hiệu hóa user ──────────────────────────────────────────────
  const deactivateUser = async (targetUserId) => {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: 'Supabase chưa kết nối' };

    try {
      const { data, error } = await client.rpc('deactivate_user', {
        target_user_id: targetUserId,
      });
      if (error) return { ok: false, message: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  // ─── Kích hoạt user ────────────────────────────────────────────────
  const activateUser = async (targetUserId) => {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: 'Supabase chưa kết nối' };

    try {
      const { data, error } = await client.rpc('activate_user', {
        target_user_id: targetUserId,
      });
      if (error) return { ok: false, message: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  // ─── Đổi mật khẩu user ────────────────────────────────────────────
  const changeUserPassword = async (targetUserId, newPassword) => {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: 'Supabase chưa kết nối' };

    try {
      const { data, error } = await client.rpc('change_user_password', {
        target_user_id: targetUserId,
        new_password: newPassword,
      });
      if (error) return { ok: false, message: error.message };
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
      {!loading && children}
    </AuthContext.Provider>
  );
};
