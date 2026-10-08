# Scoped workflow contract

## Laptop cancellation
- ADMIN is the existing owner of intake cancellation permissions.
- Both purchase and inventory actions open `CancelLaptopModal`, using the shared Modal and Button primitives.
- Không hủy closes without mutation. Xác nhận HỦY sends one request while pending; errors remain in the dialog for retry.
- Success updates inventory context and refreshes the purchase list. Cancelled rows remain visible after reload, labeled HỦY, with editing disabled and no order allocation.
- Preserve sold, reserved and supplier-return workflows. Active order links and reservations prevent cancellation atomically.
- API lifecycle logic lives in `lib/cloudflare/procurement.mjs`; list queries include inactive ignored rows explicitly, without including other inactive rows.

## Customer buyback and exchange
- Business source: user specification dated 2026-10-08; exchange uses an entered buyback value and immediate cash difference receipt.
- `/trade-ins` uses shared Modal, Button, Input and Radix Select. Select popups are above the modal and match their trigger width. Vietnamese labels and VND amounts are explicit.
- ADMIN confirms stock receipt and settlement, preserving existing trade-in receiving authority. SALES/SALES_TECH can read seller details; TECHNICAL receives a restricted list.
- Walk-in intake asks seller name, laptop name, category and serial. Historical buyback additionally requires phone and a selected sold order. Both create waiting-QC stock in the current business month.
- Exchange review names the old order cancellation, returned stock, new laptop, buyback value, sale price, account and immediate difference. The old customer identity/address are copied server-side.
- Form errors preserve entries; confirmation has a stable idempotency key until an input changes. Duplicate submission is disabled. Closing an edited form asks whether to discard.
- Search inside the modal is explicit, abortable and transient because it can contain customer contact details. List pagination is server-side, 20 records per page.
- Service and atomicity contract: `lib/cloudflare/trade-in-workflows.mjs`; acquisition history guards: `0021_trade_in_workflows.sql`. Old exchanged/reacquired orders remain historical and cannot reassign stock.
