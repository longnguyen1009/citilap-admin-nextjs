# CitiLap Admin design context

## Product and audience
Vietnamese internal laptop operations. Preserve the compact inventory and purchase tables; this feature does not redesign either screen.

## Runtime ownership
Existing colors, spacing and typography are owned by `app/globals.css`, page styles and `components/ui/button.jsx`. Confirmation overlays use `components/ui/modal.jsx` and its Radix Dialog implementation.

## Cancellation
`components/CancelLaptopModal.jsx` is the shared confirmation for purchases and inventory. Identify the laptop, explain the editing/order lock, focus the safe action first, prevent duplicate submission and show failures inside the dialog. Use the existing destructive Button variant for confirmation. The stored status remains `ignored`; the Vietnamese label is HỦY.
