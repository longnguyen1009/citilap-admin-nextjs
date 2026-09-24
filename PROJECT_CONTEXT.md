# CitiLap Admin — Operations Expansion Specification

> **Định hướng hiện hành — 2026-09-22:** Tạm hoãn CRM. Sau 9 phase đã phát triển, ưu tiên chạy thử vận hành thực tế, đơn giản hóa quy trình và cải tiến UI theo [kế hoạch chạy thử](docs/operations-pilot-plan.md). Kế hoạch này được ưu tiên hơn các chỉ dẫn bắt đầu Phase 1 và roadmap CRM bên dưới. Kết quả hoàn tất Phase 8–9 được ghi ở mục 109–110; lịch sử spec được giữ để tra cứu, không phải yêu cầu triển khai thêm ngay.

> Tài liệu yêu cầu cải tiến hệ thống dựa trên hiện trạng CitiLap Admin ngày 2026-09-17.
> Mục tiêu: mở rộng từ hệ thống quản lý tồn kho/đơn hàng thành hệ thống quản trị vận hành toàn diện cho mô hình kinh doanh laptop cũ nhập từ Trung Quốc.

---

# 1. Mục tiêu tổng thể

CitiLap Admin hiện đã quản lý được:

* Inventory
* Orders
* Customers
* Payments
* Financial Records
* Warranty
* Settings
* Users/Roles
* Activity Logs
* Month Roll

Giai đoạn tiếp theo cần bổ sung lớp nghiệp vụ phía trước và phía sau quá trình bán hàng.

Luồng tổng thể mong muốn:

```text
SUPPLIER
   ↓
PURCHASE BATCH
   ↓
PURCHASE ITEMS
   ↓
CHINA WAREHOUSE
   ↓
SHIPMENT
   ↓
VIETNAM RECEIVING
   ↓
QC / TECHNICAL INSPECTION
   ↓
AVAILABLE INVENTORY
   ↓
RESERVATION
   ↓
ORDER
   ↓
DELIVERY
   ↓
PAYMENT
   ↓
COD RECONCILIATION
   ↓
COMPLETED
```

Nhánh lỗi phía nhập hàng:

```text
QC FAILED
   ↓
SUPPLIER RETURN
   ↓
RETURN SHIPMENT
   ↓
SUPPLIER RECEIVED
   ↓
REFUND / REPLACEMENT
```

Nhánh hậu mãi:

```text
CUSTOMER
   ↓
WARRANTY CASE
   ↓
RECEIVING
   ↓
TECHNICAL CHECK
   ↓
REPAIR / EXCHANGE / RETURN
   ↓
WARRANTY COST
   ↓
COMPLETED
```

Hệ thống cuối cùng phải giúp ADMIN trả lời nhanh 5 câu hỏi:

1. Hiện CitiLap có bao nhiêu tài sản và tiền nằm ở đâu?
2. Laptop nào đang ở đâu và trạng thái gì?
3. Máy nào đang gây vấn đề hoặc tồn quá lâu?
4. Thực tế CitiLap đang lời/lỗ bao nhiêu?
5. Hôm nay có việc gì cần xử lý?

---

# 2. Nguyên tắc triển khai bắt buộc

Không rewrite toàn bộ hệ thống.

Phải mở rộng trên kiến trúc hiện tại:

```text
Next.js 16
React 19
Supabase PostgreSQL
Supabase Auth
API server-side
InventoryContext
lib/apiClient.js
lib/apiFetchers.js
lib/services/dbService.js
```

Các nguyên tắc:

* Không đưa business-critical logic chỉ vào UI.
* Validation quan trọng phải nằm API/database.
* Transaction nhiều bảng phải ưu tiên PostgreSQL RPC.
* Không tin role do client gửi.
* Không tin financial field do client tự tính.
* Không expose `SUPABASE_SERVICE_ROLE_KEY`.
* Giữ camelCase UI ↔ snake_case database.
* Không phá API hiện tại nếu chưa cần thiết.
* Migration phải additive nếu có thể.
* Không sửa migration production cũ.
* Migration mới phải đặt trong `db/migrations/`.
* Không giả định migration đã apply trên Supabase live.
* Mutation quan trọng phải ghi activity log.
* Financial data chỉ ADMIN được xem đầy đủ.
* TECH/TECHNICAL không được thấy giá vốn/lợi nhuận.
* SALES chỉ thấy dữ liệu tài chính đúng phạm vi policy.

---

# 3. Supplier Management

## 3.1 Mục tiêu

Tạo hồ sơ nhà cung cấp để liên kết toàn bộ:

```text
Supplier
→ Purchases
→ Laptops
→ QC
→ Returns
→ Refunds
→ Supplier Payments
```

Không dùng supplier chỉ như một text field.

---

# 4. Database: suppliers

Tạo bảng:

```sql
suppliers
```

Đề xuất field:

```text
id UUID PK

code
name
display_name

wechat_name
wechat_id
phone

country
province
city
address

bank_name
bank_account_name
bank_account_number

alipay_account

notes

is_active

created_at
updated_at
created_by
```

Có thể có:

```text
preferred_shipping_destination
```

enum/value:

```text
YUNNAN
GUANGXI
OTHER
```

Không lưu credential/password.

---

# 5. Supplier analytics

Hệ thống cần tính được:

```text
total_purchases
total_laptops
total_purchase_rmb

qc_failed_count
supplier_return_count
repaired_main_count

refund_pending_rmb
supplier_debt_rmb
```

Các metric có thể query/view thay vì lưu trực tiếp.

Quan trọng:

Không lưu các aggregate dễ stale nếu có thể tính bằng SQL.

---

# 6. Supplier detail page

Ví dụ route:

```text
/suppliers
/suppliers/[id]
```

Supplier detail gồm:

```text
Thông tin NCC
Purchase history
Laptop history
QC issues
Supplier returns
Payments
Refunds
Notes
```

Hiển thị thống kê:

```text
Tổng máy mua
Tổng RMB
Số máy lỗi
Tỷ lệ QC fail
Số main sửa
Số máy trả
Refund đang chờ
Công nợ
```

---

# 7. Purchase Batch / Lô nhập hàng

Đây là module ưu tiên cao nhất.

Hiện laptop chứa thông tin giá nhập nhưng thiếu khái niệm một lần mua hàng.

Cần bổ sung:

```text
purchase_batches
purchase_items
```

---

# 8. purchase_batches

Đề xuất:

```text
id
batch_code

supplier_id

purchase_date

currency
exchange_rate

subtotal_rmb
domestic_shipping_rmb
other_cost_rmb
total_rmb

paid_rmb
debt_rmb

destination

status

notes

created_by
created_at
updated_at
```

`batch_code` tự sinh dạng:

```text
CN-20260920-001
```

Không dựa hoàn toàn vào client để sinh unique code.

---

# 9. Purchase status

Đề xuất:

```text
DRAFT
CONFIRMED
PARTIALLY_PAID
PAID
IN_TRANSIT_CN
AT_CN_WAREHOUSE
IN_TRANSIT_VN
RECEIVED
PARTIALLY_RECEIVED
CLOSED
CANCELLED
```

Không cho client tùy ý chuyển status.

API/database phải validate state transition.

Ví dụ:

```text
DRAFT → CONFIRMED
CONFIRMED → PARTIALLY_PAID
PARTIALLY_PAID → PAID
CONFIRMED → IN_TRANSIT_CN
...
```

---

# 10. purchase_items

Mỗi laptop mua thuộc một purchase item.

Fields:

```text
id
purchase_batch_id

supplier_item_ref

brand
model

cpu
gpu
ram
ssd
screen

serial
supplier_serial

purchase_price_rmb

expected_condition
supplier_notes

status

laptop_id nullable

created_at
updated_at
```

Không bắt buộc có serial ngay khi tạo purchase.

Cho phép:

```text
serial = NULL
```

sau đó bổ sung khi supplier gửi serial hoặc khi nhận máy.

---

# 11. Supplier Payments

Không nên dùng `paid_rmb` đơn thuần nếu muốn audit tốt.

Tạo:

```text
supplier_payments
```

Fields:

```text
id
supplier_id
purchase_batch_id nullable

amount_rmb
amount_vnd nullable

exchange_rate nullable

payment_method
payment_reference

payment_date

notes

created_by
created_at
```

Payment method:

```text
WECHAT
ALIPAY
BANK_TRANSFER
CASH
OTHER
```

`purchase_batches.paid_rmb` có thể tính từ ledger thay vì client nhập.

Mục tiêu:

Biết chính xác:

```text
Supplier A

Purchased: ¥120,000
Paid: ¥100,000
Debt: ¥20,000
```

---

# 12. China Warehouse / Shipment

