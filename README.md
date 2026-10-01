# CitiLap Admin

Ứng dụng vận hành nội bộ chạy Next.js full-stack trên Cloudflare Workers.

## Kiến trúc hiện tại

- Runtime và frontend: Next.js 16 qua OpenNext for Cloudflare.
- Database và session: Cloudflare D1, binding `DB`.
- Ảnh: Cloudflare R2, binding `IMAGES_BUCKET`.
- Next.js incremental cache: R2, binding `NEXT_INC_CACHE_R2_BUCKET`.
- Auth: session cookie HttpOnly; user, profile và session lưu trong D1.

Ứng dụng không còn dependency runtime Vercel hoặc Supabase. Các migration PostgreSQL cũ chỉ được giữ làm nguồn lịch sử để xây schema và kiểm tra parity; không dùng để deploy runtime mới.

## Phát triển

```powershell
npm.cmd install
npm.cmd run cf:migrate:local
npm.cmd run cf:dev
```

## Kiểm tra

```powershell
npm.cmd run lint
npm.cmd run cf:test
npm.cmd run cf:test:runtime
npm.cmd run cf:test:views
npm.cmd run cf:coverage -- --require-complete
npm.cmd run cf:build
npx.cmd wrangler deploy --dry-run
git diff --check
```

## Khởi tạo môi trường Cloudflare

Các tài nguyên và binding được khai báo trong `wrangler.jsonc`. Áp dụng D1 migrations trước khi chạy Worker:

```powershell
npx.cmd wrangler d1 migrations apply DB --remote
npx.cmd wrangler secret put BOOTSTRAP_TOKEN
```

Sau khi deploy, gọi `/api/auth/bootstrap` đúng một lần để tạo ADMIN đầu tiên, rồi xóa secret bootstrap:

```powershell
npx.cmd wrangler secret delete BOOTSTRAP_TOKEN
```

Không ghi token, mật khẩu hoặc secret vào repository. Trạng thái chuyển đổi nằm tại `docs/cloudflare/STATUS.md`.
