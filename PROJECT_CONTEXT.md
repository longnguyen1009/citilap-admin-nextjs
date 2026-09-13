# CitiLap Admin - Project Context

Tài liệu này mô tả trạng thái thực tế của project tại thời điểm rà soát ngày 13/09/2026. Dùng tài liệu này để định hướng thay đổi, kiểm tra quyền truy cập và tránh làm sai các quy tắc dữ liệu hiện có.

## 1. Mục tiêu sản phẩm

CitiLap Admin là dashboard nội bộ để quản lý kho laptop, đơn hàng, khách hàng, thanh toán, sổ tài chính, bảo hành và người dùng. Ứng dụng phục vụ nhiều vai trò nên dữ liệu nhạy cảm như giá vốn, nguồn nhập và lợi nhuận phải được lọc ở server trước khi trả về trình duyệt.

Các màn hình hiện có:

- `/`: Dashboard tổng quan, chỉ hiển thị cho `ADMIN`.
- `/inventory`: quản lý laptop, trạng thái kho, giá nhập và import dữ liệu.
- `/orders`: tạo/sửa đơn, giữ máy và đồng bộ trạng thái tồn kho.
- `/payments`: ghi nhận thanh toán và sổ thu chi; tài chính chi tiết dành cho `ADMIN`.
- `/customers`: quản lý thông tin khách hàng.
- `/warranty`: tiếp nhận và xử lý bảo hành/đổi trả.
- `/settings`: công thức giá, option động, preset và quản trị người dùng; chỉ `ADMIN`.

## 2. Tech stack và cấu trúc source

- **Framework:** Next.js `16.3.2`, App Router, React `19.2.8`, JavaScript/JSX.
- **UI:** CSS trong `app/globals.css`, `lucide-react`, `react-hot-toast`; layout chính ở `layouts/MainLayout.jsx`.
- **Backend:** Route Handler trong `app/api/**/route.js`.
- **Database/Auth:** Supabase PostgreSQL và Supabase Auth.
- **Client data layer:** `context/AuthContext.jsx` và `context/InventoryContext.jsx`.
- **Server data layer:** `lib/services/dbService.js`, mapper camelCase/snake_case và RPC PostgreSQL.
- **Browser API layer:** `lib/apiFetchers.js`; mọi request gửi Bearer token lấy từ Supabase session.
- **Bảo mật server:** `lib/apiAuth.js` xác thực token, đọc role từ `user_profiles`, sanitize payload và lọc field nhạy cảm. `lib/supabaseAdmin.js` chỉ được dùng ở server với `SUPABASE_SERVICE_ROLE_KEY`.
- **Alias import:** `@/*` trỏ về thư mục root qua `jsconfig.json`.

`app/(dashboard)` là route group dùng chung `MainLayout`. Các trang và component tương tác đều là Client Component. `MainLayout` redirect về `/login` khi chưa có user.

## 3. Xác thực và ma trận quyền

Role được chấp nhận trong schema/API là `ADMIN`, `SALES`, `TECH`, `TECHNICAL`, `STAFF`. `user_profiles` là nguồn quyền duy nhất ở server; không dùng `user_metadata` để cấp quyền.

| Khu vực/API | ADMIN | SALES | TECH/TECHNICAL/STAFF |
| --- | --- | --- | --- |
| Dashboard, settings, users, financial records | Có | Không | Không |
| Inventory | Có | Có | Có |
| Orders, payments, customers | Có | Có | Không |
| Warranty, stock movements, activity logs | Có | Có | Có |
| Đọc `app_options`, presets | Có | Có | Có |
| Ghi/xóa `app_options`, presets | Có | Không | Không |

Khi Supabase không được cấu hình, mock auth chỉ được phép nếu `NEXT_PUBLIC_ALLOW_MOCK_AUTH=true`. Không được bật biến này trong production.

## 4. Mô hình dữ liệu và nghiệp vụ

### Bảng chính

