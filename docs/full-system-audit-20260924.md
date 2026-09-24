# CitiLap Admin — Audit hệ thống và kế hoạch tối ưu

Ngày kiểm tra: 2026-09-24  
Phạm vi: Next.js 16 / React 19 / Supabase / API server-side / `InventoryContext`.

## Kết quả đã áp dụng

- `InventoryContext` chỉ tải laptops, orders và các dataset cần cho route hiện tại; không còn tải toàn bộ nghiệp vụ ở mọi màn hình.
- Các request độc lập của màn hình được khởi chạy đồng thời bằng `Promise.all`.
- Một bộ auth headers được dùng lại cho cả đợt tải, tránh gọi `getSession()` lặp lại cho từng request.
- Loading chính kết thúc ngay khi laptops/orders sẵn sàng; options, months, payments, warranty, customers và settings tiếp tục hoàn tất nền.
- API orders/inventory giữ enrichment theo batch (`in`) và `Promise.all`, tránh N+1 query theo từng dòng.
- Dữ liệu nhạy cảm tiếp tục được lọc ở server theo role; tối ưu frontend không thay đổi boundary bảo mật.

## Bản đồ hiện trạng đã kiểm tra

- 35 API route files trong `app/api`.
- 29 route có `requireUser`; các route còn lại là route nội bộ được gọi qua server flow hoặc cần rà quyền riêng trong đợt tiếp theo.
- 11 route đã có batching/parallel query rõ ràng.
- `InventoryContext` là lớp state nặng duy nhất; các trang Procurement, Logistics, QC, Repairs, Finance và Sales Operations đã tự tải dữ liệu page-scoped.
- Orders và Inventory vẫn dùng danh sách client-side để lọc/thể hiện bảng. Với dữ liệu lớn hơn vài nghìn dòng, cần chuyển filter/pagination xuống API trước khi cân nhắc virtualization.

## Điểm nghẽn còn lại và thứ tự xử lý

### P1 — đo bằng dữ liệu thật

1. Gắn timing server cho các route `inventory`, `orders`, `management-dashboard`, `payments` và `financial-operations`: auth, query chính, enrichment, serialize response.
2. Ghi nhận request count, response bytes và time-to-primary-data ở Dashboard, Inventory, Orders và Finance.
3. Dùng dữ liệu timing để quyết định endpoint nào cần rút gọn select hoặc pagination; chưa cắt field theo phỏng đoán để tránh làm hỏng UI/role policy.

### P1 — tải danh sách lớn

1. Thêm `limit`, `offset/cursor`, `search`, `status`, `location`, `monthKey` cho `/api/inventory` và `/api/orders`.
2. Giữ `all=true` chỉ cho các màn hình nghiệp vụ cần đối soát toàn bộ (QC/repairs/export), không dùng mặc định.
3. Trả metadata `total`, `hasMore`, `nextCursor` để UI không phải tải lại toàn bộ danh sách sau mỗi lần đổi bộ lọc.

### P2 — giảm render

1. Đo số row/DOM và thời gian render bảng bằng React Profiler trước khi thêm `useMemo` hoặc virtualization.
2. Tách row thành component memoized chỉ sau khi đo được rerender không cần thiết.
3. Debounce các ô search gọi server khi chuyển sang server-side search; search local hiện tại không tạo request mỗi phím.

### P2 — hợp nhất mutation

Các RPC order/payment/inventory hiện đã trả state cập nhật đủ để client đồng bộ. Khi thêm mutation mới, giữ nguyên quy tắc: validate + authorize + transaction + activity log + state cập nhật trong một response; không nối chuỗi 3–5 GET ở client.

## Rủi ro và giới hạn kiểm chứng

- Đây là audit static và build/lint verification; chưa có số đo production về latency, payload bytes hoặc Supabase query plan.
- Không thay đổi schema/migration trong đợt tối ưu tải này.
- Các migration `20260926_remove_legacy_gifts.sql` và `20260927_patch_order_rpc_after_gifts_removal.sql` vẫn phải được apply trên Supabase live trước khi kiểm thử sửa đơn hàng.

## Gate kiểm tra

- ESLint cho các file fetch/context: PASS.
- `next build`: PASS (compile, TypeScript, static generation).
- `git diff --check`: PASS.
- Browser/Supabase live timing: chưa đo trong workspace này.
