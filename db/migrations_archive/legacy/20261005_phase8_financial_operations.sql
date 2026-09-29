-- Phase 8 — operational cash accounts, receivables, COD and payables.
-- financial_records remains the legacy reporting ledger; account_transactions
-- records cash location only and never recognizes revenue/cost again.
BEGIN;

CREATE TABLE public.cash_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE CHECK(code~'^[A-Z0-9_-]{2,40}$'),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 account_type text NOT NULL CHECK(account_type IN('CASH','BANK','WECHAT','ALIPAY','OTHER')),currency text NOT NULL CHECK(currency IN('VND','CNY')),
 opening_balance numeric(20,2) NOT NULL DEFAULT 0,opening_balance_at timestamptz NOT NULL,is_active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT timezone('utc',now()),updated_at timestamptz NOT NULL DEFAULT timezone('utc',now())
);
CREATE TABLE public.account_transactions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,direction text NOT NULL CHECK(direction IN('IN','OUT')),
 amount numeric(20,2) NOT NULL CHECK(amount>0),currency text NOT NULL CHECK(currency IN('VND','CNY')),
 reference_type text NOT NULL CHECK(reference_type IN('PAYMENT','SUPPLIER_PAYMENT','SUPPLIER_REFUND','COD_SETTLEMENT','MANUAL','TRANSFER')),
 reference_id text NOT NULL CHECK(length(btrim(reference_id)) BETWEEN 1 AND 100),transaction_type text NOT NULL CHECK(transaction_type IN('CUSTOMER_PAYMENT','COD_SETTLEMENT','SUPPLIER_PAYMENT','SUPPLIER_REFUND','MANUAL_IN','MANUAL_OUT','TRANSFER_IN','TRANSFER_OUT','OTHER')),
 occurred_at timestamptz NOT NULL,description text NOT NULL DEFAULT '',idempotency_key text NOT NULL UNIQUE CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 100),transfer_group_id uuid,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT timezone('utc',now())
);
CREATE UNIQUE INDEX account_transactions_source_unique ON account_transactions(reference_type,reference_id,transaction_type);
CREATE INDEX account_transactions_account_time_idx ON account_transactions(account_id,occurred_at DESC,id);

CREATE TABLE public.account_reconciliations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,recorded_balance numeric(20,2) NOT NULL,
 actual_balance numeric(20,2) NOT NULL,difference numeric(20,2) GENERATED ALWAYS AS(actual_balance-recorded_balance) STORED,
 reconciled_at timestamptz NOT NULL,notes text NOT NULL DEFAULT '',created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT timezone('utc',now())
);
CREATE INDEX account_reconciliations_account_idx ON account_reconciliations(account_id,reconciled_at DESC);

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.cash_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_unique ON public.payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.cash_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.supplier_refunds ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.cash_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_due_at timestamptz;

CREATE TABLE public.cod_receivables(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id bigint NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,carrier text NOT NULL DEFAULT '',tracking_number text NOT NULL DEFAULT '',
 expected_cod_amount_vnd numeric(20,2) NOT NULL CHECK(expected_cod_amount_vnd>0),status text NOT NULL DEFAULT 'PENDING_DELIVERY' CHECK(status IN('PENDING_DELIVERY','WAITING_SETTLEMENT','PARTIALLY_SETTLED','SETTLED','DISPUTED','RETURNED','CANCELLED')),
 shipped_at timestamptz,delivered_at timestamptz,expected_settlement_at timestamptz,settled_at timestamptz,notes text NOT NULL DEFAULT '',
 idempotency_key text NOT NULL UNIQUE CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 100),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT timezone('utc',now()),updated_at timestamptz NOT NULL DEFAULT timezone('utc',now())
);
CREATE TABLE public.cod_settlements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cod_receivable_id uuid NOT NULL REFERENCES cod_receivables(id) ON DELETE RESTRICT,amount_vnd numeric(20,2) NOT NULL CHECK(amount_vnd>0),
 account_id uuid NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,reference text NOT NULL DEFAULT '',settled_at timestamptz NOT NULL,
 idempotency_key text NOT NULL UNIQUE CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 100),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT timezone('utc',now())
);
CREATE INDEX cod_receivables_status_due_idx ON cod_receivables(status,expected_settlement_at);
CREATE INDEX cod_settlements_receivable_idx ON cod_settlements(cod_receivable_id,settled_at,id);

