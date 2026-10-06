# Cloudflare migration status

## Local integrity consolidation - 2026-10-06

- Added D1 migration `0020_integrity_consolidation.sql` to canonicalize `TECH` to `TECHNICAL`, seed `KHO TQ`, reconcile supplier-purchase compatibility aliases and keep `price_rmb`/`exchange_rate` synchronized from canonical `purchase_*` fields.
- Repaired blank-database reproducibility in migrations 0010/0013/0015 by seeding required supplier/account references instead of assuming remote-only catalog rows or IDs.
- Order profit and committed cost snapshots are derived server-side from `laptops.import_price_vnd`; commission creation requires a complete snapshot. Trade-in inventory conversion now writes the agreed acquisition value into `import_price_vnd` so later order profit uses the same canonical rule.
- Removed arbitrary Dashboard `<100` million caps and derive inventory potential margin from sale price minus `import_price_vnd` instead of a transient laptop `profitVnd` field.
- Canonical role groups now live in `lib/roles.mjs`; authenticated legacy `TECH` values normalize to `TECHNICAL` before route/UI authorization.
- Local verification: D1 migration chain 20/20 with clean foreign keys; workerd runtime PASS; auth 12/12; view parity 7/7 (103 rows); operation coverage 54/54 with zero pending; ESLint PASS; Next.js production build 68/68 pages; `git diff --check` PASS.
- These 2026-10-06 changes are local only; no production D1 migration or Worker deployment was performed as part of this audit.

## Operations UI update — 2026-10-02

- Purchases, receiving, QC and actual costs now use compact spacing, navy headers, strong outer borders and visible table separators.
- QC has waiting/history views and client-side search; supplier names use the enriched inventory field.
- Actual costs have aligned numeric columns, an emphasized total and an explicit detail button.
- Validation: targeted ESLint and diff checks passed; OpenNext build generated 68/68 pages. Authenticated desktop browser checks covered all four screens, QC filtering and history switching. Receiving currently has no pending machines, so its populated selection workflow was not exercised.
- Production version: `be7c5d2a-1f29-469d-978b-b3c6effb9069`. Final screenshot confirms white header text, compact metrics and a single-row cost toolbar. An existing browser cache referenced prior CSS assets after deployment; a fresh URL loaded the new styles correctly. Reload old tabs with Ctrl+Shift+R.

Updated 2026-10-01. The Worker is deployed to production and the initial ADMIN is active; authenticated browser workflow verification remains.

## Agreed target

- Next.js full-stack on Cloudflare Workers (user selected Workers instead of Pages).
- D1 database, R2 images, user/password/session records in D1.
- Fresh operational data; no copy or destructive changes to the Supabase source.

## Provisioned and verified remotely on 2026-09-30

- D1 `citilap-admin`, ID `a771bd4e-34fb-40a3-86ef-80f31acde278`, APAC.
- R2 `citilap-admin-images` and `citilap-admin-cache`.
- Migrations 0001 through 0005 applied successfully. Migration 0004 makes `app_settings` a validated two-key JSON store, seeds the canonical import-price formula when absent and preserves existing presets. Migration 0005 seeds the canonical Settings catalog in `app_options` without overwriting existing administrator customizations.
- Remote foreign key check returned no violations.
- Worker `citilap-admin` deployed at `https://citilap-admin.restless-snowflake-aaae.workers.dev`, version `591a7406-5bb6-4141-9c1b-99e0628ea5cd`.
- Production HTTP checks: `/login` returned 200, `/api/auth/session` returned `{"user":null}`, and unauthenticated `/api/inventory` returned 401.
- Initial ADMIN was bootstrapped from the local `.env`; production sign-in and session restoration both returned role `ADMIN`.
- Remote D1 has exactly one `auth_users` row and one active ADMIN profile. `BOOTSTRAP_TOKEN` was deleted after creation; the bootstrap endpoint now returns 404 `Bootstrap is not configured`.
- Production Settings verification returned the canonical formula (`shippingVnd=400000`, `divisor=1000000`, `defaultRate=3990`) and all eight existing presets; `PRAGMA foreign_key_check` returned no rows.
- Production `app_options` contains 78 active defaults across all 14 supported Settings groups; the group counts match `lib/fieldOptions.js` and `PRAGMA foreign_key_check` remains clean.

## Implemented locally

