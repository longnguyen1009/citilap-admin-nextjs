"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSupabaseClient, getSupabaseAdminClient } from '../lib/supabaseClient';

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
  const [loading, setLoading] = useState(true);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

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
        // Auto-create profile nếu user đăng nhập lần đầu (tạo qua Dashboard)
        const metaName = authUser.user_metadata?.name || authUser.email?.split('@')[0] || '';
        const metaRole = authUser.user_metadata?.role || 'ADMIN';
        try {
          await client.from('user_profiles').upsert({
            id: authUser.id,
            name: metaName,
            role: metaRole,
            is_active: true,
          }, { onConflict: 'id' });
        } catch { /* ignore */ }
        newUser = {
          id: authUser.id,
          name: metaName || authUser.email,
          role: metaRole,
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
      // Fallback: dùng mock auth từ localStorage
      const savedUser = localStorage.getItem('citilap_user');
      if (savedUser) {
        // eslint-disable-next-line
        try { setUser(JSON.parse(savedUser)); } catch { /* ignore */ }
      }
      setLoading(false);
      return;
    }

    setIsSupabaseConnected(true);

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
      // Mock auth fallback
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
    // 1. Clear TOÀN BỘ localStorage (data app + session Supabase)
    localStorage.clear();

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
  const createUser = async (email, password, name, role) => {
    const adminClient = getSupabaseAdminClient();
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: 'Supabase chưa kết nối' };

    // Nếu có admin client → dùng Supabase Auth Admin API (tạo đúng identities)
    if (adminClient) {
      try {
        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, role },
        });
        if (error) return { ok: false, message: error.message };

        // Tạo profile trong user_profiles
        const userId = data.user.id;
        const { error: profileError } = await client
          .from('user_profiles')
          .upsert({ id: userId, name, role, is_active: true }, { onConflict: 'id' });
        if (profileError) {
          console.error('Lỗi tạo profile:', profileError);
          // Không return lỗi vì user đã tạo thành công trong auth
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    }

    // Fallback: dùng RPC (legacy, có thể không hoạt động đúng)
    try {
      const { data, error } = await client.rpc('create_user_with_role', {
        p_email: email,
        p_password: password,
        p_name: name,
        p_role: role,
      });
      if (error) return { ok: false, message: error.message };
      if (data?.ok) return { ok: true };
      return { ok: false, message: data?.message || 'Lỗi không xác định' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

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
