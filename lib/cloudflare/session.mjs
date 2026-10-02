import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SESSION_SECONDS = 8 * 60 * 60;
const SCRYPT = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const ROLES = new Set(['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'SALES_TECH', 'STAFF']);
const digest = value => createHash('sha256').update(value).digest('hex');
const derive = (password, salt) => new Promise((resolve, reject) => {
  scrypt(password, salt, 64, SCRYPT, (error, key) => error ? reject(error) : resolve(key));
});
const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Mật khẩu phải dài từ 12 đến 128 ký tự');
  }
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const match = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded || '');
  if (!match) return false;
  const candidate = await derive(password, match[1]);
  return timingSafeEqual(candidate, Buffer.from(match[2], 'hex'));
}

function cookieName(request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-citilap_session' : 'citilap_session';
}
export function sessionCookie(request, token, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:';
  if (!secure && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)) {
    throw new Error('Authentication requires HTTPS');
  }
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function readToken(request) {
  const cookies = (request.headers.get('cookie') || '').split(';').map(value => value.trim());
  const values = cookies.filter(value => value.startsWith(`${cookieName(request)}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(cookieName(request).length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw Object.assign(new Error('Forbidden origin'), { status: 403 });
  }
}
export async function findSession(db, request) {
  const token = readToken(request);
  if (!token) return null;
  const row = await db.prepare(`SELECT u.id,u.email,p.name,p.role FROM auth_sessions s
    JOIN auth_users u ON u.id=s.user_id JOIN user_profiles p ON p.id=u.id
    WHERE s.token_hash=? AND s.expires_at>? AND p.is_active=1`).bind(digest(token), nowSeconds()).first();
  return row && ROLES.has(row.role) ? row : null;
}
export async function requireSession(db, request, roles = null) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) assertSameOrigin(request);
  const user = await findSession(db, request);
  if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
  if (roles && !roles.includes(user.role)) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return user;
}
async function consumeRateLimit(db, key, limit) {
  const now = nowSeconds();
  const row = await db.prepare(`INSERT INTO auth_rate_limits(key,attempts,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,
      expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
    RETURNING attempts`).bind(key, now + 900, now, now).first();
  if (row.attempts > limit) throw Object.assign(new Error('Thử đăng nhập quá nhiều. Vui lòng thử lại sau 15 phút.'), { status: 429 });
}
export async function signIn(db, request, { email, password } = {}) {
  assertSameOrigin(request);
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) {
    throw Object.assign(new Error('Email hoặc mật khẩu không hợp lệ'), { status: 400 });
  }
  const normalized = email.trim().toLowerCase();
  // cf-connecting-ip is supplied by Cloudflare, never trust x-forwarded-for.
  await consumeRateLimit(db, `ip:${digest(request.headers.get('cf-connecting-ip') || 'local')}`, 100);
  await consumeRateLimit(db, `email:${digest(normalized)}`, 10);
  const row = await db.prepare(`SELECT u.id,u.email,u.password_hash,p.name,p.role,p.is_active
    FROM auth_users u JOIN user_profiles p ON p.id=u.id WHERE u.email=?`).bind(normalized).first();
  // Use the same KDF for unknown users so account existence is not exposed by timing.
  const encoded = row?.password_hash || `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
  const valid = await verifyPassword(password, encoded);
  if (!valid || !row?.is_active || !ROLES.has(row.role)) {
    throw Object.assign(new Error('Email hoặc mật khẩu không đúng'), { status: 401 });
  }
  const token = randomBytes(32).toString('hex');
  const now = nowSeconds();
  const cookie = sessionCookie(request, token);
  const results = await db.batch([
    // Recheck account credentials/status atomically to close the password reset race.
    db.prepare(`INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at)
      SELECT ?,u.id,?,? FROM auth_users u JOIN user_profiles p ON p.id=u.id
      WHERE u.id=? AND u.password_hash=? AND p.is_active=1 AND p.role=? RETURNING token_hash`)
      .bind(digest(token), now, now + SESSION_SECONDS, row.id, row.password_hash, row.role),
    db.prepare('UPDATE auth_users SET last_sign_in_at=? WHERE id=?').bind(new Date().toISOString(), row.id),
    db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(now),
    db.prepare('DELETE FROM auth_rate_limits WHERE expires_at<=?').bind(now),
  ]);
  if (!results[0].results.length) throw Object.assign(new Error('Tài khoản đã thay đổi; hãy đăng nhập lại'), { status: 401 });
  return { user: { id: row.id, email: row.email, name: row.name, role: row.role }, cookie };
}
export async function signOut(db, request) {
  assertSameOrigin(request);
  const token = readToken(request);
  if (token) await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(digest(token)).run();
  return sessionCookie(request, '', 0);
}