CREATE VIEW public.cash_account_balances AS
SELECT a.*,coalesce(t.inflow,0)::numeric(20,2) inflow,coalesce(t.outflow,0)::numeric(20,2) outflow,
 (a.opening_balance+coalesce(t.inflow,0)-coalesce(t.outflow,0))::numeric(20,2) recorded_balance,t.last_transaction_at,r.last_reconciled_at,r.last_difference
FROM cash_accounts a
LEFT JOIN (SELECT x.account_id,sum(x.amount) FILTER(WHERE x.direction='IN') inflow,sum(x.amount) FILTER(WHERE x.direction='OUT') outflow,max(x.occurred_at) last_transaction_at
 FROM account_transactions x JOIN cash_accounts ca ON ca.id=x.account_id WHERE x.occurred_at>=ca.opening_balance_at GROUP BY x.account_id) t ON t.account_id=a.id
LEFT JOIN LATERAL (SELECT reconciled_at last_reconciled_at,difference last_difference FROM account_reconciliations WHERE account_id=a.id ORDER BY reconciled_at DESC LIMIT 1) r ON true;

CREATE OR REPLACE FUNCTION public.assert_cash_account(p_id uuid,p_currency text,p_occurred_at timestamptz)
RETURNS cash_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE a cash_accounts%ROWTYPE;
BEGIN SELECT * INTO a FROM cash_accounts WHERE id=p_id AND is_active FOR UPDATE;IF NOT FOUND OR a.currency<>p_currency THEN RAISE EXCEPTION 'Tài khoản tiền không tồn tại hoặc sai loại tiền';END IF;IF p_occurred_at<a.opening_balance_at THEN RAISE EXCEPTION 'Giao dịch không được trước thời điểm opening balance';END IF;RETURN a;END $$;

