# Fix Plan — CitiLap Admin (16/09/2026)

Tài liệu này liệt kê toàn bộ bug đã xác minh kèm cách sửa cụ thể, file cần đổi và thứ tự ưu tiên.

Tham chiếu: `PROJECT_CONTEXT.md` mục 10 (bug list) và mục 11 (hiểu biết kiến trúc).

## Trạng thái hoàn thành (cập nhật 17/09/2026)
- FIXED: 01, 02, 03, 04, 05, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16
- OPEN: 17 (hardcoded Google Sheet URL — cần chuyển sang .env, deployment config)
- NOTE: FIX-06 — dynamic options đã có sẵn trong context qua `dynamicOptions` + `useInventory()`, các component chính đã dùng context thay vì static constants.

## Round 2 — Fixes bổ sung 17/09/2026

### Orders.jsx (6 fixes)
1. ✅ Confirmation dialog trước khi hủy/trả đơn hàng
2. ✅ Phân biệt audit trail: `returnedAt`/`returnReason` vs `cancelledAt`/`cancelReason`
3. ✅ Truyền `appOptions` vào `isOrderCommitted`/`isOrderCancelled` (4 chỗ Orders + 4 chỗ Context + 1 Warranty)
4. ✅ Không tự động ghi đè `codAmount` khi đổi máy (cả inline table + modal form)
5. ✅ Wire nút Xóa đơn (Trash2 icon) + nút Lịch sử (History icon) trong modal
6. ✅ Clamp `codAmount` = `min(codAmount, salePrice - amountPaid)` thay vì `salePrice`

### Payments.jsx (4 fixes)
7. ✅ Hiển thị label thay vì raw key cho paymentMethod và recordType
8. ✅ Input số tiền disable khi chưa chọn đơn + hiển thị số tiền còn nợ
9. ✅ Thêm metric "Thực thu" (income - refund) cho rõ ràng

### apiAuth.js (1 fix)
10. ✅ Thêm `returnedAt`/`returnReason` vào `ORDER_PAYLOAD_KEYS`

### DB Migration (1 mới)
11. ✅ `20260916_return_audit_trail.sql` — thêm cột + patch RPC functions

### Context/Shared (4 fixes)
12. ✅ `Promise.all` ở `updateFormulaConfig` — tách ra ngoài `setLaptops` updater
13. ✅ `Promise.all` ở `rollForwardMonth` — thêm `safeFetch` wrapper
14. ✅ `alert()` → `toast()` trong `InventoryContext.jsx` error path (lazy import)
15. ✅ Truyền `appOptions` vào tất cả `isOrderCommitted`/`isReservationActive` calls trong context

### UI Polish (3 fixes)
16. ✅ `alert()` → `toast()` trong Inventory.jsx (11 chỗ), Customers.jsx, Warranty.jsx, UserManagementSection.jsx
17. ✅ UserModal.jsx: Fix dark mode border color (onBlur hardcodes → CSS variable)
18. ✅ UserModal.jsx: Footer border dùng `var(--glass-border)` thay vì hardcoded `#f1f5f9`

---

## P0 — Sửa ngay (bảo mật & đúng dữ liệu)

### FIX-01: `is_active = null` passes auth

**File:** `lib/apiAuth.js:21`
**Hiện tại:**
```js
if (!dbProfile || dbProfile.is_active === false) return null;
```
**Sửa thành:**
```js
if (!dbProfile || dbProfile.is_active === false || dbProfile.is_active === null) return null;
```
Hoặc ngắn hơn: `if (!dbProfile || !dbProfile.is_active) return null;`
Lưu ý: cần đảm bảo DB schema set default `is_active = true` cho mọi user hiện có, nếu không user nào có `is_active = null` sẽ bị khóa.

**Ảnh hưởng:** Rất cao. Chỉ thay đổi auth logic, không ảnh hưởng UI.

---

### FIX-02: `Boolean("false")` bug trong options

**File:** `app/api/options/route.js:104`
**Hiện tại:**
```js
if (payload.is_active !== undefined) updates.is_active = Boolean(payload.is_active);
```
**Sửa thành:**
```js
if (payload.is_active !== undefined) {
  updates.is_active = payload.is_active === true || payload.is_active === 'true';
}
```

**Ảnh hưởng:** Thấp. Chỉ ảnh hưởng API cập nhật option.

---

### FIX-03: SALES có thể sửa bất kỳ order

