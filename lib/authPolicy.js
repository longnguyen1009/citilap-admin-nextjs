// Mock authentication is deliberately restricted to non-production builds.
// The email allowlist prevents arbitrary strings from becoming local users.
const DEFAULT_MOCK_EMAILS = ['admin@citilap.com', 'tech@citilap.com', 'sales@citilap.com'];

export const isMockAuthAllowed = () => (
  process.env.NODE_ENV !== 'production'
  && process.env.NEXT_PUBLIC_ALLOW_MOCK_AUTH === 'true'
);

const getMockEmailAllowlist = () => {
  const configured = String(process.env.NEXT_PUBLIC_MOCK_AUTH_EMAILS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_MOCK_EMAILS);
};

export const getMockUserRole = (email) => {
  if (!isMockAuthAllowed()) return null;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!getMockEmailAllowlist().has(normalizedEmail)) return null;
  if (normalizedEmail.startsWith('admin@')) return 'ADMIN';
  if (normalizedEmail.startsWith('tech@')) return 'TECH';
  if (normalizedEmail.startsWith('sales@')) return 'SALES';
  return null;
};

