export const CANONICAL_ROLES = Object.freeze(['ADMIN', 'SALES', 'TECHNICAL', 'SALES_TECH', 'STAFF']);
export const ALL_ROLES = CANONICAL_ROLES;
export const SALES_ROLES = Object.freeze(['ADMIN', 'SALES', 'SALES_TECH']);
export const TECHNICAL_ROLES = Object.freeze(['ADMIN', 'TECHNICAL', 'SALES_TECH']);
export const SALES_TECHNICAL_ROLES = Object.freeze(['ADMIN', 'SALES', 'TECHNICAL', 'SALES_TECH']);

export const normalizeRole = role => role === 'TECH' ? 'TECHNICAL' : role;

export const isCanonicalRole = role => CANONICAL_ROLES.includes(normalizeRole(role));
