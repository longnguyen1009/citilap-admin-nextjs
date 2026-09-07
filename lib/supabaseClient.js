import { createClient } from '@supabase/supabase-js';

// Lấy thông tin cấu hình Supabase từ env
export const getSupabaseCredentials = () => {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey, isConfigured: true };
  }

  return { url: '', anonKey: '', isConfigured: false };
};

// Singleton client — quan trọng cho Auth (session persistence)
let _singletonClient = null;
let _lastUrl = null;
let _lastKey = null;

export const getSupabaseClient = () => {
  const { url, anonKey, isConfigured } = getSupabaseCredentials();
  if (!isConfigured || !url || !anonKey) return null;

  // Tạo lại client chỉ khi credentials thay đổi
  if (!_singletonClient || url !== _lastUrl || anonKey !== _lastKey) {
    _singletonClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    _lastUrl = url;
    _lastKey = anonKey;
  }
  return _singletonClient;
};
