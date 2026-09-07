import { getSupabaseAdminClient } from './supabaseAdmin';

export async function getUserProfile(request) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      try {
        const { data: { user }, error } = await adminClient.auth.getUser(token);
        if (user && !error) {
          const profile = { id: user.id, email: user.email, name: user.email?.split('@')[0] || 'User' };
          
          const { data: dbProfile } = await adminClient
            .from('user_profiles')
            .select('name, role, is_active')
            .eq('id', user.id)
            .single();
          if (!dbProfile || dbProfile.is_active === false) return null;

          profile.name = dbProfile.name || profile.name;
          // user_metadata có thể bị người dùng sửa qua Supabase Auth, không được
          // dùng để cấp quyền. Role chỉ lấy từ profile do server quản trị.
          profile.role = dbProfile.role || 'STAFF';
          return profile;
        }
      } catch (err) {
        console.error('Error fetching user profile from token:', err);
      }
    }
  }
  return null;
}

export async function getUserRole(request) {
  const profile = await getUserProfile(request);
  return profile?.role || null;
}

export async function requireUser(request, allowedRoles = null) {
  const profile = await getUserProfile(request);
  if (!profile) return { ok: false, response: new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return { ok: false, response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) };
  }
  return { ok: true, profile };
}

export function filterSensitiveFields(items, sensitiveKeys) {
  if (!Array.isArray(items)) return items;
  return items.map(item => {
    const filtered = { ...item };
    sensitiveKeys.forEach(k => { delete filtered[k]; });
    return filtered;
  });
}

export const SENSITIVE_LAPTOP_KEYS = ['priceRmb', 'shippingRmb', 'exchangeRate', 'importPriceVnd', 'wholesalePriceVnd', 'customProfit'];
export const SENSITIVE_ORDER_KEYS = ['profitVnd'];
