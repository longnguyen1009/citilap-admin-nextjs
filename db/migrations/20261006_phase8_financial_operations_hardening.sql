-- Phase 8 hardening: safe reconciliation, atomic account integration and COD lifecycle.
-- Apply after 20261005_phase8_financial_operations.sql.
BEGIN;

DO $$ DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN
   SELECT conname FROM pg_constraint
   WHERE conrelid='public.cod_receivables'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) ILIKE '%status%'
 LOOP
   EXECUTE format('ALTER TABLE public.cod_receivables DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $$;
ALTER TABLE public.cod_receivables ADD CONSTRAINT cod_receivables_status_check
  CHECK(status IN('PENDING_DELIVERY','DELIVERED','WAITING_SETTLEMENT','PARTIALLY_SETTLED','SETTLED','DISPUTED','RETURNED','CANCELLED'));

CREATE OR REPLACE FUNCTION public.prevent_supplier_payment_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND current_setting('app.financial_account_link',true)='on' AND OLD.account_id IS NULL AND NEW.account_id IS NOT NULL
   AND (to_jsonb(NEW)-'account_id')=(to_jsonb(OLD)-'account_id') THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Thanh toán nhà cung cấp là sổ bất biến; hãy tạo giao dịch điều chỉnh';
END $$;

CREATE OR REPLACE FUNCTION public.prevent_supplier_refund_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND current_setting('app.financial_account_link',true)='on' AND OLD.account_id IS NULL AND NEW.account_id IS NOT NULL
   AND (to_jsonb(NEW)-'account_id')=(to_jsonb(OLD)-'account_id') THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Hoàn tiền nhà cung cấp là ledger bất biến';
END $$;

CREATE OR REPLACE FUNCTION public.reconcile_cash_account(p_account_id uuid,p_actual numeric,p_reconciled_at timestamptz,p_notes text,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a cash_accounts%ROWTYPE;recorded numeric(20,2);r account_reconciliations%ROWTYPE;
BEGIN
 SELECT * INTO a FROM cash_accounts WHERE id=p_account_id AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài khoản';END IF;
 IF p_actual IS NULL OR p_reconciled_at IS NULL THEN RAISE EXCEPTION 'Thông tin đối soát không hợp lệ';END IF;
 SELECT (a.opening_balance+coalesce(sum(CASE WHEN direction='IN' THEN amount ELSE -amount END),0))::numeric(20,2)
 INTO recorded FROM account_transactions WHERE account_id=a.id AND occurred_at>=a.opening_balance_at;
 INSERT INTO account_reconciliations(account_id,recorded_balance,actual_balance,reconciled_at,notes,created_by)
 VALUES(a.id,recorded,p_actual,p_reconciled_at,left(coalesce(p_notes,''),2000),p_actor) RETURNING * INTO r;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES
 ('CASH_ACCOUNT',a.id::text,'UPDATE',jsonb_build_object('event','ACCOUNT_RECONCILED','recorded',recorded,'actual',p_actual,'difference',r.difference),p_actor);
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.update_cash_account(p_id uuid,p_name text,p_is_active boolean,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a cash_accounts%ROWTYPE;
BEGIN
 SELECT * INTO a FROM cash_accounts WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài khoản';END IF;
 IF btrim(coalesce(p_name,''))='' THEN RAISE EXCEPTION 'Tên tài khoản không hợp lệ';END IF;
 IF p_is_active=false AND EXISTS(SELECT 1 FROM account_transactions WHERE account_id=p_id) THEN
   RAISE EXCEPTION 'Tài khoản đã có giao dịch; chỉ được ngừng sử dụng sau khi xác nhận số dư và chuyển tiền';
 END IF;
 UPDATE cash_accounts SET name=left(btrim(p_name),160),is_active=coalesce(p_is_active,is_active) WHERE id=p_id RETURNING * INTO a;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('CASH_ACCOUNT',a.id::text,'UPDATE',jsonb_build_object('event','CASH_ACCOUNT_UPDATED','name',a.name,'is_active',a.is_active),p_actor);
 RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION public.record_order_payment_with_account(p_order_id bigint,p_amount numeric,p_payment_type text,p_payment_method text,p_payment_date date,p_reference_code text,p_note text,p_recorded_by text,p_account_id uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;p payments%ROWTYPE;a cash_accounts%ROWTYPE;t account_transactions%ROWTYPE;occurred timestamptz:=coalesce(p_payment_date,current_date)::timestamptz;
BEGIN
 IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 90 THEN RAISE EXCEPTION 'Idempotency key không hợp lệ';END IF;
 SELECT * INTO p FROM payments WHERE idempotency_key=p_idempotency_key;
 IF FOUND THEN
   IF p.account_id IS DISTINCT FROM p_account_id THEN RAISE EXCEPTION 'Idempotency key đã dùng cho tài khoản khác';END IF;
   SELECT jsonb_build_object('payment',to_jsonb(p),'order',to_jsonb(o),'account_transaction',to_jsonb(x)) INTO result
   FROM orders o LEFT JOIN account_transactions x ON x.reference_type='PAYMENT' AND x.reference_id=p.id::text WHERE o.id=p.order_id;
   RETURN result;
 END IF;
 a:=assert_cash_account(p_account_id,'VND',occurred);
 result:=record_order_payment(p_order_id,p_amount,p_payment_type,p_payment_method,coalesce(p_payment_date,current_date),p_reference_code,p_note,p_recorded_by);
 p:=jsonb_populate_record(NULL::payments,result->'payment');
 UPDATE payments SET account_id=a.id,idempotency_key=p_idempotency_key WHERE id=p.id RETURNING * INTO p;
 INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,description,idempotency_key,created_by)
 VALUES(a.id,CASE WHEN p_payment_type='refund' THEN 'OUT' ELSE 'IN' END,round(p_amount*1000000,0),'VND','PAYMENT',p.id::text,'CUSTOMER_PAYMENT',occurred,left(coalesce(p_note,'Thanh toán đơn #'||p_order_id),1000),p_idempotency_key||'-CASH',p_recorded_by) RETURNING * INTO t;
 RETURN jsonb_set(jsonb_set(result,'{payment}',to_jsonb(p)),'{account_transaction}',to_jsonb(t));
END $$;

CREATE OR REPLACE FUNCTION public.record_supplier_payment_with_account(p_batch_id bigint,p_amount_rmb numeric,p_exchange_rate numeric,p_method text,p_reference text,p_date date,p_notes text,p_actor text,p_account_id uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result supplier_payments%ROWTYPE;a cash_accounts%ROWTYPE;t account_transactions%ROWTYPE;
BEGIN
 IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 90 THEN RAISE EXCEPTION 'Idempotency key không hợp lệ';END IF;
 SELECT * INTO result FROM supplier_payments WHERE idempotency_key=p_idempotency_key;
 IF FOUND THEN IF result.account_id IS DISTINCT FROM p_account_id THEN RAISE EXCEPTION 'Idempotency key đã dùng cho tài khoản khác';END IF;RETURN to_jsonb(result);END IF;
 a:=assert_cash_account(p_account_id,'CNY',coalesce(p_date,current_date)::timestamptz);
 result:=jsonb_populate_record(NULL::supplier_payments,record_supplier_payment(p_batch_id,p_amount_rmb,p_exchange_rate,p_method,p_reference,coalesce(p_date,current_date),p_notes,p_actor,p_idempotency_key));
 PERFORM set_config('app.financial_account_link','on',true);
 UPDATE supplier_payments SET account_id=a.id WHERE id=result.id RETURNING * INTO result;
 INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,description,idempotency_key,created_by)
 VALUES(a.id,'OUT',p_amount_rmb,'CNY','SUPPLIER_PAYMENT',result.id::text,'SUPPLIER_PAYMENT',coalesce(p_date,current_date)::timestamptz,left(coalesce(p_notes,'Thanh toán lô #'||p_batch_id),1000),p_idempotency_key||'-CASH',p_actor) RETURNING * INTO t;
 RETURN to_jsonb(result);
END $$;

CREATE OR REPLACE FUNCTION public.record_supplier_refund_with_account(p_return_id uuid,p_amount_rmb numeric,p_exchange_rate numeric,p_method text,p_reference text,p_received_at timestamptz,p_actor text,p_account_id uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result supplier_refunds%ROWTYPE;a cash_accounts%ROWTYPE;t account_transactions%ROWTYPE;occurred timestamptz:=coalesce(p_received_at,timezone('utc',now()));
BEGIN
 IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 90 THEN RAISE EXCEPTION 'Idempotency key không hợp lệ';END IF;
 SELECT * INTO result FROM supplier_refunds WHERE idempotency_key=p_idempotency_key;
 IF FOUND THEN IF result.account_id IS DISTINCT FROM p_account_id THEN RAISE EXCEPTION 'Idempotency key đã dùng cho tài khoản khác';END IF;RETURN to_jsonb(result);END IF;
 a:=assert_cash_account(p_account_id,'CNY',occurred);
 result:=jsonb_populate_record(NULL::supplier_refunds,record_supplier_refund(p_return_id,p_amount_rmb,p_exchange_rate,p_method,p_reference,occurred,p_actor,p_idempotency_key));
 PERFORM set_config('app.financial_account_link','on',true);
 UPDATE supplier_refunds SET account_id=a.id WHERE id=result.id RETURNING * INTO result;
 INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,description,idempotency_key,created_by)
 VALUES(a.id,'IN',p_amount_rmb,'CNY','SUPPLIER_REFUND',result.id::text,'SUPPLIER_REFUND',occurred,left(coalesce(p_reference,'Hoàn tiền nhà cung cấp'),1000),p_idempotency_key||'-CASH',p_actor) RETURNING * INTO t;
 RETURN to_jsonb(result);
END $$;

CREATE OR REPLACE FUNCTION public.transition_cod_receivable(p_id uuid,p_target text,p_expected_settlement_at timestamptz,p_notes text,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c cod_receivables%ROWTYPE;result jsonb;
BEGIN
 SELECT * INTO c FROM cod_receivables WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy COD';END IF;
 IF p_target='DELIVERED' AND c.status='PENDING_DELIVERY' THEN
   result:=record_order_payment(c.order_id,c.expected_cod_amount_vnd/1000000,'cod','cod',current_date,c.tracking_number,'COD đã giao - chuyển nghĩa vụ phải thu sang đơn vị vận chuyển',p_actor);
   UPDATE cod_receivables SET status='DELIVERED',delivered_at=now(),expected_settlement_at=coalesce(p_expected_settlement_at,expected_settlement_at),notes=left(coalesce(p_notes,notes),2000) WHERE id=c.id RETURNING * INTO c;
 ELSIF p_target='WAITING_SETTLEMENT' AND c.status='DELIVERED' THEN
   UPDATE cod_receivables SET status='WAITING_SETTLEMENT',expected_settlement_at=coalesce(p_expected_settlement_at,expected_settlement_at),notes=left(coalesce(p_notes,notes),2000) WHERE id=c.id RETURNING * INTO c;
 ELSIF p_target='DISPUTED' AND c.status IN('DELIVERED','WAITING_SETTLEMENT','PARTIALLY_SETTLED') THEN
   UPDATE cod_receivables SET status='DISPUTED',notes=left(coalesce(p_notes,notes),2000) WHERE id=c.id RETURNING * INTO c;
 ELSIF p_target IN('RETURNED','CANCELLED') AND c.status='PENDING_DELIVERY' THEN
   UPDATE cod_receivables SET status=p_target,notes=left(coalesce(p_notes,notes),2000) WHERE id=c.id RETURNING * INTO c;
 ELSE RAISE EXCEPTION 'Chuyển trạng thái COD không hợp lệ';END IF;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('COD_RECEIVABLE',c.id::text,'UPDATE',jsonb_build_object('event','COD_'||p_target,'status',p_target),p_actor);
 RETURN to_jsonb(c);
END $$;

CREATE OR REPLACE VIEW public.customer_receivable_summaries AS
SELECT o.id order_id,o.customer_id,c.name customer_name,c.phone customer_phone,o.sale_price,o.amount_paid,o.debt_amount,o.payment_due_at,o.created_date,o.sale_online salesperson,
 (SELECT max(p.payment_date) FROM payments p WHERE p.order_id=o.id) last_payment_date,
 CASE WHEN o.payment_due_at IS NULL THEN 'NO_DUE_DATE' WHEN o.payment_due_at>=now() THEN 'NOT_DUE' WHEN now()-o.payment_due_at<=interval '7 days' THEN 'OVERDUE_1_7' WHEN now()-o.payment_due_at<=interval '30 days' THEN 'OVERDUE_8_30' WHEN now()-o.payment_due_at<=interval '60 days' THEN 'OVERDUE_31_60' ELSE 'OVERDUE_60_PLUS' END aging_bucket
FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
WHERE o.is_active AND o.debt_amount>0;

REVOKE ALL ON customer_receivable_summaries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON customer_receivable_summaries TO service_role;
REVOKE ALL ON FUNCTION update_cash_account(uuid,text,boolean,text),record_supplier_payment_with_account(bigint,numeric,numeric,text,text,date,text,text,uuid,text),record_supplier_refund_with_account(uuid,numeric,numeric,text,text,timestamptz,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION update_cash_account(uuid,text,boolean,text),record_supplier_payment_with_account(bigint,numeric,numeric,text,text,date,text,text,uuid,text),record_supplier_refund_with_account(uuid,numeric,numeric,text,text,timestamptz,text,uuid,text) TO service_role;
COMMIT;
