import { randomUUID } from 'node:crypto';
import { hashPassword } from './session.mjs';

const roles = new Set(['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
const projection = `SELECT u.id,u.email,p.name,p.role,p.is_active,u.created_at,u.last_sign_in_at
  FROM auth_users u JOIN user_profiles p ON p.id=u.id`;
const bad = message => { throw Object.assign(new Error(message), { status: 400 }); };
const publicUser = row => row ? { ...row, is_active: Boolean(row.is_active) } : null;
function validate(input, creating) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Dữ liệu tài khoản không hợp lệ');
  const result = {};
  if (creating || input.email !== undefined) {
    if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) bad('Email không hợp lệ');
    result.email = input.email.trim().toLowerCase();
  }
  if (creating || input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) bad('Tên phải dài từ 1 đến 120 ký tự');
    result.name = input.name.trim();
  }
  if (creating || input.role !== undefined) {
    result.role = input.role ?? 'SALES';
    if (!roles.has(result.role)) bad('Role không hợp lệ');
  }
  if (input.is_active !== undefined) {
    if (typeof input.is_active !== 'boolean') bad('is_active không hợp lệ');
    result.is_active = Number(input.is_active);
  }
  return result;
}
export async function listUsers(db) {
  const result = await db.prepare(`${projection} ORDER BY u.created_at DESC,u.id`).all();
  return result.results.map(publicUser);
}
export async function createUser(db, input) {
  const data = validate(input, true);
  const hash = await hashPassword(input.password);
  const id = randomUUID();
  const results = await db.batch([
    db.prepare('INSERT INTO auth_users(id,email,password_hash) VALUES (?,?,?)').bind(id, data.email, hash),
    db.prepare('INSERT INTO user_profiles(id,name,role,is_active) VALUES (?,?,?,?)').bind(id, data.name, data.role, data.is_active ?? 1),
    db.prepare(`${projection} WHERE u.id=?`).bind(id),
  ]);
  return publicUser(results.at(-1).results[0]);
}
export async function createFirstAdmin(db, input) {
  const data = validate({ ...input, role: 'ADMIN', is_active: true }, true);
  const hash = await hashPassword(input.password);
  const id = randomUUID();
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM auth_users)
      THEN 1 ELSE json('initial administrator already exists') END`),
    db.prepare('INSERT INTO auth_users(id,email,password_hash) VALUES (?,?,?)').bind(id,data.email,hash),
    db.prepare("INSERT INTO user_profiles(id,name,role,is_active) VALUES (?,?,'ADMIN',1)").bind(id,data.name),
    db.prepare(`${projection} WHERE u.id=?`).bind(id),
  ]);
  return publicUser(results.at(-1).results[0]);
}
export async function updateUser(db, input, actorId) {
  const data = validate(input, false);
  if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id)) bad('User ID không hợp lệ');
  if (input.id === actorId && (data.is_active === 0 || (data.role && data.role !== 'ADMIN'))) bad('Không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập');
  const statements = [db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM auth_users WHERE id=?)
    THEN 1 ELSE json('user does not exist') END`).bind(input.id)];
  const auth = {};
  if (data.email !== undefined) auth.email = data.email;
  if (input.password !== undefined) auth.password_hash = await hashPassword(input.password);
  if (Object.keys(auth).length) statements.push(db.prepare(`UPDATE auth_users SET ${Object.keys(auth).map(key => `${key}=?`).join(',')} WHERE id=?`).bind(...Object.values(auth), input.id));
  const profile = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'email'));
  if (Object.keys(profile).length) {
    // Protect the last active administrator inside the same write transaction.
    statements.push(db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user_profiles WHERE id=? AND role='ADMIN' AND is_active=1)
      OR (?='ADMIN' AND ?=1) OR EXISTS(SELECT 1 FROM user_profiles WHERE id<>? AND role='ADMIN' AND is_active=1)
      THEN 1 ELSE json('cannot remove last administrator') END`).bind(input.id,
      profile.role ?? 'ADMIN', profile.is_active ?? 1, input.id));
    statements.push(db.prepare(`UPDATE user_profiles SET ${Object.keys(profile).map(key => `${key}=?`).join(',')},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(...Object.values(profile), input.id));
  }
  statements.push(db.prepare(`${projection} WHERE u.id=?`).bind(input.id));
  const results = await db.batch(statements);
  return publicUser(results.at(-1).results[0]);
}
