import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [base,hardening,repair,obligationRepair,reservationRepair,ordersApi,salesOperationsApi]=await Promise.all([
 readFile('db/migrations/20261010_phase9_sales_operations.sql','utf8'),
 readFile('db/migrations/20261011_phase9_sales_operations_hardening.sql','utf8'),
  readFile('db/migrations/20261012_phase9_commission_ledger_constraint_repair.sql','utf8'),
  readFile('db/migrations/20261013_phase9_trade_in_obligation_repair.sql','utf8'),
  readFile('db/migrations/20261014_phase9_reservation_integrity_repair.sql','utf8'),
  readFile('app/api/orders/route.js','utf8'),
  readFile('app/api/sales-operations/route.js','utf8'),
]);
const checks=[];
const check=(name,condition)=>{assert.ok(condition,name);checks.push({name,ok:true})};
for(const table of ['reservations','trade_ins','trade_in_inspections','trade_in_check_items','commissions'])check(`table ${table}`,new RegExp(`CREATE TABLE public\\.${table}\\b`).test(base));
check('one active reservation partial unique',/UNIQUE INDEX reservations_one_active_laptop[\s\S]*WHERE status='ACTIVE'/.test(base));
check('one active trade-in serial',/trade_ins_serial_active_unique/.test(base));
check('one trade-in acquisition source',/laptop_cost_components_trade_in_source_unique/.test(hardening));
check('reservation order DB gate',/orders_active_reservation_gate/.test(hardening));
check('reservation gate covers requested laptop',/r\.laptop_id = NEW\.requested_laptop_id/.test(reservationRepair));
check('reservation rejects conflicting order reference',/Laptop đang được một order khác giữ hoặc bán/.test(reservationRepair));
check('reservation deposit belongs to linked order',/p\.order_id <> p_order_id/.test(reservationRepair));
check('orders API checks active reservations for both references',/reservationTargets[\s\S]*requestedLaptopId[\s\S]*\.from\('reservations'\)/.test(ordersApi));
check('sales operations API rejects unrelated reservation payment',/Payment đặt cọc không thuộc order hoặc không hợp lệ/.test(salesOperationsApi));
check('trade-in economic history immutable',/trade_ins_economic_history/.test(hardening));
check('commission approved and paid immutable',/BEFORE UPDATE OR DELETE ON public\.commissions/.test(hardening));
check('inspection snapshot cannot be empty',/jsonb_array_length\(coalesce\(p_checks,'\[\]'::jsonb\)\)=0/.test(hardening));
check('commission payout uses VND cash account',/assert_cash_account\(p_account_id,'VND'/.test(base));
check('commission payout has stable source and idempotency',/'COMMISSION',c\.id::text,'COMMISSION_PAYMENT'/.test(base)&&/p_idempotency_key\|\|'-CASH'/.test(base));
check('trade-in recognized by landed cost',/TRADE_IN_ACQUISITION/.test(base)&&/MISSING_TRADE_IN_ACQUISITION/.test(base));
check('trade-in is not posted as payment',!/INSERT INTO payments[\s\S]*TRADE_IN/i.test(base));
check('commission is not laptop cost',!/laptop_cost_components[\s\S]{0,180}COMMISSION/i.test(base));
check('legacy ledger constraints removed by catalog',/pg_get_constraintdef\(oid\) ILIKE '%reference_type%'/.test(repair)&&/pg_get_constraintdef\(oid\) ILIKE '%transaction_type%'/.test(repair));
check('trade-in credit remains part of customer obligation',/NEW\.sale_price\s*-\s*NEW\.amount_paid\s*-\s*v_trade_in_credit_million/.test(obligationRepair));
check('order obligation is enforced in database',/CREATE TRIGGER orders_enforce_customer_obligation/.test(obligationRepair));
check('invoice debt uses authoritative order debt',/current_order\.debt_amount/.test(obligationRepair));
check('RLS enabled',/ENABLE ROW LEVEL SECURITY/.test(base));
check('authenticated direct grants revoked',/REVOKE ALL ON reservations,trade_ins,trade_in_inspections,trade_in_check_items,commissions/.test(base));
console.log(JSON.stringify({checksPassed:checks.length,checks},null,2));