- `user_profiles`: tên, role, trạng thái hoạt động, liên kết `auth.users`.
- `laptops`: serial, model/category, vị trí, trạng thái, giá RMB, phí vận chuyển, tỷ giá, giá nhập, giá bán, tình trạng linh kiện, bảo hành và lịch sử linh kiện.
- `orders`: khách hàng, laptop, giá bán, cọc, COD, đã thu, công nợ, phương thức thanh toán, giao hàng, trạng thái và lợi nhuận.
- `customers`: tên, số điện thoại, địa chỉ.
- `payments`: các giao dịch cọc, số dư, COD, hoàn tiền hoặc khoản khác.
- `financial_records`: thu/chi/hoàn tiền/điều chỉnh, có thể liên kết order, payment hoặc laptop.
- `warranty_cases`: lỗi báo, chẩn đoán, chi phí sửa, linh kiện thay, cách xử lý và người phụ trách.
- `stock_movements`: lịch sử nhập, giữ, bán, trả, bảo hành và thay đổi vị trí kho.
- `activity_logs`: audit log append-only cho các entity `LAPTOP`, `ORDER`, `CUSTOMER`, `WARRANTY`, `STOCK_MOVEMENT`, `SETTING`, `OPTION`, `PAYMENT`, `FINANCIAL_RECORD`.
- `app_settings`: cấu hình công thức giá và preset.
- `app_options`: label/option động cho trạng thái, loại đơn, phương thức thanh toán, danh mục và các dropdown.

### Luồng quan trọng

1. **Tạo/sửa laptop:** UI tính giá nhập và lợi nhuận, gửi payload đã lọc lên `/api/inventory`; server kiểm tra số không âm, ghi dữ liệu và activity log. Xóa laptop là soft delete (`is_active=false`), không xóa vật lý nếu đã có order/bảo hành.
2. **Tạo/sửa order:** tạo mới và cập nhật dùng RPC `create_order_with_inventory`/`update_order_with_inventory` để khóa laptop, cập nhật tồn kho và ghi stock movement trong cùng transaction.
3. **Ghi payment:** RPC `record_order_payment` cập nhật `payments`, `orders.amount_paid`, `orders.debt_amount` và trạng thái thanh toán; API ghi audit cho payment và order.
4. **Bảo hành:** tạo case gắn với laptop/order, cập nhật condition note của laptop và tạo stock movement.
5. **Đồng bộ UI:** `InventoryContext` tải dữ liệu ban đầu qua API, lưu một số cấu hình vào localStorage và refresh cloud mỗi 60 giây. Hàm `subscribeRealtimeChanges` phía browser hiện là no-op để tránh mở trực tiếp RLS cho dữ liệu nhạy cảm.

## 5. Quy ước dữ liệu

- Database dùng snake_case; UI dùng camelCase. Mapper nằm trong `lib/services/dbService.js`.
- Các trạng thái nghiệp vụ nên được lưu bằng stable key trong `lib/fieldOptions.js`; label chỉ dành cho hiển thị.
- Các trường tiền hiện dùng đơn vị **triệu VNĐ** theo README và form; giá nguồn nhập dùng RMB, có tỷ giá và phí vận chuyển.
- Công thức mặc định trong `InventoryContext`: `shippingVnd=400000`, `divisor=1000000`, `defaultRate=3550`; có thể chỉnh qua settings.
- `activity_logs` không được update/delete sau khi ghi. Audit nên ghi cả thay đổi trước và sau.
- Payload client phải loại bỏ field chỉ dùng cho UI trước khi gửi Supabase. Field nhạy cảm phải được lọc server theo role, không chỉ ẩn bằng CSS.

## 6. Database migration và môi trường

Với database đã có dữ liệu, chạy lần lượt trong Supabase SQL Editor:

1. `db/migrations/20260907_security_and_schema.sql`
2. `db/migrations/20260907_payments_finance_ledger.sql`
3. `db/migrations/20260908_order_inventory_consistency.sql`

`init_full_db.sql` là script khởi tạo/reset toàn bộ schema và dữ liệu; chỉ dùng cho database development. `reseed_data.sql` chỉ dùng để nạp dữ liệu mẫu sau khi reset.

