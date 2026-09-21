import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = await readFile('db/migrations/20261005_phase8_financial_operations.sql', 'utf8');
const hardening = await readFile('db/migrations/20261006_phase8_financial_operations_hardening.sql', 'utf8');
const checks = [];
const ok = (name, value) => { checks.push({ name, ok: Boolean(value) }); assert(value, name); };
ok('base creates account ledger', /CREATE TABLE public\.account_transactions/i.test(base));
ok('base ledger append-only', /account_transactions_append_only/i.test(base));
ok('base opening cutover filter', /occurred_at>=ca\.opening_balance_at/i.test(base));
ok('hardening locks account row', /FROM cash_accounts WHERE id=p_account_id AND is_active FOR UPDATE/i.test(hardening));
ok('hardening reconciliation does not mutate ledger', !/UPDATE account_transactions/i.test(hardening));
ok('hardening supports delivered COD', /'DELIVERED'/i.test(hardening));
ok('customer payment atomic wrapper', /record_order_payment_with_account/i.test(hardening));
ok('supplier payment atomic wrapper', /record_supplier_payment_with_account/i.test(hardening));
ok('supplier refund atomic wrapper', /record_supplier_refund_with_account/i.test(hardening));
ok('customer receivable remains order-derived', /FROM orders o LEFT JOIN customers/i.test(hardening));
ok('direct authenticated access revoked', /REVOKE ALL ON customer_receivable_summaries FROM PUBLIC,anon,authenticated/i.test(hardening));
console.log(JSON.stringify({ checksPassed: checks.length, checks }, null, 2));