Cần phân biệt:

```text
Đã mua
≠
đã nhận kho Trung Quốc
≠
đang về Việt Nam
≠
đã nhận tại CitiLap
```

---

# 13. Shipments

Tạo:

```text
shipments
shipment_items
```

Shipment:

```text
id
shipment_code

origin
destination

carrier
tracking_number

shipping_type

shipped_at
expected_arrival_at
received_at

shipping_cost_rmb
shipping_cost_vnd

status

notes

created_by
created_at
updated_at
```

Status:

```text
CREATED
IN_TRANSIT
AT_WAREHOUSE
CUSTOMS_DELAY
RECEIVED
PARTIALLY_RECEIVED
CANCELLED
```

---

# 14. shipment_items

```text
id
shipment_id
purchase_item_id
laptop_id nullable

status
received_at

notes
```

Một purchase batch có thể chia thành nhiều shipment.

Không thiết kế:

```text
purchase_batch = shipment
```

vì thực tế có thể:

```text
20 máy mua cùng lúc
→ 12 máy gửi trước
→ 8 máy gửi sau
```

---

# 15. Receiving

Khi kiện hàng đến CitiLap cần có nghiệp vụ nhận hàng.

Tạo receiving session:

```text
receiving_sessions
```

Fields:

```text
id
shipment_id

received_by
received_at

expected_quantity
received_quantity

missing_quantity
unexpected_quantity

notes
```

Khi nhận từng máy:

```text
Expected serial
Actual serial
Model
Condition
Charger
Physical damage
```

Nếu sai serial hoặc thiếu máy:

tạo exception.

---

# 16. Receiving Exceptions

Có thể tạo:

```text
receiving_exceptions
```

Types:

```text
MISSING_ITEM
WRONG_SERIAL
WRONG_MODEL
DAMAGED
MISSING_CHARGER
UNEXPECTED_ITEM
OTHER
```

Phải có trạng thái:

```text
OPEN
RESOLVED
```

---

# 17. QC / Technical Inspection

Đây là module quan trọng đối với laptop cũ.

Không chỉ dùng note trong inventory.

Tạo:

```text
qc_inspections
qc_check_items
```

---

# 18. QC workflow

Laptop khi nhận:

```text
RECEIVED
↓
WAITING_QC
↓
QC_IN_PROGRESS
↓
QC_PASSED
```

hoặc:

```text
QC_FAILED
↓
REPAIR
```

hoặc:

```text
QC_FAILED
↓
SUPPLIER_RETURN
```

Laptop chỉ được:

```text
AVAILABLE_FOR_SALE
```

sau khi QC pass, trừ trường hợp ADMIN override có audit log.

---

# 19. QC checklist

Checklist mặc định:

```text
Serial
Model
CPU
GPU
RAM
SSD

Mainboard
Screen
Keyboard
Touchpad
Camera

WiFi
Bluetooth
Speaker
Microphone

USB
USB-C
HDMI

Battery
SSD health

CPU stress
GPU stress

Cooling
Fan

Charger

Exterior
```

Mỗi item:

```text
PASS
FAIL
WARNING
NOT_TESTED
NOT_APPLICABLE
```

Có:

```text
note
checked_by
checked_at
```

---

# 20. Mainboard Status

Bổ sung field quan trọng:

```text
mainboard_status
```

Values:

```text
ORIGINAL
OFFICIAL_REPLACED
REPAIRED
UNKNOWN
```

Ý nghĩa:

```text
ORIGINAL
main zin/chưa sửa

OFFICIAL_REPLACED
main được hãng chính thức thay

REPAIRED
phát hiện sửa chữa ngoài

UNKNOWN
chưa xác định
```

Không dùng boolean:

```text
main_repaired = true/false
```

vì không thể hiện trường hợp hãng thay main.

---

# 21. QC evidence

Nên hỗ trợ metadata cho:

```text
photo
video
attachment
```

Không cần xây storage phức tạp ngay nếu chưa cần.

Có thể thiết kế bảng:

```text
attachments
```

generic:

```text
entity_type
entity_id
file_url
file_type
description
uploaded_by
created_at
```

Sau này dùng chung cho:

```text
QC
Warranty
Supplier Return
Order
Laptop
```

Nếu sử dụng Supabase Storage, bucket/policy phải được kiểm tra riêng.

---

# 22. Repair / Technical Jobs

Không nên gộp repair vào warranty vì có:

```text
máy lỗi lúc nhập
máy sửa trước bán
máy khách bảo hành
máy trade-in cần sửa
```

Tạo:

```text
repair_jobs
repair_parts
```

Repair job:

```text
id
laptop_id

source_type
source_id nullable

issue
diagnosis

status

assigned_to

started_at
completed_at

labor_cost_vnd
total_parts_cost_vnd

notes

created_by
created_at
updated_at
```

source_type:

```text
QC
WARRANTY
TRADE_IN
INTERNAL
```

---

# 23. Repair Parts

```text
repair_parts
```

Fields:

```text
id
repair_job_id

part_name
serial nullable

quantity

cost_vnd

notes
```

Các chi phí này phải được đưa vào landed cost/lifetime cost khi thích hợp.

---

# 24. Supplier Return

Tạo module riêng:

```text
supplier_returns
supplier_return_items
```

Không dùng `warranty_cases`.

---

# 25. supplier_returns

```text
id
return_code

supplier_id

reason
status

return_tracking_number
carrier

shipped_at
supplier_received_at

resolution

expected_refund_rmb
actual_refund_rmb

refund_received_at

replacement_shipment_id nullable

notes

created_by
created_at
updated_at
```

Status:

```text
DRAFT
APPROVED
WAITING_SHIPMENT
SHIPPED
SUPPLIER_RECEIVED
WAITING_REFUND
WAITING_REPLACEMENT
REFUNDED
REPLACED
REJECTED
CLOSED
```

Resolution:

```text
REFUND
REPLACEMENT
REPAIR_BY_SUPPLIER
PARTIAL_REFUND
OTHER
```

---

# 26. supplier_return_items

```text
id
supplier_return_id
laptop_id
purchase_item_id nullable

reason
condition_notes

refund_rmb nullable

status
```

---

# 27. Supplier Refund Ledger

Nếu muốn accounting chính xác, tạo:

```text
supplier_refunds
```

```text
id
supplier_id
supplier_return_id

amount_rmb
amount_vnd nullable
exchange_rate nullable

refund_method
reference

received_at

created_by
created_at
```

Không chỉ dựa vào status `REFUNDED`.

---

# 28. Inventory State Machine

Hiện laptop status cần chuẩn hóa mạnh hơn.

Đề xuất business states:

```text
PURCHASED
IN_TRANSIT_CN
AT_CN_WAREHOUSE
IN_TRANSIT_VN

RECEIVED
WAITING_QC
QC_IN_PROGRESS

AVAILABLE

RESERVED
SOLD

REPAIR

SUPPLIER_RETURN_PENDING
SUPPLIER_RETURNED

WARRANTY

LOST
SCRAPPED
```

Không cho UI tùy ý đổi status nếu status là kết quả của nghiệp vụ khác.

Ví dụ:

Order confirmed:

```text
AVAILABLE → RESERVED/SOLD
```

Supplier return:

```text
QC_FAILED → SUPPLIER_RETURN_PENDING
```

RPC chịu trách nhiệm transition.

---

# 29. Stock Location

Tách:

```text
status
```

và:

```text
location
```

Không dùng status để biểu diễn vị trí.

Ví dụ location:

```text
CHINA_YUNNAN
CHINA_GUANGXI

VN_TRANSIT

BAC_NINH
HANOI
HCM

TECH_ROOM
WARRANTY_AREA
RETURN_AREA
```

Nên cho ADMIN quản lý location bằng options/settings.

---

# 30. Stock Movements nâng cấp

Hiện đã có `stock_movements`.

Cần bảo đảm mọi thay đổi vị trí quan trọng tạo movement:

```text
FROM
TO

laptop_id
movement_type

reference_type
reference_id

performed_by
performed_at
notes
```

Movement type:

```text
PURCHASE_RECEIVE
SHIPMENT
STORE_TRANSFER
SALE
RETURN
WARRANTY
REPAIR
SUPPLIER_RETURN
MANUAL_ADJUSTMENT
```

---

# 31. Stock Transfer

Nếu CitiLap có nhiều kho/cửa hàng:

```text
stock_transfers
stock_transfer_items
```

Workflow:

```text
DRAFT
→ SENT
→ IN_TRANSIT
→ RECEIVED
```

Ví dụ:

```text
Bắc Ninh → Hà Nội
```

Không đổi location ngay khi tạo transfer.

Khi SENT:

```text
location = IN_TRANSIT
```

