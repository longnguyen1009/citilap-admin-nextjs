import { getSupabaseAdminClient } from './supabaseClient';

export async function getUserProfile(request) {
  const mockRole = request.headers.get('X-Mock-Role');
  if (mockRole) {
    return { role: mockRole, email: 'mock@citilap.com', name: `Mock ${mockRole}` };
  }

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
            .select('role')
            .eq('id', user.id)
            .single();
            
          profile.role = dbProfile?.role || user.user_metadata?.role || 'STAFF';
          return profile;
        }
      } catch (err) {
        console.error('Error fetching user profile from token:', err);
      }
    }
  }
  return { role: 'STAFF', email: 'unknown@system', name: 'System' };
}

export async function getUserRole(request) {
  const profile = await getUserProfile(request);
  return profile.role;
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
