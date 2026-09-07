import 'server-only';
import { createClient } from '@supabase/supabase-js';

let adminClient = null;

// Chỉ dùng ở Route Handler/server service. service_role không bao giờ được import
// vào Client Component vì nó bỏ qua hoàn toàn Row Level Security.
export const getSupabaseAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
};