Khi RECEIVED:

```text
location = destination
```

---

# 32. Physical Inventory / Cycle Count

Dù trước đây có migration remove cycle count, cần đánh giá lại một nghiệp vụ kiểm kho mới, đơn giản và phù hợp hơn.

Tạo:

```text
inventory_counts
inventory_count_items
```

Count:

```text
location
started_at
completed_at
performed_by
status
```

Items:

```text
expected_laptop_id
scanned
scanned_at
exception
```

Kết quả:

```text
Expected: 81
Found: 80
Missing: 1
Unexpected: 2
```

Không tự sửa inventory khi count khác biệt.

Phải yêu cầu ADMIN resolve discrepancy.

---

# 33. QR / Barcode

Mỗi laptop nên có internal inventory code:

```text
asset_code
```

Ví dụ:

```text
CL-260920-00123
```

QR có thể chứa:

```text
asset_code
```

Không cần chứa financial information.

Scan QR:

```text
→ mở laptop detail
```

Dùng cho:

```text
Receiving
QC
Stock transfer
Stock count
Sale
Warranty
```

---

# 34. Reservation / Giữ máy

Order hiện đã có reservation logic.

Cần nâng cấp thành reservation rõ ràng.

Fields hoặc table:

```text
reservations
```

```text
id
laptop_id
customer_id nullable
order_id nullable

reserved_by
reserved_at
expires_at

deposit_amount

status

notes
```

Status:

```text
ACTIVE
EXPIRED
CONVERTED
CANCELLED
```

Laptop không thể có 2 ACTIVE reservations.

Database unique/transaction phải enforce.

---

# 35. Reservation Expiration

Khi:

```text
expires_at < now()
```

và reservation vẫn ACTIVE:

hệ thống cần có khả năng:

```text
ACTIVE → EXPIRED
```

và giải phóng laptop nếu không còn commitment khác.

Không phụ thuộc hoàn toàn vào việc người dùng mở trang.

Có thể xử lý bằng scheduled job hoặc RPC reconciliation.

---

# 36. Landed Cost

Đây là thay đổi tài chính quan trọng.

Không dùng:

```text
purchase_price × exchange_rate
```

làm toàn bộ giá vốn.

Landed cost:

```text
Purchase Cost
+ Allocated China Shipping
+ Allocated VN Shipping
+ Payment Fees
+ Repair Before Sale
+ Upgrade Parts
+ Accessories
+ Other Allocated Costs
```

---

# 37. Cost Components

Tạo:

```text
laptop_cost_components
```

```text
id
laptop_id

cost_type

amount_vnd
amount_rmb nullable
exchange_rate nullable

reference_type
reference_id

description

occurred_at
created_by
created_at
```

Cost types:

```text
PURCHASE
CN_SHIPPING
VN_SHIPPING
PAYMENT_FEE
REPAIR
RAM
SSD
ACCESSORY
CLEANING
OTHER
```

---

# 38. Cost allocation

Chi phí shipment/lô phải có thể phân bổ.

Ví dụ:

```text
Shipment cost = 3,000,000
10 laptops
```

Có thể phân bổ:

```text
EQUAL
MANUAL
```

Giai đoạn đầu chưa cần weight-based allocation nếu không có dữ liệu trọng lượng đáng tin cậy.

Phải lưu kết quả allocation để audit được.

Không recalculation lịch sử một cách âm thầm khi shipment thay đổi sau này.

---

# 39. Landed Cost Snapshot

Khi laptop được bán, nên snapshot:

```text
landed_cost_at_sale
```

vào order item/order financial snapshot.

Lý do:

Nếu sau này cost component thay đổi, báo cáo lợi nhuận lịch sử không được thay đổi ngoài ý muốn.

---

# 40. Profit Calculation

Cần phân biệt:

```text
Gross Profit
Net Contribution
```

Ví dụ:

```text
Sale Price
- Landed Cost
= Gross Profit
```

Sau đó:

```text
Gross Profit
- Card Fee
- Sales Commission
- Shipping Subsidy
- Marketplace Fee
- Other Order Cost
= Net Contribution
```

Không nhất thiết gọi là lợi nhuận kế toán doanh nghiệp.

Tên UI nên rõ:

```text
Lãi gộp đơn
Lãi sau chi phí trực tiếp
```

---

# 41. Order Cost Components

Tạo:

```text
order_cost_components
```

```text
order_id
type
amount_vnd
description
created_at
```

Types:

```text
CARD_FEE
SHIPPING
SALES_COMMISSION
CTV_COMMISSION
MARKETPLACE_FEE
DISCOUNT_COST
OTHER
```

---

# 42. Inventory Aging

Dashboard cần tính:

```text
today - inventory_available_since
```

Không nên dùng `created_at` nếu laptop được tạo từ lúc còn ở Trung Quốc.

Cần xác định ngày bắt đầu aging:

```text
available_for_sale_at
```

Buckets:

```text
0–7
8–15
16–30
31–60
61–90
90+
```

Dashboard:

```text
0–15 ngày      52 máy
16–30 ngày     19 máy
31–60 ngày     11 máy
60+ ngày        5 máy
```

Kèm:

```text
Inventory Value
Capital Locked
Average Days in Stock
```

Click bucket → filter Inventory.

---

# 43. Aging Alerts

Cho ADMIN cấu hình:

```text
warning_days
critical_days
```

Ví dụ:

```text
warning = 30
critical = 60
```

Không hardcode trong component.

---

# 44. Pricing Suggestions

Không tự động thay giá.

Chỉ cung cấp thông tin:

```text
Cost
Current Selling Price
Expected Profit
Days in Stock
Last Price Change
```

Có thể cảnh báo:

```text
Tồn 63 ngày
Giá hiện tại 21.9m
Landed cost 20.2m
```

Quyết định giảm giá vẫn do người dùng.

---

# 45. COD Reconciliation

Order online cần quản lý COD rõ ràng.

Tạo:

```text
cod_receivables
```

hoặc mở rộng financial ledger nếu kiến trúc hiện tại phù hợp.

Fields:

```text
order_id

carrier
tracking_number

expected_cod_amount
actual_received_amount

shipped_at
delivered_at
expected_settlement_at
settled_at

status

reference
```

Status:

```text
PENDING_DELIVERY
DELIVERED
WAITING_SETTLEMENT
PARTIALLY_SETTLED
SETTLED
DISPUTED
RETURNED
```

---

# 46. COD Dashboard

Hiển thị:

```text
COD đang vận chuyển
COD đã giao chưa về
COD quá hạn
COD đã nhận
COD chênh lệch
```

Ví dụ:

```text
COD chờ về: 76,300,000
Overdue > 5 ngày: 12,800,000
```

---

# 47. Trade-in hoàn chỉnh

Trade-in không chỉ là field trên order.

Một máy khách đổi phải có lifecycle riêng.

Tạo:

```text
trade_ins
```

Fields:

```text
id
order_id
customer_id

brand
model
serial

cpu
gpu
ram
ssd

estimated_value
agreed_value

condition
technical_notes

status

resulting_laptop_id nullable

created_at
```

Status:

```text
PROPOSED
ACCEPTED
RECEIVED
QC
REJECTED
CONVERTED_TO_INVENTORY
```

---

# 48. Trade-in → Inventory

Khi ACCEPTED và QC phù hợp:

```text
trade_in
→ create laptop
```

Laptop mới phải giữ reference:

```text
source_type = TRADE_IN
source_id = trade_in.id
```

Giá vốn ban đầu:

```text
agreed_value
```

sau đó cộng repair/upgrade cost.

---

# 49. Sales / CTV Commission

Tạo module commission.

```text
commissions
```

Fields:

```text
id
order_id

user_id nullable
collaborator_name nullable

commission_type
amount_vnd

status

approved_by
approved_at
paid_at

notes
```

Status:

```text
PENDING
APPROVED
PAID
CANCELLED
```

Commission type:

```text
SALES
CTV
REFERRAL
OTHER
```

---

# 50. Commission Rules

Có thể thêm sau:

```text
commission_rules
```

Nhưng phase đầu cho phép nhập amount thủ công sẽ an toàn hơn.

Không xây rule engine quá sớm.

---

# 51. Multi-location

Chuẩn hóa location ngay từ bây giờ dù hiện chưa có nhiều cửa hàng.

Có thể tạo:

```text
locations
```

Fields:

```text
id
code
name
type
address
is_active
```

Types:

```text
STORE
WAREHOUSE
TECH
TRANSIT
CHINA_WAREHOUSE
OTHER
```

Sau đó laptop dùng:

```text
location_id
```

thay vì text nếu migration khả thi.

Phải migrate backward-compatible.

---

# 52. Cash Position / Capital Dashboard