Các biến môi trường cần có trong local/deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` cho script tạo admin/QA
- `NEXT_PUBLIC_ALLOW_MOCK_AUTH` chỉ bật rõ ràng ở môi trường phát triển nếu cần mock login

Lệnh chính:

```bash
npm run dev
npm run lint
npm run build
```

## 7. Hiện trạng kiểm tra

- `npm.cmd run lint`: không có lỗi, còn 1 warning `react-hooks/exhaustive-deps` tại `context/InventoryContext.jsx:740` cho dependency `applyAndSaveLaptopStatuses`.
- `npm.cmd run build`: biên dịch thành công và qua bước TypeScript; môi trường Windows hiện lỗi `spawn EPERM` ở bước collect page data do không tạo được worker. Cần xác nhận lại trên máy/CI có quyền spawn process.
- Có các Playwright spec trong `qa/` (`qa-loop`, `single-flow`, khám phá flow/form), nhưng package chưa có script E2E chuẩn và root chưa có cấu hình Playwright rõ ràng.
- Thư mục `tests/` hiện chưa có bộ unit/integration test đáng kể.

## 8. Yêu cầu cần cải thiện

### Ưu tiên P0 - an toàn và đúng dữ liệu

1. **Thống nhất role model:** thay thế cách kiểm tra role rải rác bằng một policy map dùng chung cho UI và API; quyết định rõ có giữ `STAFF`, `TECH` và `TECHNICAL` hay hợp nhất chúng.
2. **Hoàn thiện option key/label:** `fieldOptions.js` mô tả stable key nhưng `labelToKey`, `resolveLabel` và `readCustomConfig` hiện còn helper tối giản. Cần lưu key ổn định trong DB, hiển thị label tùy biến và có migration cho dữ liệu đang lưu label.
3. **Bảo vệ tính nhất quán thanh toán:** bổ sung kiểm tra idempotency, hoàn tiền, thanh toán vượt giá trị đơn, race condition và đối soát giữa `payments`, `orders` và `financial_records`.
4. **Giảm fire-and-forget mutation:** các thao tác cập nhật nền trong `InventoryContext` cần trả kết quả rõ ràng, retry có giới hạn và refresh lại bản ghi khi server từ chối; tránh UI hiển thị thành công lâu hơn dữ liệu thật.
5. **Kiểm tra quyền theo môi trường:** thêm test API cho 401/403, field nhạy cảm và mock auth; tuyệt đối không để service role key vào bundle client.

### Ưu tiên P1 - khả năng vận hành

1. Thêm pagination, filter theo tháng/trạng thái và index cho các bảng lớn; hiện nhiều API có thể tải toàn bộ dữ liệu.
2. Quyết định cơ chế đồng bộ: triển khai realtime qua server-safe channel hoặc ghi rõ polling 60 giây là lựa chọn chính thức, kèm nút refresh và trạng thái stale/error.
3. Chuẩn hóa error envelope, logging có request id và thông báo lỗi thân thiện; hiện nhiều fetcher trả `null` nên khó phân biệt mất mạng, 401 và lỗi server.
4. Bổ sung audit cho mọi thao tác quản trị và lưu user id cùng user name; tên hiển thị có thể thay đổi nên không đủ làm định danh.
5. Tách logic tính giá, mapping, policy và nghiệp vụ order khỏi `InventoryContext` lớn để giảm coupling và dễ kiểm thử.
6. Cập nhật README: phần hướng dẫn mặc định vẫn nhắc `app/page.js`, trong khi project thực tế dùng `app/(dashboard)/page.js`.

### Ưu tiên P2 - chất lượng sản phẩm

1. Sửa warning hook tại `context/InventoryContext.jsx:740`.
2. Thêm unit test cho mapper, parse số tiền, công thức giá, sanitize payload, role matrix và trạng thái order/inventory.
3. Thêm `playwright.config.*`, script `npm run test:e2e`, seed/cleanup an toàn và chạy QA trong CI có Supabase test project.
4. Bổ sung kiểm tra accessibility, keyboard navigation, responsive mobile và empty/loading/error state cho từng màn hình.
5. Cân nhắc chuyển schema/payload sang TypeScript hoặc generated Supabase types để bắt lỗi tên cột và kiểu dữ liệu trước khi deploy.
6. Bổ sung monitoring cho lỗi API, lỗi đồng bộ optimistic update và các job reconcile tồn kho.

## 9. Quy tắc khi phát triển tiếp

- Đọc tài liệu Next.js trong `node_modules/next/dist/docs/` trước khi thay đổi API/framework behavior theo yêu cầu của `AGENTS.md`.
- Không chạy lại `init_full_db.sql` trên production hoặc database có dữ liệu cần giữ.
- Mọi Route Handler phải xác thực Bearer token bằng `requireUser` trước khi đọc/ghi.
- Không import `lib/supabaseAdmin.js` vào Client Component.
- Khi thêm field: cập nhật schema/migration, mapper, payload allow-list, UI, validation và audit log cùng một thay đổi.
- Khi thay đổi status/option: giữ stable key tương thích với các constant trong `lib/fieldOptions.js`, đồng thời cập nhật migration và test.
- Sau thay đổi nghiệp vụ order/payment/inventory, chạy lint, build và flow E2E có dữ liệu test trước khi merge.
