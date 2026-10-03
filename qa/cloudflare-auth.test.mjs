import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { hashPassword, verifyPassword, signIn, signOut, findSession, requireSession, assertSameOrigin, sessionCookie } from '../lib/cloudflare/session.mjs';
import { readImage } from '../lib/cloudflare/images.mjs';
import { createFirstAdmin } from '../lib/cloudflare/users.mjs';
import { publicLaptop } from '../lib/responseVisibility.js';

function adapter(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      const query = {
        bind(...params) { values = params; return query; },
        async first() { return statement.get(...values) || null; },
        async run() { return { success: true, meta: statement.run(...values) }; },
        execute() { return { success: true, results: statement.all(...values) }; },
      };
      return query;
    },
    async batch(queries) {
      sqlite.exec('BEGIN');
      try { const results = queries.map(query => query.execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
const origin = 'https://admin.example.com';
function request(method = 'POST', cookie = '', source = origin) {
  return new Request(`${origin}/api/auth/session`, { method, headers: { origin: source, cookie } });
}
const password = 'test-password-for-cloudflare-only';
let passwordHash;
test.before(async () => { passwordHash = await hashPassword(password); });
test('sale/tech laptop projection preserves underscored QC fields', () => {
  const projected = publicLaptop({
    id: 9,
    qcDetails: {
      keyboardBacklight: { result: 'PASS' },
      usbC: { result: 'PASS' },
      ssdHealth: { result: 'PASS' },
      cpuStress: { result: 'PASS' },
      gpuStress: { result: 'PASS' },
    },
  });
  assert.deepEqual(Object.keys(projected.qcDetails).sort(), [
    'cpu_stress', 'gpu_stress', 'keyboard_backlight', 'ssd_health', 'usb_c',
  ]);
});
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(await readFile('db/d1/migrations/0001_schema.sql', 'utf8'));
  sqlite.exec(await readFile('db/d1/migrations/0002_auth_storage.sql', 'utf8'));
  sqlite.prepare('INSERT INTO auth_users(id,email,password_hash) VALUES (?,?,?)').run('user-1', 'admin@example.com', passwordHash);
  sqlite.prepare('INSERT INTO user_profiles(id,name,role,is_active) VALUES (?,?,?,1)').run('user-1', 'Admin', 'ADMIN');
  return { sqlite, db: adapter(sqlite) };
}
test('passwords use salted hashes and reject incorrect passwords', async () => {
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword('incorrect-password', passwordHash), false);
  assert.notEqual(await hashPassword(password), passwordHash);
  assert.equal(await verifyPassword(password, 'malformed'), false);
  await assert.rejects(hashPassword('short'));
});
test('bootstrap creates exactly one initial administrator', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(await readFile('db/d1/migrations/0001_schema.sql', 'utf8'));
    sqlite.exec(await readFile('db/d1/migrations/0002_auth_storage.sql', 'utf8'));
    const db = adapter(sqlite);
    const admin = await createFirstAdmin(db, { email: 'first@example.com', name: 'First Admin', password });
    assert.equal(admin.role, 'ADMIN');
    assert.equal(admin.is_active, true);
    await assert.rejects(createFirstAdmin(db, { email: 'second@example.com', name: 'Second Admin', password }));
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM auth_users').get().n, 1);
  } finally { sqlite.close(); }
});
test('session persists, stores only a digest and logs out', async () => {
  const { sqlite, db } = await fixture();
  try {
    const login = await signIn(db, request(), { email: 'ADMIN@example.com', password });
    assert.match(login.cookie, /^__Host-citilap_session=/);
    assert.match(login.cookie, /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
    const cookie = login.cookie.split(';')[0];
    assert.notEqual(sqlite.prepare('SELECT token_hash FROM auth_sessions').get().token_hash, cookie.split('=')[1]);
    assert.equal((await findSession(db, request('GET', cookie))).role, 'ADMIN');
    assert.equal((await requireSession(db, request('POST', cookie), ['ADMIN'])).id, 'user-1');
    assert.match(await signOut(db, request('DELETE', cookie)), /Max-Age=0/);
    assert.equal(await findSession(db, request('GET', cookie)), null);
  } finally { sqlite.close(); }
});
for (const [name, sql] of [
  ['disabled account', "UPDATE user_profiles SET is_active=0 WHERE id='user-1'"],
  ['changed role', "UPDATE user_profiles SET role='SALES' WHERE id='user-1'"],
  ['changed password', "UPDATE auth_users SET password_hash='changed' WHERE id='user-1'"],
  ['changed email', "UPDATE auth_users SET email='new@example.com' WHERE id='user-1'"],
]) {
  test(`${name} revokes existing sessions`, async () => {
    const { sqlite, db } = await fixture();
    try {
      const { cookie } = await signIn(db, request(), { email: 'admin@example.com', password });
      sqlite.exec(sql);
      assert.equal(await findSession(db, request('GET', cookie.split(';')[0])), null);
      assert.equal(sqlite.prepare('SELECT count(*) AS n FROM auth_sessions').get().n, 0);
    } finally { sqlite.close(); }
  });
}
test('expired, forged and duplicate cookies cannot authenticate', async () => {
  const { sqlite, db } = await fixture();
  try {
    const { cookie } = await signIn(db, request(), { email: 'admin@example.com', password });
    const tokenCookie = cookie.split(';')[0];
    assert.equal(await findSession(db, request('GET', `${tokenCookie}; ${tokenCookie}`)), null);
    assert.equal(await findSession(db, request('GET', `__Host-citilap_session=${'a'.repeat(64)}`)), null);
    sqlite.exec('UPDATE auth_sessions SET created_at=1,expires_at=2');
    assert.equal(await findSession(db, request('GET', tokenCookie)), null);
  } finally { sqlite.close(); }
});
test('authorization rejects missing session, role escalation and cross-origin writes', async () => {
  const { sqlite, db } = await fixture();
  try {
    await assert.rejects(requireSession(db, request('GET')), { status: 401 });
    sqlite.exec("UPDATE user_profiles SET role='SALES'");
    const { cookie } = await signIn(db, request(), { email: 'admin@example.com', password });
    await assert.rejects(requireSession(db, request('GET', cookie.split(';')[0]), ['ADMIN']), { status: 403 });
    assert.throws(() => assertSameOrigin(request('POST', '', 'https://evil.example')), { status: 403 });
    assert.throws(() => assertSameOrigin(new Request(`${origin}/api/auth/session`, { method: 'POST' })), { status: 403 });
    assert.throws(() => sessionCookie(new Request('http://admin.example.com'), 'token'));
  } finally { sqlite.close(); }
});
test('login attempts are bounded atomically', async () => {
  const { sqlite, db } = await fixture();
  try {
    for (let i = 0; i < 10; i++) await assert.rejects(signIn(db, request(), { email: 'admin@example.com', password: 'wrong' }), { status: 401 });
    await assert.rejects(signIn(db, request(), { email: 'admin@example.com', password }), { status: 429 });
    sqlite.exec('UPDATE auth_rate_limits SET expires_at=0');
    assert.equal((await signIn(db, request(), { email: 'admin@example.com', password })).user.id, 'user-1');
  } finally { sqlite.close(); }
});
test('image input checks content signatures and size', async () => {
  const imageRequest = (type, bytes, headers = {}) => new Request(`${origin}/api/images`, { method: 'POST', headers: { 'content-type': type, ...headers }, body: bytes });
  const png = new Uint8Array([137,80,78,71,13,10,26,10]);
  assert.equal((await readImage(imageRequest('image/png', png))).contentType, 'image/png');
  await assert.rejects(readImage(imageRequest('image/jpeg', png)), { status: 415 });
  await assert.rejects(readImage(imageRequest('image/svg+xml', '<svg/>')), { status: 415 });
  await assert.rejects(readImage(imageRequest('image/png', png, { 'content-length': '5242881' })), { status: 413 });
  await assert.rejects(readImage(imageRequest('image/png', new Uint8Array(5242881))), { status: 413 });
});