Dashboard ADMIN cần nhìn được:

```text
Cash / Recorded Accounts
Inventory at Cost
Goods in Transit
Customer Receivables
COD Receivables
Supplier Receivables / Refunds
Supplier Payables
```

Ví dụ:

```text
Tiền khả dụng                 420m
Tồn kho VN                  1.21b
Hàng đang về                 380m
COD chưa về                   76m
Khách còn nợ                  28m
Refund NCC đang chờ           42m
Nợ NCC                       210m
```

Cần ghi rõ đây là:

```text
Operational Capital View
```

không phải balance sheet kế toán đầy đủ.

---

# 53. Cash Accounts

Nếu muốn biết “tiền khả dụng” chính xác, cần ledger/account.

Tạo:

```text
cash_accounts
```

Ví dụ:

```text
Cash
VCB
MB Bank
WeChat
Alipay
```

Fields:

```text
id
name
type
currency
is_active
```

Không lưu login credential.

---

# 54. Account Transactions

```text
account_transactions
```

```text
account_id
direction

amount
currency

exchange_rate nullable

reference_type
reference_id

occurred_at

description
created_by
created_at
```

direction:

```text
IN
OUT
```

Tuy nhiên cần đánh giá tích hợp với `payments` và `financial_records` hiện tại trước khi tạo để tránh hai ledger song song.

Ưu tiên reuse ledger hiện có nếu phù hợp.

---

# 55. Customer Debt / Receivables

Order đã có `debt_amount`.

Cần dashboard riêng:

```text
Customer Receivables
```

Hiển thị:

```text
Customer
Order
Debt
Due date
Days overdue
Last payment
```

Nếu chưa có:

```text
payment_due_at
```

có thể bổ sung.

---

# 56. Action Center

Dashboard cần một khu vực:

```text
CẦN XỬ LÝ
```

Không chỉ hiển thị KPI.

Các alert:

```text
QC_PENDING_TOO_LONG
AGING_INVENTORY
OVERDUE_CUSTOMER_DEBT
OVERDUE_COD
SUPPLIER_REFUND_PENDING
RESERVATION_EXPIRING
WARRANTY_OVERDUE
REPAIR_OVERDUE
RECEIVING_EXCEPTION
SHIPMENT_DELAY
```

---

# 57. Alert Engine

Không cần AI.

Có thể tạo:

```text
operational_alerts
```

hoặc generate bằng SQL query/view.

Mỗi alert:

```text
type
severity

entity_type
entity_id

title
message

created_at
resolved_at
```

Severity:

```text
INFO
WARNING
CRITICAL
```

Nếu alert có thể derive hoàn toàn từ data thì ưu tiên view/query để tránh stale data.

---

# 58. Dashboard mới

Dashboard ADMIN nên chia thành:

## A. Today

```text
Orders Today
Revenue Today
Payments Today
Units Sold
```

## B. Inventory

```text
Available
Reserved
QC
Repair
Warranty
In Transit
```

## C. Capital

```text
Inventory Cost
Goods in Transit
COD Receivable
Customer Debt
Supplier Refund Pending
Supplier Debt
```

## D. Aging

```text
0–15
16–30
31–60
60+
```

## E. Operations

```text
Waiting QC
Open Repairs
Open Warranty
Supplier Returns
Receiving Exceptions
```

## F. Action Center

Các việc cần xử lý.

---

# 59. Inventory Dashboard Drill-down

Mọi KPI phải click được.

Ví dụ:

```text
Waiting QC: 6
```

click:

```text
/inventory?status=WAITING_QC
```

Không tạo KPI chỉ để hiển thị.

---

# 60. Sales Analytics

ADMIN cần:

```text
Revenue
Units Sold
Gross Profit
Net Contribution
Average Selling Price
Average Profit / Laptop
Average Days to Sell
```

Theo:

```text
Day
Week
Month
Salesperson
Location
Brand
Model
CPU
GPU
```

---

# 61. Inventory Analytics

Các chỉ số:

```text
Stock Count
Stock Cost
Average Age
Sell-through
Stock Turnover
Aging distribution
```

Có thể thêm:

```text
Top slow-moving models
Top selling models
```

Nhưng tránh kết luận tự động nếu sample quá nhỏ.

---

# 62. Supplier Analytics

Các metric:

```text
Units Purchased
Purchase RMB
QC Fail Rate
Return Rate
Mainboard Repair Detection
Average Purchase Cost
Refund Pending
Average Refund Time
```

Không cần tự động gắn nhãn supplier “tốt/xấu”.

Chỉ cung cấp dữ liệu cho ADMIN quyết định.

---

# 63. Warranty Analytics

```text
Warranty Cases
Warranty Rate
Average Resolution Time
Warranty Cost
Repeat Issue Count
```

Theo:

```text
Brand
Model
Supplier
Issue Type
```

Có thể giúp phát hiện:

```text
một model có tỷ lệ lỗi cao
```

nhưng UI nên trình bày số liệu thay vì kết luận khi mẫu nhỏ.

---

# 64. Technical Productivity

TECH/TECHNICAL dashboard:

```text
Waiting QC
Assigned QC
Open Repairs
Warranty Waiting
Completed Today
```

Không hiển thị:

```text
purchase price
landed cost
profit
supplier debt
financial data
```

---

# 65. Sales Dashboard

SALES chỉ cần:

```text
Available inventory
Reservations
Orders
Customers
Deposits
Customer debt phù hợp policy
Sales performance
```

Ẩn:

```text
purchase RMB
exchange rate
landed cost
supplier payment
full profit
```

---

# 66. CRM / Lead Management

Đây là Phase sau, không ưu tiên trước core operations.

Có thể tạo:

```text
leads
lead_activities
```

Lead:

```text
name
phone
source

desired_model
budget

status

assigned_to

next_follow_up_at

customer_id nullable
order_id nullable
```

Status:

```text
NEW
CONTACTED
INTERESTED
RESERVED
WON
LOST
```

---

# 67. Lead Sources

```text
FACEBOOK
TIKTOK
ZALO
WALK_IN
REFERRAL
SHOPEE
OTHER
```

Mục tiêu:

Biết khách đến từ đâu.

Không cần marketing attribution phức tạp giai đoạn đầu.

---

# 68. Customer Timeline

Customer detail nên có timeline:

```text
Created
Lead
Order
Payment
Warranty
Trade-in
Notes
```

Cho phép nhân viên xem lịch sử quan hệ với khách nhanh.

---

# 69. Notifications

Bổ sung notification trong app:

```text
notifications
```

Types:

```text
QC_ASSIGNED
WARRANTY_ASSIGNED
DEBT_OVERDUE
RESERVATION_EXPIRING
RETURN_REFUND_PENDING
SHIPMENT_RECEIVED
```

Có:

```text
user_id
read_at
```

Không cần push notification ngay Phase đầu.

---

# 70. Activity Log nâng cấp

Audit các nghiệp vụ:

```text
Supplier created/updated
Purchase confirmed
Supplier payment
Shipment status
Receiving
QC result
Mainboard status
Repair
Supplier return
Refund
Cost adjustment
Reservation override
Stock adjustment
Commission
```

Log nên có:

```text
actor
action
entity
entity_id
before
after
timestamp
```

Không log secrets.

---

# 71. Permission Matrix mới

## ADMIN

Full access.

## SALES

Cho phép:

```text
Inventory selling information
Customers
Orders
Reservations
Trade-in
Customer payments theo policy
```

Không:

```text
Supplier purchase cost
Supplier payment
Landed cost
Profit nhạy cảm
```

## TECH / TECHNICAL

Cho phép:

```text
Laptop technical information
QC
Repair
Warranty
Technical attachments
```

Không:

```text
Supplier financials
Purchase cost
Profit
Sales financial dashboard
```

## STAFF

Explicit policy.

Không dùng fallback kiểu:

```text
if role !== ADMIN allow
```

Phải whitelist capability.

---

# 72. Capability-based Authorization

Nên cân nhắc dần chuyển từ:

```text
role === "ADMIN"
```

sang helper:

```text
can(user, "supplier.read")
can(user, "supplier.financial.read")
can(user, "qc.update")
can(user, "order.create")
```

Không nhất thiết xây RBAC editor ngay.

Có thể map capabilities server-side theo role.

---

# 73. API mới dự kiến

```text
/api/suppliers
/api/purchases
/api/supplier-payments

/api/shipments
/api/receiving

/api/qc
/api/repairs

/api/supplier-returns
/api/supplier-refunds

/api/reservations

/api/trade-ins
/api/commissions

/api/stock-transfers
/api/inventory-counts

/api/cod

/api/analytics
/api/alerts
```

Không nhất thiết mỗi bảng một API.

