import { getSupabaseAdminClient } from './supabaseClient';

export async function getUserRole(request) {
  // Check for Mock Role header first
  const mockRole = request.headers.get('X-Mock-Role');
  if (mockRole) {
    return mockRole;
  }

  // Check for Supabase JWT token
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      try {
        const { data: { user }, error } = await adminClient.auth.getUser(token);
        if (user && !error) {
          // Fetch role from user_profiles
          const { data: profile } = await adminClient
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single();
          if (profile && profile.role) {
            return profile.role;
          }
          // Fallback to metadata
          if (user.user_metadata && user.user_metadata.role) {
            return user.user_metadata.role;
          }
        }
      } catch (err) {
        console.error('Error fetching user role from token:', err);
      }
    }
  }

  return 'SALES'; // Default fallback role if no auth provided, most restrictive
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
