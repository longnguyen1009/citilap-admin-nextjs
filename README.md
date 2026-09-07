This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## MIGRATION INCREMENTAL

Với database đang có dữ liệu, không chạy lại `init_full_db.sql`. Chạy lần lượt các file trong `db/migrations/` bằng Supabase SQL Editor, đặc biệt:

1. `20260907_security_and_schema.sql`
2. `20260907_payments_finance_ledger.sql`

Migration thanh toán tạo RPC ghi giao dịch theo transaction, cập nhật công nợ và bổ sung bảng `payments`, `financial_records`.

`create_admin.js` khong luu credential trong source. Truoc khi chay, can dat `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL` va `ADMIN_PASSWORD` trong environment cua terminal.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## RESEED DATABASE (CHỈ DÙNG CHO MÔI TRƯỜNG DEV)

`init_full_db.sql` sẽ xóa toàn bộ schema `public` và toàn bộ dữ liệu nghiệp vụ. Không chạy file này trên production hoặc database đang có dữ liệu cần giữ lại.

Trình tự khởi tạo database dev:

1. Mở lại Supabase SQL Editor và dán toàn bộ nội dung mới nhất của file init_full_db.sql vào chạy. (Thao tác này sẽ reset lại DB, tạo bảng và cấp quyền truy cập đầy đủ).
2. Chạy tiếp file reseed_data.sql bên trong SQL Editor để chèn dữ liệu mẫu.
3. Cuối cùng, gõ lại lệnh này ở Terminal của VSCode để tạo tài khoản Admin: node create_admin.js
