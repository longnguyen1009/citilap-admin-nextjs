-- Cancelled, returned and fully refunded orders retain their original sale/debt
-- history, but they are no longer collectible customer receivables.
BEGIN;

CREATE OR REPLACE VIEW public.customer_receivable_summaries AS
SELECT
  o.id AS order_id,
  o.customer_id,
  c.name AS customer_name,
  c.phone AS customer_phone,
  o.sale_price,
  o.amount_paid,
  o.debt_amount,
  o.payment_due_at,
  o.created_date,
  o.sale_online AS salesperson,
  (SELECT max(p.payment_date) FROM public.payments p WHERE p.order_id = o.id) AS last_payment_date,
  CASE
    WHEN o.payment_due_at IS NULL THEN 'NO_DUE_DATE'
    WHEN o.payment_due_at >= now() THEN 'NOT_DUE'
    WHEN now() - o.payment_due_at <= interval '7 days' THEN 'OVERDUE_1_7'
    WHEN now() - o.payment_due_at <= interval '30 days' THEN 'OVERDUE_8_30'
    WHEN now() - o.payment_due_at <= interval '60 days' THEN 'OVERDUE_31_60'
    ELSE 'OVERDUE_60_PLUS'
  END AS aging_bucket
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE o.is_active
  AND o.debt_amount > 0
  AND o.order_status NOT IN ('cancelled', 'returned')
  AND o.payment_status <> 'refunded';

CREATE OR REPLACE FUNCTION public.get_financial_operations_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH receivables AS (
  SELECT r.*
  FROM public.customer_receivable_summaries r
),
refund_due AS (
  SELECT r.id, sum(coalesce(i.agreed_refund_rmb, i.expected_refund_rmb, 0)) expected
  FROM public.supplier_returns r
  JOIN public.supplier_return_items i
    ON i.supplier_return_id = r.id
   AND i.status NOT IN ('CANCELLED', 'REFUNDED', 'REPLACED', 'REJECTED')
  WHERE r.status IN ('WAITING_REFUND', 'PARTIALLY_RESOLVED')
  GROUP BY r.id
),
refund_paid AS (
  SELECT supplier_return_id, sum(amount_rmb) paid
  FROM public.supplier_refunds
  GROUP BY supplier_return_id
)
SELECT jsonb_build_object(
  'generated_at', timezone('utc', now()),
  'customer_receivable_vnd', (SELECT coalesce(sum(debt_amount), 0) * 1000000 FROM receivables),
  'customer_receivable_orders', (SELECT count(*) FROM receivables),
  'receivable_aging', coalesce((
    SELECT jsonb_object_agg(aging_bucket, jsonb_build_object('orders', n, 'amount_vnd', amount_vnd))
    FROM (
      SELECT aging_bucket, count(*) n, sum(debt_amount) * 1000000 amount_vnd
      FROM receivables
      GROUP BY aging_bucket
    ) x
  ), '{}'::jsonb),
  'cod', jsonb_build_object(
    'outstanding_vnd', (SELECT coalesce(sum(outstanding_vnd), 0) FROM public.cod_receivable_summaries WHERE status IN ('WAITING_SETTLEMENT', 'PARTIALLY_SETTLED', 'DISPUTED')),
    'in_transit_vnd', (SELECT coalesce(sum(expected_cod_amount_vnd), 0) FROM public.cod_receivable_summaries WHERE status = 'PENDING_DELIVERY'),
    'overdue_vnd', (SELECT coalesce(sum(outstanding_vnd), 0) FROM public.cod_receivable_summaries WHERE status IN ('WAITING_SETTLEMENT', 'PARTIALLY_SETTLED', 'DISPUTED') AND expected_settlement_at < now()),
    'disputed', (SELECT count(*) FROM public.cod_receivables WHERE status = 'DISPUTED')
  ),
  'supplier_payable_cny', (SELECT coalesce(sum(debt_rmb), 0) FROM public.purchase_batch_summaries WHERE status NOT IN ('DRAFT', 'CANCELLED', 'CLOSED')),
  'supplier_refund_pending_cny', (SELECT coalesce(sum(greatest(d.expected - coalesce(p.paid, 0), 0)), 0) FROM refund_due d LEFT JOIN refund_paid p ON p.supplier_return_id = d.id),
  'accounts', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY currency, code) FROM public.cash_account_balances b WHERE is_active), '[]'::jsonb),
  'reconciliation_differences', (SELECT count(*) FROM public.cash_account_balances WHERE is_active AND coalesce(last_difference, 0) <> 0)
);
$$;

REVOKE ALL ON public.customer_receivable_summaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_receivable_summaries TO service_role;
REVOKE ALL ON FUNCTION public.get_financial_operations_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_operations_summary() TO service_role;

COMMIT;
