# Database map — remote D1, 2026-10-07

## accessories

Domain: Settings / Sales. Purpose/workflow: Danh mục quà, phụ kiện hóa đơn. Classification: ACTIVE. Live rows: 4.

PK: id INTEGER. FK: Không có FK khai báo. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R. Module chính: invoice-catalog; remaining; Invoices.

Runtime references: [app/api/exports/route.js:37](../../app/api/exports/route.js#L37); [app/api/invoice-catalog/route.js:9](../../app/api/invoice-catalog/route.js#L9); [lib/cloudflare/remaining.mjs:145](../../lib/cloudflare/remaining.mjs#L145); [lib/exportData.js:3](../../lib/exportData.js#L3); [components/InvoiceOrderFields.jsx:7](../../components/InvoiceOrderFields.jsx#L7); [components/pages/InvoiceCatalog.jsx:9](../../components/pages/InvoiceCatalog.jsx#L9)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "accessories" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT DEFAULT 'other' NOT NULL,
  "price" NUMERIC DEFAULT 0 NOT NULL,
  "note" TEXT DEFAULT '' NOT NULL,
  "active" INTEGER DEFAULT true NOT NULL CHECK ("active" IN (0,1)),
  CONSTRAINT "accessories_kind_check" CHECK (kind IN ('mouse', 'backpack', 'mousepad', 'sleeve', 'other')),
  CONSTRAINT "accessories_name_check" CHECK (length(trim(name)) >= 1 AND length(trim(name)) <= 240),
  CONSTRAINT "accessories_price_check" CHECK (price >= 0),
  CONSTRAINT "accessories_sku_check" CHECK (length(trim(sku)) >= 1 AND length(trim(sku)) <= 80),
  CONSTRAINT "accessories_sku_key" UNIQUE (sku)
);
```

Indexes (1, gồm autoindex):

- `sqlite_autoindex_accessories_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## account_reconciliations

Domain: Finance / Reconciliation. Purpose/workflow: Biên bản đối soát số thực tế với số sổ. Classification: QUESTIONABLE DESIGN. Live rows: 0.