CREATE OR REPLACE FUNCTION public.create_cash_account(p_data jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE a cash_accounts%ROWTYPE;
BEGIN IF coalesce((p_data->>'opening_balance')::numeric,0)<0 OR (p_data->>'account_type') NOT IN('CASH','BANK','WECHAT','ALIPAY','OTHER') OR (p_data->>'currency') NOT IN('VND','CNY') THEN RAISE EXCEPTION 'Thông tin tài khoản không hợp lệ';END IF;
 INSERT INTO cash_accounts(code,name,account_type,currency,opening_balance,opening_balance_at,created_by) VALUES(upper(btrim(p_data->>'code')),btrim(p_data->>'name'),p_data->>'account_type',p_data->>'currency',coalesce((p_data->>'opening_balance')::numeric,0),(p_data->>'opening_balance_at')::timestamptz,p_actor) RETURNING * INTO a;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('CASH_ACCOUNT',a.id::text,'CREATE',jsonb_build_object('event','CASH_ACCOUNT_CREATED','code',a.code,'currency',a.currency,'opening_balance',a.opening_balance),p_actor);RETURN to_jsonb(a);END $$;

CREATE OR REPLACE FUNCTION public.post_manual_account_transaction(p_account_id uuid,p_direction text,p_amount numeric,p_description text,p_occurred_at timestamptz,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE a cash_accounts%ROWTYPE;t account_transactions%ROWTYPE;
BEGIN SELECT * INTO t FROM account_transactions WHERE idempotency_key=p_idempotency_key;IF FOUND THEN RETURN to_jsonb(t);END IF;IF p_direction NOT IN('IN','OUT') OR p_amount<=0 OR btrim(coalesce(p_description,''))='' THEN RAISE EXCEPTION 'Giao dịch thủ công không hợp lệ';END IF;a:=assert_cash_account(p_account_id,(SELECT currency FROM cash_accounts WHERE id=p_account_id),p_occurred_at);
 INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,description,idempotency_key,created_by) VALUES(a.id,p_direction,p_amount,a.currency,'MANUAL',p_idempotency_key,CASE WHEN p_direction='IN' THEN 'MANUAL_IN' ELSE 'MANUAL_OUT' END,p_occurred_at,left(p_description,1000),p_idempotency_key,p_actor) RETURNING * INTO t;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('ACCOUNT_TRANSACTION',t.id::text,'CREATE',jsonb_build_object('event','ACCOUNT_TRANSACTION_POSTED','account_id',a.id,'direction',p_direction,'amount',p_amount,'currency',a.currency),p_actor);RETURN to_jsonb(t);END $$;

CREATE OR REPLACE FUNCTION public.transfer_cash_accounts(p_source uuid,p_destination uuid,p_amount numeric,p_occurred_at timestamptz,p_description text,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE src cash_accounts%ROWTYPE;dst cash_accounts%ROWTYPE;gid uuid:=gen_random_uuid();existing account_transactions%ROWTYPE;
BEGIN SELECT * INTO existing FROM account_transactions WHERE idempotency_key=p_idempotency_key||'-OUT';IF FOUND THEN RETURN jsonb_build_object('transfer_group_id',existing.transfer_group_id);END IF;IF p_source=p_destination OR p_amount<=0 OR btrim(coalesce(p_description,''))='' THEN RAISE EXCEPTION 'Transfer không hợp lệ';END IF;
 src:=assert_cash_account(p_source,(SELECT currency FROM cash_accounts WHERE id=p_source),p_occurred_at);dst:=assert_cash_account(p_destination,src.currency,p_occurred_at);
 INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,description,idempotency_key,transfer_group_id,created_by) VALUES
 (src.id,'OUT',p_amount,src.currency,'TRANSFER',gid::text,'TRANSFER_OUT',p_occurred_at,left(p_description,1000),p_idempotency_key||'-OUT',gid,p_actor),
 (dst.id,'IN',p_amount,dst.currency,'TRANSFER',gid::text,'TRANSFER_IN',p_occurred_at,left(p_description,1000),p_idempotency_key||'-IN',gid,p_actor);
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('ACCOUNT_TRANSFER',gid::text,'CREATE',jsonb_build_object('event','ACCOUNT_TRANSFER','source',src.id,'destination',dst.id,'amount',p_amount,'currency',src.currency),p_actor);RETURN jsonb_build_object('transfer_group_id',gid);END $$;

CREATE OR REPLACE FUNCTION public.reconcile_cash_account(p_account_id uuid,p_actual numeric,p_reconciled_at timestamptz,p_notes text,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE b cash_account_balances%ROWTYPE;r account_reconciliations%ROWTYPE;
BEGIN SELECT * INTO b FROM cash_account_balances WHERE id=p_account_id AND is_active FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài khoản';END IF;
 INSERT INTO account_reconciliations(account_id,recorded_balance,actual_balance,reconciled_at,notes,created_by) VALUES(b.id,b.recorded_balance,p_actual,p_reconciled_at,left(coalesce(p_notes,''),2000),p_actor) RETURNING * INTO r;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('CASH_ACCOUNT',b.id::text,'UPDATE',jsonb_build_object('event','ACCOUNT_RECONCILED','recorded',b.recorded_balance,'actual',p_actual,'difference',r.difference),p_actor);RETURN to_jsonb(r);END $$;

CREATE OR REPLACE FUNCTION public.record_order_payment_with_account(p_order_id bigint,p_amount numeric,p_payment_type text,p_payment_method text,p_payment_date date,p_reference_code text,p_note text,p_recorded_by text,p_account_id uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE result jsonb;p payments%ROWTYPE;a cash_accounts%ROWTYPE;t account_transactions%ROWTYPE;
BEGIN SELECT * INTO p FROM payments WHERE idempotency_key=p_idempotency_key;IF FOUND THEN SELECT jsonb_build_object('payment',to_jsonb(p),'order',to_jsonb(o),'account_transaction',to_jsonb(x)) INTO result FROM orders o LEFT JOIN account_transactions x ON x.reference_type='PAYMENT' AND x.reference_id=p.id::text WHERE o.id=p.order_id;RETURN result;END IF;
 a:=assert_cash_account(p_account_id,'VND',p_payment_date::timestamptz);result:=record_order_payment(p_order_id,p_amount,p_payment_type,p_payment_method,p_payment_date,p_reference_code,p_note,p_recorded_by);p:=jsonb_populate_record(NULL::payments,result->'payment');
 UPDATE payments SET account_id=a.id,idempotency_key=p_idempotency_key WHERE id=p.id RETURNING * INTO p;
 INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,description,idempotency_key,created_by) VALUES(a.id,CASE WHEN p_payment_type='refund' THEN 'OUT' ELSE 'IN' END,round(p_amount*1000000,0),'VND','PAYMENT',p.id::text,'CUSTOMER_PAYMENT',p_payment_date::timestamptz,left(coalesce(p_note,'Thanh toán đơn #'||p_order_id),1000),p_idempotency_key||'-CASH',p_recorded_by) RETURNING * INTO t;
 RETURN jsonb_set(jsonb_set(result,'{payment}',to_jsonb(p)),'{account_transaction}',to_jsonb(t));END $$;

CREATE OR REPLACE FUNCTION public.create_cod_receivable(p_order_id bigint,p_carrier text,p_tracking text,p_expected_settlement_at timestamptz,p_notes text,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE o orders%ROWTYPE;c cod_receivables%ROWTYPE;expected numeric;
BEGIN SELECT * INTO c FROM cod_receivables WHERE idempotency_key=p_idempotency_key;IF FOUND THEN RETURN to_jsonb(c);END IF;SELECT * INTO o FROM orders WHERE id=p_order_id AND is_active FOR UPDATE;IF NOT FOUND OR coalesce(o.cod_amount,0)<=0 THEN RAISE EXCEPTION 'Đơn hàng không có COD hợp lệ';END IF;expected:=round(least(o.cod_amount,o.debt_amount)*1000000,0);IF expected<=0 THEN RAISE EXCEPTION 'Đơn hàng không còn khoản COD phải thu';END IF;
 INSERT INTO cod_receivables(order_id,carrier,tracking_number,expected_cod_amount_vnd,shipped_at,expected_settlement_at,notes,idempotency_key,created_by) VALUES(o.id,left(coalesce(p_carrier,''),160),left(coalesce(p_tracking,o.tracking_code,''),200),expected,CASE WHEN o.order_status IN('shipping','done') THEN now() END,p_expected_settlement_at,left(coalesce(p_notes,''),2000),p_idempotency_key,p_actor) RETURNING * INTO c;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('COD_RECEIVABLE',c.id::text,'CREATE',jsonb_build_object('event','COD_CREATED','order_id',o.id,'expected_vnd',expected),p_actor);RETURN to_jsonb(c);END $$;

CREATE OR REPLACE FUNCTION public.transition_cod_receivable(p_id uuid,p_target text,p_expected_settlement_at timestamptz,p_notes text,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE c cod_receivables%ROWTYPE;result jsonb;
BEGIN SELECT * INTO c FROM cod_receivables WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy COD';END IF;
 IF p_target='WAITING_SETTLEMENT' AND c.status='PENDING_DELIVERY' THEN result:=record_order_payment(c.order_id,c.expected_cod_amount_vnd/1000000,'cod','cod',current_date,c.tracking_number,'COD giao thành công - chuyển phải thu sang carrier',p_actor);UPDATE cod_receivables SET status='WAITING_SETTLEMENT',delivered_at=now(),expected_settlement_at=coalesce(p_expected_settlement_at,expected_settlement_at),notes=left(coalesce(p_notes,notes),2000) WHERE id=c.id RETURNING * INTO c;
 ELSIF p_target='DISPUTED' AND c.status IN('WAITING_SETTLEMENT','PARTIALLY_SETTLED') THEN UPDATE cod_receivables SET status='DISPUTED',notes=left(coalesce(p_notes,notes),2000) WHERE id=c.id RETURNING * INTO c;
 ELSIF p_target IN('RETURNED','CANCELLED') AND c.status='PENDING_DELIVERY' THEN UPDATE cod_receivables SET status=p_target,notes=left(coalesce(p_notes,notes),2000) WHERE id=c.id RETURNING * INTO c;
 ELSE RAISE EXCEPTION 'Chuyển trạng thái COD không hợp lệ';END IF;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('COD_RECEIVABLE',c.id::text,'UPDATE',jsonb_build_object('event',CASE WHEN p_target='WAITING_SETTLEMENT' THEN 'COD_DELIVERED' WHEN p_target='DISPUTED' THEN 'COD_DISPUTED' ELSE 'COD_'||p_target END,'status',p_target),p_actor);RETURN to_jsonb(c);END $$;

CREATE OR REPLACE FUNCTION public.record_cod_settlement(p_cod_id uuid,p_amount_vnd numeric,p_account_id uuid,p_reference text,p_settled_at timestamptz,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE c cod_receivables%ROWTYPE;s cod_settlements%ROWTYPE;a cash_accounts%ROWTYPE;paid numeric;remaining numeric;t account_transactions%ROWTYPE;
BEGIN SELECT * INTO s FROM cod_settlements WHERE idempotency_key=p_idempotency_key;IF FOUND THEN RETURN to_jsonb(s);END IF;SELECT * INTO c FROM cod_receivables WHERE id=p_cod_id FOR UPDATE;IF NOT FOUND OR c.status NOT IN('WAITING_SETTLEMENT','PARTIALLY_SETTLED') THEN RAISE EXCEPTION 'COD chưa ở trạng thái nhận đối soát';END IF;a:=assert_cash_account(p_account_id,'VND',p_settled_at);SELECT coalesce(sum(amount_vnd),0) INTO paid FROM cod_settlements WHERE cod_receivable_id=c.id;remaining:=c.expected_cod_amount_vnd-paid;IF p_amount_vnd<=0 OR p_amount_vnd>remaining THEN RAISE EXCEPTION 'Số tiền COD vượt khoản còn phải thu';END IF;
 INSERT INTO cod_settlements(cod_receivable_id,amount_vnd,account_id,reference,settled_at,idempotency_key,created_by) VALUES(c.id,p_amount_vnd,a.id,left(coalesce(p_reference,''),300),p_settled_at,p_idempotency_key,p_actor) RETURNING * INTO s;
 INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,transaction_type,occurred_at,description,idempotency_key,created_by) VALUES(a.id,'IN',p_amount_vnd,'VND','COD_SETTLEMENT',s.id::text,'COD_SETTLEMENT',p_settled_at,'COD order #'||c.order_id,p_idempotency_key||'-CASH',p_actor) RETURNING * INTO t;
 paid:=paid+p_amount_vnd;UPDATE cod_receivables SET status=CASE WHEN paid=c.expected_cod_amount_vnd THEN 'SETTLED' ELSE 'PARTIALLY_SETTLED' END,settled_at=CASE WHEN paid=c.expected_cod_amount_vnd THEN p_settled_at END WHERE id=c.id;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('COD_SETTLEMENT',s.id::text,'CREATE',jsonb_build_object('event',CASE WHEN paid=c.expected_cod_amount_vnd THEN 'COD_SETTLED' ELSE 'COD_SETTLEMENT_RECORDED' END,'cod_id',c.id,'amount_vnd',p_amount_vnd),p_actor);RETURN to_jsonb(s);END $$;

CREATE VIEW public.cod_receivable_summaries AS SELECT c.*,coalesce(s.settled_vnd,0)::numeric(20,2) settled_vnd,greatest(c.expected_cod_amount_vnd-coalesce(s.settled_vnd,0),0)::numeric(20,2) outstanding_vnd,o.customer_id,o.sale_price,o.amount_paid,o.debt_amount
FROM cod_receivables c JOIN orders o ON o.id=c.order_id LEFT JOIN(SELECT cod_receivable_id,sum(amount_vnd) settled_vnd FROM cod_settlements GROUP BY cod_receivable_id)s ON s.cod_receivable_id=c.id;

CREATE OR REPLACE FUNCTION public.get_financial_operations_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH receivables AS(SELECT o.*,CASE WHEN payment_due_at IS NULL THEN 'NO_DUE_DATE' WHEN payment_due_at>=now() THEN 'NOT_DUE' WHEN now()-payment_due_at<=interval '7 days' THEN 'OVERDUE_1_7' WHEN now()-payment_due_at<=interval '30 days' THEN 'OVERDUE_8_30' WHEN now()-payment_due_at<=interval '60 days' THEN 'OVERDUE_31_60' ELSE 'OVERDUE_60_PLUS' END bucket FROM orders o WHERE is_active AND debt_amount>0),
refund_due AS(SELECT r.id,sum(coalesce(i.agreed_refund_rmb,i.expected_refund_rmb,0)) expected FROM supplier_returns r JOIN supplier_return_items i ON i.supplier_return_id=r.id AND i.status NOT IN('CANCELLED','REFUNDED','REPLACED','REJECTED') WHERE r.status IN('WAITING_REFUND','PARTIALLY_RESOLVED') GROUP BY r.id),refund_paid AS(SELECT supplier_return_id,sum(amount_rmb) paid FROM supplier_refunds GROUP BY supplier_return_id)
SELECT jsonb_build_object('generated_at',timezone('utc',now()),
 'customer_receivable_vnd',(SELECT coalesce(sum(debt_amount),0)*1000000 FROM receivables),'customer_receivable_orders',(SELECT count(*) FROM receivables),
 'receivable_aging',coalesce((SELECT jsonb_object_agg(bucket,jsonb_build_object('orders',n,'amount_vnd',amount_vnd)) FROM(SELECT bucket,count(*) n,sum(debt_amount)*1000000 amount_vnd FROM receivables GROUP BY bucket)x),'{}'::jsonb),
 'cod',jsonb_build_object('outstanding_vnd',(SELECT coalesce(sum(outstanding_vnd),0) FROM cod_receivable_summaries WHERE status IN('WAITING_SETTLEMENT','PARTIALLY_SETTLED','DISPUTED')),'in_transit_vnd',(SELECT coalesce(sum(expected_cod_amount_vnd),0) FROM cod_receivable_summaries WHERE status='PENDING_DELIVERY'),'overdue_vnd',(SELECT coalesce(sum(outstanding_vnd),0) FROM cod_receivable_summaries WHERE status IN('WAITING_SETTLEMENT','PARTIALLY_SETTLED','DISPUTED') AND expected_settlement_at<now()),'disputed',(SELECT count(*) FROM cod_receivables WHERE status='DISPUTED')),
 'supplier_payable_cny',(SELECT coalesce(sum(debt_rmb),0) FROM purchase_batch_summaries WHERE status NOT IN('DRAFT','CANCELLED','CLOSED')),
 'supplier_refund_pending_cny',(SELECT coalesce(sum(greatest(d.expected-coalesce(p.paid,0),0)),0) FROM refund_due d LEFT JOIN refund_paid p ON p.supplier_return_id=d.id),
 'accounts',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY currency,code) FROM cash_account_balances b WHERE is_active),'[]'::jsonb),
 'reconciliation_differences',(SELECT count(*) FROM cash_account_balances WHERE is_active AND coalesce(last_difference,0)<>0))
$$;

CREATE OR REPLACE FUNCTION public.guard_account_transaction_history() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'Account transaction là ledger bất biến; hãy tạo giao dịch điều chỉnh';END $$;
CREATE TRIGGER account_transactions_append_only BEFORE UPDATE OR DELETE ON account_transactions FOR EACH ROW EXECUTE FUNCTION guard_account_transaction_history();
CREATE TRIGGER cod_settlements_append_only BEFORE UPDATE OR DELETE ON cod_settlements FOR EACH ROW EXECUTE FUNCTION guard_account_transaction_history();
CREATE TRIGGER cash_accounts_updated BEFORE UPDATE ON cash_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER cod_receivables_updated BEFORE UPDATE ON cod_receivables FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;ALTER TABLE account_reconciliations ENABLE ROW LEVEL SECURITY;ALTER TABLE cod_receivables ENABLE ROW LEVEL SECURITY;ALTER TABLE cod_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cash_accounts,account_transactions,account_reconciliations,cod_receivables,cod_settlements,cash_account_balances,cod_receivable_summaries FROM PUBLIC,anon,authenticated;
GRANT ALL ON cash_accounts,account_transactions,account_reconciliations,cod_receivables,cod_settlements TO service_role;GRANT SELECT ON cash_account_balances,cod_receivable_summaries TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE ALL ON FUNCTION assert_cash_account(uuid,text,timestamptz),create_cash_account(jsonb,text),post_manual_account_transaction(uuid,text,numeric,text,timestamptz,text,text),transfer_cash_accounts(uuid,uuid,numeric,timestamptz,text,text,text),reconcile_cash_account(uuid,numeric,timestamptz,text,text),record_order_payment_with_account(bigint,numeric,text,text,date,text,text,text,uuid,text),create_cod_receivable(bigint,text,text,timestamptz,text,text,text),transition_cod_receivable(uuid,text,timestamptz,text,text),record_cod_settlement(uuid,numeric,uuid,text,timestamptz,text,text),get_financial_operations_summary(),guard_account_transaction_history() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_cash_account(jsonb,text),post_manual_account_transaction(uuid,text,numeric,text,timestamptz,text,text),transfer_cash_accounts(uuid,uuid,numeric,timestamptz,text,text,text),reconcile_cash_account(uuid,numeric,timestamptz,text,text),record_order_payment_with_account(bigint,numeric,text,text,date,text,text,text,uuid,text),create_cod_receivable(bigint,text,text,timestamptz,text,text,text),transition_cod_receivable(uuid,text,timestamptz,text,text),record_cod_settlement(uuid,numeric,uuid,text,timestamptz,text,text),get_financial_operations_summary() TO service_role;
COMMIT;