Thiết kế API theo nghiệp vụ.

---

# 74. RPC / Transaction cần ưu tiên

Các nghiệp vụ sau nên transaction:

```text
confirm_purchase()
receive_shipment()
complete_qc()
create_reservation()
expire_reservation()
complete_sale()
create_trade_in_inventory()
send_supplier_return()
record_supplier_refund()
complete_stock_transfer()
reconcile_cod()
```

Ví dụ `receive_shipment()` có thể:

```text
validate shipment
validate items
mark shipment items received
create/update laptop
create stock movement
set laptop WAITING_QC
write activity log
```

Tất cả atomic.

---

# 75. Idempotency

Các mutation tài chính và receiving quan trọng phải chống double-submit.

Đặc biệt:

```text
Payment
Supplier Payment
Supplier Refund
Receiving
COD Settlement
```

Có thể sử dụng:

```text
idempotency_key
```

hoặc database constraint/reference uniqueness.

---

# 76. Concurrency

Phải xử lý trường hợp:

```text
2 SALES cùng giữ một máy
```

hoặc:

```text
2 người cùng bán một laptop
```

hoặc:

```text
QC và Supplier Return cùng update status
```

Không dựa vào check UI.

Dùng transaction + row lock/constraint/RPC.

---

# 77. Financial Integrity

Không cho:

```text
negative payment
negative supplier payment
negative refund
```

trừ nghiệp vụ reversal rõ ràng.

Không sửa/xóa ledger transaction tùy tiện.

Nếu sai:

```text
reversal / adjustment
```

có audit.

---

# 78. Soft Delete

Các entity quan trọng:

```text
Supplier
Purchase
Payment
Return
Repair
```

không hard delete sau khi đã phát sinh reference.

Dùng:

```text
is_active
cancelled_at
voided_at
```

tùy entity.

---

# 79. Attachments

Nếu triển khai attachment:

```text
entity_type
entity_id
```

Phải validate entity access.

Không vì biết URL mà TECH có thể xem financial attachment của supplier.

Storage RLS phải tương ứng API permission.

---

# 80. Search toàn hệ thống

Có thể bổ sung Global Search:

```text
Serial
Tracking
Order code
Customer phone
Customer name
Laptop model
Purchase batch
Shipment
Supplier
Warranty code
Return code
```

Shortcut:

```text
Ctrl + K
```

Kết quả phải respect role.

---

# 81. Laptop Detail 360°

Laptop detail nên trở thành nơi xem toàn bộ lifecycle:

```text
Purchase
↓
Shipment
↓
Receiving
↓
QC
↓
Repair
↓
Inventory movements
↓
Reservation
↓
Order
↓
Payment
↓
Warranty
↓
Supplier Return
```

Có timeline.

Đây nên là màn hình quan trọng nhất của hệ thống.

---

# 82. Internal Identifiers

Các entity nên có human-readable code:

```text
Laptop        CL-xxxx
Purchase      PO-xxxx
Shipment      SH-xxxx
Order         ORD-xxxx
Warranty      WAR-xxxx
SupplierReturn SR-xxxx
Repair        REP-xxxx
Trade-in      TI-xxxx
```

UUID vẫn là primary key.

Code chỉ phục vụ người dùng.

---

# 83. Data Import

CSV import Inventory hiện có.

Cần cân nhắc import:

```text
Purchase items
Supplier serial list
Shipment list
```

Import phải có preview:

```text
Rows valid
Rows invalid
Duplicate serial
Missing required field
```

Không insert partial silently.

---

# 84. Export

ADMIN cần export:

```text
Inventory
Sales
Payments
Purchases
Supplier debt
Customer debt
COD
Warranty
Profit
```

CSV trước.

Không cần Excel formatting phức tạp ngay.

Export phải respect filters hiện tại.

---

# 85. Pagination

Bắt buộc chuẩn bị pagination cho:

```text
payments
financial_records
stock_movements
activity_logs
purchase_items
QC history
```

Không load toàn bộ dataset vào `InventoryContext` khi dữ liệu tăng.

Ưu tiên:

```text
server-side pagination
server-side filtering
server-side sorting
```

---

# 86. InventoryContext Refactor

Không nên tiếp tục nhét tất cả module mới vào một context khổng lồ.

Cần đánh giá tách:

```text
InventoryContext
OrderContext
FinanceContext
SupplierContext
OperationsContext
```

hoặc chuyển các trang mới sang page-specific data fetching.

Không refactor toàn bộ ngay nếu có nguy cơ regression.

Nguyên tắc:

```text
new modules should not increase global state unnecessarily
```

---

# 87. Cache / Refresh

Sau mutation chỉ refresh dữ liệu liên quan.

Ví dụ QC:

```text
refresh laptop
refresh qc
refresh alerts
```

Không reload:

```text
customers
payments
orders
financials
...
```

nếu không liên quan.

---

# 88. UI Navigation đề xuất

Sidebar:

```text
Dashboard

Bán hàng
  Inventory
  Orders
  Customers
  Reservations

Nhập hàng
  Purchases
  Suppliers
  Shipments
  Receiving

Kỹ thuật
  QC
  Repairs
  Warranty

Trả hàng
  Supplier Returns

Tài chính
  Payments
  COD
  Supplier Payments
  Financials

Kho
  Stock Transfers
  Stock Count

Reports
  Sales
  Inventory
  Profit
  Suppliers
  Warranty

Settings
```

Menu render theo capability.

---

# 89. UX Status

Status phải dùng badge nhất quán.

Không để mỗi page tự định nghĩa màu/tên.

Tạo centralized status metadata:

```text
code
label
category
```

Nếu màu được dùng thì phải nhất quán toàn hệ thống.

---

# 90. Responsive

Desktop-first vẫn đúng.

Các bảng lớn:

```text
sticky header
sticky action column
horizontal scroll inside table container
```

Không để toàn page overflow-x.

Mobile:

ưu tiên:

```text
Serial
Model
Status
Location
Selling Price nếu role được phép
Action
```

Các field phụ mở detail.

---

# 91. Action Center UX

Mỗi alert phải có action trực tiếp.

Ví dụ:

```text
6 máy chờ QC
[Kiểm tra]
```

```text
3 COD quá hạn
[Đối soát]
```

```text
2 supplier refund chờ >7 ngày
[Xem trả hàng]
```

Không chỉ hiển thị notification thụ động.

---

# 92. Data Quality Rules

Bổ sung validation:

```text
serial unique khi known
tracking normalized
phone normalized
RMB >= 0
VND >= 0
exchange_rate > 0
```

Không bắt buộc serial khi purchase item chưa nhận.

Khi chuyển laptop thành AVAILABLE:

```text
serial required
model required
location required
QC passed hoặc admin override
```

---

# 93. Duplicate Detection

Khi nhập serial:

tìm:

```text
active inventory
sold laptops
supplier returns
warranty
trade-ins
```

Nếu serial từng tồn tại:

không tự block mọi trường hợp.

Hiển thị:

```text
Serial này đã từng xuất hiện ở laptop CL-...
```

ADMIN xử lý nếu đây là máy quay lại hợp lệ.

---

# 94. Historical Snapshot

Các dữ liệu sau cần snapshot khi order hoàn thành:

```text
Laptop model
Serial
Sale price
Landed cost
Salesperson
Customer
Commission
Direct order costs
```

Không để thay đổi master data làm thay đổi báo cáo lịch sử.

---

# 95. Month Roll

Phải đánh giá lại `month-roll`.

Module mới không được làm dữ liệu biến mất khi đổi tháng.

Các entity lifecycle:

```text
Purchase
Shipment
Warranty
Supplier Return
Repair
Debt
COD
```

có thể kéo dài nhiều tháng.

Không partition logic nghiệp vụ chỉ theo selected month.

Selected month chủ yếu dùng cho:

```text
reporting
dashboard
```

không phải ownership của record.

---

# 96. Timezone

Chuẩn hóa:

```text
database timestamp = timestamptz
```

UI hiển thị theo timezone Việt Nam:

```text
Asia/Ho_Chi_Minh
```

Không dùng string date tùy tiện cho transaction time.

---

# 97. QA bắt buộc

Mỗi module phải test happy path + conflict path.

## Purchase

```text
create
edit draft
confirm
payment
partial payment
cancel
```

## Shipment

```text
create
split purchase
receive partial
missing item
wrong serial
```

## QC

```text
pass
fail
repair
supplier return
```

## Reservation

```text
reserve
expire
cancel
convert
double reservation
```

## Supplier Return

```text
send
supplier receive
refund
replacement
```

## COD

```text
delivered
partial settlement
full settlement
dispute
```

---

# 98. Security QA

Test trực tiếp API bằng user role khác nhau.

