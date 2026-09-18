# CitiLap Admin — Project Context

> Tài liệu hiện trạng kỹ thuật và nghiệp vụ. Cập nhật: 2026-09-17.

## 1. Mục đích hệ thống

CitiLap Admin là ứng dụng nội bộ quản lý laptop nhập khẩu từ Trung Quốc: nhập kho, định giá, theo dõi tồn, bán hàng, thu tiền, công nợ, tài chính, khách hàng và bảo hành/đổi trả. Ứng dụng phục vụ desktop là chính nhưng các bảng dữ liệu có xử lý cuộn ngang cho màn hình nhỏ.

## 2. Stack và cách chạy

- Next.js `16.3.2` App Router, React `19.2.8`, Turbopack khi chạy dev.
- Tailwind CSS 4 qua PostCSS, CSS giao diện chính ở `app/globals.css` và `app/globals.tw.css`.
- Supabase PostgreSQL + Supabase Auth email/password.
- UI tự xây dựng, Radix UI primitives và `lucide-react`.
- State dùng `AuthContext` và `InventoryContext`; fetch/API dùng `lib/apiClient.js`, `lib/apiFetchers.js`.
- Chạy: `npm.cmd install`, `npm.cmd run dev`; mặc định `http://localhost:3000`. Kiểm tra: `npm.cmd run lint`, `npm.cmd run build`.

## 3. Cấu trúc ứng dụng

```text
app/
  layout.js                         Root metadata/providers
  login/page.js                     Màn hình đăng nhập
  (dashboard)/layout.js             Layout yêu cầu đăng nhập
  (dashboard)/page.js               Dashboard
  (dashboard)/inventory/page.js    Quản lý laptop/tồn kho
  (dashboard)/orders/page.js       Quản lý đơn hàng
  (dashboard)/payments/page.js     Thanh toán và tài chính
  (dashboard)/customers/page.js    Khách hàng
  (dashboard)/warranty/page.js     Bảo hành/đổi trả
  (dashboard)/settings/page.js     Tùy chọn, tháng, user/preset
  api/*/route.js                    API server-side
components/pages/*                  UI nghiệp vụ của từng trang
layouts/MainLayout.jsx              Sidebar, header, điều hướng, logout
context/AuthContext.jsx             Auth/profile/role/user management
context/InventoryContext.jsx        State, load/save, mapping, refresh
lib/apiAuth.js                      Bearer auth, role checks, validation/sanitize
lib/services/dbService.js           Supabase data access và RPC nghiệp vụ
lib/services/logger.js              Activity log
db/migrations/*                     Migration nối tiếp sau init_full_db.sql
```

## 4. Authentication và phân quyền

