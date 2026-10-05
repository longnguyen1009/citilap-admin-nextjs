# Scoped workflow contract

## Laptop cancellation
- ADMIN is the existing owner of intake cancellation permissions.
- Both purchase and inventory actions open `CancelLaptopModal`, using the shared Modal and Button primitives.
- Không hủy closes without mutation. Xác nhận HỦY sends one request while pending; errors remain in the dialog for retry.
- Success updates inventory context and refreshes the purchase list. Cancelled rows remain visible after reload, labeled HỦY, with editing disabled and no order allocation.
- Preserve sold, reserved and supplier-return workflows. Active order links and reservations prevent cancellation atomically.
- API lifecycle logic lives in `lib/cloudflare/procurement.mjs`; list queries include inactive ignored rows explicitly, without including other inactive rows.