Ví dụ SALES cố:

```text
GET supplier financial data
```

→ phải bị từ chối.

TECH cố:

```text
GET landed cost
```

→ không được trả field.

Không chỉ test xem UI có ẩn hay không.

---

# 99. Database QA

Kiểm tra:

```text
Foreign Keys
Unique constraints
Check constraints
RLS
RPC grants
Triggers
Indexes
```

Indexes quan trọng:

```text
serial
tracking_number
status
location_id
supplier_id
purchase_batch_id
order_id
customer_id
created_at
```

Index theo query thực tế, không tạo index mọi field.

---

# 100. Performance

Không để Dashboard chạy 20 query toàn bảng.

Có thể dùng:

```text
SQL aggregate
views
RPC dashboard summary
```

Ví dụ:

```text
get_admin_dashboard_summary(month_key)
```

trả về aggregate cần thiết.

Drill-down mới fetch detail.

---

# 101. Implementation Roadmap

Không triển khai tất cả cùng lúc.

## PHASE 1 — Procurement

Làm trước:

```text
Suppliers
Purchase Batches
Purchase Items
Supplier Payments
```

Mục tiêu:

biết:

```text
đã mua gì
mua ai
bao nhiêu RMB
đã trả bao nhiêu
còn nợ bao nhiêu
```

---

## PHASE 2 — Logistics

```text
Shipments
Shipment Items
Receiving
Receiving Exceptions
```

Mục tiêu:

biết chính xác máy đang ở:

```text
supplier
China warehouse
in transit
Vietnam
```

---

## PHASE 3 — QC

```text
QC Inspection
Checklist
Mainboard Status
Attachments
```

Mục tiêu:

không cho máy chưa kiểm tra đi thẳng vào inventory bán.

---

## PHASE 4 — Supplier Return

```text
Supplier Returns
Return Shipment
Supplier Refund
Replacement
```

Mục tiêu:

quản lý đầy đủ tiền và máy đang nằm ở luồng trả NCC.

---

## PHASE 5 — True Cost

```text
Cost Components
Cost Allocation
Landed Cost
Historical Snapshot
Gross Profit
Net Contribution
```

Mục tiêu:

biết lãi thực trên từng laptop.

---

## PHASE 6 — Inventory Operations

```text
Locations
Stock Transfer
Physical Count
QR
Aging
```

---

## PHASE 7 — Sales Operations

```text
Reservation improvements
Trade-in
Commission
COD reconciliation
```

---

## PHASE 8 — Management Dashboard

```text
Capital
Cash position
Aging
Action Center
Supplier analytics
Sales analytics
Warranty analytics
```

---

## PHASE 9 — CRM

```text
Lead
Follow-up
Customer Timeline
Lead Source
```

Chỉ làm sau khi core operation ổn định.

---

# 102. Codex implementation rules

Codex không được bắt đầu bằng việc code toàn bộ roadmap.

Mỗi phase phải thực hiện:

```text
1. Inspect current implementation
2. Inspect database schema
3. Inspect migrations
4. Inspect existing API patterns
5. Inspect auth/role helpers
6. Identify reusable code
7. Propose exact migration/API/UI changes
8. Implement one bounded batch
9. Test
10. Lint
11. Build
12. git diff --check
13. Report unverified live dependencies
```

---

# 103. Không được làm

Codex không được:

```text
rewrite working modules unnecessarily

replace Supabase architecture

move authorization to client

trust client calculated profit

create duplicate financial ledgers without checking existing ledger

hardcode status in many components

hardcode role logic everywhere

delete historical financial records

modify old production migration

assume live migrations are applied

silently fix stock discrepancy

automatically lower selling prices

automatically mark supplier good/bad

load all historical data into InventoryContext
```

---

# 104. Compatibility requirement

Mọi cải tiến phải bảo toàn các flow đang hoạt động:

```text
Inventory
Orders
Payments
Customers
Warranty
Settings
Authentication
Month selection
Activity logs
```

Nếu cần thay schema cũ:

phải migration theo chiến lược:

```text
add new field/table
→ backfill
→ dual compatibility
→ migrate usage
→ verify
→ remove legacy later
```

Không breaking migration trực tiếp.

---

# 105. Definition of Done cho mỗi phase

Một phase chỉ được coi hoàn thành khi:

```text
Schema/migration hoàn thành
API hoàn thành
Authorization hoàn thành
Validation hoàn thành
UI hoàn thành
Activity logging hoàn thành
Error/loading/empty states hoàn thành
Relevant tests pass
Lint pass
Build pass
git diff --check pass
```

Ngoài ra phải ghi rõ:

```text
Live Supabase verified: YES/NO
RLS verified: YES/NO
RPC verified: YES/NO
Migration applied: YES/NO
```

Không được ghi “hoàn thành production” nếu chưa kiểm tra live Supabase.

---

# 106. Ưu tiên cuối cùng

Nếu phải lựa chọn giữa nhiều tính năng, ưu tiên theo thứ tự:

```text
DATA INTEGRITY
↓
FINANCIAL INTEGRITY
↓
INVENTORY TRACEABILITY
↓
OPERATIONAL CONTROL
↓
REPORTING
↓
CONVENIENCE
↓
AUTOMATION
```

Không ưu tiên dashboard đẹp hơn việc dữ liệu chính xác.

---

# 107. Kết quả cuối cùng mong muốn

Sau khi hoàn thiện roadmap, mỗi laptop phải có thể truy ngược toàn bộ vòng đời:

```text
Supplier
↓
Purchase
↓
Supplier Payment
↓
China Shipment
↓
Vietnam Receiving
↓
QC
↓
Repair / Upgrade
↓
Landed Cost
↓
Inventory
↓
Reservation
↓
Order
↓
Customer Payment / COD
↓
Profit Snapshot
↓
Warranty
```

Nếu máy có vấn đề:

```text
Purchase
↓
QC Fail
↓
Supplier Return
↓
Supplier Received
↓
Refund / Replacement
```

ADMIN phải có thể nhìn Dashboard và biết ngay:

```text
Có bao nhiêu máy?

Máy đang ở đâu?

Bao nhiêu máy đang trên đường?

Bao nhiêu máy chưa QC?

Bao nhiêu máy đang sửa?

Bao nhiêu máy tồn lâu?

Bao nhiêu vốn đang nằm trong tồn kho?

Bao nhiêu tiền đang nằm ở COD?

Khách đang nợ bao nhiêu?

CitiLap đang nợ supplier bao nhiêu?

Supplier còn phải refund bao nhiêu?

Máy nào cần xử lý hôm nay?

Doanh thu bao nhiêu?

Giá vốn thực bao nhiêu?

Lãi gộp bao nhiêu?

Chi phí trực tiếp bao nhiêu?

Lãi sau chi phí trực tiếp bao nhiêu?
```

Đây là mục tiêu kiến trúc của phiên bản CitiLap Admin tiếp theo.

---

# 108. Chỉ dẫn bắt đầu cho Codex

Không triển khai toàn bộ tài liệu trong một lần.

Bắt đầu bằng:

```text
PHASE 1 — Procurement
```

Trước khi sửa code:

1. Đọc toàn bộ project context.
2. Inspect schema hiện tại.
3. Inspect `init_full_db.sql`.
4. Inspect toàn bộ migration liên quan.
5. Inspect `InventoryContext`.
6. Inspect `dbService.js`.
7. Inspect auth/API helpers.
8. Inspect Orders/Payments để hiểu pattern transaction hiện tại.
9. Kiểm tra xem supplier/purchase concepts đã tồn tại một phần hay chưa.
10. Không tạo duplicate abstraction nếu đã có.

Sau khi inspect, lập kế hoạch chính xác cho:

```text
suppliers
purchase_batches
purchase_items
supplier_payments
```

và quan hệ của chúng với:

```text
laptops
financial_records
activity_logs
user_profiles
```

Đặc biệt phải xác định trước khi code:

```text
supplier payment có reuse financial_records hay không?

purchase item chuyển thành laptop tại thời điểm nào?

exchange rate snapshot nằm ở batch hay item?

một laptop có thể đổi supplier không?

purchase cancellation xử lý payment thế nào?

purchase batch đã confirm có được sửa giá hay không?

supplier return sau này sẽ reference purchase_item bằng cách nào?
```

Sau khi có câu trả lời từ code/schema hiện tại, mới triển khai Phase 1.

Không tự ý triển khai Phase 2+ trong cùng batch.

---

# 109. Phase 8 Completion & Hardening — 2026-09-22

Verified repository implementation:

```text
financial_records = legacy operational reporting ledger
payments / supplier_payments / supplier_refunds = business event ledgers
account_transactions = cash-location ledger only
```