1. `AuthContext` khởi tạo Supabase browser client từ `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Người dùng đăng nhập bằng `signInWithPassword`; JWT được Supabase lưu/refresh.
3. API nhận `Authorization: Bearer <JWT>`, `lib/apiAuth.js` gọi Supabase Auth để xác thực.
4. Profile được đọc từ `user_profiles` gồm `name`, `role`, `is_active`; user inactive bị từ chối.
5. UI lọc menu và field nhạy cảm; API vẫn là lớp bảo vệ bắt buộc.

Role hiện dùng: `ADMIN`, `SALES`, `TECH`, `TECHNICAL`, `STAFF`. Có mock login cho môi trường không kết nối Supabase (`ADMIN`, `SALES`, `TECH`); mock không được coi là cơ chế bảo mật production.

| Chức năng | ADMIN | SALES | TECH/TECHNICAL | STAFF |
|---|---:|---:|---:|---:|
| Dashboard, đọc tồn/đơn/khách | Có | Có | Có theo màn hình | Có theo policy |
| Tạo/sửa đơn, khách | Có | Có | Không | Theo API policy |
| Giá vốn, lợi nhuận, tài chính nhạy cảm | Có | Ẩn/giới hạn | Ẩn | Ẩn |
| Bảo hành/kỹ thuật | Có | Đọc tùy policy | Có | Đọc tùy policy |
| Settings, preset, users, month roll | Có | Không | Không | Không |

`MainLayout.jsx` hiện cần tiếp tục đối chiếu riêng việc hiển thị menu cho `TECHNICAL`; không nên dùng việc ẩn menu thay cho kiểm tra quyền ở API.

## 5. Luồng dữ liệu chính

- `InventoryContext` tải options, tháng, laptops, orders, customers, payments, financial records, stock movements, warranty cases và activity logs thông qua fetchers.
- Payload UI được map camelCase ↔ snake_case tại `lib/mappers.js`/`lib/services/dbService.js`.
- Khi Supabase không khả dụng, một số state có fallback localStorage; dữ liệu local chỉ dành cho development và không phải nguồn dữ liệu production.
- Sau mutation, context refresh các collection liên quan để đồng bộ UI.
- Trường nhạy cảm laptop gồm `priceRmb`, `shippingRmb`, `exchangeRate`, `importPriceVnd`, `wholesalePriceVnd`, `profitVnd`, `seller`, `warrantySupplier`; order nhạy cảm gồm `profitVnd`.

## 6. Màn hình và nghiệp vụ

### Dashboard
Hiển thị tổng quan tồn kho, giá trị, đơn hàng và các chỉ số vận hành theo tháng đang chọn.

### Inventory — `components/pages/Inventory.jsx`
Quản lý serial/tracking, model, trạng thái, vị trí, giá nhập, giá bán, phụ kiện, lịch sử linh kiện và thông tin bảo hành. Có bảng rộng, lọc/sort, form tạo/sửa, import CSV và thao tác kiểm tra kỹ thuật. Laptop đã khóa/bán không được sửa các field tài chính.

### Orders — `components/pages/Orders.jsx`
Tạo/sửa đơn, chọn laptop/khách hàng, loại bán online/offline, giao hàng, trạng thái đơn, tiền cọc/đã thu/COD/công nợ/phí thẻ và trade-in. RPC database chịu trách nhiệm cập nhật trạng thái laptop, chống double reservation và đồng bộ financials.

### Payments — `components/pages/Payments.jsx`
Ghi nhận payment theo order và financial record; hiển thị lịch sử thanh toán, dòng tài chính, phương thức, tham chiếu và người ghi nhận. Quy tắc số tiền và payment status được normalize/guard ở database.

### Customers — `components/pages/Customers.jsx`
CRUD thông tin khách hàng, tìm kiếm và liên kết khách với order/bảo hành.

### Warranty — `components/pages/Warranty.jsx`
Tạo và cập nhật case bảo hành/đổi trả gắn với laptop, serial, khách hàng và đơn gốc; theo dõi lỗi khách báo, tiếp nhận, trạng thái, chi phí và supplier. Migration gần nhất cho phép supplier dạng text.

### Settings — `components/pages/Settings.jsx`
Quản lý option labels (status, location, payment, delivery, warranty...), preset, user và chuyển tháng. Các hành động nhạy cảm giới hạn ADMIN.

## 7. API hiện có

`activity-logs`, `customers`, `financial-records`, `inventory`, `month-roll`, `months`, `options`, `orders`, `payments`, `presets`, `settings`, `stock-movements`, `users`, `warranty` nằm dưới `app/api/*/route.js`. Tất cả route cần bearer auth; route mutation phải dùng policy/validation ở server, không tin role hoặc field do client gửi.

Các RPC/transaction quan trọng gồm tạo/cập nhật order kèm inventory, normalize order financials, payment ledger, month roll và reservation/lock laptop. Schema gốc ở `init_full_db.sql`; migration phải chạy theo thứ tự ngày trong `db/migrations/` và cần xác nhận đã apply trên Supabase thật.

## 8. Database và nhất quán nghiệp vụ

- Bảng chính: `laptops`, `orders`, `customers`, `payments`, `financial_records`, `stock_movements`, `warranty_cases`, `app_options`, `presets`, `user_profiles`, `activity_logs`.
- Order có các nhóm tiền: `sale_price`, `deposit_amount`, `amount_paid`, `debt_amount`, `cod_amount`, `credit_card_fee`, `profit_vnd`; database giới hạn giá trị âm và chuẩn hóa payment status.
- Laptop được coi là committed/locked theo laptop usage và trạng thái order; không được gán cho order xung đột.
- Activity log ghi các thay đổi quan trọng; preset changes vẫn cần đánh giá nếu yêu cầu audit đầy đủ.

## 9. Migrations cần lưu ý

Theo thứ tự hiện có: payments/finance ledger, security/schema, order-inventory consistency, financial guards, remove cycle count, round2 fixes, manual payment status, warranty supplier text, month key và RPC month key. Không giả định migration đã chạy trên Supabase chỉ vì file tồn tại trong repo; cần kiểm tra migration history, RLS, trigger, RPC và dữ liệu cũ trên project thật.

## 10. QA và trạng thái xác minh

- Có Playwright/discovery scripts và ảnh kiểm tra trong `qa/`; kế hoạch kiểm thử ở `docs/qa/2026-09-16-test-plan.md` và `qa/codex-e2e-scenarios.md`.
- Đã có các đợt sửa validation, reservation conflict, locked laptop, CSV/cloud persistence, warranty routing và financial guards.
- Cần phân biệt: lint/build local chỉ xác nhận compile/static rules; chưa chứng minh Supabase live, RLS, RPC, auth role và dữ liệu production hoạt động đúng.
- Khi sửa tiếp: chạy test/focused flow, `npm.cmd run lint`, `npm.cmd run build`, rồi `git diff --check`.

## 11. Rủi ro và việc còn mở

1. Xác nhận tất cả migrations và RLS/trigger/RPC đã apply trên Supabase live.
2. Bổ sung pagination cho payments, financial records và stock movements nếu dữ liệu lớn.
3. Kiểm tra menu/API cho `TECHNICAL` nhất quán với `TECH`.
4. Bổ sung audit log cho thay đổi preset nếu cần truy vết đầy đủ.
5. Kiểm tra sort `GroupPanel` không ghi đè `sort_order` từ database.
6. Kiểm tra polling trong `EditableCell` không làm mất bản nháp đang sửa.
7. Rà soát responsive: bảng rộng cần sticky action/header, mobile ưu tiên card hoặc cột quan trọng; tránh layout bị tràn ngang ngoài vùng bảng.
8. Không hardcode credential; `.env` chỉ lưu local và phải thay key nếu từng bị lộ.

## 12. Biến môi trường

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

`SUPABASE_SERVICE_ROLE_KEY` chỉ được dùng server-side (`lib/supabaseAdmin.js`), tuyệt đối không import vào client component.

## 13. Quy ước làm việc

- Sửa root cause ở API/database thay vì chỉ ẩn lỗi trên UI.
- Giữ mapping field rõ ràng giữa camelCase UI và snake_case database.
- Không thêm logic quyền chỉ ở client.
- Mỗi batch remediation phải validate riêng và ghi rõ phần live chưa xác minh.
- Không commit hoặc thay đổi migration production nếu chưa được duyệt.