PK: id TEXT. FK: account_id → cash_accounts(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C. Module chính: accounts; account-reconciliations; Finance.

Runtime references: [app/api/account-reconciliations/route.js:7](../../app/api/account-reconciliations/route.js#L7); [lib/cloudflare/accounts.mjs:11](../../lib/cloudflare/accounts.mjs#L11); [lib/cloudflare/payment-correction.mjs:11](../../lib/cloudflare/payment-correction.mjs#L11)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "account_reconciliations" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "account_id" TEXT NOT NULL,
  "recorded_balance" NUMERIC NOT NULL,
  "actual_balance" NUMERIC NOT NULL,
  "difference" NUMERIC GENERATED ALWAYS AS ((actual_balance - recorded_balance)) STORED,
  "reconciled_at" TEXT NOT NULL,
  "notes" TEXT DEFAULT '' NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "account_reconciliations_account_id_fkey" FOREIGN KEY (account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "account_reconciliations_pkey" PRIMARY KEY (id)
);
```

Indexes (2, gồm autoindex):

- `account_reconciliations_account_idx`: `CREATE INDEX account_reconciliations_account_idx ON account_reconciliations (account_id, reconciled_at DESC)`
- `sqlite_autoindex_account_reconciliations_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## account_transactions

Domain: Cash / Finance. Purpose/workflow: Sổ tiền từng tài khoản, kể cả chuyển tiền hai vế. Classification: ACTIVE. Live rows: 76.

PK: id TEXT. FK: account_id → cash_accounts(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: accounts; payments; supplier-payments; supplier-returns; cod; commissions.

Runtime references: [app/api/account-transactions/route.js:23](../../app/api/account-transactions/route.js#L23); [lib/cloudflare/accounts.mjs:13](../../lib/cloudflare/accounts.mjs#L13); [lib/cloudflare/cod.mjs:105](../../lib/cloudflare/cod.mjs#L105); [lib/cloudflare/commissions.mjs:58](../../lib/cloudflare/commissions.mjs#L58); [lib/cloudflare/payment-correction.mjs:30](../../lib/cloudflare/payment-correction.mjs#L30); [lib/cloudflare/payments.mjs:27](../../lib/cloudflare/payments.mjs#L27); [lib/cloudflare/supplier-payments.mjs:34](../../lib/cloudflare/supplier-payments.mjs#L34); [lib/cloudflare/supplier-returns.mjs:137](../../lib/cloudflare/supplier-returns.mjs#L137)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "account_transactions" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "account_id" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" NUMERIC NOT NULL,
  "currency" TEXT NOT NULL,
  "reference_type" TEXT NOT NULL,
  "reference_id" TEXT NOT NULL,
  "transaction_type" TEXT NOT NULL,
  "occurred_at" TEXT NOT NULL,
  "description" TEXT DEFAULT '' NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "transfer_group_id" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "account_transactions_account_id_fkey" FOREIGN KEY (account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "account_transactions_amount_check" CHECK (amount > 0),
  CONSTRAINT "account_transactions_currency_check" CHECK (currency IN ('VND', 'CNY')),
  CONSTRAINT "account_transactions_direction_check" CHECK (direction IN ('IN', 'OUT')),
  CONSTRAINT "account_transactions_idempotency_key_check" CHECK (length(trim(idempotency_key)) >= 8 AND length(trim(idempotency_key)) <= 100),
  CONSTRAINT "account_transactions_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "account_transactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "account_transactions_reference_id_check" CHECK (length(trim(reference_id)) >= 1 AND length(trim(reference_id)) <= 100),
  CONSTRAINT "account_transactions_reference_type_check" CHECK (reference_type IN ('PAYMENT', 'SUPPLIER_PAYMENT', 'SUPPLIER_REFUND', 'COD_SETTLEMENT', 'COMMISSION', 'MANUAL', 'TRANSFER')),
  CONSTRAINT "account_transactions_transaction_type_check" CHECK (transaction_type IN ('CUSTOMER_PAYMENT', 'COD_SETTLEMENT', 'SUPPLIER_PAYMENT', 'SUPPLIER_REFUND', 'COMMISSION_PAYMENT', 'MANUAL_IN', 'MANUAL_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'OTHER'))
);
```

Indexes (4, gồm autoindex):

- `account_transactions_account_time_idx`: `CREATE INDEX account_transactions_account_time_idx ON account_transactions (account_id, occurred_at DESC, id)`
- `account_transactions_source_unique`: `CREATE UNIQUE INDEX account_transactions_source_unique ON account_transactions (reference_type, reference_id, transaction_type)`
- `sqlite_autoindex_account_transactions_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_account_transactions_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## activity_logs

Domain: Audit. Purpose/workflow: Lịch sử thay đổi có actor và before/after/event. Classification: ACTIVE. Live rows: 156.

PK: id INTEGER. FK: Không có FK khai báo. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: route-helpers; các service; activity-logs.

Runtime references: [app/api/activity-logs/route.js:26](../../app/api/activity-logs/route.js#L26); [lib/cloudflare/accounts.mjs:15](../../lib/cloudflare/accounts.mjs#L15); [lib/cloudflare/allocations.mjs:74](../../lib/cloudflare/allocations.mjs#L74); [lib/cloudflare/cod.mjs:31](../../lib/cloudflare/cod.mjs#L31); [lib/cloudflare/commissions.mjs:32](../../lib/cloudflare/commissions.mjs#L32); [lib/cloudflare/costs.mjs:26](../../lib/cloudflare/costs.mjs#L26); [lib/cloudflare/financial.mjs:56](../../lib/cloudflare/financial.mjs#L56); [lib/cloudflare/payment-correction.mjs:35](../../lib/cloudflare/payment-correction.mjs#L35); [lib/cloudflare/payments.mjs:80](../../lib/cloudflare/payments.mjs#L80); [lib/cloudflare/procurement.mjs:94](../../lib/cloudflare/procurement.mjs#L94); [lib/cloudflare/qc.mjs:166](../../lib/cloudflare/qc.mjs#L166); [lib/cloudflare/remaining.mjs:79](../../lib/cloudflare/remaining.mjs#L79); [lib/cloudflare/repairs.mjs:59](../../lib/cloudflare/repairs.mjs#L59); [lib/cloudflare/reservations.mjs:53](../../lib/cloudflare/reservations.mjs#L53); [lib/cloudflare/route-helpers.mjs:27](../../lib/cloudflare/route-helpers.mjs#L27); [lib/cloudflare/supplier-payments.mjs:38](../../lib/cloudflare/supplier-payments.mjs#L38); [lib/cloudflare/supplier-returns.mjs:51](../../lib/cloudflare/supplier-returns.mjs#L51); [lib/cloudflare/suppliers.mjs:12](../../lib/cloudflare/suppliers.mjs#L12); [lib/cloudflare/trade-ins.mjs:18](../../lib/cloudflare/trade-ins.mjs#L18)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "activity_logs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "changes" TEXT CHECK ("changes" IS NULL OR json_valid("changes")),
  "user_name" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "activity_logs_action_check" CHECK (action IN ('CREATE', 'UPDATE', 'DELETE'))
);
```

Indexes (1, gồm autoindex):

- `activity_logs_entity_created_at_idx`: `CREATE INDEX activity_logs_entity_created_at_idx ON activity_logs (entity_type, entity_id, created_at DESC)`

## app_options

Domain: Settings. Purpose/workflow: Danh mục lựa chọn cấu hình UI/nghiệp vụ. Classification: ACTIVE. Live rows: 106.

PK: id INTEGER. FK: Không có FK khai báo. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/U. Module chính: options; optionPolicy; useFieldOptions.

Runtime references: [app/api/exports/route.js:32](../../app/api/exports/route.js#L32); [app/api/intake/route.js:70](../../app/api/intake/route.js#L70); [app/api/options/route.js:9](../../app/api/options/route.js#L9); [lib/cloudflare/procurement.mjs:60](../../lib/cloudflare/procurement.mjs#L60); [context/InventoryContext.jsx:51](../../context/InventoryContext.jsx#L51)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "app_options" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "group_key" TEXT NOT NULL,
  "option_key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "is_active" INTEGER DEFAULT true CHECK ("is_active" IN (0,1)),
  "sort_order" INTEGER DEFAULT 0,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "app_options_group_key_option_key_key" UNIQUE (group_key, option_key)
);
```

Indexes (1, gồm autoindex):

- `sqlite_autoindex_app_options_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## app_settings

Domain: Settings. Purpose/workflow: Công thức giá và preset cấu hình JSON. Classification: ACTIVE. Live rows: 2.

PK: key TEXT. FK: Không có FK khai báo. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: settings; presets; procurement.

Runtime references: [app/api/presets/route.js:18](../../app/api/presets/route.js#L18); [app/api/settings/route.js:11](../../app/api/settings/route.js#L11); [lib/cloudflare/procurement.mjs:128](../../lib/cloudflare/procurement.mjs#L128)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "app_settings" (
  key TEXT NOT NULL PRIMARY KEY
    CHECK (key IN ('formula', 'preset_configs')),
  value TEXT NOT NULL
    CHECK (json_valid(value) = 1)
    CHECK (json_type(value) = 'object')
    CHECK (key <> 'formula' OR (
      json_remove(value, '$.shippingVnd', '$.divisor', '$.defaultRate') = '{}'
      AND coalesce(json_type(value, '$.shippingVnd') IN ('integer', 'real'), 0) = 1
      AND json_extract(value, '$.shippingVnd') BETWEEN 0 AND 1000000000
      AND coalesce(json_type(value, '$.divisor') IN ('integer', 'real'), 0) = 1
      AND json_extract(value, '$.divisor') > 0
      AND json_extract(value, '$.divisor') <= 1000000000
      AND coalesce(json_type(value, '$.defaultRate') IN ('integer', 'real'), 0) = 1
      AND json_extract(value, '$.defaultRate') > 0
      AND json_extract(value, '$.defaultRate') <= 1000000000
    ))
    CHECK (key <> 'preset_configs' OR length(value) <= 100000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

Indexes (1, gồm autoindex):

- `sqlite_autoindex_app_settings_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## auth_rate_limits

Domain: Users / Auth. Purpose/workflow: Giới hạn lần đăng nhập theo khóa. Classification: ACTIVE. Live rows: 2.

PK: key TEXT. FK: Không có FK khai báo. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): C/D. Module chính: auth/session; session.

Runtime references: [lib/cloudflare/session.mjs:71](../../lib/cloudflare/session.mjs#L71)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
```

Indexes (2, gồm autoindex):

- `auth_rate_limits_expiry`: `CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(expires_at)`
- `sqlite_autoindex_auth_rate_limits_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## auth_sessions

Domain: Users / Auth. Purpose/workflow: Hash token, phiên đăng nhập hết hạn. Classification: ACTIVE. Live rows: 7.

PK: token_hash TEXT. FK: user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/D. Module chính: session; users.

Runtime references: [lib/cloudflare/session.mjs:55](../../lib/cloudflare/session.mjs#L55)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (expires_at > created_at)
);
```

Indexes (3, gồm autoindex):

- `auth_sessions_expiry`: `CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at)`
- `auth_sessions_user`: `CREATE INDEX auth_sessions_user ON auth_sessions(user_id)`
- `sqlite_autoindex_auth_sessions_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## auth_users

Domain: Users / Auth. Purpose/workflow: Email và mật khẩu đã băm. Classification: ACTIVE. Live rows: 7.

PK: id TEXT. FK: Không có FK khai báo. Inbound: auth_sessions, image_objects, user_profiles.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/U/C. Module chính: session; users.

Runtime references: [lib/cloudflare/session.mjs:56](../../lib/cloudflare/session.mjs#L56); [lib/cloudflare/users.mjs:7](../../lib/cloudflare/users.mjs#L7)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE auth_users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_sign_in_at TEXT
  );
```

Indexes (2, gồm autoindex):

- `sqlite_autoindex_auth_users_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_auth_users_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## branches

Domain: Settings / Sales. Purpose/workflow: Chi nhánh hiển thị trên hóa đơn. Classification: ACTIVE. Live rows: 1.

PK: id INTEGER. FK: Không có FK khai báo. Inbound: orders.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R. Module chính: invoice-catalog; remaining.

Runtime references: [app/api/invoice-catalog/route.js:9](../../app/api/invoice-catalog/route.js#L9); [lib/cloudflare/remaining.mjs:203](../../lib/cloudflare/remaining.mjs#L203); [components/InvoiceOrderFields.jsx:7](../../components/InvoiceOrderFields.jsx#L7); [components/pages/InvoiceCatalog.jsx:17](../../components/pages/InvoiceCatalog.jsx#L17); [components/pages/Settings.jsx:547](../../components/pages/Settings.jsx#L547)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "branches" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "address" TEXT DEFAULT '' NOT NULL,
  "active" INTEGER DEFAULT true NOT NULL CHECK ("active" IN (0,1)),
  CONSTRAINT "branches_name_check" CHECK (length(trim(name)) >= 1 AND length(trim(name)) <= 160)
);
```

Indexes (0, gồm autoindex):

Không có secondary index.

## cash_accounts

Domain: Cash / Finance. Purpose/workflow: Danh mục tài khoản, tiền tệ và số dư đầu kỳ. Classification: ACTIVE. Live rows: 3.

PK: id TEXT. FK: Không có FK khai báo. Inbound: account_reconciliations, account_transactions, cod_settlements, commissions, payments, supplier_payments, supplier_refunds.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: accounts; cash-accounts.

Runtime references: [app/api/account-reconciliations/route.js:7](../../app/api/account-reconciliations/route.js#L7); [app/api/account-transactions/route.js:23](../../app/api/account-transactions/route.js#L23); [app/api/sales-operations/route.js:50](../../app/api/sales-operations/route.js#L50); [lib/cloudflare/accounts.mjs:9](../../lib/cloudflare/accounts.mjs#L9); [lib/cloudflare/cod.mjs:99](../../lib/cloudflare/cod.mjs#L99); [lib/cloudflare/commissions.mjs:65](../../lib/cloudflare/commissions.mjs#L65); [lib/cloudflare/payments.mjs:14](../../lib/cloudflare/payments.mjs#L14); [lib/cloudflare/supplier-payments.mjs:23](../../lib/cloudflare/supplier-payments.mjs#L23); [lib/cloudflare/supplier-returns.mjs:125](../../lib/cloudflare/supplier-returns.mjs#L125); [components/pages/Finance.jsx:53](../../components/pages/Finance.jsx#L53)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "cash_accounts" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "account_type" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "opening_balance" NUMERIC DEFAULT 0 NOT NULL,
  "opening_balance_at" TEXT NOT NULL,
  "is_active" INTEGER DEFAULT true NOT NULL CHECK ("is_active" IN (0,1)),
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "cash_accounts_account_type_check" CHECK (account_type IN ('CASH', 'BANK', 'WECHAT', 'ALIPAY', 'OTHER')),
  CONSTRAINT "cash_accounts_code_check" CHECK (length(code) BETWEEN 2 AND 40 AND code NOT GLOB '*[^A-Z0-9_-]*'),
  CONSTRAINT "cash_accounts_code_key" UNIQUE (code),
  CONSTRAINT "cash_accounts_currency_check" CHECK (currency IN ('VND', 'CNY')),
  CONSTRAINT "cash_accounts_name_check" CHECK (length(trim(name)) >= 1 AND length(trim(name)) <= 160),
  CONSTRAINT "cash_accounts_pkey" PRIMARY KEY (id)
);
```

Indexes (2, gồm autoindex):

- `sqlite_autoindex_cash_accounts_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_cash_accounts_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## cod_receivables

Domain: COD / Receivables. Purpose/workflow: Nghĩa vụ hãng vận chuyển trả tiền. Classification: ACTIVE. Live rows: 0.

PK: id TEXT. FK: order_id → orders(id); DELETE RESTRICT. Inbound: cod_settlements.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: cod; financial; Finance.

Runtime references: [lib/cloudflare/cod.mjs:18](../../lib/cloudflare/cod.mjs#L18); [lib/cloudflare/payment-correction.mjs:26](../../lib/cloudflare/payment-correction.mjs#L26); [lib/cloudflare/payments.mjs:62](../../lib/cloudflare/payments.mjs#L62); [lib/cloudflare/remaining.mjs:116](../../lib/cloudflare/remaining.mjs#L116)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "cod_receivables" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "order_id" INTEGER NOT NULL,
  "carrier" TEXT DEFAULT '' NOT NULL,
  "tracking_number" TEXT DEFAULT '' NOT NULL,
  "expected_cod_amount_vnd" NUMERIC NOT NULL,
  "status" TEXT DEFAULT 'PENDING_DELIVERY' NOT NULL,
  "shipped_at" TEXT,
  "delivered_at" TEXT,
  "expected_settlement_at" TEXT,
  "settled_at" TEXT,
  "notes" TEXT DEFAULT '' NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "cod_receivables_expected_cod_amount_vnd_check" CHECK (expected_cod_amount_vnd > 0),
  CONSTRAINT "cod_receivables_idempotency_key_check" CHECK (length(trim(idempotency_key)) >= 8 AND length(trim(idempotency_key)) <= 100),
  CONSTRAINT "cod_receivables_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "cod_receivables_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT "cod_receivables_order_id_key" UNIQUE (order_id),
  CONSTRAINT "cod_receivables_pkey" PRIMARY KEY (id),
  CONSTRAINT "cod_receivables_status_check" CHECK (status IN ('PENDING_DELIVERY', 'DELIVERED', 'WAITING_SETTLEMENT', 'PARTIALLY_SETTLED', 'SETTLED', 'DISPUTED', 'RETURNED', 'CANCELLED'))
);
```

Indexes (4, gồm autoindex):

- `cod_receivables_status_due_idx`: `CREATE INDEX cod_receivables_status_due_idx ON cod_receivables (status, expected_settlement_at)`
- `sqlite_autoindex_cod_receivables_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_cod_receivables_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_cod_receivables_3`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## cod_settlements

Domain: COD / Cash. Purpose/workflow: Các lần hãng vận chuyển thanh toán. Classification: ACTIVE. Live rows: 0.

PK: id TEXT. FK: account_id → cash_accounts(id); DELETE RESTRICT; cod_receivable_id → cod_receivables(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C. Module chính: cod; financial.

Runtime references: [lib/cloudflare/cod.mjs:91](../../lib/cloudflare/cod.mjs#L91)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "cod_settlements" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "cod_receivable_id" TEXT NOT NULL,
  "amount_vnd" NUMERIC NOT NULL,
  "account_id" TEXT NOT NULL,
  "reference" TEXT DEFAULT '' NOT NULL,
  "settled_at" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "cod_settlements_account_id_fkey" FOREIGN KEY (account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "cod_settlements_amount_vnd_check" CHECK (amount_vnd > 0),
  CONSTRAINT "cod_settlements_cod_receivable_id_fkey" FOREIGN KEY (cod_receivable_id) REFERENCES cod_receivables(id) ON DELETE RESTRICT,
  CONSTRAINT "cod_settlements_idempotency_key_check" CHECK (length(trim(idempotency_key)) >= 8 AND length(trim(idempotency_key)) <= 100),
  CONSTRAINT "cod_settlements_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "cod_settlements_pkey" PRIMARY KEY (id)
);
```

Indexes (3, gồm autoindex):

- `cod_settlements_receivable_idx`: `CREATE INDEX cod_settlements_receivable_idx ON cod_settlements (cod_receivable_id, settled_at, id)`
- `sqlite_autoindex_cod_settlements_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_cod_settlements_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## commissions

Domain: Sales / Finance. Purpose/workflow: Hoa hồng, duyệt và chi tiền. Classification: ACTIVE. Live rows: 0.

PK: id TEXT. FK: beneficiary_user_id → user_profiles(id); DELETE SET NULL; laptop_id → laptops(id); DELETE SET NULL; order_id → orders(id); DELETE RESTRICT; payment_account_id → cash_accounts(id); DELETE NO ACTION. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: commissions; sales-operations.

Runtime references: [app/(dashboard)/commissions/page.js:2](../../app/%28dashboard%29/commissions/page.js#L2); [app/api/management-dashboard/route.js:20](../../app/api/management-dashboard/route.js#L20); [app/api/orders/route.js:117](../../app/api/orders/route.js#L117); [app/api/sales-operations/route.js:48](../../app/api/sales-operations/route.js#L48); [lib/cloudflare/commissions.mjs:19](../../lib/cloudflare/commissions.mjs#L19); [lib/cloudflare/database.mjs:14](../../lib/cloudflare/database.mjs#L14); [components/pages/Dashboard.jsx:174](../../components/pages/Dashboard.jsx#L174); [components/pages/SalesOperations.jsx:15](../../components/pages/SalesOperations.jsx#L15)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "commissions" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "order_id" INTEGER NOT NULL,
  "laptop_id" INTEGER,
  "beneficiary_type" TEXT NOT NULL,
  "beneficiary_user_id" TEXT,
  "beneficiary_name" TEXT,
  "commission_type" TEXT NOT NULL,
  "amount_vnd" NUMERIC NOT NULL,
  "status" TEXT DEFAULT 'PENDING' NOT NULL,
  "calculation_basis" TEXT NOT NULL,
  "calculation_snapshot_json" TEXT CHECK ("calculation_snapshot_json" IS NULL OR json_valid("calculation_snapshot_json")),
  "earned_at" TEXT NOT NULL,
  "approved_at" TEXT,
  "paid_at" TEXT,
  "payment_account_id" TEXT,
  "payment_reference" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "notes" TEXT DEFAULT '' NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "commissions_amount_vnd_check" CHECK (amount_vnd > 0),
  CONSTRAINT "commissions_beneficiary_type_check" CHECK (beneficiary_type IN ('EMPLOYEE', 'CTV', 'OTHER')),
  CONSTRAINT "commissions_beneficiary_user_id_fkey" FOREIGN KEY (beneficiary_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT "commissions_check" CHECK (beneficiary_user_id IS NOT NULL OR trim(COALESCE(beneficiary_name, '')) <> ''),
  CONSTRAINT "commissions_commission_type_check" CHECK (commission_type IN ('FIXED', 'MANUAL')),
  CONSTRAINT "commissions_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "commissions_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE SET NULL,
  CONSTRAINT "commissions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT "commissions_payment_account_id_fkey" FOREIGN KEY (payment_account_id) REFERENCES cash_accounts(id),
  CONSTRAINT "commissions_pkey" PRIMARY KEY (id),
  CONSTRAINT "commissions_status_check" CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'CANCELLED'))
);
```

Indexes (3, gồm autoindex):

- `commissions_source_unique`: `CREATE UNIQUE INDEX commissions_source_unique ON commissions (order_id, beneficiary_type, COALESCE((beneficiary_user_id), beneficiary_name), commission_type) WHERE (status <> 'CANCELLED')`
- `sqlite_autoindex_commissions_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_commissions_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## customers

Domain: Sales. Purpose/workflow: Khách hàng; đơn và hóa đơn tham chiếu. Classification: ACTIVE. Live rows: 60.

PK: id INTEGER. FK: Không có FK khai báo. Inbound: invoices, orders, reservations, trade_ins.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: customers; orders; remaining.

Runtime references: [app/api/customers/route.js:13](../../app/api/customers/route.js#L13); [app/api/exports/route.js:37](../../app/api/exports/route.js#L37); [app/api/inventory/route.js:71](../../app/api/inventory/route.js#L71); [app/api/orders/route.js:92](../../app/api/orders/route.js#L92); [app/api/sales-operations/route.js:43](../../app/api/sales-operations/route.js#L43); [lib/apiFetchers.js:98](../../lib/apiFetchers.js#L98); [lib/cloudflare/remaining.mjs:215](../../lib/cloudflare/remaining.mjs#L215); [lib/cloudflare/reservations.mjs:39](../../lib/cloudflare/reservations.mjs#L39); [lib/cloudflare/trade-ins.mjs:13](../../lib/cloudflare/trade-ins.mjs#L13); [lib/exportData.js:3](../../lib/exportData.js#L3); [components/pages/Customers.jsx:13](../../components/pages/Customers.jsx#L13); [components/pages/Dashboard.jsx:28](../../components/pages/Dashboard.jsx#L28); [components/pages/Orders.jsx:75](../../components/pages/Orders.jsx#L75); [components/pages/Payments.jsx:45](../../components/pages/Payments.jsx#L45); [components/pages/SalesOperations.jsx:109](../../components/pages/SalesOperations.jsx#L109); [components/pages/Warranty.jsx:16](../../components/pages/Warranty.jsx#L16); [context/InventoryContext.jsx:340](../../context/InventoryContext.jsx#L340)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "customers" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "address" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

Indexes (1, gồm autoindex):

- `customers_phone_unique_ci_idx`: `CREATE UNIQUE INDEX customers_phone_unique_ci_idx ON customers (lower(trim(phone))) WHERE ((phone IS NOT NULL) AND (trim(phone) <> ''))`

## financial_records

Domain: Finance. Purpose/workflow: Phân loại thu/chi kinh doanh và bản chiếu payment. Classification: ACTIVE. Live rows: 76.

PK: id INTEGER. FK: laptop_id → laptops(id); DELETE SET NULL; order_id → orders(id); DELETE SET NULL; payment_id → payments(id); DELETE SET NULL. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: financial; payments; payment-correction; Finance.

Runtime references: [app/api/financial-records/route.js:24](../../app/api/financial-records/route.js#L24); [lib/cloudflare/cod.mjs:63](../../lib/cloudflare/cod.mjs#L63); [lib/cloudflare/financial.mjs:52](../../lib/cloudflare/financial.mjs#L52); [lib/cloudflare/payment-correction.mjs:29](../../lib/cloudflare/payment-correction.mjs#L29); [lib/cloudflare/payments.mjs:41](../../lib/cloudflare/payments.mjs#L41); [lib/cloudflare/remaining.mjs:130](../../lib/cloudflare/remaining.mjs#L130); [lib/responseVisibility.js:73](../../lib/responseVisibility.js#L73); [components/pages/Invoices.jsx:57](../../components/pages/Invoices.jsx#L57)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "financial_records" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "record_type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" NUMERIC NOT NULL,
  "order_id" INTEGER,
  "payment_id" INTEGER,
  "laptop_id" INTEGER,
  "occurred_on" TEXT DEFAULT CURRENT_DATE NOT NULL,
  "payment_method" TEXT,
  "note" TEXT,
  "recorded_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "financial_records_amount_check" CHECK (amount > 0),
  CONSTRAINT "financial_records_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE SET NULL,
  CONSTRAINT "financial_records_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT "financial_records_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT "financial_records_record_type_check" CHECK (record_type IN ('income', 'expense', 'refund', 'adjustment'))
);
```

Indexes (2, gồm autoindex):

- `financial_records_date_idx`: `CREATE INDEX financial_records_date_idx ON financial_records (occurred_on DESC, id DESC)`
- `financial_records_order_idx`: `CREATE INDEX financial_records_order_idx ON financial_records (order_id, occurred_on DESC)`

## image_objects

Domain: Storage. Purpose/workflow: Metadata object ảnh trong R2. Classification: ACTIVE. Live rows: 0.

PK: id TEXT. FK: uploaded_by TEXT NOT NULL REFERENCES auth_users(id),. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): C/R/D. Module chính: images; images API.

Runtime references: [app/api/images/route.js:15](../../app/api/images/route.js#L15); [app/api/images/[id]/route.js:16](../../app/api/images/[id]/route.js#L16)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE image_objects (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  uploaded_by TEXT NOT NULL REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

Indexes (2, gồm autoindex):

- `sqlite_autoindex_image_objects_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_image_objects_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## invoices

Domain: Sales / History. Purpose/workflow: Snapshot chứng từ theo order. Classification: QUESTIONABLE DESIGN. Live rows: 6.

PK: id INTEGER. FK: customer_id → customers(id); DELETE RESTRICT; laptop_id → laptops(id); DELETE RESTRICT; order_id → orders(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/U/C. Module chính: remaining; invoices; invoiceSnapshot.

Runtime references: [app/api/invoices/route.js:21](../../app/api/invoices/route.js#L21); [app/api/orders/route.js:118](../../app/api/orders/route.js#L118); [lib/cloudflare/remaining.mjs:187](../../lib/cloudflare/remaining.mjs#L187); [components/InvoiceLink.jsx:20](../../components/InvoiceLink.jsx#L20); [components/pages/InvoiceDocument.jsx:29](../../components/pages/InvoiceDocument.jsx#L29); [components/pages/Invoices.jsx:37](../../components/pages/Invoices.jsx#L37); [context/InventoryContext.jsx:462](../../context/InventoryContext.jsx#L462)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "invoices" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "order_id" INTEGER NOT NULL,
  "laptop_id" INTEGER,
  "customer_id" INTEGER,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "created_by" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL CHECK ("snapshot" IS NULL OR json_valid("snapshot")),
  CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT "invoices_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE RESTRICT,
  CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT "invoices_order_id_key" UNIQUE (order_id)
);
```

Indexes (3, gồm autoindex):

- `invoices_customer_idx`: `CREATE INDEX invoices_customer_idx ON invoices (customer_id)`
- `invoices_laptop_idx`: `CREATE INDEX invoices_laptop_idx ON invoices (laptop_id)`
- `sqlite_autoindex_invoices_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## laptop_cost_components

Domain: Landed Cost. Purpose/workflow: Chi phí bổ sung/thu cũ/sửa, void theo nguồn. Classification: ACTIVE. Live rows: 0.

PK: id TEXT. FK: laptop_id → laptops(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: costs; repairs; trade-ins; laptop_landed_costs.

Runtime references: [app/api/costs/route.js:21](../../app/api/costs/route.js#L21); [lib/cloudflare/costs.mjs:20](../../lib/cloudflare/costs.mjs#L20); [lib/cloudflare/repairs.mjs:15](../../lib/cloudflare/repairs.mjs#L15); [lib/cloudflare/trade-ins.mjs:49](../../lib/cloudflare/trade-ins.mjs#L49)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "laptop_cost_components" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "laptop_id" INTEGER NOT NULL,
  "cost_type" TEXT NOT NULL,
  "amount_vnd" NUMERIC NOT NULL,
  "amount_rmb" NUMERIC,
  "exchange_rate" NUMERIC,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT,
  "description" TEXT DEFAULT '' NOT NULL,
  "occurred_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "created_by" TEXT NOT NULL,
  "voided_at" TEXT,
  "voided_by" TEXT,
  "void_reason" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "laptop_cost_components_amount_vnd_check" CHECK (amount_vnd >= 0),
  CONSTRAINT "laptop_cost_components_check" CHECK (amount_rmb IS NULL AND exchange_rate IS NULL OR amount_rmb >= 0 AND exchange_rate > 0),
  CONSTRAINT "laptop_cost_components_cost_type_check" CHECK (cost_type IN ('PURCHASE', 'TRADE_IN_ACQUISITION', 'CN_SHIPPING', 'VN_SHIPPING', 'PAYMENT_FEE', 'REPAIR', 'RAM_UPGRADE', 'SSD_UPGRADE', 'ACCESSORY', 'CLEANING', 'OTHER', 'REFUND_CREDIT')),
  CONSTRAINT "laptop_cost_components_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE RESTRICT,
  CONSTRAINT "laptop_cost_components_pkey" PRIMARY KEY (id),
  CONSTRAINT "laptop_cost_components_source_identity_check" CHECK (source_id IS NOT NULL AND length(trim(source_id)) >= 1 AND length(trim(source_id)) <= 100),
  CONSTRAINT "laptop_cost_components_source_type_check" CHECK (source_type IN ('TRADE_IN', 'REPAIR_JOB', 'MANUAL', 'SUPPLIER_REFUND'))
);
```

Indexes (4, gồm autoindex):

- `laptop_cost_components_laptop_idx`: `CREATE INDEX laptop_cost_components_laptop_idx ON laptop_cost_components (laptop_id, occurred_at, id)`
- `laptop_cost_components_source_unique`: `CREATE UNIQUE INDEX laptop_cost_components_source_unique ON laptop_cost_components (laptop_id, source_type, source_id, cost_type) WHERE ((source_id IS NOT NULL) AND (voided_at IS NULL))`
- `laptop_cost_components_trade_in_source_unique`: `CREATE UNIQUE INDEX laptop_cost_components_trade_in_source_unique ON laptop_cost_components (source_id) WHERE ((source_type = 'TRADE_IN') AND (cost_type = 'TRADE_IN_ACQUISITION') AND (voided_at IS NULL))`
- `sqlite_autoindex_laptop_cost_components_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## laptops

Domain: Inventory / Logistics. Purpose/workflow: Một bản ghi máy xuyên suốt mua, nhận, QC, bán. Classification: QUESTIONABLE DESIGN. Live rows: 193.

PK: id INTEGER. FK: purchase_batch_id → purchase_batches(id); DELETE RESTRICT. Inbound: commissions, financial_records, invoices, laptop_cost_components, orders, qc_inspections, repair_jobs, reservations, stock_movements, supplier_return_items, trade_ins, warranty_cases.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U/D. Module chính: inventory; procurement; qc; repairs; orders.

Runtime references: [app/api/costs/route.js:26](../../app/api/costs/route.js#L26); [app/api/exports/route.js:13](../../app/api/exports/route.js#L13); [app/api/intake/route.js:43](../../app/api/intake/route.js#L43); [app/api/inventory/route.js:44](../../app/api/inventory/route.js#L44); [app/api/month-roll/route.js:12](../../app/api/month-roll/route.js#L12); [app/api/order-allocation/route.js:36](../../app/api/order-allocation/route.js#L36); [app/api/orders/route.js:297](../../app/api/orders/route.js#L297); [app/api/payments/route.js:101](../../app/api/payments/route.js#L101); [app/api/purchases/route.js:19](../../app/api/purchases/route.js#L19); [app/api/qc/route.js:21](../../app/api/qc/route.js#L21); [app/api/repairs/route.js:29](../../app/api/repairs/route.js#L29); [app/api/sales-operations/route.js:43](../../app/api/sales-operations/route.js#L43); [app/api/supplier-returns/route.js:22](../../app/api/supplier-returns/route.js#L22); [lib/cloudflare/accounts.mjs:121](../../lib/cloudflare/accounts.mjs#L121); [lib/cloudflare/allocations.mjs:13](../../lib/cloudflare/allocations.mjs#L13); [lib/cloudflare/costs.mjs:18](../../lib/cloudflare/costs.mjs#L18); [lib/cloudflare/financial.mjs:50](../../lib/cloudflare/financial.mjs#L50); [lib/cloudflare/payments.mjs:68](../../lib/cloudflare/payments.mjs#L68); [lib/cloudflare/procurement.mjs:32](../../lib/cloudflare/procurement.mjs#L32); [lib/cloudflare/qc.mjs:89](../../lib/cloudflare/qc.mjs#L89); [lib/cloudflare/remaining.mjs:33](../../lib/cloudflare/remaining.mjs#L33); [lib/cloudflare/repairs.mjs:30](../../lib/cloudflare/repairs.mjs#L30); [lib/cloudflare/reservations.mjs:15](../../lib/cloudflare/reservations.mjs#L15); [lib/cloudflare/supplier-payments.mjs:26](../../lib/cloudflare/supplier-payments.mjs#L26); [lib/cloudflare/supplier-returns.mjs:25](../../lib/cloudflare/supplier-returns.mjs#L25); [lib/cloudflare/trade-ins.mjs:49](../../lib/cloudflare/trade-ins.mjs#L49); [lib/exportData.js:3](../../lib/exportData.js#L3); [components/pages/Costs.jsx:65](../../components/pages/Costs.jsx#L65); [components/pages/Dashboard.jsx:20](../../components/pages/Dashboard.jsx#L20); [components/pages/DirectIntake.jsx:31](../../components/pages/DirectIntake.jsx#L31); [components/pages/Inventory.jsx:73](../../components/pages/Inventory.jsx#L73); [components/pages/Orders.jsx:72](../../components/pages/Orders.jsx#L72); [components/pages/PurchaseDayTables.jsx:53](../../components/pages/PurchaseDayTables.jsx#L53); [components/pages/QC.jsx:63](../../components/pages/QC.jsx#L63); [components/pages/Repairs.jsx:30](../../components/pages/Repairs.jsx#L30); [components/pages/SalesOperations.jsx:109](../../components/pages/SalesOperations.jsx#L109); [components/pages/Settings.jsx:280](../../components/pages/Settings.jsx#L280); [components/pages/SupplierReturns.jsx:38](../../components/pages/SupplierReturns.jsx#L38); [components/pages/Warranty.jsx:16](../../components/pages/Warranty.jsx#L16); [context/InventoryContext.jsx:264](../../context/InventoryContext.jsx#L264)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "laptops" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "serial" TEXT,
  "name" TEXT,
  "category" TEXT,
  "import_date" TEXT,
  "warehouse_date" TEXT,
  "location" TEXT,
  "charger_status" TEXT,
  "status" TEXT,
  "price_rmb" NUMERIC DEFAULT 0,
  "shipping_rmb" NUMERIC DEFAULT 0,
  "exchange_rate" NUMERIC DEFAULT 3550,
  "import_price_vnd" NUMERIC DEFAULT 0,
  "wholesale_price_vnd" NUMERIC DEFAULT 0,
  "retail_price_vnd" NUMERIC DEFAULT 0,
  "customer_note" TEXT,
  "battery_health" INTEGER,
  "warranty_supplier" TEXT,
  "screen_status" TEXT,
  "camera_mic_status" TEXT,
  "mainboard_status" TEXT,
  "condition_note" TEXT,
  "seller" TEXT,
  "is_active" INTEGER DEFAULT true CHECK ("is_active" IN (0,1)),
  "parts_history" TEXT DEFAULT '[]' CHECK ("parts_history" IS NULL OR json_valid("parts_history")),
  "month_key" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "sku" TEXT DEFAULT ('LT-' || upper(hex(randomblob(8)))) NOT NULL,
  "available_for_sale_at" TEXT,
  "source_type" TEXT DEFAULT 'UNKNOWN' NOT NULL,
  "source_reference_id" TEXT,
  "purchase_batch_id" INTEGER,
  "tracking_code_cn" TEXT DEFAULT '' NOT NULL,
  "purchase_price_rmb" NUMERIC DEFAULT 0 NOT NULL,
  "purchase_exchange_rate" NUMERIC,
  "received_at" TEXT,
  "sold_at" TEXT,
  "ignored_at" TEXT,
  "ignored_by" TEXT,
  "ignore_reason" TEXT DEFAULT '' NOT NULL,
  "created_by" TEXT DEFAULT 'System' NOT NULL,
  "qc_details" TEXT DEFAULT '{}' NOT NULL CHECK ("qc_details" IS NULL OR json_valid("qc_details")),
  CONSTRAINT "laptops_battery_health_range" CHECK (battery_health IS NULL OR battery_health >= 0 AND battery_health <= 100),
  CONSTRAINT "laptops_non_negative_values" CHECK (COALESCE(price_rmb, 0) >= 0 AND COALESCE(shipping_rmb, 0) >= 0 AND COALESCE(exchange_rate, 0) >= 0 AND COALESCE(import_price_vnd, 0) >= 0 AND COALESCE(wholesale_price_vnd, 0) >= 0 AND COALESCE(retail_price_vnd, 0) >= 0),
  CONSTRAINT "laptops_purchase_batch_id_fkey" FOREIGN KEY (purchase_batch_id) REFERENCES purchase_batches(id) ON DELETE RESTRICT,
  CONSTRAINT "laptops_purchase_values_check" CHECK (purchase_price_rmb >= 0 AND COALESCE(shipping_rmb, 0) >= 0 AND (purchase_exchange_rate IS NULL OR purchase_exchange_rate > 0)),
  CONSTRAINT "laptops_sale_prices_non_negative" CHECK (COALESCE(wholesale_price_vnd, 0) >= 0 AND COALESCE(retail_price_vnd, 0) >= 0),
  CONSTRAINT "laptops_source_lineage_check" CHECK ((source_type IN ('SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT')) AND purchase_batch_id IS NOT NULL AND purchase_exchange_rate IS NOT NULL OR (source_type IN ('UNKNOWN', 'TRADE_IN')) AND purchase_batch_id IS NULL),
  CONSTRAINT "laptops_source_type_check" CHECK (source_type IN ('SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT', 'TRADE_IN', 'UNKNOWN')),
  CONSTRAINT "laptops_status_check" CHECK (status IN ('in_transit', 'waiting_qc', 'available', 'reserved', 'sold', 'repair', 'supplier_return', 'ignored'))
);
```

Indexes (7, gồm autoindex):

- `idx_laptops_month_key`: `CREATE INDEX idx_laptops_month_key ON laptops (month_key)`
- `laptops_active_status_import_date_idx`: `CREATE INDEX laptops_active_status_import_date_idx ON laptops (is_active, status, import_date DESC)`
- `laptops_purchase_batch_idx`: `CREATE INDEX laptops_purchase_batch_idx ON laptops (purchase_batch_id, id)`
- `laptops_serial_unique_ci_idx`: `CREATE UNIQUE INDEX laptops_serial_unique_ci_idx ON laptops (lower(trim((serial)))) WHERE ((serial IS NOT NULL) AND (trim((serial)) <> ''))`
- `laptops_sku_unique`: `CREATE UNIQUE INDEX laptops_sku_unique ON laptops (sku)`
- `laptops_status_received_idx`: `CREATE INDEX laptops_status_received_idx ON laptops (status, received_at DESC, id DESC)`
- `laptops_tracking_code_cn_idx`: `CREATE INDEX laptops_tracking_code_cn_idx ON laptops (lower(tracking_code_cn)) WHERE (trim(tracking_code_cn) <> '')`

## operation_requests

Domain: Idempotency. Purpose/workflow: Kết quả request nghiệp vụ đã xử lý và staging hợp nhất. Classification: ACTIVE. Live rows: 5.

PK: idempotency_key TEXT. FK: Không có FK khai báo. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: procurement.

Runtime references: [lib/cloudflare/procurement.mjs:49](../../lib/cloudflare/procurement.mjs#L49)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "operation_requests" (
  "idempotency_key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "result" TEXT NOT NULL CHECK ("result" IS NULL OR json_valid("result")),
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "operation_requests_idempotency_key_check" CHECK (length(trim(idempotency_key)) >= 8 AND length(trim(idempotency_key)) <= 100),
  CONSTRAINT "operation_requests_operation_check" CHECK (length(trim(operation)) >= 2 AND length(trim(operation)) <= 80),
  CONSTRAINT "operation_requests_pkey" PRIMARY KEY (idempotency_key)
);
```

Indexes (1, gồm autoindex):

- `sqlite_autoindex_operation_requests_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## orders

Domain: Orders / Receivables. Purpose/workflow: Một đơn một máy, tiền thu/công nợ/snapshot. Classification: QUESTIONABLE DESIGN. Live rows: 63.

PK: id INTEGER. FK: branch_id → branches(id); DELETE NO ACTION; customer_id → customers(id); DELETE SET NULL; laptop_id → laptops(id); DELETE SET NULL; requested_laptop_id → laptops(id); DELETE SET NULL; trade_in_laptop_id → laptops(id); DELETE SET NULL. Inbound: cod_receivables, commissions, financial_records, invoices, payments, reservations, stock_movements, trade_ins, warranty_cases.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/U/C. Module chính: orders; remaining; allocations; payments.

Runtime references: [app/api/cod/route.js:12](../../app/api/cod/route.js#L12); [app/api/exports/route.js:13](../../app/api/exports/route.js#L13); [app/api/month-roll/route.js:12](../../app/api/month-roll/route.js#L12); [app/api/order-allocation/route.js:28](../../app/api/order-allocation/route.js#L28); [app/api/orders/route.js:83](../../app/api/orders/route.js#L83); [app/api/payments/route.js:100](../../app/api/payments/route.js#L100); [app/api/sales-operations/route.js:50](../../app/api/sales-operations/route.js#L50); [app/api/warranty/route.js:41](../../app/api/warranty/route.js#L41); [lib/apiFetchers.js:31](../../lib/apiFetchers.js#L31); [lib/cloudflare/accounts.mjs:122](../../lib/cloudflare/accounts.mjs#L122); [lib/cloudflare/allocations.mjs:8](../../lib/cloudflare/allocations.mjs#L8); [lib/cloudflare/cod.mjs:20](../../lib/cloudflare/cod.mjs#L20); [lib/cloudflare/commissions.mjs:21](../../lib/cloudflare/commissions.mjs#L21); [lib/cloudflare/financial.mjs:4](../../lib/cloudflare/financial.mjs#L4); [lib/cloudflare/payment-correction.mjs:13](../../lib/cloudflare/payment-correction.mjs#L13); [lib/cloudflare/payments.mjs:15](../../lib/cloudflare/payments.mjs#L15); [lib/cloudflare/procurement.mjs:191](../../lib/cloudflare/procurement.mjs#L191); [lib/cloudflare/remaining.mjs:55](../../lib/cloudflare/remaining.mjs#L55); [lib/cloudflare/reservations.mjs:17](../../lib/cloudflare/reservations.mjs#L17); [lib/cloudflare/trade-ins.mjs:13](../../lib/cloudflare/trade-ins.mjs#L13); [lib/exportData.js:12](../../lib/exportData.js#L12); [components/OrderAllocation.jsx:28](../../components/OrderAllocation.jsx#L28); [components/pages/Dashboard.jsx:21](../../components/pages/Dashboard.jsx#L21); [components/pages/Finance.jsx:42](../../components/pages/Finance.jsx#L42); [components/pages/Inventory.jsx:644](../../components/pages/Inventory.jsx#L644); [components/pages/Invoices.jsx:43](../../components/pages/Invoices.jsx#L43); [components/pages/Orders.jsx:74](../../components/pages/Orders.jsx#L74); [components/pages/Payments.jsx:45](../../components/pages/Payments.jsx#L45); [components/pages/SalesOperations.jsx:109](../../components/pages/SalesOperations.jsx#L109); [components/pages/Settings.jsx:280](../../components/pages/Settings.jsx#L280); [components/pages/Warranty.jsx:16](../../components/pages/Warranty.jsx#L16); [components/RecordPaymentModal.jsx:33](../../components/RecordPaymentModal.jsx#L33); [context/InventoryContext.jsx:264](../../context/InventoryContext.jsx#L264)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "orders" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "created_date" TEXT,
  "sale_online" TEXT,
  "sale_offline" TEXT,
  "note" TEXT,
  "order_type" TEXT,
  "order_status" TEXT,
  "payment_status" TEXT,
  "payment_method" TEXT,
  "delivery_status" TEXT,
  "shipping_method" TEXT,
  "laptop_id" INTEGER,
  "requested_laptop_id" INTEGER,
  "sale_price" NUMERIC DEFAULT 0,
  "deposit_amount" NUMERIC DEFAULT 0,
  "deposit_note" TEXT,
  "cod_amount" NUMERIC DEFAULT 0,
  "amount_paid" NUMERIC DEFAULT 0,
  "debt_amount" NUMERIC DEFAULT 0,
  "credit_card_fee" NUMERIC DEFAULT 0,
  "profit_vnd" NUMERIC DEFAULT 0,
  "trade_in_laptop_id" INTEGER,
  "customer_id" INTEGER,
  "customer_info" TEXT,
  "customer_address" TEXT,
  "tracking_code" TEXT,
  "ship_date" TEXT,
  "setup_note" TEXT,
  "warranty" TEXT,
  "laptop_locked" INTEGER DEFAULT false CHECK ("laptop_locked" IN (0,1)),
  "reservation_expires_at" TEXT,
  "cancel_reason" TEXT,
  "cancelled_at" TEXT,
  "month_key" TEXT,
  "is_active" INTEGER DEFAULT true CHECK ("is_active" IN (0,1)),
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "returned_at" TEXT,
  "return_reason" TEXT,
  "branch_id" INTEGER,
  "gift_accessory_ids" TEXT DEFAULT '[]' NOT NULL CHECK ("gift_accessory_ids" IS NULL OR json_valid("gift_accessory_ids")),
  "gift_preset" TEXT DEFAULT '' NOT NULL,
  "cost_snapshot_vnd" NUMERIC,
  "gross_profit_snapshot_vnd" NUMERIC,
  "direct_cost_snapshot_vnd" NUMERIC,
  "net_contribution_snapshot_vnd" NUMERIC,
  "cost_snapshot_status" TEXT,
  "cost_snapshot_reasons" TEXT CHECK ("cost_snapshot_reasons" IS NULL OR json_valid("cost_snapshot_reasons")),
  "cost_snapshotted_at" TEXT,
  "payment_due_at" TEXT,
  "trade_in_credit_vnd" NUMERIC DEFAULT 0 NOT NULL,
  "requested_configuration" TEXT,
  "requested_category" TEXT,
  CONSTRAINT "orders_amount_paid_lte_sale_price_chk" CHECK (COALESCE(amount_paid, 0) >= 0 AND COALESCE(amount_paid, 0) <= COALESCE(sale_price, 0)),
  CONSTRAINT "orders_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT "orders_cod_amount_lte_sale_price_chk" CHECK (COALESCE(cod_amount, 0) >= 0 AND COALESCE(cod_amount, 0) <= COALESCE(sale_price, 0)),
  CONSTRAINT "orders_cost_snapshot_status_check" CHECK (cost_snapshot_status IS NULL OR (cost_snapshot_status IN ('COMPLETE', 'INCOMPLETE', 'LEGACY'))),
  CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT "orders_deposit_amount_lte_sale_price_chk" CHECK (COALESCE(deposit_amount, 0) >= 0 AND COALESCE(deposit_amount, 0) <= COALESCE(sale_price, 0)),
  CONSTRAINT "orders_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE SET NULL,
  CONSTRAINT "orders_non_negative_values" CHECK (COALESCE(sale_price, 0) >= 0 AND COALESCE(deposit_amount, 0) >= 0 AND COALESCE(cod_amount, 0) >= 0 AND COALESCE(amount_paid, 0) >= 0 AND COALESCE(debt_amount, 0) >= 0 AND COALESCE(credit_card_fee, 0) >= 0),
  CONSTRAINT "orders_payment_totals_valid" CHECK (COALESCE(amount_paid, 0) <= COALESCE(sale_price, 0) AND COALESCE(deposit_amount, 0) <= COALESCE(amount_paid, 0)),
  CONSTRAINT "orders_requested_laptop_id_fkey" FOREIGN KEY (requested_laptop_id) REFERENCES laptops(id) ON DELETE SET NULL,
  CONSTRAINT "orders_trade_in_credit_vnd_check" CHECK (trade_in_credit_vnd >= 0),
  CONSTRAINT "orders_trade_in_laptop_id_fkey" FOREIGN KEY (trade_in_laptop_id) REFERENCES laptops(id) ON DELETE SET NULL
);
```

Indexes (3, gồm autoindex):

- `idx_orders_month_key`: `CREATE INDEX idx_orders_month_key ON orders (month_key)`
- `orders_laptop_active_idx`: `CREATE INDEX orders_laptop_active_idx ON orders (laptop_id, is_active, order_status, payment_status)`
- `orders_requested_laptop_idx`: `CREATE INDEX orders_requested_laptop_idx ON orders (requested_laptop_id, is_active, order_status, payment_status)`

## payments

Domain: Sales / Finance. Purpose/workflow: Các lần thu/hoàn khách; COD delivered. Classification: ACTIVE. Live rows: 76.

PK: id INTEGER. FK: account_id → cash_accounts(id); DELETE RESTRICT; order_id → orders(id); DELETE RESTRICT. Inbound: financial_records, reservations.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: payments; cod; payment-correction.

Runtime references: [app/(dashboard)/supplier-payments/page.js:2](../../app/%28dashboard%29/supplier-payments/page.js#L2); [app/api/payments/route.js:45](../../app/api/payments/route.js#L45); [app/api/purchases/route.js:19](../../app/api/purchases/route.js#L19); [app/api/sales-operations/route.js:43](../../app/api/sales-operations/route.js#L43); [lib/apiFetchers.js:154](../../lib/apiFetchers.js#L154); [lib/cloudflare/cod.mjs:58](../../lib/cloudflare/cod.mjs#L58); [lib/cloudflare/database.mjs:8](../../lib/cloudflare/database.mjs#L8); [lib/cloudflare/payment-correction.mjs:7](../../lib/cloudflare/payment-correction.mjs#L7); [lib/cloudflare/payments.mjs:13](../../lib/cloudflare/payments.mjs#L13); [lib/cloudflare/remaining.mjs:130](../../lib/cloudflare/remaining.mjs#L130); [lib/cloudflare/reservations.mjs:41](../../lib/cloudflare/reservations.mjs#L41); [lib/responseVisibility.js:71](../../lib/responseVisibility.js#L71); [components/pages/Invoices.jsx:55](../../components/pages/Invoices.jsx#L55); [components/pages/Payments.jsx:45](../../components/pages/Payments.jsx#L45); [components/pages/Procurement.jsx:21](../../components/pages/Procurement.jsx#L21); [context/InventoryContext.jsx:339](../../context/InventoryContext.jsx#L339)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "payments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "order_id" INTEGER NOT NULL,
  "payment_type" TEXT NOT NULL,
  "amount" NUMERIC NOT NULL,
  "payment_method" TEXT DEFAULT 'transfer_cash' NOT NULL,
  "payment_date" TEXT DEFAULT CURRENT_DATE NOT NULL,
  "reference_code" TEXT,
  "note" TEXT,
  "recorded_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "account_id" TEXT,
  "idempotency_key" TEXT,
  CONSTRAINT "payments_account_id_fkey" FOREIGN KEY (account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "payments_amount_check" CHECK (amount > 0),
  CONSTRAINT "payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT "payments_payment_type_check" CHECK (payment_type IN ('deposit', 'balance', 'cod', 'refund', 'other'))
);
```

Indexes (2, gồm autoindex):

- `payments_idempotency_unique`: `CREATE UNIQUE INDEX payments_idempotency_unique ON payments (idempotency_key) WHERE (idempotency_key IS NOT NULL)`
- `payments_order_date_idx`: `CREATE INDEX payments_order_date_idx ON payments (order_id, payment_date DESC, id DESC)`

## purchase_batches

Domain: Procurement / Supplier. Purpose/workflow: Đầu lô mua; máy chi tiết nằm trong laptops. Classification: QUESTIONABLE DESIGN. Live rows: 24.

PK: id INTEGER. FK: supplier_id → suppliers(id); DELETE RESTRICT. Inbound: laptops, supplier_payments.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C. Module chính: procurement; intake; supplier-payments.

Runtime references: [app/api/exports/route.js:42](../../app/api/exports/route.js#L42); [app/api/intake/route.js:50](../../app/api/intake/route.js#L50); [app/api/inventory/route.js:80](../../app/api/inventory/route.js#L80); [app/api/supplier-payments/route.js:19](../../app/api/supplier-payments/route.js#L19); [app/api/supplier-returns/route.js:45](../../app/api/supplier-returns/route.js#L45); [lib/cloudflare/accounts.mjs:123](../../lib/cloudflare/accounts.mjs#L123); [lib/cloudflare/procurement.mjs:79](../../lib/cloudflare/procurement.mjs#L79); [lib/cloudflare/qc.mjs:116](../../lib/cloudflare/qc.mjs#L116); [lib/cloudflare/supplier-payments.mjs:25](../../lib/cloudflare/supplier-payments.mjs#L25); [lib/cloudflare/supplier-returns.mjs:25](../../lib/cloudflare/supplier-returns.mjs#L25); [components/pages/Procurement.jsx:55](../../components/pages/Procurement.jsx#L55)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "purchase_batches" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "batch_code" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "purchase_date" TEXT NOT NULL,
  "currency" TEXT DEFAULT 'CNY' NOT NULL,
  "exchange_rate" NUMERIC NOT NULL,
  "subtotal_rmb" NUMERIC DEFAULT 0 NOT NULL,
  "domestic_shipping_rmb" NUMERIC DEFAULT 0 NOT NULL,
  "other_cost_rmb" NUMERIC DEFAULT 0 NOT NULL,
  "destination" TEXT DEFAULT 'OTHER' NOT NULL,
  "status" TEXT DEFAULT 'DRAFT' NOT NULL,
  "notes" TEXT DEFAULT '' NOT NULL,
  "active" INTEGER DEFAULT true NOT NULL CHECK ("active" IN (0,1)),
  "created_by" TEXT NOT NULL,
  "updated_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "idempotency_key" TEXT,
  "procurement_flow" TEXT DEFAULT 'LEGACY' NOT NULL,
  CONSTRAINT "purchase_batches_batch_code_key" UNIQUE (batch_code),
  CONSTRAINT "purchase_batches_currency_check" CHECK (currency = 'CNY'),
  CONSTRAINT "purchase_batches_destination_check" CHECK (destination IN ('YUNNAN', 'GUANGXI', 'OTHER')),
  CONSTRAINT "purchase_batches_domestic_shipping_rmb_check" CHECK (domestic_shipping_rmb >= 0),
  CONSTRAINT "purchase_batches_exchange_rate_check" CHECK (exchange_rate > 0),
  CONSTRAINT "purchase_batches_id_supplier_unique" UNIQUE (id, supplier_id),
  CONSTRAINT "purchase_batches_other_cost_rmb_check" CHECK (other_cost_rmb >= 0),
  CONSTRAINT "purchase_batches_procurement_flow_check" CHECK (procurement_flow IN ('LEGACY', 'DIRECT')),
  CONSTRAINT "purchase_batches_status_check" CHECK (status IN ('DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'IN_TRANSIT_CN', 'AT_CN_WAREHOUSE', 'IN_TRANSIT_VN', 'RECEIVED', 'PARTIALLY_RECEIVED', 'CLOSED', 'CANCELLED')),
  CONSTRAINT "purchase_batches_subtotal_rmb_check" CHECK (subtotal_rmb >= 0),
  CONSTRAINT "purchase_batches_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);
```

Indexes (4, gồm autoindex):

- `purchase_batches_idempotency_unique`: `CREATE UNIQUE INDEX purchase_batches_idempotency_unique ON purchase_batches (idempotency_key) WHERE (idempotency_key IS NOT NULL)`
- `purchase_batches_supplier_idx`: `CREATE INDEX purchase_batches_supplier_idx ON purchase_batches (supplier_id, purchase_date DESC)`
- `sqlite_autoindex_purchase_batches_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_purchase_batches_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## qc_check_items

Domain: QC / Legacy history. Purpose/workflow: Checklist QC cũ còn API đọc. Classification: POSSIBLY LEGACY. Live rows: 0.

PK: id INTEGER. FK: qc_inspection_id → qc_inspections(id); DELETE CASCADE. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R. Module chính: qc API; migration/import lịch sử.

Runtime references: [app/api/qc/route.js:22](../../app/api/qc/route.js#L22)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "qc_check_items" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "qc_inspection_id" TEXT NOT NULL,
  "check_key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "note" TEXT DEFAULT '' NOT NULL,
  "checked_by" TEXT NOT NULL,
  "checked_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "category" TEXT DEFAULT 'OTHER' NOT NULL,
  "requirement" TEXT DEFAULT 'REQUIRED' NOT NULL,
  "sort_order" INTEGER DEFAULT 0 NOT NULL,
  CONSTRAINT "qc_check_items_check_key_check" CHECK (length(check_key) BETWEEN 2 AND 60 AND check_key NOT GLOB '*[^a-z0-9_]*'),
  CONSTRAINT "qc_check_items_label_check" CHECK (length(trim(label)) >= 1 AND length(trim(label)) <= 120),
  CONSTRAINT "qc_check_items_qc_inspection_id_check_key_key" UNIQUE (qc_inspection_id, check_key),
  CONSTRAINT "qc_check_items_qc_inspection_id_fkey" FOREIGN KEY (qc_inspection_id) REFERENCES qc_inspections(id) ON DELETE CASCADE,
  CONSTRAINT "qc_check_items_requirement_check" CHECK (requirement IN ('REQUIRED', 'OPTIONAL', 'CONDITIONAL')),
  CONSTRAINT "qc_check_items_result_check" CHECK (result IN ('PASS', 'FAIL', 'WARNING', 'NOT_TESTED', 'NOT_APPLICABLE'))
);
```

Indexes (1, gồm autoindex):

- `sqlite_autoindex_qc_check_items_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## qc_inspections

Domain: QC. Purpose/workflow: Phiên kiểm tra, disposition, kết quả và thời điểm. Classification: ACTIVE. Live rows: 128.

PK: id TEXT. FK: laptop_id → laptops(id); DELETE RESTRICT. Inbound: qc_check_items, supplier_return_items.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: procurement; qc; QC.

Runtime references: [app/api/qc/route.js:21](../../app/api/qc/route.js#L21); [app/api/repairs/route.js:36](../../app/api/repairs/route.js#L36); [app/api/supplier-returns/route.js:22](../../app/api/supplier-returns/route.js#L22); [lib/cloudflare/procurement.mjs:153](../../lib/cloudflare/procurement.mjs#L153); [lib/cloudflare/qc.mjs:88](../../lib/cloudflare/qc.mjs#L88); [lib/cloudflare/remaining.mjs:263](../../lib/cloudflare/remaining.mjs#L263); [lib/cloudflare/repairs.mjs:123](../../lib/cloudflare/repairs.mjs#L123)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "qc_inspections" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "inspection_code" TEXT NOT NULL,
  "laptop_id" INTEGER NOT NULL,
  "status" TEXT DEFAULT 'IN_PROGRESS' NOT NULL,
  "result" TEXT,
  "started_by" TEXT NOT NULL,
  "started_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "completed_by" TEXT,
  "completed_at" TEXT,
  "overall_notes" TEXT DEFAULT '' NOT NULL,
  "mainboard_status" TEXT DEFAULT 'UNKNOWN' NOT NULL,
  "charger_status" TEXT DEFAULT 'UNKNOWN' NOT NULL,
  "cosmetic_grade" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "completion_idempotency_key" TEXT,
  "disposition" TEXT,
  "detail_snapshot" TEXT CHECK ("detail_snapshot" IS NULL OR json_valid("detail_snapshot")),
  CONSTRAINT "qc_inspections_charger_status_check" CHECK (charger_status IN ('ORIGINAL', 'ORIGINAL_US', 'COMPATIBLE', 'MISSING', 'UNKNOWN')),
  CONSTRAINT "qc_inspections_check" CHECK (status = 'IN_PROGRESS' AND result IS NULL AND completed_at IS NULL OR status = 'COMPLETED' AND result IS NOT NULL AND completed_at IS NOT NULL OR status = 'CANCELLED'),
  CONSTRAINT "qc_inspections_cosmetic_grade_check" CHECK (cosmetic_grade IS NULL OR (cosmetic_grade IN ('A', 'B', 'C', 'D'))),
  CONSTRAINT "qc_inspections_disposition_check" CHECK (disposition IN ('PASS', 'FAIL', 'REPAIR', 'RETURN_CN')),
  CONSTRAINT "qc_inspections_idempotency_key_check" CHECK (length(trim(idempotency_key)) >= 8 AND length(trim(idempotency_key)) <= 100),
  CONSTRAINT "qc_inspections_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "qc_inspections_inspection_code_key" UNIQUE (inspection_code),
  CONSTRAINT "qc_inspections_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE RESTRICT,
  CONSTRAINT "qc_inspections_mainboard_status_check" CHECK (mainboard_status IN ('ORIGINAL', 'OFFICIAL_REPLACED', 'REPAIRED', 'UNKNOWN')),
  CONSTRAINT "qc_inspections_pkey" PRIMARY KEY (id),
  CONSTRAINT "qc_inspections_result_check" CHECK (result IN ('PASS', 'FAIL')),
  CONSTRAINT "qc_inspections_status_check" CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
);
```

Indexes (6, gồm autoindex):

- `qc_inspections_completion_idempotency_unique`: `CREATE UNIQUE INDEX qc_inspections_completion_idempotency_unique ON qc_inspections (completion_idempotency_key) WHERE (completion_idempotency_key IS NOT NULL)`
- `qc_inspections_laptop_history_idx`: `CREATE INDEX qc_inspections_laptop_history_idx ON qc_inspections (laptop_id, started_at DESC)`
- `qc_inspections_one_active_per_laptop`: `CREATE UNIQUE INDEX qc_inspections_one_active_per_laptop ON qc_inspections (laptop_id) WHERE (status = 'IN_PROGRESS')`
- `sqlite_autoindex_qc_inspections_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_qc_inspections_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_qc_inspections_3`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## repair_actions

Domain: Repair / History. Purpose/workflow: Thao tác thực hiện sửa chữa. Classification: ACTIVE. Live rows: 0.

PK: id INTEGER. FK: repair_job_id → repair_jobs(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C. Module chính: repairs; Repairs.

Runtime references: [app/api/repairs/route.js:31](../../app/api/repairs/route.js#L31); [lib/cloudflare/repairs.mjs:85](../../lib/cloudflare/repairs.mjs#L85)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "repair_actions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "repair_job_id" TEXT NOT NULL,
  "action_type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "performed_by" TEXT NOT NULL,
  "performed_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "repair_actions_action_type_check" CHECK (action_type IN ('DIAGNOSIS', 'CLEANING', 'PART_REPLACEMENT', 'BIOS', 'SOFTWARE', 'THERMAL_SERVICE', 'TEST', 'OTHER')),
  CONSTRAINT "repair_actions_repair_job_id_fkey" FOREIGN KEY (repair_job_id) REFERENCES repair_jobs(id) ON DELETE RESTRICT
);
```

Indexes (0, gồm autoindex):

Không có secondary index.

## repair_jobs

Domain: Repair. Purpose/workflow: Phiếu sửa, lifecycle, kết quả và tổng chi phí. Classification: QUESTIONABLE DESIGN. Live rows: 0.

PK: id TEXT. FK: assigned_to → user_profiles(id); DELETE RESTRICT; laptop_id → laptops(id); DELETE RESTRICT. Inbound: repair_actions, repair_parts, supplier_return_items.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: repairs; qc; Repairs.

Runtime references: [app/api/repairs/route.js:29](../../app/api/repairs/route.js#L29); [app/api/supplier-returns/route.js:22](../../app/api/supplier-returns/route.js#L22); [lib/cloudflare/procurement.mjs:375](../../lib/cloudflare/procurement.mjs#L375); [lib/cloudflare/qc.mjs:123](../../lib/cloudflare/qc.mjs#L123); [lib/cloudflare/remaining.mjs:273](../../lib/cloudflare/remaining.mjs#L273); [lib/cloudflare/repairs.mjs:10](../../lib/cloudflare/repairs.mjs#L10); [lib/cloudflare/supplier-returns.mjs:27](../../lib/cloudflare/supplier-returns.mjs#L27)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "repair_jobs" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "repair_code" TEXT NOT NULL,
  "laptop_id" INTEGER NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT,
  "status" TEXT DEFAULT 'OPEN' NOT NULL,
  "reported_issue" TEXT NOT NULL,
  "diagnosis" TEXT DEFAULT '' NOT NULL,
  "repair_plan" TEXT DEFAULT '' NOT NULL,
  "resolution" TEXT DEFAULT '' NOT NULL,
  "priority" TEXT DEFAULT 'NORMAL' NOT NULL,
  "assigned_to" TEXT,
  "started_at" TEXT,
  "completed_at" TEXT,
  "labor_cost_vnd" NUMERIC DEFAULT 0 NOT NULL,
  "parts_cost_vnd" NUMERIC DEFAULT 0 NOT NULL,
  "total_cost_vnd" NUMERIC GENERATED ALWAYS AS ((labor_cost_vnd + parts_cost_vnd)) STORED,
  "requires_re_qc" INTEGER DEFAULT true NOT NULL CHECK ("requires_re_qc" IN (0,1)),
  "notes" TEXT DEFAULT '' NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "completion_idempotency_key" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "outcome" TEXT,
  "recommended_action" TEXT,
  CONSTRAINT "repair_jobs_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES user_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT "repair_jobs_completion_idempotency_key_check" CHECK (completion_idempotency_key IS NULL OR length(trim(completion_idempotency_key)) >= 8 AND length(trim(completion_idempotency_key)) <= 100),
  CONSTRAINT "repair_jobs_completion_idempotency_key_key" UNIQUE (completion_idempotency_key),
  CONSTRAINT "repair_jobs_idempotency_key_check" CHECK (length(trim(idempotency_key)) >= 8 AND length(trim(idempotency_key)) <= 100),
  CONSTRAINT "repair_jobs_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "repair_jobs_labor_cost_vnd_check" CHECK (labor_cost_vnd >= 0),
  CONSTRAINT "repair_jobs_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE RESTRICT,
  CONSTRAINT "repair_jobs_outcome_check" CHECK (outcome IS NULL OR (outcome IN ('REPAIRED', 'NOT_REPAIRED', 'PARTIALLY_REPAIRED', 'NO_FAULT_FOUND'))),
  CONSTRAINT "repair_jobs_parts_cost_vnd_check" CHECK (parts_cost_vnd >= 0),
  CONSTRAINT "repair_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "repair_jobs_priority_check" CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  CONSTRAINT "repair_jobs_recommended_action_check" CHECK (recommended_action IS NULL OR (recommended_action IN ('RE_QC', 'SUPPLIER_RETURN', 'NO_FURTHER_ACTION', 'OTHER'))),
  CONSTRAINT "repair_jobs_repair_code_key" UNIQUE (repair_code),
  CONSTRAINT "repair_jobs_reported_issue_check" CHECK (length(trim(reported_issue)) >= 1 AND length(trim(reported_issue)) <= 5000),
  CONSTRAINT "repair_jobs_source_type_check" CHECK (source_type IN ('QC', 'WARRANTY', 'TRADE_IN', 'INTERNAL')),
  CONSTRAINT "repair_jobs_status_check" CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_PART', 'TESTING', 'COMPLETED', 'CANCELLED'))
);
```

Indexes (6, gồm autoindex):

- `repair_jobs_one_active_per_laptop`: `CREATE UNIQUE INDEX repair_jobs_one_active_per_laptop ON repair_jobs (laptop_id) WHERE (status NOT IN ('COMPLETED', 'CANCELLED'))`
- `repair_jobs_status_idx`: `CREATE INDEX repair_jobs_status_idx ON repair_jobs (status, priority, created_at DESC)`
- `sqlite_autoindex_repair_jobs_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_repair_jobs_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_repair_jobs_3`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_repair_jobs_4`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## repair_parts

Domain: Repair. Purpose/workflow: Linh kiện và chi phí của phiếu sửa. Classification: ACTIVE. Live rows: 0.

PK: id INTEGER. FK: repair_job_id → repair_jobs(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U/D. Module chính: repairs; Repairs.

Runtime references: [app/api/repairs/route.js:30](../../app/api/repairs/route.js#L30); [lib/cloudflare/repairs.mjs:55](../../lib/cloudflare/repairs.mjs#L55)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "repair_parts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "repair_job_id" TEXT NOT NULL,
  "part_type" TEXT NOT NULL,
  "part_name" TEXT NOT NULL,
  "serial" TEXT,
  "quantity" INTEGER NOT NULL,
  "unit_cost_vnd" NUMERIC NOT NULL,
  "total_cost_vnd" NUMERIC GENERATED ALWAYS AS (((quantity) * unit_cost_vnd)) STORED,
  "source" TEXT NOT NULL,
  "notes" TEXT DEFAULT '' NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "repair_parts_part_type_check" CHECK (part_type IN ('RAM', 'SSD', 'SCREEN', 'KEYBOARD', 'FAN', 'BATTERY', 'MAINBOARD', 'WIFI_CARD', 'CHARGER', 'HINGE', 'CABLE', 'THERMAL_MATERIAL', 'OTHER')),
  CONSTRAINT "repair_parts_quantity_check" CHECK (quantity > 0),
  CONSTRAINT "repair_parts_repair_job_id_fkey" FOREIGN KEY (repair_job_id) REFERENCES repair_jobs(id) ON DELETE RESTRICT,
  CONSTRAINT "repair_parts_source_check" CHECK (source IN ('STOCK', 'PURCHASED', 'CUSTOMER', 'SUPPLIER', 'OTHER')),
  CONSTRAINT "repair_parts_unit_cost_vnd_check" CHECK (unit_cost_vnd >= 0)
);
```

Indexes (0, gồm autoindex):

Không có secondary index.

## reservations

Domain: Sales / Inventory. Purpose/workflow: Giữ máy có thời hạn và chuyển thành phân bổ đơn. Classification: QUESTIONABLE DESIGN. Live rows: 0.

PK: id TEXT. FK: customer_id → customers(id); DELETE SET NULL; deposit_payment_id → payments(id); DELETE SET NULL; laptop_id → laptops(id); DELETE RESTRICT; order_id → orders(id); DELETE SET NULL; reserved_by → user_profiles(id); DELETE SET NULL. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/U/C. Module chính: reservations; sales-operations.

Runtime references: [app/(dashboard)/reservations/page.js:2](../../app/%28dashboard%29/reservations/page.js#L2); [app/api/inventory/route.js:61](../../app/api/inventory/route.js#L61); [app/api/management-dashboard/route.js:18](../../app/api/management-dashboard/route.js#L18); [app/api/orders/route.js:114](../../app/api/orders/route.js#L114); [app/api/sales-operations/route.js:38](../../app/api/sales-operations/route.js#L38); [lib/cloudflare/database.mjs:13](../../lib/cloudflare/database.mjs#L13); [lib/cloudflare/procurement.mjs:192](../../lib/cloudflare/procurement.mjs#L192); [lib/cloudflare/reservations.mjs:10](../../lib/cloudflare/reservations.mjs#L10); [components/pages/Dashboard.jsx:172](../../components/pages/Dashboard.jsx#L172); [components/pages/Inventory.jsx:1099](../../components/pages/Inventory.jsx#L1099); [components/pages/Orders.jsx:994](../../components/pages/Orders.jsx#L994); [components/pages/SalesOperations.jsx:13](../../components/pages/SalesOperations.jsx#L13)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "reservations" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "reservation_code" TEXT NOT NULL,
  "laptop_id" INTEGER NOT NULL,
  "customer_id" INTEGER,
  "order_id" INTEGER,
  "status" TEXT NOT NULL,
  "reserved_by" TEXT,
  "reserved_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "expires_at" TEXT NOT NULL,
  "deposit_payment_id" INTEGER,
  "notes" TEXT DEFAULT '' NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "converted_at" TEXT,
  "expired_at" TEXT,
  "cancelled_at" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "reservations_check" CHECK (expires_at > reserved_at),
  CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT "reservations_deposit_payment_id_fkey" FOREIGN KEY (deposit_payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT "reservations_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "reservations_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE RESTRICT,
  CONSTRAINT "reservations_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT "reservations_pkey" PRIMARY KEY (id),
  CONSTRAINT "reservations_reservation_code_key" UNIQUE (reservation_code),
  CONSTRAINT "reservations_reserved_by_fkey" FOREIGN KEY (reserved_by) REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT "reservations_status_check" CHECK (status IN ('ACTIVE', 'CONVERTED', 'EXPIRED', 'CANCELLED'))
);
```

Indexes (5, gồm autoindex):

- `reservations_one_active_laptop`: `CREATE UNIQUE INDEX reservations_one_active_laptop ON reservations (laptop_id) WHERE (status = 'ACTIVE')`
- `reservations_status_expiry_idx`: `CREATE INDEX reservations_status_expiry_idx ON reservations (status, expires_at)`
- `sqlite_autoindex_reservations_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_reservations_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_reservations_3`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## sheet_import_sources

Domain: Import / History. Purpose/workflow: Payload nguồn sheet phục vụ truy vết và tái dựng import. Classification: ACTIVE (import/history). Live rows: 250.

PK: source_key TEXT. FK: Không có FK khai báo. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): import/history hoặc qua wrapper. Module chính: 0013; 0015; scripts/build-october-replacement.

Runtime references: Không có reference trực tiếp trong runtime; đối chiếu import/history/tests.

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE sheet_import_sources(source_key TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)));
```

Indexes (1, gồm autoindex):

- `sqlite_autoindex_sheet_import_sources_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## stock_movements

Domain: Inventory / History. Purpose/workflow: Lịch sử nhận, QC, giữ, bán, giải phóng máy. Classification: ACTIVE. Live rows: 256.

PK: id INTEGER. FK: laptop_id → laptops(id); DELETE SET NULL; order_id → orders(id); DELETE SET NULL; warranty_case_id → warranty_cases(id); DELETE SET NULL. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C. Module chính: procurement; qc; payments; stock-movements.

Runtime references: [app/api/stock-movements/route.js:35](../../app/api/stock-movements/route.js#L35); [lib/cloudflare/payments.mjs:65](../../lib/cloudflare/payments.mjs#L65); [lib/cloudflare/procurement.mjs:282](../../lib/cloudflare/procurement.mjs#L282); [lib/cloudflare/qc.mjs:188](../../lib/cloudflare/qc.mjs#L188)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "stock_movements" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "laptop_id" INTEGER,
  "movement_type" TEXT,
  "from_location" TEXT,
  "to_location" TEXT,
  "order_id" INTEGER,
  "warranty_case_id" INTEGER,
  "note" TEXT,
  "performed_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "reference_type" TEXT,
  "reference_id" TEXT,
  CONSTRAINT "stock_movements_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE SET NULL,
  CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT "stock_movements_warranty_case_id_fkey" FOREIGN KEY (warranty_case_id) REFERENCES warranty_cases(id) ON DELETE SET NULL
);
```

Indexes (1, gồm autoindex):

- `stock_movements_laptop_created_at_idx`: `CREATE INDEX stock_movements_laptop_created_at_idx ON stock_movements (laptop_id, created_at DESC)`

## supplier_payments

Domain: Payables / Cash. Purpose/workflow: Thanh toán nhà cung cấp theo lô. Classification: ACTIVE. Live rows: 0.

PK: id INTEGER. FK: account_id → cash_accounts(id); DELETE RESTRICT; purchase_batch_id, supplier_id → purchase_batches(id, supplier_id); DELETE RESTRICT; purchase_batch_id → purchase_batches(id); DELETE RESTRICT; supplier_id → suppliers(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C. Module chính: supplier-payments; payables.

Runtime references: [app/api/purchases/route.js:22](../../app/api/purchases/route.js#L22); [app/api/supplier-payments/route.js:20](../../app/api/supplier-payments/route.js#L20); [lib/cloudflare/procurement.mjs:234](../../lib/cloudflare/procurement.mjs#L234); [lib/cloudflare/supplier-payments.mjs:19](../../lib/cloudflare/supplier-payments.mjs#L19)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "supplier_payments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "supplier_id" TEXT NOT NULL,
  "purchase_batch_id" INTEGER NOT NULL,
  "amount_rmb" NUMERIC NOT NULL,
  "amount_vnd" NUMERIC NOT NULL,
  "exchange_rate" NUMERIC NOT NULL,
  "payment_method" TEXT NOT NULL,
  "reference" TEXT DEFAULT '' NOT NULL,
  "payment_date" TEXT NOT NULL,
  "notes" TEXT DEFAULT '' NOT NULL,
  "recorded_by" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "account_id" TEXT,
  CONSTRAINT "supplier_payments_account_id_fkey" FOREIGN KEY (account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_payments_amount_rmb_check" CHECK (amount_rmb > 0),
  CONSTRAINT "supplier_payments_amount_vnd_check" CHECK (amount_vnd > 0),
  CONSTRAINT "supplier_payments_batch_supplier_fk" FOREIGN KEY (purchase_batch_id, supplier_id) REFERENCES purchase_batches(id, supplier_id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_payments_exchange_rate_check" CHECK (exchange_rate > 0),
  CONSTRAINT "supplier_payments_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "supplier_payments_idempotency_not_blank" CHECK (length(trim(idempotency_key)) >= 8 AND length(trim(idempotency_key)) <= 100),
  CONSTRAINT "supplier_payments_payment_method_check" CHECK (payment_method IN ('WECHAT', 'ALIPAY', 'BANK_TRANSFER', 'CASH', 'OTHER')),
  CONSTRAINT "supplier_payments_purchase_batch_id_fkey" FOREIGN KEY (purchase_batch_id) REFERENCES purchase_batches(id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);
```

Indexes (2, gồm autoindex):

- `sqlite_autoindex_supplier_payments_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `supplier_payments_batch_idx`: `CREATE INDEX supplier_payments_batch_idx ON supplier_payments (purchase_batch_id, payment_date, id)`

## supplier_refunds

Domain: Supplier Refund / Cash. Purpose/workflow: Các lần hoàn tiền NCC, gắn phiếu trả. Classification: ACTIVE. Live rows: 0.

PK: id INTEGER. FK: account_id → cash_accounts(id); DELETE RESTRICT; supplier_id → suppliers(id); DELETE RESTRICT; supplier_return_id → supplier_returns(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C. Module chính: supplier-returns.

Runtime references: [app/api/supplier-returns/route.js:23](../../app/api/supplier-returns/route.js#L23); [lib/cloudflare/financial.mjs:19](../../lib/cloudflare/financial.mjs#L19); [lib/cloudflare/procurement.mjs:224](../../lib/cloudflare/procurement.mjs#L224); [lib/cloudflare/remaining.mjs:283](../../lib/cloudflare/remaining.mjs#L283); [lib/cloudflare/supplier-returns.mjs:121](../../lib/cloudflare/supplier-returns.mjs#L121)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "supplier_refunds" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "supplier_id" TEXT NOT NULL,
  "supplier_return_id" TEXT NOT NULL,
  "amount_rmb" NUMERIC NOT NULL,
  "amount_vnd" NUMERIC,
  "exchange_rate" NUMERIC,
  "refund_method" TEXT NOT NULL,
  "reference" TEXT DEFAULT '' NOT NULL,
  "received_at" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "account_id" TEXT,
  CONSTRAINT "supplier_refunds_account_id_fkey" FOREIGN KEY (account_id) REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_refunds_amount_rmb_check" CHECK (amount_rmb > 0),
  CONSTRAINT "supplier_refunds_check" CHECK (amount_vnd IS NULL AND exchange_rate IS NULL OR amount_vnd >= 0 AND exchange_rate > 0),
  CONSTRAINT "supplier_refunds_idempotency_key_check" CHECK (length(trim(idempotency_key)) >= 8 AND length(trim(idempotency_key)) <= 100),
  CONSTRAINT "supplier_refunds_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "supplier_refunds_refund_method_check" CHECK (refund_method IN ('WECHAT', 'ALIPAY', 'BANK_TRANSFER', 'OFFSET', 'OTHER')),
  CONSTRAINT "supplier_refunds_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_refunds_supplier_return_id_fkey" FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns(id) ON DELETE RESTRICT
);
```

Indexes (2, gồm autoindex):

- `sqlite_autoindex_supplier_refunds_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `supplier_refunds_return_idx`: `CREATE INDEX supplier_refunds_return_idx ON supplier_refunds (supplier_return_id, received_at, id)`

## supplier_return_events

Domain: Supplier Return / History. Purpose/workflow: Mốc xử lý, nhận refund, liên kết thay thế. Classification: ACTIVE. Live rows: 0.

PK: id INTEGER. FK: supplier_return_id → supplier_returns(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C. Module chính: supplier-returns; SupplierReturns.

Runtime references: [app/api/supplier-returns/route.js:24](../../app/api/supplier-returns/route.js#L24); [lib/cloudflare/qc.mjs:179](../../lib/cloudflare/qc.mjs#L179); [lib/cloudflare/supplier-returns.mjs:48](../../lib/cloudflare/supplier-returns.mjs#L48)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "supplier_return_events" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "supplier_return_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "details" TEXT DEFAULT '{}' NOT NULL CHECK ("details" IS NULL OR json_valid("details")),
  "performed_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "supplier_return_events_supplier_return_id_fkey" FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns(id) ON DELETE RESTRICT
);
```

Indexes (1, gồm autoindex):

- `supplier_return_events_return_idx`: `CREATE INDEX supplier_return_events_return_idx ON supplier_return_events (supplier_return_id, created_at, id)`

## supplier_return_items

Domain: Supplier Return / Replacement. Purpose/workflow: Máy trả, mức hoàn, máy thay thế và trạng thái item. Classification: ACTIVE. Live rows: 0.

PK: id INTEGER. FK: laptop_id → laptops(id); DELETE RESTRICT; qc_inspection_id → qc_inspections(id); DELETE RESTRICT; repair_job_id → repair_jobs(id); DELETE RESTRICT; replacement_laptop_id → laptops(id); DELETE RESTRICT; supplier_return_id → supplier_returns(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: supplier-returns; qc.

Runtime references: [app/api/supplier-returns/route.js:22](../../app/api/supplier-returns/route.js#L22); [lib/cloudflare/financial.mjs:16](../../lib/cloudflare/financial.mjs#L16); [lib/cloudflare/procurement.mjs:223](../../lib/cloudflare/procurement.mjs#L223); [lib/cloudflare/qc.mjs:130](../../lib/cloudflare/qc.mjs#L130); [lib/cloudflare/remaining.mjs:279](../../lib/cloudflare/remaining.mjs#L279); [lib/cloudflare/supplier-returns.mjs:39](../../lib/cloudflare/supplier-returns.mjs#L39); [components/pages/SupplierReturns.jsx:31](../../components/pages/SupplierReturns.jsx#L31)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "supplier_return_items" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "supplier_return_id" TEXT NOT NULL,
  "laptop_id" INTEGER NOT NULL,
  "repair_job_id" TEXT,
  "qc_inspection_id" TEXT,
  "reason" TEXT NOT NULL,
  "condition_notes" TEXT DEFAULT '' NOT NULL,
  "expected_refund_rmb" NUMERIC,
  "agreed_refund_rmb" NUMERIC,
  "replacement_laptop_id" INTEGER,
  "status" TEXT DEFAULT 'ACTIVE' NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "previous_laptop_status" TEXT,
  CONSTRAINT "supplier_return_items_agreed_refund_rmb_check" CHECK (agreed_refund_rmb IS NULL OR agreed_refund_rmb >= 0),
  CONSTRAINT "supplier_return_items_expected_refund_rmb_check" CHECK (expected_refund_rmb IS NULL OR expected_refund_rmb >= 0),
  CONSTRAINT "supplier_return_items_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_return_items_qc_inspection_id_fkey" FOREIGN KEY (qc_inspection_id) REFERENCES qc_inspections(id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_return_items_reason_check" CHECK (reason IN ('MAINBOARD_REPAIRED', 'WRONG_CONFIGURATION', 'HARDWARE_FAULT', 'SCREEN_FAULT', 'GPU_FAULT', 'FUNCTIONAL_FAILURE', 'PHYSICAL_DAMAGE', 'MISSING_ACCESSORY', 'SUPPLIER_AGREEMENT', 'OTHER')),
  CONSTRAINT "supplier_return_items_repair_job_id_fkey" FOREIGN KEY (repair_job_id) REFERENCES repair_jobs(id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_return_items_replacement_laptop_id_fkey" FOREIGN KEY (replacement_laptop_id) REFERENCES laptops(id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_return_items_status_check" CHECK (status IN ('ACTIVE', 'SHIPPED', 'SUPPLIER_RECEIVED', 'REFUNDED', 'REPLACED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT "supplier_return_items_supplier_return_id_fkey" FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns(id) ON DELETE RESTRICT,
  CONSTRAINT "supplier_return_items_supplier_return_id_laptop_id_key" UNIQUE (supplier_return_id, laptop_id)
);
```

Indexes (4, gồm autoindex):

- `sqlite_autoindex_supplier_return_items_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `supplier_return_items_one_active_laptop`: `CREATE UNIQUE INDEX supplier_return_items_one_active_laptop ON supplier_return_items (laptop_id) WHERE (status NOT IN ('REFUNDED', 'REPLACED', 'REJECTED', 'CANCELLED'))`
- `supplier_return_items_replacement_laptop_unique`: `CREATE UNIQUE INDEX supplier_return_items_replacement_laptop_unique ON supplier_return_items (replacement_laptop_id) WHERE (replacement_laptop_id IS NOT NULL)`
- `supplier_return_items_return_idx`: `CREATE INDEX supplier_return_items_return_idx ON supplier_return_items (supplier_return_id, status, id)`

## supplier_returns

Domain: Supplier Return. Purpose/workflow: Đầu phiếu trả cho một NCC, trạng thái giải quyết. Classification: QUESTIONABLE DESIGN. Live rows: 0.

PK: id TEXT. FK: supplier_id → suppliers(id); DELETE RESTRICT. Inbound: supplier_refunds, supplier_return_events, supplier_return_items.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: supplier-returns; qc.

Runtime references: [app/api/supplier-returns/route.js:21](../../app/api/supplier-returns/route.js#L21); [lib/cloudflare/financial.mjs:16](../../lib/cloudflare/financial.mjs#L16); [lib/cloudflare/qc.mjs:169](../../lib/cloudflare/qc.mjs#L169); [lib/cloudflare/remaining.mjs:279](../../lib/cloudflare/remaining.mjs#L279); [lib/cloudflare/supplier-returns.mjs:22](../../lib/cloudflare/supplier-returns.mjs#L22); [components/pages/Dashboard.jsx:181](../../components/pages/Dashboard.jsx#L181)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "supplier_returns" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "return_code" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "status" TEXT DEFAULT 'DRAFT' NOT NULL,
  "resolution_type" TEXT,
  "reason" TEXT NOT NULL,
  "reason_notes" TEXT DEFAULT '' NOT NULL,
  "notes" TEXT DEFAULT '' NOT NULL,
  "return_carrier" TEXT DEFAULT '' NOT NULL,
  "return_tracking_number" TEXT DEFAULT '' NOT NULL,
  "created_by" TEXT NOT NULL,
  "approved_by" TEXT,
  "approved_at" TEXT,
  "shipped_at" TEXT,
  "supplier_received_at" TEXT,
  "closed_at" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "supplier_returns_idempotency_key_check" CHECK (length(trim(idempotency_key)) >= 8 AND length(trim(idempotency_key)) <= 100),
  CONSTRAINT "supplier_returns_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "supplier_returns_pkey" PRIMARY KEY (id),
  CONSTRAINT "supplier_returns_reason_check" CHECK (reason IN ('MAINBOARD_REPAIRED', 'WRONG_CONFIGURATION', 'HARDWARE_FAULT', 'SCREEN_FAULT', 'GPU_FAULT', 'FUNCTIONAL_FAILURE', 'PHYSICAL_DAMAGE', 'MISSING_ACCESSORY', 'SUPPLIER_AGREEMENT', 'OTHER')),
  CONSTRAINT "supplier_returns_resolution_type_check" CHECK (resolution_type IS NULL OR (resolution_type IN ('REFUND', 'REPLACEMENT', 'PARTIAL_REFUND', 'SUPPLIER_REPAIR', 'OTHER'))),
  CONSTRAINT "supplier_returns_return_code_key" UNIQUE (return_code),
  CONSTRAINT "supplier_returns_status_check" CHECK (status IN ('DRAFT', 'APPROVED', 'READY_TO_SHIP', 'SHIPPED', 'SUPPLIER_RECEIVED', 'WAITING_REFUND', 'WAITING_REPLACEMENT', 'PARTIALLY_RESOLVED', 'REFUNDED', 'REPLACED', 'REJECTED', 'CLOSED', 'CANCELLED')),
  CONSTRAINT "supplier_returns_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);
```

Indexes (5, gồm autoindex):

- `sqlite_autoindex_supplier_returns_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_supplier_returns_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_supplier_returns_3`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `supplier_returns_supplier_status_idx`: `CREATE INDEX supplier_returns_supplier_status_idx ON supplier_returns (supplier_id, status, created_at DESC)`
- `supplier_returns_tracking_idx`: `CREATE INDEX supplier_returns_tracking_idx ON supplier_returns (lower(return_tracking_number)) WHERE (trim(return_tracking_number) <> '')`

## suppliers

Domain: Supplier. Purpose/workflow: Danh mục nguồn nhập và thông tin liên hệ. Classification: ACTIVE. Live rows: 16.

PK: id TEXT. FK: Không có FK khai báo. Inbound: purchase_batches, supplier_payments, supplier_refunds, supplier_returns.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/U/C. Module chính: suppliers; procurement; intake.

Runtime references: [app/(dashboard)/suppliers/page.js:2](../../app/%28dashboard%29/suppliers/page.js#L2); [app/api/exports/route.js:43](../../app/api/exports/route.js#L43); [app/api/intake/route.js:48](../../app/api/intake/route.js#L48); [app/api/inventory/route.js:93](../../app/api/inventory/route.js#L93); [app/api/supplier-payments/route.js:20](../../app/api/supplier-payments/route.js#L20); [app/api/supplier-returns/route.js:21](../../app/api/supplier-returns/route.js#L21); [app/api/suppliers/route.js:5](../../app/api/suppliers/route.js#L5); [lib/cloudflare/procurement.mjs:53](../../lib/cloudflare/procurement.mjs#L53); [lib/cloudflare/suppliers.mjs:10](../../lib/cloudflare/suppliers.mjs#L10); [lib/exportData.js:3](../../lib/exportData.js#L3); [components/pages/DirectIntake.jsx:31](../../components/pages/DirectIntake.jsx#L31); [components/pages/Inventory.jsx:203](../../components/pages/Inventory.jsx#L203); [components/pages/Procurement.jsx:21](../../components/pages/Procurement.jsx#L21); [components/pages/PurchaseDayTables.jsx:47](../../components/pages/PurchaseDayTables.jsx#L47); [components/pages/SupplierReturns.jsx:14](../../components/pages/SupplierReturns.jsx#L14)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "suppliers" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "display_name" TEXT DEFAULT '' NOT NULL,
  "wechat_name" TEXT DEFAULT '' NOT NULL,
  "wechat_id" TEXT DEFAULT '' NOT NULL,
  "phone" TEXT DEFAULT '' NOT NULL,
  "country" TEXT DEFAULT 'Trung Quá»‘c' NOT NULL,
  "province" TEXT DEFAULT '' NOT NULL,
  "city" TEXT DEFAULT '' NOT NULL,
  "address" TEXT DEFAULT '' NOT NULL,
  "bank_name" TEXT DEFAULT '' NOT NULL,
  "bank_account_name" TEXT DEFAULT '' NOT NULL,
  "bank_account_number" TEXT DEFAULT '' NOT NULL,
  "alipay_account" TEXT DEFAULT '' NOT NULL,
  "preferred_shipping_destination" TEXT DEFAULT 'OTHER' NOT NULL,
  "notes" TEXT DEFAULT '' NOT NULL,
  "active" INTEGER DEFAULT true NOT NULL CHECK ("active" IN (0,1)),
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "suppliers_code_check" CHECK (length(code) BETWEEN 2 AND 40 AND code NOT GLOB '*[^A-Z0-9_-]*'),
  CONSTRAINT "suppliers_code_key" UNIQUE (code),
  CONSTRAINT "suppliers_name_check" CHECK (length(trim(name)) >= 1 AND length(trim(name)) <= 200),
  CONSTRAINT "suppliers_pkey" PRIMARY KEY (id),
  CONSTRAINT "suppliers_preferred_shipping_destination_check" CHECK (preferred_shipping_destination IN ('YUNNAN', 'GUANGXI', 'OTHER'))
);
```

Indexes (2, gồm autoindex):

- `sqlite_autoindex_suppliers_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_suppliers_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## trade_in_check_items

Domain: Trade-in / QC. Purpose/workflow: Checklist kiểm tra thu cũ. Classification: ACTIVE. Live rows: 0.

PK: id INTEGER. FK: inspection_id → trade_in_inspections(id); DELETE RESTRICT. Inbound: Không có FK inbound.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): C. Module chính: trade-ins; sales-operations.

Runtime references: [app/api/sales-operations/route.js:45](../../app/api/sales-operations/route.js#L45); [lib/cloudflare/trade-ins.mjs:36](../../lib/cloudflare/trade-ins.mjs#L36)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "trade_in_check_items" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "inspection_id" TEXT NOT NULL,
  "check_key" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "notes" TEXT DEFAULT '' NOT NULL,
  CONSTRAINT "trade_in_check_items_inspection_id_check_key_key" UNIQUE (inspection_id, check_key),
  CONSTRAINT "trade_in_check_items_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES trade_in_inspections(id) ON DELETE RESTRICT,
  CONSTRAINT "trade_in_check_items_result_check" CHECK (result IN ('PASS', 'FAIL', 'WARNING', 'NOT_TESTED'))
);
```

Indexes (1, gồm autoindex):

- `sqlite_autoindex_trade_in_check_items_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## trade_in_inspections

Domain: Trade-in / QC. Purpose/workflow: Phiên định giá kỹ thuật thu cũ. Classification: ACTIVE. Live rows: 0.

PK: id TEXT. FK: inspected_by → user_profiles(id); DELETE NO ACTION; trade_in_id → trade_ins(id); DELETE RESTRICT. Inbound: trade_in_check_items.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: trade-ins; sales-operations.

Runtime references: [app/api/sales-operations/route.js:45](../../app/api/sales-operations/route.js#L45); [lib/cloudflare/trade-ins.mjs:5](../../lib/cloudflare/trade-ins.mjs#L5); [components/pages/SalesOperations.jsx:82](../../components/pages/SalesOperations.jsx#L82)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "trade_in_inspections" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "trade_in_id" TEXT NOT NULL,
  "status" TEXT DEFAULT 'IN_PROGRESS' NOT NULL,
  "mainboard_status" TEXT DEFAULT 'UNKNOWN' NOT NULL,
  "findings" TEXT DEFAULT '' NOT NULL,
  "inspected_by" TEXT,
  "started_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "completed_at" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "trade_in_inspections_inspected_by_fkey" FOREIGN KEY (inspected_by) REFERENCES user_profiles(id),
  CONSTRAINT "trade_in_inspections_mainboard_status_check" CHECK (mainboard_status IN ('ORIGINAL', 'OFFICIAL_REPLACED', 'REPAIRED', 'UNKNOWN')),
  CONSTRAINT "trade_in_inspections_pkey" PRIMARY KEY (id),
  CONSTRAINT "trade_in_inspections_status_check" CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  CONSTRAINT "trade_in_inspections_trade_in_id_fkey" FOREIGN KEY (trade_in_id) REFERENCES trade_ins(id) ON DELETE RESTRICT
);
```

Indexes (2, gồm autoindex):

- `sqlite_autoindex_trade_in_inspections_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `trade_in_one_open_inspection`: `CREATE UNIQUE INDEX trade_in_one_open_inspection ON trade_in_inspections (trade_in_id) WHERE (status = 'IN_PROGRESS')`

## trade_ins

Domain: Trade-in / Orders. Purpose/workflow: Hồ sơ đổi máy, credit và máy nhận vào kho. Classification: QUESTIONABLE DESIGN. Live rows: 0.

PK: id TEXT. FK: customer_id → customers(id); DELETE SET NULL; inventory_laptop_id → laptops(id); DELETE RESTRICT; order_id → orders(id); DELETE SET NULL. Inbound: trade_in_inspections.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: trade-ins; sales-operations.

Runtime references: [app/api/inventory/route.js:62](../../app/api/inventory/route.js#L62); [app/api/management-dashboard/route.js:19](../../app/api/management-dashboard/route.js#L19); [app/api/orders/route.js:115](../../app/api/orders/route.js#L115); [app/api/sales-operations/route.js:47](../../app/api/sales-operations/route.js#L47); [lib/cloudflare/trade-ins.mjs:5](../../lib/cloudflare/trade-ins.mjs#L5)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "trade_ins" (
  "id" TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
  "trade_in_code" TEXT NOT NULL,
  "customer_id" INTEGER,
  "order_id" INTEGER,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "serial" TEXT,
  "cpu" TEXT,
  "gpu" TEXT,
  "ram" TEXT,
  "ssd" TEXT,
  "status" TEXT NOT NULL,
  "estimated_value_vnd" NUMERIC,
  "agreed_value_vnd" NUMERIC,
  "reported_condition" TEXT,
  "notes" TEXT,
  "received_at" TEXT,
  "inventory_laptop_id" INTEGER,
  "idempotency_key" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  CONSTRAINT "trade_ins_agreed_value_vnd_check" CHECK (agreed_value_vnd IS NULL OR agreed_value_vnd > 0),
  CONSTRAINT "trade_ins_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT "trade_ins_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "trade_ins_inventory_laptop_id_fkey" FOREIGN KEY (inventory_laptop_id) REFERENCES laptops(id) ON DELETE RESTRICT,
  CONSTRAINT "trade_ins_inventory_laptop_id_key" UNIQUE (inventory_laptop_id),
  CONSTRAINT "trade_ins_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT "trade_ins_order_id_key" UNIQUE (order_id),
  CONSTRAINT "trade_ins_pkey" PRIMARY KEY (id),
  CONSTRAINT "trade_ins_status_check" CHECK (status IN ('DRAFT', 'INSPECTING', 'QUOTED', 'ACCEPTED', 'REJECTED', 'RECEIVED', 'CONVERTED_TO_INVENTORY', 'CANCELLED')),
  CONSTRAINT "trade_ins_trade_in_code_key" UNIQUE (trade_in_code)
);
```

Indexes (6, gồm autoindex):

- `sqlite_autoindex_trade_ins_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_trade_ins_2`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_trade_ins_3`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_trade_ins_4`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `sqlite_autoindex_trade_ins_5`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên
- `trade_ins_serial_active_unique`: `CREATE UNIQUE INDEX trade_ins_serial_active_unique ON trade_ins (lower(serial)) WHERE ((serial IS NOT NULL) AND (status NOT IN ('REJECTED', 'CANCELLED')))`

## user_profiles

Domain: Users / Roles. Purpose/workflow: Tên, role canonical và active của tài khoản. Classification: ACTIVE. Live rows: 7.

PK: id TEXT. FK: id TEXT NOT NULL PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,. Inbound: commissions, repair_jobs, reservations, trade_in_inspections.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: session; users; roles.

Runtime references: [app/api/inventory/route.js:72](../../app/api/inventory/route.js#L72); [app/api/repairs/route.js:49](../../app/api/repairs/route.js#L49); [lib/apiAuth.js:28](../../lib/apiAuth.js#L28); [lib/cloudflare/commissions.mjs:23](../../lib/cloudflare/commissions.mjs#L23); [lib/cloudflare/repairs.mjs:5](../../lib/cloudflare/repairs.mjs#L5); [lib/cloudflare/session.mjs:56](../../lib/cloudflare/session.mjs#L56); [lib/cloudflare/users.mjs:7](../../lib/cloudflare/users.mjs#L7)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "user_profiles" (
  id TEXT NOT NULL PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'SALES'
    CHECK (role IN ('ADMIN','SALES','TECH','TECHNICAL','SALES_TECH','STAFF')),
  is_active INTEGER DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

Indexes (1, gồm autoindex):

- `sqlite_autoindex_user_profiles_1`: autoindex của PRIMARY KEY/UNIQUE trong DDL trên

## warranty_cases

Domain: Warranty / Repair. Purpose/workflow: Tiếp nhận bảo hành gắn laptop/đơn gốc. Classification: ACTIVE. Live rows: 0.

PK: id INTEGER. FK: laptop_id → laptops(id); DELETE SET NULL; order_id → orders(id); DELETE SET NULL. Inbound: stock_movements.

CRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): R/C/U. Module chính: warranty; Warranty.

Runtime references: [app/api/stock-movements/route.js:26](../../app/api/stock-movements/route.js#L26); [app/api/warranty/route.js:13](../../app/api/warranty/route.js#L13)

Tất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:

```sql
CREATE TABLE "warranty_cases" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "order_id" INTEGER,
  "laptop_id" INTEGER,
  "reported_issue" TEXT,
  "status" TEXT,
  "received_date" TEXT,
  "resolved_date" TEXT,
  "repair_cost" NUMERIC DEFAULT 0,
  "parts_replaced" TEXT,
  "diagnosis" TEXT,
  "resolution" TEXT,
  "resolution_note" TEXT,
  "notes" TEXT,
  "customer_info" TEXT,
  "handled_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "warranty_cases_laptop_id_fkey" FOREIGN KEY (laptop_id) REFERENCES laptops(id) ON DELETE SET NULL,
  CONSTRAINT "warranty_cases_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT "warranty_cases_repair_cost_non_negative" CHECK (COALESCE(repair_cost, 0) >= 0)
);
```

Indexes (2, gồm autoindex):

- `warranty_cases_laptop_created_at_idx`: `CREATE INDEX warranty_cases_laptop_created_at_idx ON warranty_cases (laptop_id, created_at DESC)`
- `warranty_cases_one_open_per_laptop_idx`: `CREATE UNIQUE INDEX warranty_cases_one_open_per_laptop_idx ON warranty_cases (laptop_id) WHERE (status IN ('received', 'checking', 'wait_parts', 'repairing'))`

## Views và triggers

### auth_password_revoke

```sql
CREATE TRIGGER auth_password_revoke AFTER UPDATE OF password_hash,email ON auth_users
BEGIN
  DELETE FROM auth_sessions WHERE user_id = NEW.id;
END;
```

### auth_profile_revoke

```sql
CREATE TRIGGER auth_profile_revoke AFTER UPDATE OF is_active,role ON user_profiles
BEGIN
  DELETE FROM auth_sessions WHERE user_id = NEW.id;
END;
```

### laptops_reject_procurement_alias_drift

```sql
CREATE TRIGGER laptops_reject_procurement_alias_drift
AFTER UPDATE OF price_rmb, exchange_rate ON laptops
WHEN NEW.source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')
  AND (NEW.price_rmb IS NOT NEW.purchase_price_rmb OR NEW.exchange_rate IS NOT NEW.purchase_exchange_rate)
BEGIN
  UPDATE laptops
  SET price_rmb=NEW.purchase_price_rmb, exchange_rate=NEW.purchase_exchange_rate
  WHERE id=NEW.id;
END;
```

### laptops_sync_procurement_aliases_canonical

```sql
CREATE TRIGGER laptops_sync_procurement_aliases_canonical
AFTER UPDATE OF purchase_price_rmb, purchase_exchange_rate ON laptops
WHEN NEW.source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')
  AND (NEW.price_rmb IS NOT NEW.purchase_price_rmb OR NEW.exchange_rate IS NOT NEW.purchase_exchange_rate)
BEGIN
  UPDATE laptops
  SET price_rmb=NEW.purchase_price_rmb, exchange_rate=NEW.purchase_exchange_rate
  WHERE id=NEW.id;
END;
```

### laptops_sync_procurement_aliases_insert

```sql
CREATE TRIGGER laptops_sync_procurement_aliases_insert
AFTER INSERT ON laptops
WHEN NEW.source_type IN ('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT')
  AND (NEW.price_rmb IS NOT NEW.purchase_price_rmb OR NEW.exchange_rate IS NOT NEW.purchase_exchange_rate)
BEGIN
  UPDATE laptops
  SET price_rmb=NEW.purchase_price_rmb, exchange_rate=NEW.purchase_exchange_rate
  WHERE id=NEW.id;
END;
```

### cash_account_balances

```sql
CREATE VIEW cash_account_balances AS
SELECT a.id,
    a.code,
    a.name,
    a.account_type,
    a.currency,
    a.opening_balance,
    a.opening_balance_at,
    a.is_active,
    a.created_by,
    a.created_at,
    a.updated_at,
    (COALESCE(t.inflow, (0))) AS inflow,
    (COALESCE(t.outflow, (0))) AS outflow,
    (((a.opening_balance + COALESCE(t.inflow, (0))) - COALESCE(t.outflow, (0)))) AS recorded_balance,
    t.last_transaction_at,
    r.last_reconciled_at,
    r.last_difference
   FROM ((cash_accounts a
     LEFT JOIN ( SELECT x.account_id,
            sum(x.amount) FILTER (WHERE (x.direction = 'IN')) AS inflow,
            sum(x.amount) FILTER (WHERE (x.direction = 'OUT')) AS outflow,
            max(x.occurred_at) AS last_transaction_at
           FROM (account_transactions x
             JOIN cash_accounts ca ON ((ca.id = x.account_id)))
          WHERE (x.occurred_at >= ca.opening_balance_at)
          GROUP BY x.account_id) t ON ((t.account_id = a.id)))
     LEFT JOIN (SELECT account_id,reconciled_at AS last_reconciled_at,difference AS last_difference,
        row_number() OVER (PARTITION BY account_id ORDER BY reconciled_at DESC,id DESC) AS position
        FROM account_reconciliations) r ON (r.account_id=a.id AND r.position=1));
```

### cod_receivable_summaries

```sql
CREATE VIEW cod_receivable_summaries AS
SELECT c.id,
    c.order_id,
    c.carrier,
    c.tracking_number,
    c.expected_cod_amount_vnd,
    c.status,
    c.shipped_at,
    c.delivered_at,
    c.expected_settlement_at,
    c.settled_at,
    c.notes,
    c.idempotency_key,
    c.created_by,
    c.created_at,
    c.updated_at,
    (COALESCE(s.settled_vnd, (0))) AS settled_vnd,
    (max((c.expected_cod_amount_vnd - COALESCE(s.settled_vnd, (0))), (0))) AS outstanding_vnd,
    o.customer_id,
    o.sale_price,
    o.amount_paid,
    o.debt_amount
   FROM ((cod_receivables c
     JOIN orders o ON ((o.id = c.order_id)))
     LEFT JOIN ( SELECT cod_settlements.cod_receivable_id,
            sum(cod_settlements.amount_vnd) AS settled_vnd
           FROM cod_settlements
          GROUP BY cod_settlements.cod_receivable_id) s ON ((s.cod_receivable_id = c.id)));
```

### customer_receivable_summaries

```sql
CREATE VIEW customer_receivable_summaries AS
SELECT o.id AS order_id,
    o.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    o.sale_price,
    o.amount_paid,
    o.debt_amount,
    o.payment_due_at,
    o.created_date,
    o.sale_online AS salesperson,
    ( SELECT max(p.payment_date) AS max
           FROM payments p
          WHERE (p.order_id = o.id)) AS last_payment_date,
        CASE
            WHEN (o.payment_due_at IS NULL) THEN 'NO_DUE_DATE'
            WHEN (julianday(o.payment_due_at) >= julianday('now')) THEN 'NOT_DUE'
            WHEN (julianday('now') - julianday(o.payment_due_at) <= 7) THEN 'OVERDUE_1_7'
            WHEN (julianday('now') - julianday(o.payment_due_at) <= 30) THEN 'OVERDUE_8_30'
            WHEN (julianday('now') - julianday(o.payment_due_at) <= 60) THEN 'OVERDUE_31_60'
            ELSE 'OVERDUE_60_PLUS'
        END AS aging_bucket
   FROM (orders o
     LEFT JOIN customers c ON ((c.id = o.customer_id)))
  WHERE (o.is_active AND (o.debt_amount > (0)) AND ((o.order_status) NOT IN (('cancelled'), ('returned'))) AND ((o.payment_status) <> 'refunded'));
```

### laptop_landed_costs

```sql
CREATE VIEW laptop_landed_costs AS
WITH component_sums AS (
  SELECT laptop_id,
    sum(amount_vnd) FILTER (WHERE cost_type = 'TRADE_IN_ACQUISITION') AS trade_in_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type = 'VN_SHIPPING') AS vn_shipping_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type = 'REPAIR') AS repair_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type IN ('RAM_UPGRADE', 'SSD_UPGRADE')) AS upgrade_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type = 'ACCESSORY') AS accessory_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type IN ('CLEANING', 'OTHER', 'PAYMENT_FEE')) AS other_cost_vnd,
    sum(amount_vnd) FILTER (WHERE cost_type = 'REFUND_CREDIT') AS refund_credit_vnd
  FROM laptop_cost_components
  WHERE voided_at IS NULL
  GROUP BY laptop_id
), calculated AS (
  SELECT l.id, l.source_type, l.purchase_batch_id, l.purchase_exchange_rate,
    CASE
      WHEN l.source_type = 'TRADE_IN' THEN coalesce(c.trade_in_cost_vnd, 0)
      WHEN l.purchase_exchange_rate IS NOT NULL THEN round(l.purchase_price_rmb * l.purchase_exchange_rate, 2)
      ELSE 0
    END AS purchase_cost_vnd,
    CASE WHEN l.purchase_exchange_rate IS NOT NULL
      THEN round(l.shipping_rmb * l.purchase_exchange_rate, 2) ELSE 0 END AS cn_shipping_vnd,
    c.vn_shipping_vnd, c.repair_cost_vnd, c.upgrade_cost_vnd,
    c.accessory_cost_vnd, c.other_cost_vnd, c.refund_credit_vnd,
    CASE
      WHEN l.source_type = 'UNKNOWN' THEN 'INCOMPLETE'
      WHEN l.source_type IN ('SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT')
        AND (l.purchase_batch_id IS NULL OR l.purchase_exchange_rate IS NULL) THEN 'INCOMPLETE'
      WHEN l.source_type = 'TRADE_IN' AND coalesce(c.trade_in_cost_vnd, 0) <= 0 THEN 'INCOMPLETE'
      WHEN EXISTS (SELECT 1 FROM repair_jobs r WHERE r.laptop_id = l.id
        AND r.status NOT IN ('COMPLETED', 'CANCELLED')) THEN 'INCOMPLETE'
      ELSE 'COMPLETE'
    END AS cost_status
  FROM laptops l
  LEFT JOIN component_sums c ON c.laptop_id = l.id
)
SELECT id AS laptop_id,
  coalesce(purchase_cost_vnd, 0) AS purchase_cost_vnd,
  coalesce(cn_shipping_vnd, 0) AS cn_shipping_vnd,
  coalesce(vn_shipping_vnd, 0) AS vn_shipping_vnd,
  coalesce(repair_cost_vnd, 0) AS repair_cost_vnd,
  coalesce(upgrade_cost_vnd, 0) AS upgrade_cost_vnd,
  coalesce(accessory_cost_vnd, 0) AS accessory_cost_vnd,
  coalesce(other_cost_vnd, 0) AS other_cost_vnd,
  coalesce(refund_credit_vnd, 0) AS refund_credit_vnd,
  max(coalesce(purchase_cost_vnd, 0) + coalesce(cn_shipping_vnd, 0)
    + coalesce(vn_shipping_vnd, 0) + coalesce(repair_cost_vnd, 0)
    + coalesce(upgrade_cost_vnd, 0) + coalesce(accessory_cost_vnd, 0)
    + coalesce(other_cost_vnd, 0) - coalesce(refund_credit_vnd, 0), 0) AS landed_cost_vnd,
  cost_status,
  (SELECT json_group_array(value) FROM json_each(json_array(
    CASE WHEN source_type = 'UNKNOWN' THEN 'UNKNOWN_SOURCE' END,
    CASE WHEN source_type IN ('SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT')
      AND purchase_batch_id IS NULL THEN 'MISSING_PURCHASE_BATCH' END,
    CASE WHEN source_type IN ('SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT')
      AND purchase_exchange_rate IS NULL THEN 'MISSING_EXCHANGE_RATE' END,
    CASE WHEN source_type = 'TRADE_IN' AND purchase_cost_vnd <= 0
      THEN 'MISSING_TRADE_IN_ACQUISITION' END,
    CASE WHEN EXISTS (SELECT 1 FROM repair_jobs r WHERE r.laptop_id = calculated.id
      AND r.status NOT IN ('COMPLETED', 'CANCELLED')) THEN 'ACTIVE_REPAIR_COST_PENDING' END
  )) WHERE value IS NOT NULL) AS reasons
FROM calculated;
```

### order_sales_operations_summary

```sql
CREATE VIEW order_sales_operations_summary AS
SELECT o.id AS order_id,
    (o.sale_price * (1000000)) AS sale_revenue_vnd,
    o.trade_in_credit_vnd,
    (o.debt_amount * (1000000)) AS customer_outstanding_vnd,
    o.gross_profit_snapshot_vnd,
    o.net_contribution_snapshot_vnd,
    COALESCE(sum(c.amount_vnd) FILTER (WHERE (c.status IN ('APPROVED', 'PAID'))), (0)) AS commission_cost_vnd,
    (o.net_contribution_snapshot_vnd - COALESCE(sum(c.amount_vnd) FILTER (WHERE (c.status IN ('APPROVED', 'PAID'))), (0))) AS net_contribution_after_commission_vnd
   FROM (orders o
     LEFT JOIN commissions c ON ((c.order_id = o.id)))
  GROUP BY o.id;
```

### purchase_batch_summaries

```sql
CREATE VIEW purchase_batch_summaries AS
SELECT b.id,
    b.batch_code,
    b.supplier_id,
    b.purchase_date,
    b.notes,
    b.created_by,
    b.created_at,
    b.updated_at,
    b.idempotency_key,
    s.code AS supplier_code,
    s.name AS supplier_name,
    COALESCE(x.laptop_count, (0)) AS item_count,
    COALESCE(x.received_count, (0)) AS received_count,
    COALESCE(x.pending_count, (0)) AS pending_count,
    COALESCE(x.ignored_count, (0)) AS ignored_count,
    (COALESCE(x.purchase_total_rmb, (0))) AS subtotal_rmb,
    (COALESCE(x.purchase_total_rmb, (0))) AS purchase_total_rmb,
    (COALESCE(x.shipping_total_rmb, (0))) AS shipping_total_rmb,
    (COALESCE(x.purchase_total_rmb, (0))) AS total_rmb,
    (COALESCE(p.paid_rmb, (0))) AS paid_rmb,
    (max((COALESCE(x.purchase_total_rmb, (0)) - COALESCE(p.paid_rmb, (0))), (0))) AS debt_rmb,
        CASE
            WHEN (COALESCE(x.pending_count, (0)) = 0) THEN 'RECEIVED'
            WHEN (COALESCE(x.received_count, (0)) > 0) THEN 'PARTIALLY_RECEIVED'
            ELSE 'IN_TRANSIT'
        END AS status
   FROM (((purchase_batches b
     JOIN suppliers s ON ((s.id = b.supplier_id)))
     LEFT JOIN ( SELECT laptops.purchase_batch_id,
            count(*) AS laptop_count,
            count(*) FILTER (WHERE (laptops.received_at IS NOT NULL)) AS received_count,
            count(*) FILTER (WHERE ((laptops.status) = 'in_transit')) AS pending_count,
            count(*) FILTER (WHERE ((laptops.status) = 'ignored')) AS ignored_count,
            sum(laptops.purchase_price_rmb) FILTER (WHERE ((laptops.status) <> 'ignored')) AS purchase_total_rmb,
            sum(laptops.shipping_rmb) FILTER (WHERE ((laptops.status) <> 'ignored')) AS shipping_total_rmb
           FROM laptops
          WHERE (laptops.purchase_batch_id IS NOT NULL)
          GROUP BY laptops.purchase_batch_id) x ON ((x.purchase_batch_id = b.id)))
     LEFT JOIN ( SELECT supplier_payments.purchase_batch_id,
            sum(supplier_payments.amount_rmb) AS paid_rmb
           FROM supplier_payments
          GROUP BY supplier_payments.purchase_batch_id) p ON ((p.purchase_batch_id = b.id)));
```

### unified_inventory

```sql
CREATE VIEW unified_inventory AS
SELECT CAST(l.id AS TEXT) AS entity_key,
    'LAPTOP' AS entity_type,
    l.id AS entity_id,
    l.id AS laptop_id,
    l.name,
    l.category,
    l.serial,
    l.tracking_code_cn,
    l.status AS display_status,
    l.status AS backend_status,
    s.name AS supplier_name,
    b.batch_code,
    l.received_at,
    l.warehouse_date,
    l.available_for_sale_at,
    b.purchase_date,
        CASE
            WHEN (b.purchase_date IS NULL) THEN NULL
            ELSE strftime('%m/%Y',b.purchase_date)
        END AS month_key,
    l.purchase_price_rmb,
    l.shipping_rmb,
    l.purchase_exchange_rate AS exchange_rate,
    l.charger_status,
    l.battery_health,
    l.warranty_supplier,
        CASE
            WHEN (l.purchase_exchange_rate IS NULL) THEN NULL
            ELSE round(((l.purchase_price_rmb + l.shipping_rmb) * l.purchase_exchange_rate), 2)
        END AS landed_cost_vnd,
    (l.source_type = 'UNKNOWN') AS source_unresolved,
    l.condition_note AS notes
   FROM ((laptops l
     LEFT JOIN purchase_batches b ON ((b.id = l.purchase_batch_id)))
     LEFT JOIN suppliers s ON ((s.id = b.supplier_id)));
```