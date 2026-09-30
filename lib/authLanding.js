export function defaultLandingPath(role) {
  return role === 'ADMIN' ? '/' : '/inventory';
}