Added additive hardening migration:

```text
db/migrations/20261004_phase8_legacy_finance_conflicts.sql
db/migrations/20261006_phase8_financial_operations_hardening.sql
```

Dev Supabase contains an earlier unused finance prototype with empty tables named
`account_transactions`, `cod_receivables` and `cod_settlements`. The preflight
migration verifies those legacy signatures and zero row counts, then preserves
them as `legacy_*` before the Phase 8 base migration creates its authoritative
tables. It raises instead of renaming if any legacy table contains data.

It fixes reconciliation by locking `cash_accounts`, adds consistent COD `DELIVERED`
transitions, and atomically links customer payments, supplier payments, supplier
refunds and COD settlements to exactly one account transaction.

Active finance routes:

```text
/finance
/finance/cod
/finance/receivables
/finance/payables
/finance/accounts
/finance/transactions
```

Server endpoints are role checked. Full finance operations are ADMIN-only. SALES
may read only the minimal active VND account identity needed for its existing
customer-payment permission; balances and ledger history remain hidden.

Cross-currency account transfer is intentionally deferred. VND and CNY balances
must remain separate.

Live verification on 2026-09-22 confirms the Phase 8 preflight, base and
hardening migrations were applied to Dev Supabase. All five finance tables are
reachable by `service_role` and denied to `anon`; the finance summary, customer
payment, supplier payment, supplier refund and reconciliation RPCs are exposed.
ADMIN authentication and six read-only Finance APIs passed a 22-check live smoke
suite.

Final transactional verification on 2026-09-22 added and ran
`qa/live-phase8-e2e.mjs`. The controlled `TEST-FIN-` suite passed 186/186 checks,
including opening-balance cutover, customer/supplier/refund/COD cash effects,
idempotency, concurrent retries, append-only ledgers, reconciliation, role API
matrix, direct RLS/RPC denial, pagination and QA-user deactivation.

Live E2E found a duplicate legacy COD status constraint named
`cod_receivables_status_check1`. `db/migrations/20261007_phase8_cod_status_constraint_repair.sql`
was applied successfully to Dev Supabase and the COD scenarios then passed.

Final regression hardening added and applied:

```text
db/migrations/20261008_phase8_regression_trigger_hardening.sql
db/migrations/20261009_phase8_action_center_resolution.sql
```

The Phase 4 failure came from `sync_repair_cost_trigger()` reading
`NEW.completed_by` on `repair_jobs`, whose actor column is `created_by`. The new
migration replaces the function without editing applied history and recreates
only the intended `repair_sync_landed_cost` attachment. Phase 4 then passed 75
checks and Phase 3 passed 52 checks.

The final Phase 1-8 matrix passes: Phase 1-2 69/69, Phase 3 52, Phase 4 75,
Phase 5 52, Phase 6 61, Phase 7 27, and Phase 8 186/186. Legacy Phase 1-2 supplier
payment fixtures now provide dedicated CNY/VND account IDs. Deprecated base RPCs
remain internal compatibility primitives; production routes use account-aware
wrappers.

Browser verification covers Finance overview, accounts, COD, receivables and
payables with live mutations and authoritative refresh after reload. ADMIN has
full access. SALES, TECH, TECHNICAL and STAFF hide the Finance navigation; direct
Finance URLs render an access-denied view, while the API matrix returns 403.
SALES retains only sanitized active VND account identities for customer payments.

The financial Action Center exposes deterministic drill-down links for overdue
customer receivables, overdue COD, disputed COD and account reconciliation
differences. `qa/live-phase8-action-center-e2e.mjs` verifies all four alerts,
resolution behavior, and null-date protections in 11/11 checks. Migration
`20261009` permits an otherwise valid COD settlement to resolve a disputed COD
while retaining account, amount, idempotency and append-only controls.

Final validation on 2026-09-22: local finance DB verification 11/11, live Phase 8
transactional E2E 186/186, ESLint pass, production build pass, and QA accounts
deactivated. TEST data is intentionally retained for auditability. Phase 8 is
complete and the repository is ready to begin Phase 9 in a separate batch.

---

# 110. Phase 9 Sales Operations Completion — 2026-09-22

Phase 9 adds authoritative reservation, trade-in and commission workflows using
the additive migrations below. All three were applied successfully to Dev
Supabase:

```text
db/migrations/20261010_phase9_sales_operations.sql
db/migrations/20261011_phase9_sales_operations_hardening.sql
db/migrations/20261012_phase9_commission_ledger_constraint_repair.sql
```

Reservations enforce one active hold per laptop, expiry and conversion rules,
idempotency, row locking, and a database gate that prevents competing order
assignment. Trade-ins require an immutable inspection snapshot before valuation,
reduce customer obligation as non-cash credit, and create exactly one locked
waiting-QC inventory asset, acquisition cost and stock movement. Commissions are
generated from committed order snapshots, become immutable after approval, and
post exactly one VND cash-ledger outflow when paid. Commission expense does not
mutate laptop landed cost or the order's pre-commission snapshot.

Active operational routes are `/reservations`, `/trade-ins` and `/commissions`,
served through the role-checked `/api/sales-operations` endpoint. Inventory now
shows active reservation metadata and ADMIN-only trade-in lineage. Orders show
reservation/trade-in links and payment composition; ADMIN additionally receives
commission details and authoritative net contribution after commission. SALES,
TECH, TECHNICAL and STAFF responses do not receive ADMIN financial summaries.

The ADMIN management dashboard includes deterministic Phase 9 alerts for active
reservations expiring within two hours, draft trade-ins awaiting inspection and
pending commissions. Drill-down targets preserve the relevant status filter.
`qa/live-phase9-action-center-e2e.mjs` verifies appearance, resolution,
ADMIN-only visibility and drill-down targets in 10/10 checks.

Final live verification passed `qa/live-phase9-e2e.mjs` 57/57 and
`qa/sales-operations-db-verification.mjs` 20/20. The repaired legacy PGlite
regression harness now applies `20260907_payments_finance_ledger.sql`; procurement
and landed-cost regressions both pass without a synthetic payments table. Phase
7 remains 27/27, Phase 8 Action Center remains 11/11 and Phase 8 transactional
E2E remains 186/186.

Browser role verification used real Supabase sessions. ADMIN sees the Sales
Operations Action Center and all three modules. SALES can access reservations and
trade-ins but not commissions. TECH and TECHNICAL can access trade-ins without
valuation fields and are denied reservations/commissions. STAFF has no Phase 9
navigation and direct URLs render access denied. Finance navigation remains
hidden for every non-ADMIN role. All temporary browser QA accounts were
deactivated after verification.

Final static gates: ESLint pass, production build pass and `git diff --check`
pass (line-ending warnings only). Phase 9 is complete; Phase 10 has not started.

---

# 111. Operations Pilot — 2026-09-22

CRM is deferred while the owner runs the current seed data through real operating
flows. The active plan and first audit are in:

```text
docs/operations-pilot-plan.md
docs/pilot-core-flow-audit.md
```

The first core-flow audit found that legacy order normalization, payment UI and
invoice snapshots did not include Phase 9 `trade_in_credit_vnd` when calculating
customer debt. The application fix and additive repair migration are:

```text
db/migrations/20261013_phase9_trade_in_obligation_repair.sql
qa/trade-in-obligation-db-verification.mjs
```

The migration enforces `sale price - cash paid - trade-in credit` at the database
boundary and resynchronizes affected invoice payment snapshots. The owner applied
it to Dev Supabase on 2026-09-22. The extended Phase 9 live suite then passed
64/64, including an ordinary order edit followed by a customer payment on an
accepted trade-in order.

PILOT-04 now treats payment status and monetary totals on an existing order as
ledger-owned fields. The order table and edit form display payment status as
read-only, the Orders API preserves the existing financial fields during ordinary
edits, and the order row links directly to a preselected payment form. New-order
cash entry is also removed: a new order starts unpaid, then deposits and balances
are recorded through the Payments workflow with an explicit VND cash account.
The API rejects opening cash, paid/deposited/refunded status, deposited order
status, and zero sale price on creation. Inventory labels now distinguish RMB,
VND/RMB exchange rate, and million-VND selling/import prices. Pilot browser smoke
passes 20/20 checks for these form guards and the core navigation.

PILOT-05 added `qa/pilot-data-load-measure.mjs`. On the development server,
the `/orders` baseline was 62 API requests / 171,852 response bytes because
each eligible order queried its invoice separately and the global context loaded
unrelated payments, stock movements, warranty and settings. Orders now include
`invoiceId` in their list response and the context loads route-specific datasets.
The same measurement is 6 requests / 85,741 bytes: 90.3% fewer requests and
50.1% fewer response bytes. Development Strict Mode accounts for the remaining
duplicate `/api/months` request; production runs that effect once.