**File:** `app/api/orders/route.js` — trong POST handler, sau dòng 74 (trước khi gọi `saveOrderToCloud`)
**Thêm kiểm tra ownership:**
```js
if (!isAdmin && oldData) {
  // SALES chỉ được sửa order mình tạo (kiểm tra created_by hoặc cho phép tất cả nếu không có field created_by)
  // Tạm thời: chỉ cho phép SALES sửa order của tháng hiện tại
  const currentMonth = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`;
  // Hoặc đơn giản hơn: không cần check nếu business cho phép
}
```
Cần xác nhận yêu cầu nghiệp vụ: SALES có được sửa order của người khác không?
Nếu không → thêm guard: `if (!isAdmin && oldData && oldData.created_by !== profile.name) return 403`.
Trường `created_by` hiện được ghi bởi `saveOrderToCloud(order, profile.name)` → xem RPC có lưu `recordedBy` vào order không.

**Ảnh hưởng:** Trung bình. Thay đổi logic update order.

---

### FIX-04: `saveWarrantyCaseToCloud` trả `false` thay vì throw

**File:** `lib/services/dbService.js:310-311`
**Hiện tại:**
```js
const { data, error } = await client.from('warranty_cases').upsert(dbRow).select().single();
if (error || !data) return false;
```
**Sửa thành:**
```js
const { data, error } = await client.from('warranty_cases').upsert(dbRow).select().single();
if (error || !data) throw new Error(error?.message || 'Không thể lưu bảo hành');
```
Sau đó sửa caller `app/api/warranty/route.js:33`:
```js
// trước: if (!data) return NextResponse.json(...)
// sau:  (không cần check false nữa vì đã throw)
```

**Ảnh hưởng:** Thấp. Chỉ thay đổi error handling.

---

### FIX-05: `rollForwardMonth` so sánh month_key sai khi khác năm

**File:** `lib/services/dbService.js:513,523` — hàm `rollForwardMonth`
**Vấn đề:** `.lt('month_key', newMonthKey)` so sánh chuỗi `MM/YYYY`. `"12/2023" < "01/2024"` là `false` (vì `"12" > "01"`), nên item từ 12/2023 không được roll sang 01/2024.

**Cách sửa — đổi sang parse tháng/năm:**
```js
// Helper mới (thêm vào dbService.js)
const parseMonthKey = (mk) => {
  if (!mk) return null;
  const [m, y] = String(mk).split('/').map(Number);
  if (!m || !y) return null;
  return y * 100 + m; // ví dụ "01/2024" → 202401, "12/2023" → 202312
};

const parseNewMonth = parseMonthKey(newMonthKey);
```
Sau đó thay `.lt('month_key', newMonthKey)` bằng fetch về application-level filter:
```js
// Option A: Fetch all open items, filter ở JS
const { data: allOpen } = await client
  .from('laptops')
  .select('id, month_key')
  .in('status', OPEN_LAPTOP_STATUS)
  .eq('is_active', true);

const toMove = (allOpen || []).filter(r => {
  const mk = parseMonthKey(r.month_key);
  return mk !== null && mk < parseNewMonth;
});

if (toMove.length > 0) {
  await client.from('laptops')
    .update({ month_key: newMonthKey, updated_at: new Date().toISOString() })
    .in('id', toMove.map(r => r.id));
}
```
Tương tự cho orders.

**Option B (migration):** Đổi DB schema từ `MM/YYYY` sang `YYYY-MM` để string comparison hoạt động đúng. Cần migration + update toàn bộ code.

**Khuyến nghị:** Option A (không cần migration, sửa nhanh). Option B tốt hơn về lâu dài nhưng cần migration.

**Ảnh hưởng:** Trung bình. Cần test kỹ vì ảnh hưởng đến dữ liệu khi roll tháng.

---

## P1 — Sửa sớm (logic & UX)

### FIX-06: Module-level OPTIONS lấy dữ liệu cũ

**File:** `context/InventoryContext.jsx:89-106`
**Vấn đề:** `STATUS_OPTIONS`, `LOCATION_OPTIONS`... tính 1 lần khi module load. Các constant này cũ nếu `appOptions` thay đổi.

**Sửa:** Thay vì export constant module-level, tạo hook `useOptions(groupKey)` đọc từ `appOptions` context:
```js
// Thêm vào InventoryContext.jsx
export function useOptionLabels(groupKey) {
  const { appOptions } = useContext(InventoryContext);
  return useMemo(() => getOptionLabels(groupKey, appOptions), [groupKey, appOptions]);
}
```
Các component import `STATUS_OPTIONS`... chuyển sang dùng `useOptionLabels('laptopStatus')`.
Giữ nguyên constant cũ cho backward compatibility nhưng đánh dấu deprecated.

**Ảnh hưởng:** Lớn (cần sửa nhiều file import). Nhưng nếu chỉ thêm hook mới và sửa từng file, rủi ro thấp.

---

### FIX-07: `Promise.all` crash khi 1 fetcher throw

**File:** `context/InventoryContext.jsx:491`
**Sửa:** Dùng `Promise.allSettled`:
```js
const results = await Promise.allSettled([...]);
// Xử lý results[i].status === 'fulfilled' / 'rejected'
```
Hoặc bọc từng fetcher trong try/catch, trả null khi lỗi (pattern hiện tại của fetcher).

---

### FIX-08: CSV export lệch cột

**File:** `components/pages/Inventory.jsx:515-533`
**Sửa:** Thêm `wholesalePriceVnd` và `retailPriceVnd` vào mảng `selling`:
```js
selling.push(
  item.wholesalePriceVnd || '',
  item.retailPriceVnd || '',
  item.trackingCode || ''
);
```

---

### FIX-09: Order table gửi label thay vì key

**File:** `components/pages/Orders.jsx:1069+`
**Sửa:** Thay `<select value={getLabel(...)}>` bằng `<select value={ord.orderStatus}>`. Khi `onChange`, dùng key trực tiếp thay vì label.

Cần sửa nhiều `<select>` trong bảng: orderStatus, paymentStatus, deliveryStatus, paymentMethod.

**Ảnh hưởng:** Lớn. Cần xác minh mọi `<select>` và test.

---

### FIX-10: Login `isSubmitting` không reset

**File:** `components/pages/Login.jsx:37-38`
**Sửa:**
```js
} else {
  setIsSubmitting(false); // thêm dòng này
  router.replace('/');
}
```

---

### FIX-11: Password type="text" → type="password"

**File:** `components/pages/UserModal.jsx:145`
**Sửa:** Đổi `type="text"` thành `type="password"`.

**Ảnh hưởng:** Rất thấp. 1 dòng.

---

### FIX-12: Không có Error Boundary

**Thêm file mới:** `components/ErrorBoundary.jsx`
```jsx
'use client';
import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: 20 }}>
        <h2>Đã xảy ra lỗi</h2>
        <pre>{this.state.error?.message}</pre>
        <button onClick={() => this.setState({ hasError: false })}>Thử lại</button>
      </div>;
    }
    return this.props.children;
  }
}
```
Wrap trong `app/layout.js` hoặc `components/Providers.jsx`.

---

## P2 — Cải thiện (hiệu suất & chất lượng)

### FIX-13: Customer phone dedup quét toàn bộ bảng
**File:** `app/api/customers/route.js:54-57`
**Sửa:** Dùng SQL function normalize phone, index trên normalized_phone, hoặc filter bằng `.like()` thay vì fetch all.
```js
// Thay fetch all bằng:
const { data: candidates } = await supabase
  .from('customers')
  .select('id, phone')
  .neq('id', customerData.id || 0)
  .ilike('phone', `%${normalizedPhone.slice(-8)}%`);
