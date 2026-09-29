-- Keep customer obligation consistent after a trade-in credit is accepted.
-- Money on orders uses million VND; trade_in_credit_vnd uses VND.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_order_customer_obligation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trade_in_credit_million numeric := greatest(coalesce(NEW.trade_in_credit_vnd, 0), 0) / 1000000;
BEGIN
  NEW.sale_price := greatest(coalesce(NEW.sale_price, 0), 0);
  NEW.amount_paid := greatest(coalesce(NEW.amount_paid, 0), 0);
  IF NEW.amount_paid + v_trade_in_credit_million > NEW.sale_price + 0.000001 THEN
    RAISE EXCEPTION 'Tiền đã thu và credit thu cũ vượt giá bán';
  END IF;

  NEW.debt_amount := greatest(NEW.sale_price - NEW.amount_paid - v_trade_in_credit_million, 0);
  NEW.payment_status := CASE
    WHEN NEW.payment_status = 'refunded' THEN 'refunded'
    WHEN NEW.debt_amount = 0 AND NEW.sale_price > 0 THEN 'paid'
    WHEN NEW.payment_status = 'cod' THEN 'cod'
    WHEN NEW.amount_paid > 0 THEN 'deposited'
    ELSE 'unpaid'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_customer_obligation ON public.orders;
CREATE TRIGGER orders_enforce_customer_obligation
BEFORE INSERT OR UPDATE OF sale_price, amount_paid, debt_amount, payment_status, trade_in_credit_vnd
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_customer_obligation();

-- Repair only Phase 9 orders that already carry a trade-in credit.
UPDATE public.orders
SET debt_amount = debt_amount
WHERE trade_in_credit_vnd > 0;

-- The order row is authoritative for outstanding debt because it also includes
-- non-cash trade-in credit. Cash receipts remain a separate invoice figure.
CREATE OR REPLACE FUNCTION public.sync_invoice_payment_snapshot(p_order_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE receipts jsonb; finance jsonb; ledger_total numeric; effective_paid numeric; payment_count bigint; current_order orders%ROWTYPE;
BEGIN
 SELECT * INTO current_order FROM orders WHERE id=p_order_id;
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM invoices WHERE order_id=p_order_id) THEN RETURN; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.payment_date,p.id),'[]'),
        coalesce(sum(CASE WHEN p.payment_type='refund' THEN -p.amount ELSE p.amount END),0),
        count(*)
 INTO receipts,ledger_total,payment_count FROM payments p WHERE p.order_id=p_order_id;
 effective_paid := CASE WHEN payment_count > 0 THEN ledger_total ELSE coalesce(current_order.amount_paid,0) END;
 SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.occurred_on,f.id),'[]')
 INTO finance FROM financial_records f WHERE f.order_id=p_order_id;
 UPDATE invoices SET snapshot = jsonb_set(
   jsonb_set(
     jsonb_set(
       jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(snapshot,'{payments}',receipts,true),
             '{financial_records}',finance,true),
           '{paid}',to_jsonb(effective_paid),true),
         '{order,payment_status}',to_jsonb(current_order.payment_status),true),
       '{order,amount_paid}',to_jsonb(coalesce(current_order.amount_paid,ledger_total)),true),
     '{order,trade_in_credit_vnd}',to_jsonb(coalesce(current_order.trade_in_credit_vnd,0)),true),
   '{order,debt_amount}',to_jsonb(coalesce(current_order.debt_amount,0)),true)
 WHERE order_id=p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.enforce_order_customer_obligation(), public.sync_invoice_payment_snapshot(bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_invoice_payment_snapshot(bigint) TO service_role;

DO $$
DECLARE v_order_id bigint;
BEGIN
  FOR v_order_id IN SELECT id FROM public.orders WHERE trade_in_credit_vnd > 0 LOOP
    PERFORM public.sync_invoice_payment_snapshot(v_order_id);
  END LOOP;
END $$;

COMMIT;