Route-aware loading retains the datasets each page consumes. `/warranty` measures
7 requests / 86,160 bytes. `/payments` measures 9 requests / 172,384 bytes and no
longer downloads inventory; its development-only duplicate financial-record and
cash-account effects remain visible for later production comparison. Inventory
status/category/location/charger and order branch selection are now marked as
required in the UI, matching downstream operational and invoice requirements.

PILOT-06 removed the legacy trade-in shortcut from new orders. That shortcut
created an immediately available laptop without a trade-in dossier, inspection,
receiving or QC. New trade-ins must use `/trade-ins`; the Orders API rejects new
legacy trade-in payloads and preserves any historical `trade_in_laptop_id` during
ordinary edits. Existing legacy orders remain readable. The obsolete
`preserveExplicitPaymentStatus` post-RPC update was also removed so the payment
ledger, order RPCs and `enforce_order_customer_obligation()` remain authoritative.

The second PILOT-06 pass found that the active-reservation trigger did not
actually compare `requested_laptop_id`, allowing a requested-only order to bypass
an ACTIVE reservation. `20261014_phase9_reservation_integrity_repair.sql` covers
both order laptop references, rejects reservation conflicts with another order,
and requires any linked deposit payment to be a positive non-refund payment from
the same order. The Orders and Sales Operations APIs apply the same guards.
Commission has no parallel legacy write path: Phase 9 `commissions` plus its
account transaction is authoritative. Legacy browser scenarios now treat payment
status as read-only and direct users to `/payments`.

Migration `20261014` was applied to Dev Supabase on 2026-09-22. The extended
Phase 9 live suite passed 70/70, including requested-only reservation conflicts
and cross-order deposit-payment rejection. PILOT-07 is now active. The original
54 active `TEST-*` cash accounts were made inactive without deleting history;
four zero-balance PILOT accounts now provide clean VND/CNY choices. The current
aggregate snapshot is `docs/pilot-baseline-latest.json` and the operator checklist
is `docs/pilot-run-log.md`.

The first controlled PILOT-07 core rehearsal passed 17/17 using isolated fixture
`PILOT-CORE-MUCVKQH9`: order 129, laptop 173 and invoice 5. A 2m deposit plus
10.5m balance produced a paid order with zero debt, a sold/locked laptop, two
ledger payments, a settled invoice snapshot and exactly 12.5m VND in the pilot
bank account. The first attempt exposed an opening-balance timestamp later than
the payment date's start of day; `qa/prepare-pilot-seed.mjs` now uses a stable
2026-01-01 opening boundary for pilot accounts.

The PILOT-07 cancellation/refund rehearsal found that payment and inventory
behavior was correct, but a cancelled/refunded order remained in customer
receivables because the Phase 8 view only checked `is_active` and positive debt.
`20261015_cancelled_receivable_repair.sql` excludes cancelled, returned and
refunded orders from both the receivable list and financial summary. The owner
applied it on 2026-09-22; the isolated rerun passed 16/16 on order 131 and the
financial DB verification passed 14/14.

The controlled COD rehearsal in `qa/pilot-cod-live.mjs` passed 27/27 on order
133. Delivery moved the 15m obligation from customer receivables to the carrier
without posting cash. Concurrent retry of the 10m partial settlement produced
one settlement and one cash transaction, over-settlement was rejected, and the
final 5m settlement moved COD to `SETTLED`. The pilot bank balance increased
exactly 15m from 12.5m to 27.5m with no reconciliation difference. A first
script attempt stopped after delivery because it queried a nonexistent test-only
ledger column; its seed fixture remains order 132 for audit visibility.

The warranty pilot on order 133 passed 21/21 application checks. It exposed that
the prior API validated order and laptop existence independently, allowing a
warranty to reference an order for another physical device and allowing parallel
open cases. The Warranty API now enforces the order/device relationship,
immutable source device, known statuses, resolved-date semantics and one open
case. `20261016_warranty_integrity_repair.sql` added the equivalent trigger and a
partial unique index at the database boundary and was applied on 2026-09-22.
Direct verification then found a PostgreSQL null-semantics defect in its order
link check: `NOT IN` became unknown when one order laptop reference was null.
The test-only invalid row was removed. The additive
`20261017_warranty_order_link_null_repair.sql` replaces that comparison with
null-safe `IS DISTINCT FROM`.

The owner applied `20261017` on 2026-09-23. The final warranty suite passed
26/26, including direct database rejection and a concurrent open-case race where
exactly one request succeeded. The winning race fixture was closed afterward.

The Settings pilot passed 21/21. System option groups used by application and
database semantics can now change labels and ordering but cannot add arbitrary
keys, rename keys, deactivate or delete them. Extensible catalog groups retain
normal create/update/deactivate behavior. The formula API returns and stores only
the three consumed fields (`shippingVnd`, `divisor`, `defaultRate`); the unused
legacy `currencyUnit` seed property was removed without changing calculations.

The first UI pilot pass inspected the live ADMIN dashboard at desktop and mobile
sizes. User-facing management labels now use Vietnamese operational language
instead of internal codes such as `COD_DISPUTED`, `QC exposure`, `cost complete`
and `legacy`. The sidebar names Shipments as `Vận chuyển TQ–VN`. The extended
browser smoke suite passed 23/23 across the core routes and both navigation
layouts; browser console inspection showed no errors.

The second UI pilot pass inspected Inventory and Orders at desktop and mobile
sizes. Status rows now use light background tints with a stronger left accent,
keeping workflow state visible while improving the readability of dense inputs
and financial values. Inventory table and CSV headers explicitly distinguish RMB,
VND/RMB and million VND. Duplicate filter label IDs were removed so category and
warehouse location have separate accessible names. Browser smoke passed 25/25;
lint, the 66-page production build and diff validation also passed.

The third UI pilot pass removed the legacy `financial_records` write path from
the Payments screen. Operational cash adjustments now direct ADMIN users to the
Phase 8 account transaction ledger, which is the source used for recorded cash
balances. Payment tables state their million-VND unit, and Finance translates
account types, COD states, aging buckets, payable states, directions and
transaction/reference types into Vietnamese operator labels. Lint, the 66-page
production build and diff validation passed. The expanded browser smoke could
not pass its login gate because the Supabase Auth session did not navigate away
from `/login` within 30 seconds, including after a local dev-server restart; no
new UI assertion was reached or failed.

The fourth UI pilot pass repaired the login/profile race and added visible
loading states for sign-in, session recovery and operational route data. Initial
route APIs are now scheduled in batches of at most two, `/login` no longer
starts an unnecessary options/month load, and the management dashboard waits
for the core dataset. A live browser measurement recorded 814 ms to navigation,
2.37 seconds to dashboard readiness and a maximum of two concurrent local API
requests. Browser smoke passed 27/27, targeted lint passed, and the 66-page
production build completed successfully. Chrome's compromised-password dialog
is owned by Google Password Manager; autocomplete hints reduce accidental
credential reuse prompts but the seed password must be changed if Chrome still
flags that credential.

The fifth UI pilot pass compacted shared page headers so operational content
starts higher in the viewport. The sidebar now identifies the application as
`KHO CITILAP`, displays the signed-in employee name beneath it and replaces the
separate Supabase Cloud card with a live database-status icon beside that name.
A shared 50-record paginator now covers operational and administration lists;
inventory and orders remain intentionally unpaginated. Finance server pagination
also uses 50 records per page. Browser smoke passed 30/30, including the new
sidebar identity and database-state assertions; targeted lint and the 66-page
production build passed.


## Screen audit follow-up (2026-09-23)
See docs/pilot-screen-audit.md for fixes and evidence: 54 route/viewport checks, 32 create-form openings, 6 UI feedback checks (mocked mutation), targeted lint and production build passed. Detailed edit dialogs, role matrix and persistence checks remain explicitly outstanding.

## Database reset package (2026-09-24)

The owner requested a fresh seed database for June through September 2026.
`init_full_db.sql` is now generated by `qa/build-db-init.mjs` from the historical
core plus all 41 migrations through 20261017. It rebuilds public transactionally
and preserves existing auth users/profile roles. `reseed_data.sql` creates 480
laptops, 320 orders, 416 payments with matching cash ledger entries and 32 COD
receivables, evenly distributed across the four months. Known opening inventory
costs are recorded; procurement lineage intentionally remains LEGACY.
PGlite validation passed seven groups including repeated reset/seed, profile
preservation, ledger/debt/stock/cost consistency and dashboard functions.
Remote Supabase reset has NOT been performed by the agent. Apply init then seed
as postgres in SQL Editor; see `docs/database-reset-2026.md` for exact scope.