```
Hoặc tạo PostgreSQL function `normalize_phone(text)` và index.

### FIX-14: Pagination cho các GET endpoints lớn
**File:** Mọi route GET (orders, inventory, customers, warranty, stock-movements, activity-logs).
**Sửa:** Thêm `?page=1&limit=50` params và `.range(start, end)` trong Supabase query.

### FIX-15: `alert()` → `toast()`
**File:** Inventory.jsx, Orders.jsx (nhiều chỗ).
**Sửa:** Thay `alert(...)` bằng `toast.error(...)` (react-hot-toast đã cài).

### FIX-16: Duplicate CSS `border` trong UserModal
**File:** `UserModal.jsx:170-171,213`
**Sửa:** Xóa dòng duplicate.

### FIX-17: Hardcoded Google Sheet URL
**File:** `Inventory.jsx:546`
**Sửa:** Di chuyển URL sang `.env` hoặc `app_settings`.

---

## Thứ tự thực hiện đề xuất

| Bước | Fix | Ước tính thời gian | Rủi ro |
|------|-----|---------------------|--------|
| 1 | FIX-01 (is_active null) | 5 phút | Thấp |
| 2 | FIX-02 (Boolean "false") | 2 phút | Rất thấp |
| 3 | FIX-11 (password type) | 1 phút | Rất thấp |
| 4 | FIX-10 (isSubmitting) | 2 phút | Rất thấp |
| 5 | FIX-04 (warranty throw) | 5 phút | Thấp |
| 6 | FIX-05 (month comparison) | 30 phút | Trung bình |
| 7 | FIX-03 (order ownership) | 15 phút | Trung bình (cần xác minh nghiệp vụ) |
| 8 | FIX-07 (Promise.allSettled) | 10 phút | Thấp |
| 9 | FIX-08 (CSV export) | 10 phút | Thấp |
| 10 | FIX-12 (Error Boundary) | 15 phút | Thấp |
| 11 | FIX-09 (label→key) | 1 giờ | Trung bình |
| 12 | FIX-06 (dynamic OPTIONS) | 1 giờ | Trung bình |
| 13-17 | P2 fixes | 2 giờ | Thấp |

**Tổng ước tính:** ~6 giờ cho toàn bộ (P0 + P1 + P2).

## Cách xác minh sau khi sửa

1. Chạy `npm run lint` — không lỗi mới.
2. Chạy `npm run build` — thành công.
3. Chạy kịch bản E2E trong `qa/codex-e2e-scenarios.md` qua Codex + Playwright MCP.
4. Kiểm tra thủ công: tạo order, sửa order, roll month, tạo user, login/logout.
