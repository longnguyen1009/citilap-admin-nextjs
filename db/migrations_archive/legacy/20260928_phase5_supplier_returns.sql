-- Phase 5 — structured repair outcome and supplier returns. No landed cost or supplier credit accounting.
BEGIN;

ALTER TABLE public.repair_jobs ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.repair_jobs ADD COLUMN IF NOT EXISTS recommended_action text;
ALTER TABLE public.repair_jobs DROP CONSTRAINT IF EXISTS repair_jobs_outcome_check;
ALTER TABLE public.repair_jobs ADD CONSTRAINT repair_jobs_outcome_check CHECK(outcome IS NULL OR outcome IN('REPAIRED','NOT_REPAIRED','PARTIALLY_REPAIRED','NO_FAULT_FOUND'));
ALTER TABLE public.repair_jobs DROP CONSTRAINT IF EXISTS repair_jobs_recommended_action_check;
ALTER TABLE public.repair_jobs ADD CONSTRAINT repair_jobs_recommended_action_check CHECK(recommended_action IS NULL OR recommended_action IN('RE_QC','SUPPLIER_RETURN','NO_FURTHER_ACTION','OTHER'));

-- The previous signature is intentionally disabled so callers cannot bypass structured completion.
CREATE OR REPLACE FUNCTION public.complete_repair_job(p_id uuid,p_resolution text,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Vui lòng cập nhật ứng dụng để chọn kết quả và hành động đề xuất'; END $$;

CREATE OR REPLACE FUNCTION public.complete_repair_job(p_id uuid,p_resolution text,p_outcome text,p_recommended_action text,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j repair_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM repair_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu sửa'; END IF;
 IF j.status='COMPLETED' AND j.completion_idempotency_key=p_idempotency_key THEN RETURN to_jsonb(j); END IF;
 IF j.status<>'TESTING' OR btrim(coalesce(p_resolution,''))='' OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Chỉ có thể hoàn tất phiếu đang TESTING với kết quả hợp lệ'; END IF;
 IF p_outcome NOT IN('REPAIRED','NOT_REPAIRED','PARTIALLY_REPAIRED','NO_FAULT_FOUND') OR p_recommended_action NOT IN('RE_QC','SUPPLIER_RETURN','NO_FURTHER_ACTION','OTHER') THEN RAISE EXCEPTION 'Kết quả hoặc hành động đề xuất không hợp lệ'; END IF;
 IF p_outcome='REPAIRED' AND p_recommended_action='SUPPLIER_RETURN' THEN RAISE EXCEPTION 'Máy đã sửa xong không thể đề xuất trả nhà cung cấp'; END IF;
 IF p_outcome='NOT_REPAIRED' AND p_recommended_action='RE_QC' THEN RAISE EXCEPTION 'Máy chưa sửa xong không thể đề xuất tái QC'; END IF;
 UPDATE repair_jobs SET status='COMPLETED',resolution=left(p_resolution,5000),outcome=p_outcome,recommended_action=p_recommended_action,
   completed_at=timezone('utc',now()),completion_idempotency_key=p_idempotency_key,
   parts_cost_vnd=(SELECT coalesce(sum(total_cost_vnd),0) FROM repair_parts WHERE repair_job_id=p_id)
 WHERE id=p_id RETURNING * INTO j;
 PERFORM set_config('app.repair_transition','on',true);
 UPDATE laptops SET status='qc_failed',is_locked=true,available_for_sale_at=NULL WHERE id=j.laptop_id;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('REPAIR_JOB',j.id::text,'UPDATE',jsonb_build_object('status','COMPLETED','outcome',p_outcome,'recommended_action',p_recommended_action,'total_cost_vnd',j.total_cost_vnd),p_actor);
 RETURN to_jsonb(j);
END $$;

CREATE TABLE IF NOT EXISTS public.supplier_returns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),return_code text NOT NULL UNIQUE,supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','APPROVED','READY_TO_SHIP','SHIPPED','SUPPLIER_RECEIVED','WAITING_REFUND','WAITING_REPLACEMENT','PARTIALLY_RESOLVED','REFUNDED','REPLACED','REJECTED','CLOSED','CANCELLED')),
 resolution_type text CHECK(resolution_type IS NULL OR resolution_type IN('REFUND','REPLACEMENT','PARTIAL_REFUND','SUPPLIER_REPAIR','OTHER')),
 reason text NOT NULL CHECK(reason IN('MAINBOARD_REPAIRED','WRONG_CONFIGURATION','HARDWARE_FAULT','SCREEN_FAULT','GPU_FAULT','FUNCTIONAL_FAILURE','PHYSICAL_DAMAGE','MISSING_ACCESSORY','SUPPLIER_AGREEMENT','OTHER')),
 reason_notes text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',return_carrier text NOT NULL DEFAULT '',return_tracking_number text NOT NULL DEFAULT '',
 created_by text NOT NULL,approved_by text,approved_at timestamptz,shipped_at timestamptz,supplier_received_at timestamptz,closed_at timestamptz,
 idempotency_key text NOT NULL UNIQUE CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 100),created_at timestamptz NOT NULL DEFAULT timezone('utc',now()),updated_at timestamptz NOT NULL DEFAULT timezone('utc',now())
);
CREATE INDEX IF NOT EXISTS supplier_returns_supplier_status_idx ON public.supplier_returns(supplier_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS supplier_returns_tracking_idx ON public.supplier_returns(lower(return_tracking_number)) WHERE btrim(return_tracking_number)<>'';

CREATE TABLE IF NOT EXISTS public.supplier_return_items(
 id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,supplier_return_id uuid NOT NULL REFERENCES public.supplier_returns(id) ON DELETE RESTRICT,
 laptop_id bigint NOT NULL REFERENCES public.laptops(id) ON DELETE RESTRICT,purchase_item_id bigint REFERENCES public.purchase_items(id) ON DELETE RESTRICT,
 repair_job_id uuid REFERENCES public.repair_jobs(id) ON DELETE RESTRICT,qc_inspection_id uuid REFERENCES public.qc_inspections(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK(reason IN('MAINBOARD_REPAIRED','WRONG_CONFIGURATION','HARDWARE_FAULT','SCREEN_FAULT','GPU_FAULT','FUNCTIONAL_FAILURE','PHYSICAL_DAMAGE','MISSING_ACCESSORY','SUPPLIER_AGREEMENT','OTHER')),
 condition_notes text NOT NULL DEFAULT '',expected_refund_rmb numeric(14,2) CHECK(expected_refund_rmb IS NULL OR expected_refund_rmb>=0),agreed_refund_rmb numeric(14,2) CHECK(agreed_refund_rmb IS NULL OR agreed_refund_rmb>=0),
 replacement_purchase_item_id bigint REFERENCES public.purchase_items(id) ON DELETE RESTRICT,replacement_laptop_id bigint REFERENCES public.laptops(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','SHIPPED','SUPPLIER_RECEIVED','REFUNDED','REPLACED','REJECTED','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT timezone('utc',now()),updated_at timestamptz NOT NULL DEFAULT timezone('utc',now()),UNIQUE(supplier_return_id,laptop_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_return_items_one_active_laptop ON public.supplier_return_items(laptop_id) WHERE status NOT IN('REFUNDED','REPLACED','REJECTED','CANCELLED');
CREATE INDEX IF NOT EXISTS supplier_return_items_return_idx ON public.supplier_return_items(supplier_return_id,status,id);

CREATE TABLE IF NOT EXISTS public.supplier_refunds(
 id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
 supplier_return_id uuid NOT NULL REFERENCES public.supplier_returns(id) ON DELETE RESTRICT,amount_rmb numeric(14,2) NOT NULL CHECK(amount_rmb>0),
 amount_vnd numeric(18,2),exchange_rate numeric(14,4),refund_method text NOT NULL CHECK(refund_method IN('WECHAT','ALIPAY','BANK_TRANSFER','OFFSET','OTHER')),
 reference text NOT NULL DEFAULT '',received_at timestamptz NOT NULL,idempotency_key text NOT NULL UNIQUE CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 100),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT timezone('utc',now()),CHECK((amount_vnd IS NULL AND exchange_rate IS NULL) OR (amount_vnd>=0 AND exchange_rate>0))
);
CREATE INDEX IF NOT EXISTS supplier_refunds_return_idx ON public.supplier_refunds(supplier_return_id,received_at,id);

CREATE TABLE IF NOT EXISTS public.supplier_return_events(
 id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,supplier_return_id uuid NOT NULL REFERENCES public.supplier_returns(id) ON DELETE RESTRICT,
 event_type text NOT NULL,details jsonb NOT NULL DEFAULT '{}',performed_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT timezone('utc',now())
);
CREATE INDEX IF NOT EXISTS supplier_return_events_return_idx ON public.supplier_return_events(supplier_return_id,created_at,id);

CREATE OR REPLACE FUNCTION public.next_supplier_return_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prefix text:='SR-'||to_char(current_date,'YYYYMMDD')||'-';n integer;
BEGIN PERFORM pg_advisory_xact_lock(hashtext(prefix));SELECT coalesce(max(right(return_code,3)::integer),0)+1 INTO n FROM supplier_returns WHERE return_code LIKE prefix||'%';RETURN prefix||lpad(n::text,3,'0');END $$;

CREATE OR REPLACE FUNCTION public.create_supplier_return(p_data jsonb,p_items jsonb,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r supplier_returns%ROWTYPE;entry jsonb;l laptops%ROWTYPE;item_supplier uuid;requested_supplier uuid:=(p_data->>'supplier_id')::uuid;
BEGIN
 SELECT * INTO r FROM supplier_returns WHERE idempotency_key=p_idempotency_key;IF FOUND THEN RETURN to_jsonb(r);END IF;
 IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'Yêu cầu tạo phiếu trả không hợp lệ';END IF;
 IF NOT EXISTS(SELECT 1 FROM suppliers WHERE id=requested_supplier AND active) THEN RAISE EXCEPTION 'Nhà cung cấp không tồn tại hoặc đã ngừng sử dụng';END IF;
 INSERT INTO supplier_returns(return_code,supplier_id,reason,reason_notes,notes,created_by,idempotency_key)
 VALUES(next_supplier_return_code(),requested_supplier,p_data->>'reason',left(coalesce(p_data->>'reason_notes',''),3000),left(coalesce(p_data->>'notes',''),3000),p_actor,p_idempotency_key) RETURNING * INTO r;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   SELECT * INTO l FROM laptops WHERE id=(entry->>'laptop_id')::bigint AND is_active FOR UPDATE;
   IF NOT FOUND OR l.status<>'qc_failed' THEN RAISE EXCEPTION 'Laptop không đủ điều kiện trả nhà cung cấp';END IF;
   IF EXISTS(SELECT 1 FROM repair_jobs WHERE laptop_id=l.id AND status NOT IN('COMPLETED','CANCELLED')) THEN RAISE EXCEPTION 'Laptop còn phiếu sửa đang hoạt động';END IF;
   IF l.purchase_item_id IS NULL THEN RAISE EXCEPTION 'Laptop không có nguồn gốc purchase item';END IF;
   SELECT pb.supplier_id INTO item_supplier FROM purchase_items pi2 JOIN purchase_batches pb ON pb.id=pi2.purchase_batch_id WHERE pi2.id=l.purchase_item_id;
   IF item_supplier IS DISTINCT FROM requested_supplier THEN RAISE EXCEPTION 'Laptop không thuộc nhà cung cấp đã chọn';END IF;
   IF nullif(entry->>'repair_job_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM repair_jobs j WHERE j.id=(entry->>'repair_job_id')::uuid AND j.laptop_id=l.id AND j.status='COMPLETED' AND j.recommended_action='SUPPLIER_RETURN') THEN RAISE EXCEPTION 'Repair nguồn không hợp lệ';END IF;
   IF nullif(entry->>'qc_inspection_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM qc_inspections q WHERE q.id=(entry->>'qc_inspection_id')::uuid AND q.laptop_id=l.id AND q.result='FAIL') THEN RAISE EXCEPTION 'QC nguồn không hợp lệ';END IF;
   INSERT INTO supplier_return_items(supplier_return_id,laptop_id,purchase_item_id,repair_job_id,qc_inspection_id,reason,condition_notes,expected_refund_rmb,agreed_refund_rmb)
   VALUES(r.id,l.id,l.purchase_item_id,nullif(entry->>'repair_job_id','')::uuid,nullif(entry->>'qc_inspection_id','')::uuid,entry->>'reason',left(coalesce(entry->>'condition_notes',''),3000),nullif(entry->>'expected_refund_rmb','')::numeric,nullif(entry->>'agreed_refund_rmb','')::numeric);
 END LOOP;
 INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by) VALUES(r.id,'CREATED',jsonb_build_object('item_count',jsonb_array_length(p_items)),p_actor);
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('SUPPLIER_RETURN',r.id::text,'CREATE',jsonb_build_object('return_code',r.return_code,'supplier_id',r.supplier_id,'item_count',jsonb_array_length(p_items)),p_actor);
 RETURN to_jsonb(r);
EXCEPTION WHEN unique_violation THEN SELECT * INTO r FROM supplier_returns WHERE idempotency_key=p_idempotency_key;IF FOUND THEN RETURN to_jsonb(r);END IF;RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.transition_supplier_return(p_id uuid,p_target text,p_data jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r supplier_returns%ROWTYPE;resolution text:=nullif(p_data->>'resolution_type','');
BEGIN
 SELECT * INTO r FROM supplier_returns WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu trả nhà cung cấp';END IF;
 IF NOT ((r.status='DRAFT' AND p_target IN('APPROVED','CANCELLED')) OR (r.status='APPROVED' AND p_target IN('READY_TO_SHIP','CANCELLED')) OR
   (r.status='READY_TO_SHIP' AND p_target IN('SHIPPED','CANCELLED')) OR (r.status='SHIPPED' AND p_target='SUPPLIER_RECEIVED') OR
   (r.status='SUPPLIER_RECEIVED' AND p_target IN('WAITING_REFUND','WAITING_REPLACEMENT','REJECTED')) OR
   (r.status IN('REFUNDED','REPLACED','REJECTED') AND p_target='CLOSED')) THEN RAISE EXCEPTION 'Chuyển trạng thái trả nhà cung cấp không hợp lệ (% → %)',r.status,p_target;END IF;
 IF p_target='SHIPPED' AND (btrim(coalesce(p_data->>'carrier',r.return_carrier,''))='' OR btrim(coalesce(p_data->>'tracking_number',r.return_tracking_number,''))='') THEN RAISE EXCEPTION 'Cần có đơn vị vận chuyển và tracking trước khi gửi';END IF;
 IF p_target='WAITING_REFUND' AND resolution NOT IN('REFUND','PARTIAL_REFUND') THEN RAISE EXCEPTION 'Loại xử lý hoàn tiền không hợp lệ';END IF;
 IF p_target='WAITING_REPLACEMENT' AND resolution<>'REPLACEMENT' THEN RAISE EXCEPTION 'Loại xử lý replacement không hợp lệ';END IF;
 UPDATE supplier_returns SET status=p_target,resolution_type=coalesce(resolution,resolution_type),return_carrier=left(coalesce(nullif(p_data->>'carrier',''),return_carrier),160),return_tracking_number=left(coalesce(nullif(p_data->>'tracking_number',''),return_tracking_number),200),
   approved_by=CASE WHEN p_target='APPROVED' THEN p_actor ELSE approved_by END,approved_at=CASE WHEN p_target='APPROVED' THEN timezone('utc',now()) ELSE approved_at END,
   shipped_at=CASE WHEN p_target='SHIPPED' THEN timezone('utc',now()) ELSE shipped_at END,supplier_received_at=CASE WHEN p_target='SUPPLIER_RECEIVED' THEN timezone('utc',now()) ELSE supplier_received_at END,
   closed_at=CASE WHEN p_target IN('CLOSED','CANCELLED') THEN timezone('utc',now()) ELSE closed_at END WHERE id=r.id RETURNING * INTO r;
 IF p_target='APPROVED' THEN PERFORM set_config('app.supplier_return_transition','on',true);UPDATE laptops SET status='supplier_return_pending',is_locked=true,available_for_sale_at=NULL WHERE id IN(SELECT laptop_id FROM supplier_return_items WHERE supplier_return_id=r.id);END IF;
 IF p_target='SHIPPED' THEN PERFORM set_config('app.supplier_return_transition','on',true);UPDATE laptops SET status='supplier_returned',is_locked=true,available_for_sale_at=NULL WHERE id IN(SELECT laptop_id FROM supplier_return_items WHERE supplier_return_id=r.id);UPDATE supplier_return_items SET status='SHIPPED' WHERE supplier_return_id=r.id;END IF;
 IF p_target='SUPPLIER_RECEIVED' THEN UPDATE supplier_return_items SET status='SUPPLIER_RECEIVED' WHERE supplier_return_id=r.id;END IF;
 IF p_target='CANCELLED' THEN PERFORM set_config('app.supplier_return_transition','on',true);UPDATE laptops SET status='qc_failed',is_locked=true,available_for_sale_at=NULL WHERE id IN(SELECT laptop_id FROM supplier_return_items WHERE supplier_return_id=r.id);UPDATE supplier_return_items SET status='CANCELLED' WHERE supplier_return_id=r.id;END IF;
 INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by) VALUES(r.id,p_target,jsonb_build_object('resolution_type',r.resolution_type,'tracking_number',r.return_tracking_number),p_actor);
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('SUPPLIER_RETURN',r.id::text,'UPDATE',jsonb_build_object('status',p_target,'resolution_type',r.resolution_type),p_actor);
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.record_supplier_refund(p_return_id uuid,p_amount_rmb numeric,p_exchange_rate numeric,p_method text,p_reference text,p_received_at timestamptz,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r supplier_returns%ROWTYPE;refund supplier_refunds%ROWTYPE;limit_amount numeric;refunded numeric;
BEGIN
 SELECT * INTO refund FROM supplier_refunds WHERE idempotency_key=p_idempotency_key;IF FOUND THEN RETURN to_jsonb(refund);END IF;
 SELECT * INTO r FROM supplier_returns WHERE id=p_return_id FOR UPDATE;IF NOT FOUND OR r.status NOT IN('WAITING_REFUND','PARTIALLY_RESOLVED') THEN RAISE EXCEPTION 'Phiếu trả chưa ở trạng thái nhận hoàn tiền';END IF;
 SELECT coalesce(sum(coalesce(agreed_refund_rmb,expected_refund_rmb)),0) INTO limit_amount FROM supplier_return_items WHERE supplier_return_id=r.id AND status<>'CANCELLED';
 SELECT coalesce(sum(amount_rmb),0) INTO refunded FROM supplier_refunds WHERE supplier_return_id=r.id;
 IF p_amount_rmb<=0 OR limit_amount<=0 OR p_amount_rmb>limit_amount-refunded THEN RAISE EXCEPTION 'Số tiền hoàn vượt số còn phải nhận';END IF;
 IF p_exchange_rate IS NOT NULL AND p_exchange_rate<=0 THEN RAISE EXCEPTION 'Tỷ giá không hợp lệ';END IF;
 INSERT INTO supplier_refunds(supplier_id,supplier_return_id,amount_rmb,amount_vnd,exchange_rate,refund_method,reference,received_at,idempotency_key,created_by)
 VALUES(r.supplier_id,r.id,p_amount_rmb,CASE WHEN p_exchange_rate IS NULL THEN NULL ELSE round(p_amount_rmb*p_exchange_rate,2) END,p_exchange_rate,p_method,left(coalesce(p_reference,''),300),coalesce(p_received_at,timezone('utc',now())),p_idempotency_key,p_actor) RETURNING * INTO refund;
 refunded:=refunded+p_amount_rmb;
 UPDATE supplier_returns SET status=CASE WHEN refunded>=limit_amount THEN 'REFUNDED' ELSE 'PARTIALLY_RESOLVED' END WHERE id=r.id;
 IF refunded>=limit_amount THEN UPDATE supplier_return_items SET status='REFUNDED' WHERE supplier_return_id=r.id AND status<>'CANCELLED';END IF;
 INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by) VALUES(r.id,'REFUND_RECEIVED',jsonb_build_object('amount_rmb',p_amount_rmb,'refunded_rmb',refunded,'remaining_rmb',greatest(limit_amount-refunded,0)),p_actor);
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('SUPPLIER_REFUND',refund.id::text,'CREATE',jsonb_build_object('supplier_return_id',r.id,'amount_rmb',p_amount_rmb),p_actor);
 RETURN to_jsonb(refund);
EXCEPTION WHEN unique_violation THEN SELECT * INTO refund FROM supplier_refunds WHERE idempotency_key=p_idempotency_key;IF FOUND THEN RETURN to_jsonb(refund);END IF;RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.link_supplier_replacement(p_item_id bigint,p_replacement_purchase_item_id bigint,p_replacement_laptop_id bigint,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item supplier_return_items%ROWTYPE;r supplier_returns%ROWTYPE;replacement_supplier uuid;
BEGIN
 SELECT * INTO item FROM supplier_return_items WHERE id=p_item_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm trả';END IF;
 SELECT * INTO r FROM supplier_returns WHERE id=item.supplier_return_id FOR UPDATE;IF r.status<>'WAITING_REPLACEMENT' THEN RAISE EXCEPTION 'Phiếu trả chưa chờ replacement';END IF;
 SELECT pb.supplier_id INTO replacement_supplier FROM purchase_items pi JOIN purchase_batches pb ON pb.id=pi.purchase_batch_id WHERE pi.id=p_replacement_purchase_item_id;
 IF replacement_supplier IS DISTINCT FROM r.supplier_id THEN RAISE EXCEPTION 'Replacement không cùng nhà cung cấp';END IF;
 IF p_replacement_laptop_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM laptops WHERE id=p_replacement_laptop_id AND purchase_item_id=p_replacement_purchase_item_id) THEN RAISE EXCEPTION 'Laptop replacement không khớp purchase item';END IF;
 UPDATE supplier_return_items SET replacement_purchase_item_id=p_replacement_purchase_item_id,replacement_laptop_id=p_replacement_laptop_id,status='REPLACED' WHERE id=item.id RETURNING * INTO item;
 IF NOT EXISTS(SELECT 1 FROM supplier_return_items WHERE supplier_return_id=r.id AND status NOT IN('REPLACED','CANCELLED')) THEN UPDATE supplier_returns SET status='REPLACED' WHERE id=r.id;END IF;
 INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by) VALUES(r.id,'REPLACEMENT_LINKED',jsonb_build_object('item_id',item.id,'replacement_purchase_item_id',p_replacement_purchase_item_id,'replacement_laptop_id',p_replacement_laptop_id),p_actor);
 RETURN to_jsonb(item);
END $$;

CREATE OR REPLACE FUNCTION public.prevent_supplier_refund_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'Hoàn tiền nhà cung cấp là ledger bất biến';END $$;
DROP TRIGGER IF EXISTS supplier_refunds_append_only ON public.supplier_refunds;CREATE TRIGGER supplier_refunds_append_only BEFORE UPDATE OR DELETE ON public.supplier_refunds FOR EACH ROW EXECUTE FUNCTION public.prevent_supplier_refund_mutation();
CREATE OR REPLACE FUNCTION public.guard_supplier_return_laptop_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN IF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status IN('supplier_return_pending','supplier_returned') OR NEW.status IN('supplier_return_pending','supplier_returned')) AND current_setting('app.supplier_return_transition',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Trạng thái trả nhà cung cấp chỉ được đổi qua Supplier Return workflow';END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS guard_supplier_return_laptop_transition_trigger ON public.laptops;CREATE TRIGGER guard_supplier_return_laptop_transition_trigger BEFORE UPDATE OF status ON public.laptops FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_return_laptop_transition();
CREATE OR REPLACE FUNCTION public.guard_laptop_qc_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN IF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status IN('waiting_qc','qc_in_progress','qc_failed') OR NEW.status IN('qc_in_progress','qc_failed')) AND current_setting('app.qc_transition',true) IS DISTINCT FROM 'on' AND current_setting('app.repair_transition',true) IS DISTINCT FROM 'on' AND current_setting('app.supplier_return_transition',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Trạng thái QC chỉ được thay đổi qua quy trình kiểm tra kỹ thuật';END IF;RETURN NEW;END $$;

DROP TRIGGER IF EXISTS supplier_returns_updated_at ON public.supplier_returns;CREATE TRIGGER supplier_returns_updated_at BEFORE UPDATE ON public.supplier_returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS supplier_return_items_updated_at ON public.supplier_return_items;CREATE TRIGGER supplier_return_items_updated_at BEFORE UPDATE ON public.supplier_return_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;ALTER TABLE public.supplier_return_items ENABLE ROW LEVEL SECURITY;ALTER TABLE public.supplier_refunds ENABLE ROW LEVEL SECURITY;ALTER TABLE public.supplier_return_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_returns,public.supplier_return_items,public.supplier_refunds,public.supplier_return_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.supplier_returns,public.supplier_return_items,public.supplier_refunds,public.supplier_return_events TO service_role;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE ALL ON FUNCTION public.complete_repair_job(uuid,text,text,text),public.complete_repair_job(uuid,text,text,text,text,text),public.next_supplier_return_code(),public.create_supplier_return(jsonb,jsonb,text,text),public.transition_supplier_return(uuid,text,jsonb,text),public.record_supplier_refund(uuid,numeric,numeric,text,text,timestamptz,text,text),public.link_supplier_replacement(bigint,bigint,bigint,text),public.prevent_supplier_refund_mutation(),public.guard_supplier_return_laptop_transition() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_repair_job(uuid,text,text,text,text,text),public.create_supplier_return(jsonb,jsonb,text,text),public.transition_supplier_return(uuid,text,jsonb,text),public.record_supplier_refund(uuid,numeric,numeric,text,text,timestamptz,text,text),public.link_supplier_replacement(bigint,bigint,bigint,text) TO service_role;
COMMIT;
