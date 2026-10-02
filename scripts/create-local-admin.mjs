import { getPlatformProxy } from 'wrangler';
import { createFirstAdmin } from '../lib/cloudflare/users.mjs';

const platform = await getPlatformProxy({
  configPath: 'wrangler.jsonc',
  persist: true,
  remoteBindings: false,
});

try {
  const email = platform.env.ADMIN_EMAIL;
  const password = platform.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Thiếu ADMIN_EMAIL hoặc ADMIN_PASSWORD trong .env/.env.local');
  }

  const existing = await platform.env.DB.prepare(
    `SELECT u.id,u.email,p.role,p.is_active
     FROM auth_users u JOIN user_profiles p ON p.id=u.id
     WHERE u.email=?`,
  ).bind(String(email).trim().toLowerCase()).first();

  if (existing) {
    console.log(`Local admin đã tồn tại: ${existing.email} (${existing.role})`);
  } else {
    const count = await platform.env.DB.prepare('SELECT count(*) AS total FROM auth_users').first();
    if (Number(count?.total || 0) > 0) {
      throw new Error('Local D1 đã có user khác. Hãy tạo user mới từ trang Cài đặt bằng ADMIN hiện có.');
    }
    const user = await createFirstAdmin(platform.env.DB, {
      email,
      password,
      name: 'Admin',
    });
    console.log(`Đã tạo local admin: ${user.email}`);
  }
} finally {
  await platform.dispose();
}