- OpenNext build and Wrangler configuration with request-scoped bindings.
- Scoped Windows directory-junction workaround; OpenNext bundle and Wrangler dry-run passed.
- 38 business tables, authentication/storage tables, constraints/indexes and seven report views.
- Session service and `/api/auth/session`; authenticated R2 upload/read/delete endpoints.
- `AuthContext` now restores/signs in/signs out through the HttpOnly D1 session cookie. Browser API helpers no longer read or send Supabase bearer tokens.
- D1 account creation/list/update service; atomic user/profile writes, password-change revocation, last-administrator protection.
- `/api/users` now uses D1 exclusively. `/api/auth/bootstrap` creates exactly one initial ADMIN using a Wrangler secret and then fails closed once any account exists.
- Procurement service: create purchase batch, add laptops to an existing batch, receive expected and unknown laptops atomically, correct procurement fields/tracking, reconcile an unknown physical laptop with an expected placeholder while preserving the physical ID, ignore incoming laptop, and start QC.
- Supplier-return creation service derives the supplier from purchase lineage, enforces one supplier per return, moves laptops atomically and records item/event/audit history with replay protection.
- QC completion now runs fully in one D1 transaction for `PASS`, `FAIL`, `REPAIR` and `RETURN_CN`. It validates and stores technical details, updates canonical laptop serial/battery/condition fields, records movement/audit history and creates the linked repair job or supplier return atomically with replay protection.
- D1 read adapter: bound filters, consistent pagination/count, boolean/JSON decoding, nested one-to-one and one-to-many relationships, inner relation selection and related-column filters.
- D1 mutation adapter: insert/upsert/update/delete, atomic multirow writes and transaction-level single-row cardinality guards.
- Cash-account create/update and month-listing services added and checked in workerd.
- Repair services: start/update/complete/cancel jobs, add actions, add/remove parts, return laptops to QC and synchronize completed repair costs. Local workerd tests cover idempotent replay, audit-failure rollback, transition guards and closed-job rejection.
- Laptop cost services: idempotent manual-cost creation, completed-repair cost synchronization and manual-cost voiding, with audit writes in the same D1 transaction.
- `/api/repairs` and `/api/costs` now use D1 sessions, the D1 query adapter and registered D1 business operations.
- `/api/intake`, `/api/purchases`, `/api/months` and `/api/qc` now read/write D1 and require D1 sessions. `/api/activity-logs` also reads D1 directly with the existing role-based field filtering. These routes no longer mix their data source.
- Supplier-return transitions, account-linked CNY refunds and replacement linking now use D1 transactions. Refund retries preserve closed returns and reject keys reused for another return/account/amount; refund and cash ledger writes roll back together.
- `/api/supplier-returns` and `/api/cash-accounts` now use D1 sessions and D1 data exclusively, including the CNY account selector used by supplier refunds.
- `/api/supplier-payments` now uses D1 exclusively. Payment, outgoing CNY ledger and audit are committed in one batch; validation rejects overpayment, invalid dates, pre-opening dates and conflicting replay keys.
- Manual cash transactions and same-currency transfers use atomic D1 batches with replay guards and audit. `/api/account-transactions` reads and writes D1 through ADMIN sessions. Workerd verifies manual rollback/replay and balanced, retry-safe transfer legs.
- Cash-account reconciliation now derives the recorded balance from the immutable D1 ledger and commits the reconciliation plus audit atomically. `/api/account-reconciliations` and `/api/payables` now use D1 sessions and queries.
- Supplier list/create/update and audit now use D1 exclusively, including duplicate-code rejection and transaction rollback.
- Customer order payments now use D1 end to end through `/api/payments`. Payment, financial record, order/laptop state, stock movement, VND cash ledger and audits commit atomically with replay protection; deposit, final payment, refund and rollback paths run in workerd.
- `/api/financial-operations` now builds its receivable, COD, supplier payable/refund, account balance and reconciliation summary from D1 views and tables.
- COD creation, delivery/status transitions and VND settlement now run as atomic D1 operations. Delivery records the customer payment and financial record without adding cash to the account ledger; settlement adds the cash ledger entry when the carrier remits funds. Workerd covers partial settlement, dispute, full settlement, replay conflicts and audit rollback.
- `/api/cod`, `/api/receivables` and `/api/financial-records` now use D1 exclusively. Manual financial records validate linked orders/laptops and commit their audit in the same batch.
- Order allocation now uses D1 end to end. It checks the expected current owner, rejects committed machines, atomically transfers a machine between eligible orders, refreshes both laptop states and writes both audits. Workerd covers stale-owner rejection and audit rollback.
- Reservation operations now use D1: expiration releases eligible laptops, create/replay locks an available laptop, extension preserves active-state rules, cancellation releases it, and conversion links a valid draft order atomically. `/api/sales-operations` now uses D1 sessions and the D1 query adapter for reservations, trade-ins and commissions.
- Commission create/approve/pay now use D1 transactions. Creation requires a committed order with a cost snapshot, payment uses an active VND account and writes one immutable cash-ledger entry; workerd covers replay and audit rollback at every stage.
- Trade-in create, inspection, acceptance/rejection, receiving and inventory conversion now use D1. Workerd covers replay, checklist/quote transitions, order credit/debt updates, receiving, inventory conversion and the rejection branch.
- The final order create/update, core order-payment, invoice issue and management-dashboard operations are registered in D1. `/api/orders`, `/api/invoices` and `/api/management-dashboard` now use request-scoped D1 bindings and D1 sessions; order audit writes are performed by the D1 operation rather than a separate Supabase call.
- All 56 RPC names from the original migration inventory are implemented. After direct D1 route conversions removed two obsolete RPC callers, the current generated coverage is 54 referenced, 54 registered and zero pending. The additional lower-level receiving operation is also implemented. Registration and local workerd coverage do not by themselves prove full PostgreSQL business parity or complete route/browser integration.

All API route modules now use request-scoped D1/R2 bindings and D1 sessions. The remaining customer, export, inventory, invoice-catalog, options, presets, stock-movement, warranty, settings and month-roll paths were migrated, and the browser inventory context no longer checks Supabase Auth. The Supabase client modules and npm dependency have been removed. Cloudflare Access is intentionally deferred.

- `InventoryContext` now loads route-specific metadata only when entering a page that uses it. Its 60-second refresh is limited to the current route's laptop/order datasets; options, months, settings, payments, warranties and customers are no longer polled. Background refresh also leaves connection state stable, preventing the Dashboard from refetching its management aggregate every minute.
- Inline purchase drafts are removed from state and `sessionStorage` immediately after `addToBatch` succeeds. The subsequent purchase-list refresh runs in the background so it cannot unmount the table before draft cleanup; failed saves continue to retain their draft.
- Inventory rows now derive supplier display name and batch code from the canonical `laptops.purchase_batch_id -> purchase_batches.supplier_id -> suppliers` lineage. The edit modal displays the supplier and links its purchase batch. Client-only `importPriceManuallyEdited` and derived `profitVnd` values are excluded from laptop writes, preventing nonexistent D1-column errors.

## Verification

- `node --test qa/cloudflare-auth.test.mjs`: 11/11 tests, including the single-use initial-admin transaction.
- `node qa/cloudflare-view-parity.mjs`: 7/7 report comparisons, 103 rows. COD fixture contains zero rows, so COD value parity remains unverified.
- `node qa/cloudflare-runtime.mjs`: real local workerd/D1/R2 smoke checks with all three D1 migrations, including session, user changes, mixed expected/unknown receiving, add-to-batch and reconciliation replay, physical-ID preservation, repair completion/cancellation, repair and manual cost replay, supplier CRUD, account reconciliation, order payment/refund and the financial operations summary. QC checks cover all four dispositions, replay, late audit-failure rollback, canonical serial/battery/detail mapping and atomic linked repair/supplier-return creation.
- `node qa/cloudflare-coverage.mjs --require-complete`: 54 currently referenced, 54 registered, zero pending; the registry still contains all 56 operations from the original inventory.
- Targeted ESLint and `git diff --check`: pass.
- Supplier-return workerd checks pass for transition guards, shipment tracking requirements, partial/full refunds, cash ledger replay, audit-failure rollback, closed-return replay and replacement linking. Browser/HTTP role coverage for these routes remains pending.
- Supplier-payment workerd checks cover ledger replay, conversion to VND, audit rollback, overpayment and date/account guards.
- Full Next.js/OpenNext build completed on 2026-10-01 after all API routes and browser auth/data callers were moved off Supabase: 68/68 pages generated and `.open-next/worker.js` produced.
- Next.js production build passed on 2026-10-02 after route-scoped polling changes: 68/68 pages generated.
- Production browser verification on 2026-10-02 confirmed laptop #2 displays supplier `We-莫名`, links batch `PO-20261002-001`, and saves successfully from the Inventory edit modal without a D1 column error.
- Fresh `wrangler deploy --dry-run` passed with D1, both R2 buckets, assets and the Worker self-reference bound.
- Scripts import PGlite from this repository's pinned dependency; no external temporary installation required.
- Tests above are local; they do not prove browser flows or production Worker behavior.

## Remaining required work

1. Review the newly registered order/invoice/dashboard operations against every PostgreSQL trigger side effect and extend business-parity tests where the current D1 implementation is intentionally smaller.
2. Add HTTP/browser workflow and role tests for the final catalog, inventory, warranty, settings and month-roll routes, including reload persistence.
3. Integrate image upload into appropriate product flows.
4. Remove obsolete deployment references and update PROJECT_CONTEXT.
5. Complete authenticated production browser verification.

`source-inventory.json` captures the original scan; rerunning its generator updates it to the current source tree, so it is not a fixed denominator for migration completion. `postgres-catalog.json` captures the final local PostgreSQL catalog from the migration chain, not the live Supabase schema.
