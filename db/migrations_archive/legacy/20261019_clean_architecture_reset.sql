-- Clean architecture reset: one expected/physical laptop is one public.laptops row.
-- This migration is intentionally destructive for the obsolete procurement/logistics model.
BEGIN;

DROP VIEW IF EXISTS public.unified_inventory CASCADE;
DROP VIEW IF EXISTS public.purchase_batch_summaries CASCADE;
DROP VIEW IF EXISTS public.shipment_summaries CASCADE;
DROP VIEW IF EXISTS public.laptop_landed_costs CASCADE;

DROP TABLE IF EXISTS public.receiving_exceptions CASCADE;
DROP TABLE IF EXISTS public.receiving_items CASCADE;
DROP TABLE IF EXISTS public.receiving_sessions CASCADE;
DROP TABLE IF EXISTS public.cost_allocation_items CASCADE;
DROP TABLE IF EXISTS public.cost_allocations CASCADE;
DROP TABLE IF EXISTS public.shipment_items CASCADE;
DROP TABLE IF EXISTS public.shipments CASCADE;
DROP TABLE IF EXISTS public.unmatched_received_items CASCADE;
DROP TABLE IF EXISTS public.intake_receipts CASCADE;

DO $$
DECLARE obsolete regprocedure;
BEGIN
  FOR obsolete IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
      'update_purchase_draft','transition_purchase_batch','next_shipment_code',
      'create_shipment','transition_shipment','receive_shipment_items',
      'resolve_receiving_exception','guard_laptop_qc_transition',
      'create_cost_allocation','guard_finalized_cost_history',
      'guard_allocated_shipment_cost_source','guard_allocated_shipment_item',
      'refresh_direct_batch_status','create_direct_purchase','receive_direct_items',
      'match_unmatched_intake','ignore_direct_purchase_item','inventory_display_status'
    ])
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE',obsolete);
  END LOOP;
END $$;

ALTER TABLE public.supplier_return_items
  DROP COLUMN IF EXISTS purchase_item_id,
  DROP COLUMN IF EXISTS replacement_purchase_item_id;

ALTER TABLE public.laptops
  ADD COLUMN IF NOT EXISTS purchase_batch_id bigint REFERENCES public.purchase_batches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS configuration text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tracking_code_cn text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS purchase_price_rmb numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_exchange_rate numeric(14,4),
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS ignored_at timestamptz,
  ADD COLUMN IF NOT EXISTS ignored_by text,
  ADD COLUMN IF NOT EXISTS ignore_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT 'System';

UPDATE public.laptops SET
  tracking_code_cn = coalesce(nullif(tracking_code_cn,''),tracking_code,''),
  purchase_price_rmb = coalesce(nullif(purchase_price_rmb,0),price_rmb,0),
  purchase_exchange_rate = coalesce(purchase_exchange_rate,exchange_rate),
  source_type = CASE
    WHEN source_type='TRADE_IN' THEN 'TRADE_IN'
    WHEN coalesce(source_unresolved,false) THEN 'UNKNOWN'
    ELSE 'SUPPLIER_PURCHASE'
  END,
  status = CASE
    WHEN status IN ('not_imported','IN_TRANSIT') THEN 'in_transit'
    WHEN status IN ('waiting_qc','qc_in_progress','qc_failed','WAITING_QC') THEN 'waiting_qc'
    WHEN status IN ('available','AVAILABLE') THEN 'available'
    WHEN status IN ('deposited','RESERVED') THEN 'reserved'
    WHEN status IN ('sold','SOLD') THEN 'sold'
    WHEN status IN ('repair','repairing','REPAIR') THEN 'repair'
    WHEN status IN ('returned_cn','SUPPLIER_RETURN') THEN 'supplier_return'
    WHEN status IN ('skipped','inactive','IGNORED') THEN 'ignored'
    ELSE 'waiting_qc'
  END;

ALTER TABLE public.laptops DROP CONSTRAINT IF EXISTS laptops_source_type_check;
ALTER TABLE public.laptops ALTER COLUMN source_type SET DEFAULT 'UNKNOWN';
ALTER TABLE public.laptops ADD CONSTRAINT laptops_source_type_check
  CHECK(source_type IN('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT','TRADE_IN','UNKNOWN'));
ALTER TABLE public.laptops DROP CONSTRAINT IF EXISTS laptops_status_check;
ALTER TABLE public.laptops ADD CONSTRAINT laptops_status_check
  CHECK(status IN('in_transit','waiting_qc','available','reserved','sold','repair','supplier_return','ignored'));
ALTER TABLE public.laptops DROP CONSTRAINT IF EXISTS laptops_purchase_values_check;
ALTER TABLE public.laptops ADD CONSTRAINT laptops_purchase_values_check CHECK(
  purchase_price_rmb>=0 AND coalesce(shipping_rmb,0)>=0
  AND (purchase_exchange_rate IS NULL OR purchase_exchange_rate>0)
);
CREATE INDEX IF NOT EXISTS laptops_purchase_batch_idx ON public.laptops(purchase_batch_id,id);
CREATE INDEX IF NOT EXISTS laptops_status_received_idx ON public.laptops(status,received_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS laptops_tracking_code_cn_idx ON public.laptops(lower(tracking_code_cn)) WHERE btrim(tracking_code_cn)<>'';

-- Operational eligibility is derived from status. Keeping a second lock flag
-- would allow the two values to disagree.
ALTER TABLE public.laptops DROP COLUMN IF EXISTS is_locked CASCADE;
ALTER TABLE public.laptops DROP COLUMN IF EXISTS source_unresolved CASCADE;

DROP TRIGGER IF EXISTS guard_laptop_qc_transition_trigger ON public.laptops;
DROP TRIGGER IF EXISTS guard_repair_laptop_transition_trigger ON public.laptops;
DROP TRIGGER IF EXISTS guard_supplier_return_laptop_transition_trigger ON public.laptops;
CREATE OR REPLACE FUNCTION public.guard_laptop_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('app.laptop_transition',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Trạng thái laptop chỉ được thay đổi qua workflow nghiệp vụ';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER laptops_status_workflow_guard BEFORE UPDATE OF status ON public.laptops
FOR EACH ROW EXECUTE FUNCTION public.guard_laptop_status_transition();

CREATE OR REPLACE FUNCTION public.sync_laptop_purchase_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF coalesce(NEW.purchase_price_rmb,0)=0 AND coalesce(NEW.price_rmb,0)>0 THEN NEW.purchase_price_rmb:=NEW.price_rmb; END IF;
  IF coalesce(NEW.price_rmb,0)=0 AND coalesce(NEW.purchase_price_rmb,0)>0 THEN NEW.price_rmb:=NEW.purchase_price_rmb; END IF;
  NEW.purchase_exchange_rate:=coalesce(NEW.purchase_exchange_rate,NEW.exchange_rate);
  NEW.exchange_rate:=coalesce(NEW.exchange_rate,NEW.purchase_exchange_rate);
  NEW.tracking_code_cn:=coalesce(nullif(NEW.tracking_code_cn,''),NEW.tracking_code,'');
  NEW.tracking_code:=coalesce(NEW.tracking_code,nullif(NEW.tracking_code_cn,''));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS laptops_sync_purchase_fields_trigger ON public.laptops;
CREATE TRIGGER laptops_sync_purchase_fields_trigger BEFORE INSERT OR UPDATE OF
  purchase_price_rmb,price_rmb,purchase_exchange_rate,exchange_rate,tracking_code_cn,tracking_code
  ON public.laptops FOR EACH ROW EXECUTE FUNCTION public.sync_laptop_purchase_fields();

-- Old line items are no longer part of the active model. The FK on laptops was
-- removed above by CASCADE; remove the compatibility columns as well.
ALTER TABLE public.laptops DROP COLUMN IF EXISTS purchase_item_id CASCADE;
DROP TABLE IF EXISTS public.purchase_items CASCADE;

-- A generic idempotency journal replaces receiving-session transport tables.
CREATE TABLE IF NOT EXISTS public.operation_requests(
  idempotency_key text PRIMARY KEY CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 100),
  operation text NOT NULL CHECK(length(btrim(operation)) BETWEEN 2 AND 80),
  result jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc',now())
);
ALTER TABLE public.operation_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_purchase_batch_code(p_date date DEFAULT current_date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prefix text:='PO-'||to_char(p_date,'YYYYMMDD')||'-'; n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(prefix));
  SELECT coalesce(max(right(batch_code,3)::integer),0)+1 INTO n
  FROM purchase_batches WHERE batch_code LIKE prefix||'%';
  RETURN prefix||lpad(n::text,3,'0');
END $$;

DROP FUNCTION IF EXISTS public.create_purchase_batch(jsonb,jsonb,text,text);
CREATE FUNCTION public.create_purchase_batch(
  p_batch jsonb,p_laptops jsonb,p_actor text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b purchase_batches%ROWTYPE; entry jsonb; created_rows jsonb; rate numeric;
BEGIN
  SELECT result INTO created_rows FROM operation_requests
  WHERE idempotency_key=p_idempotency_key AND operation='CREATE_PURCHASE_BATCH';
  IF FOUND THEN RETURN created_rows; END IF;
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100
     OR jsonb_typeof(p_laptops) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_laptops) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Lô mua phải có từ 1 đến 200 máy';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM suppliers WHERE id=(p_batch->>'supplier_id')::uuid AND active) THEN
    RAISE EXCEPTION 'Nhà cung cấp không tồn tại hoặc đã ngừng sử dụng';
  END IF;
  rate:=coalesce(nullif(p_batch->>'purchase_exchange_rate','')::numeric,nullif(p_batch->>'exchange_rate','')::numeric);
  IF rate IS NULL OR rate<=0 THEN RAISE EXCEPTION 'Tỷ giá mua không hợp lệ'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_laptops) x WHERE
    length(btrim(coalesce(x->>'name',''))) NOT BETWEEN 1 AND 240
    OR coalesce(nullif(x->>'purchase_price_rmb','')::numeric,-1)<0
    OR coalesce(nullif(x->>'shipping_rmb','')::numeric,0)<0
    OR length(coalesce(x->>'configuration',''))>1000
    OR length(coalesce(x->>'tracking_code_cn',''))>200) THEN
    RAISE EXCEPTION 'Thông tin máy trong lô không hợp lệ';
  END IF;

  INSERT INTO purchase_batches(batch_code,supplier_id,purchase_date,currency,exchange_rate,
    subtotal_rmb,domestic_shipping_rmb,other_cost_rmb,destination,status,notes,active,
    created_by,updated_by,idempotency_key)
  VALUES(next_purchase_batch_code((p_batch->>'purchase_date')::date),(p_batch->>'supplier_id')::uuid,
    (p_batch->>'purchase_date')::date,'CNY',rate,0,0,0,'OTHER','CONFIRMED',
    left(coalesce(p_batch->>'notes',''),3000),true,p_actor,p_actor,p_idempotency_key)
  RETURNING * INTO b;

  FOR entry IN SELECT value FROM jsonb_array_elements(p_laptops) LOOP
    INSERT INTO laptops(name,configuration,serial,tracking_code_cn,purchase_price_rmb,shipping_rmb,
      purchase_exchange_rate,purchase_batch_id,source_type,status,location,charger_status,
      is_active,condition_note,created_by,import_date,month_key,price_rmb,exchange_rate,tracking_code)
    VALUES(btrim(entry->>'name'),left(coalesce(entry->>'configuration',''),1000),
      nullif(left(btrim(coalesce(entry->>'serial','')),100),''),
      left(btrim(coalesce(entry->>'tracking_code_cn','')),200),
      (entry->>'purchase_price_rmb')::numeric,coalesce(nullif(entry->>'shipping_rmb','')::numeric,0),
      rate,b.id,'SUPPLIER_PURCHASE','in_transit','wh_cn','unchecked',true,
      left(coalesce(entry->>'notes',''),2000),p_actor,b.purchase_date,to_char(b.purchase_date,'MM/YYYY'),
      (entry->>'purchase_price_rmb')::numeric,rate,left(btrim(coalesce(entry->>'tracking_code_cn','')),200));
  END LOOP;
  SELECT jsonb_build_object('batch',to_jsonb(b),'laptops',coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb))
  INTO created_rows FROM laptops l WHERE l.purchase_batch_id=b.id;
  INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
  VALUES(p_idempotency_key,'CREATE_PURCHASE_BATCH',created_rows,p_actor);
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('PURCHASE_BATCH',b.id::text,'CREATE',jsonb_build_object('batch_code',b.batch_code,'laptop_count',jsonb_array_length(p_laptops)),p_actor);
  RETURN created_rows;
END $$;

CREATE OR REPLACE FUNCTION public.receive_purchase_laptops(
  p_items jsonb,p_notes text,p_actor text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE entry jsonb; l laptops%ROWTYPE; rows jsonb:='[]'::jsonb; prior jsonb;
BEGIN
  SELECT result INTO prior FROM operation_requests
  WHERE idempotency_key=p_idempotency_key AND operation='RECEIVE_PURCHASE_LAPTOPS';
  IF FOUND THEN RETURN prior; END IF;
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Đợt nhận hàng không hợp lệ';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_items)) <>
     (SELECT count(DISTINCT (value->>'laptop_id')::bigint) FROM jsonb_array_elements(p_items)) THEN
    RAISE EXCEPTION 'Danh sách nhận hàng có máy bị trùng';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO l FROM laptops WHERE id=(entry->>'laptop_id')::bigint FOR UPDATE;
    IF NOT FOUND OR l.source_type NOT IN('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT') THEN
      RAISE EXCEPTION 'Máy không thuộc luồng mua từ nhà cung cấp';
    END IF;
    IF l.status<>'in_transit' THEN RAISE EXCEPTION 'Máy % không còn ở trạng thái chưa về hàng',l.id; END IF;
    PERFORM set_config('app.laptop_transition','on',true);
    UPDATE laptops SET
      status='waiting_qc',received_at=timezone('utc',now()),warehouse_date=current_date,location='store',
      serial=coalesce(nullif(left(btrim(coalesce(entry->>'serial','')),100),''),serial),
      tracking_code_cn=coalesce(nullif(left(btrim(coalesce(entry->>'tracking_code_cn','')),200),''),tracking_code_cn),
      tracking_code=coalesce(nullif(left(btrim(coalesce(entry->>'tracking_code_cn','')),200),''),tracking_code),
      charger_status=coalesce(nullif(entry->>'charger_status',''),charger_status),
      condition_note=left(concat_ws(E'\n',nullif(condition_note,''),nullif(entry->>'notes',''),nullif(p_notes,'')),2000)
    WHERE id=l.id RETURNING * INTO l;
    INSERT INTO stock_movements(laptop_id,movement_type,from_location,to_location,note,performed_by,reference_type,reference_id)
    VALUES(l.id,'PURCHASE_RECEIVE','IN_TRANSIT',l.location,'Nhận hàng từ lô '||coalesce(l.purchase_batch_id::text,''),p_actor,'PURCHASE_BATCH',l.purchase_batch_id::text);
    rows:=rows||jsonb_build_array(to_jsonb(l));
  END LOOP;
  prior:=jsonb_build_object('laptops',rows,'received_count',jsonb_array_length(rows));
  INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
  VALUES(p_idempotency_key,'RECEIVE_PURCHASE_LAPTOPS',prior,p_actor);
  RETURN prior;
END $$;

CREATE OR REPLACE FUNCTION public.receive_unknown_laptop(
  p_data jsonb,p_actor text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l laptops%ROWTYPE; prior jsonb;
BEGIN
  SELECT result INTO prior FROM operation_requests
  WHERE idempotency_key=p_idempotency_key AND operation='RECEIVE_UNKNOWN_LAPTOP';
  IF FOUND THEN RETURN prior; END IF;
  IF length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Tên máy không hợp lệ'; END IF;
  INSERT INTO laptops(name,configuration,serial,tracking_code_cn,tracking_code,source_type,status,
    location,charger_status,is_active,condition_note,received_at,warehouse_date,created_by)
  VALUES(btrim(p_data->>'name'),left(coalesce(p_data->>'configuration',''),1000),
    nullif(left(btrim(coalesce(p_data->>'serial','')),100),''),left(btrim(coalesce(p_data->>'tracking_code_cn','')),200),
    left(btrim(coalesce(p_data->>'tracking_code_cn','')),200),'UNKNOWN','waiting_qc','store',
    coalesce(nullif(p_data->>'charger_status',''),'unchecked'),true,left(coalesce(p_data->>'notes',''),2000),
    timezone('utc',now()),current_date,p_actor) RETURNING * INTO l;
  prior:=to_jsonb(l);
  INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
  VALUES(p_idempotency_key,'RECEIVE_UNKNOWN_LAPTOP',prior,p_actor);
  INSERT INTO stock_movements(laptop_id,movement_type,to_location,note,performed_by,reference_type,reference_id)
  VALUES(l.id,'PURCHASE_RECEIVE',l.location,'Nhận máy chưa rõ nguồn',p_actor,'UNKNOWN_INTAKE',p_idempotency_key);
  RETURN prior;
END $$;

CREATE OR REPLACE FUNCTION public.receive_inventory(
  p_expected jsonb,p_unknown jsonb,p_notes text,p_actor text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior jsonb; known_result jsonb:=jsonb_build_object('laptops','[]'::jsonb,'received_count',0);
  entry jsonb; unknown_rows jsonb:='[]'::jsonb; unknown_row jsonb; index_no integer:=0;
BEGIN
  SELECT result INTO prior FROM operation_requests
  WHERE idempotency_key=p_idempotency_key AND operation='RECEIVE_INVENTORY';
  IF FOUND THEN RETURN prior; END IF;
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 80
     OR jsonb_typeof(coalesce(p_expected,'[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_typeof(coalesce(p_unknown,'[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_array_length(coalesce(p_expected,'[]'::jsonb))+jsonb_array_length(coalesce(p_unknown,'[]'::jsonb)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Đợt nhận hàng không hợp lệ';
  END IF;
  IF jsonb_array_length(coalesce(p_expected,'[]'::jsonb))>0 THEN
    known_result:=receive_purchase_laptops(p_expected,p_notes,p_actor,p_idempotency_key||'-expected');
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(p_unknown,'[]'::jsonb)) LOOP
    index_no:=index_no+1;
    unknown_row:=receive_unknown_laptop(entry,p_actor,p_idempotency_key||'-unknown-'||index_no::text);
    unknown_rows:=unknown_rows||jsonb_build_array(unknown_row);
  END LOOP;
  prior:=jsonb_build_object('expected',known_result->'laptops','unknown',unknown_rows,
    'received_count',jsonb_array_length(coalesce(known_result->'laptops','[]'::jsonb))+jsonb_array_length(unknown_rows));
  INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
  VALUES(p_idempotency_key,'RECEIVE_INVENTORY',prior,p_actor);
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('RECEIVING',p_idempotency_key,'CREATE',jsonb_build_object('received_count',prior->'received_count','notes',left(coalesce(p_notes,''),1000)),p_actor);
  RETURN prior;
END $$;

CREATE OR REPLACE FUNCTION public.reconcile_unknown_laptop(
  p_unknown_laptop_id bigint,p_expected_laptop_id bigint,p_actor text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE physical laptops%ROWTYPE; expected laptops%ROWTYPE; prior jsonb;
BEGIN
  SELECT result INTO prior FROM operation_requests
  WHERE idempotency_key=p_idempotency_key AND operation='RECONCILE_UNKNOWN_LAPTOP';
  IF FOUND THEN RETURN prior; END IF;
  IF p_unknown_laptop_id=p_expected_laptop_id THEN RAISE EXCEPTION 'Hai laptop phải khác nhau'; END IF;
  PERFORM pg_advisory_xact_lock(least(p_unknown_laptop_id,p_expected_laptop_id));
  PERFORM pg_advisory_xact_lock(greatest(p_unknown_laptop_id,p_expected_laptop_id));
  SELECT * INTO physical FROM laptops WHERE id=p_unknown_laptop_id FOR UPDATE;
  SELECT * INTO expected FROM laptops WHERE id=p_expected_laptop_id FOR UPDATE;
  IF physical.id IS NULL OR physical.source_type<>'UNKNOWN' OR physical.status<>'waiting_qc' THEN
    RAISE EXCEPTION 'Laptop thực nhận không còn là máy chưa rõ nguồn đang chờ QC';
  END IF;
  IF expected.id IS NULL OR expected.status<>'in_transit' OR expected.source_type NOT IN('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT') THEN
    RAISE EXCEPTION 'Laptop dự kiến không còn nguyên trạng chưa về hàng';
  END IF;
  IF EXISTS(SELECT 1 FROM qc_inspections WHERE laptop_id=expected.id)
     OR EXISTS(SELECT 1 FROM repair_jobs WHERE laptop_id=expected.id)
     OR EXISTS(SELECT 1 FROM orders WHERE laptop_id=expected.id OR requested_laptop_id=expected.id)
     OR EXISTS(SELECT 1 FROM reservations WHERE laptop_id=expected.id)
     OR EXISTS(SELECT 1 FROM stock_movements WHERE laptop_id=expected.id) THEN
    RAISE EXCEPTION 'Laptop dự kiến đã có lịch sử nghiệp vụ, không thể gộp';
  END IF;
  -- Release unique serial/tracking keys held by the untouched placeholder before
  -- copying its source data onto the physical laptop that keeps the stable ID.
  DELETE FROM laptops WHERE id=expected.id;
  UPDATE laptops SET purchase_batch_id=expected.purchase_batch_id,source_type=expected.source_type,
    purchase_price_rmb=expected.purchase_price_rmb,shipping_rmb=expected.shipping_rmb,
    purchase_exchange_rate=expected.purchase_exchange_rate,price_rmb=expected.purchase_price_rmb,
    exchange_rate=expected.purchase_exchange_rate,tracking_code_cn=coalesce(nullif(expected.tracking_code_cn,''),tracking_code_cn),
    tracking_code=coalesce(nullif(expected.tracking_code_cn,''),tracking_code),
    name=coalesce(nullif(name,''),expected.name),configuration=coalesce(nullif(configuration,''),expected.configuration),
    serial=coalesce(serial,expected.serial),import_date=expected.import_date,month_key=expected.month_key,
    source_reference_id=expected.source_reference_id
  WHERE id=physical.id RETURNING * INTO physical;
  prior:=to_jsonb(physical);
  INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
  VALUES(p_idempotency_key,'RECONCILE_UNKNOWN_LAPTOP',prior,p_actor);
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('LAPTOP',physical.id::text,'UPDATE',jsonb_build_object('event','UNKNOWN_SOURCE_RECONCILED','deleted_expected_laptop_id',expected.id,'purchase_batch_id',physical.purchase_batch_id),p_actor);
  RETURN prior;
END $$;

DROP FUNCTION IF EXISTS public.update_incoming_tracking(bigint,text,text);
CREATE FUNCTION public.update_incoming_tracking(p_laptop_id bigint,p_tracking text,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l laptops%ROWTYPE;
BEGIN
  UPDATE laptops SET tracking_code_cn=left(btrim(coalesce(p_tracking,'')),200),tracking_code=left(btrim(coalesce(p_tracking,'')),200)
  WHERE id=p_laptop_id AND status='in_transit' RETURNING * INTO l;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chỉ cập nhật mã cho máy chưa về hàng'; END IF;
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('LAPTOP',l.id::text,'UPDATE',jsonb_build_object('tracking_code_cn',l.tracking_code_cn),p_actor);
  RETURN to_jsonb(l);
END $$;

CREATE OR REPLACE FUNCTION public.ignore_incoming_laptop(p_laptop_id bigint,p_reason text,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l laptops%ROWTYPE;
BEGIN
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Cần nhập lý do bỏ qua'; END IF;
  PERFORM set_config('app.laptop_transition','on',true);
  UPDATE laptops SET status='ignored',ignored_at=timezone('utc',now()),ignored_by=p_actor,
    ignore_reason=left(btrim(p_reason),1000),is_active=false
  WHERE id=p_laptop_id AND status='in_transit' RETURNING * INTO l;
  IF NOT FOUND THEN RAISE EXCEPTION 'Máy không còn ở trạng thái có thể bỏ qua'; END IF;
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('LAPTOP',l.id::text,'UPDATE',jsonb_build_object('event','INCOMING_LAPTOP_IGNORED','reason',l.ignore_reason),p_actor);
  RETURN to_jsonb(l);
END $$;

CREATE OR REPLACE VIEW public.purchase_batch_summaries AS
SELECT b.id,b.batch_code,b.supplier_id,b.purchase_date,b.notes,b.created_by,b.created_at,b.updated_at,b.idempotency_key,
  s.code supplier_code,s.name supplier_name,
  coalesce(x.laptop_count,0)::bigint item_count,coalesce(x.received_count,0)::bigint received_count,
  coalesce(x.pending_count,0)::bigint pending_count,coalesce(x.ignored_count,0)::bigint ignored_count,
  coalesce(x.purchase_total_rmb,0)::numeric(14,2) subtotal_rmb,
  coalesce(x.purchase_total_rmb,0)::numeric(14,2) purchase_total_rmb,
  coalesce(x.shipping_total_rmb,0)::numeric(14,2) shipping_total_rmb,
  coalesce(x.purchase_total_rmb,0)::numeric(14,2) total_rmb,
  coalesce(p.paid_rmb,0)::numeric(14,2) paid_rmb,
  greatest(coalesce(x.purchase_total_rmb,0)-coalesce(p.paid_rmb,0),0)::numeric(14,2) debt_rmb,
  CASE WHEN coalesce(x.pending_count,0)=0 THEN 'RECEIVED'
       WHEN coalesce(x.received_count,0)>0 THEN 'PARTIALLY_RECEIVED' ELSE 'IN_TRANSIT' END status
FROM purchase_batches b JOIN suppliers s ON s.id=b.supplier_id
LEFT JOIN (SELECT purchase_batch_id,count(*) laptop_count,
  count(*) FILTER(WHERE received_at IS NOT NULL) received_count,
  count(*) FILTER(WHERE status='in_transit') pending_count,
  count(*) FILTER(WHERE status='ignored') ignored_count,
  sum(purchase_price_rmb) FILTER(WHERE status<>'ignored') purchase_total_rmb,
  sum(shipping_rmb) FILTER(WHERE status<>'ignored') shipping_total_rmb
  FROM laptops WHERE purchase_batch_id IS NOT NULL GROUP BY purchase_batch_id) x ON x.purchase_batch_id=b.id
LEFT JOIN (SELECT purchase_batch_id,sum(amount_rmb) paid_rmb FROM supplier_payments GROUP BY purchase_batch_id) p ON p.purchase_batch_id=b.id;

-- Supplier debt follows the expected laptops in the batch. Per-laptop
-- shipping remains an inventory cost and is not paid a second time here.
CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  p_batch_id bigint,p_amount_rmb numeric,p_exchange_rate numeric,p_method text,
  p_reference text,p_date date,p_notes text,p_actor text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b purchase_batches%ROWTYPE; paid numeric; total numeric; result supplier_payments%ROWTYPE;
BEGIN
  SELECT * INTO result FROM supplier_payments WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(result); END IF;
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 90 THEN
    RAISE EXCEPTION 'Idempotency key không hợp lệ';
  END IF;
  SELECT * INTO b FROM purchase_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND OR b.active IS NOT TRUE OR b.status='CANCELLED' THEN
    RAISE EXCEPTION 'Lô mua không tồn tại hoặc không còn nhận thanh toán';
  END IF;
  SELECT coalesce(sum(purchase_price_rmb),0) INTO total
  FROM laptops WHERE purchase_batch_id=b.id AND status<>'ignored';
  SELECT coalesce(sum(amount_rmb),0) INTO paid
  FROM supplier_payments WHERE purchase_batch_id=b.id;
  IF p_amount_rmb IS NULL OR p_amount_rmb<=0 OR p_amount_rmb>total-paid THEN
    RAISE EXCEPTION 'Số tiền vượt công nợ còn lại';
  END IF;
  IF p_exchange_rate IS NULL OR p_exchange_rate<=0 THEN RAISE EXCEPTION 'Tỷ giá không hợp lệ'; END IF;
  IF p_method NOT IN('WECHAT','ALIPAY','BANK_TRANSFER','CASH','OTHER') THEN
    RAISE EXCEPTION 'Phương thức thanh toán không hợp lệ';
  END IF;
  INSERT INTO supplier_payments(
    supplier_id,purchase_batch_id,amount_rmb,amount_vnd,exchange_rate,payment_method,
    reference,payment_date,notes,recorded_by,idempotency_key
  ) VALUES(
    b.supplier_id,b.id,p_amount_rmb,round(p_amount_rmb*p_exchange_rate,2),p_exchange_rate,
    p_method,left(coalesce(p_reference,''),200),coalesce(p_date,current_date),
    left(coalesce(p_notes,''),2000),p_actor,p_idempotency_key
  ) RETURNING * INTO result;
  RETURN to_jsonb(result);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO result FROM supplier_payments WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(result); END IF;
  RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.sync_laptop_cost_components(p_laptop_id bigint,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l laptops%ROWTYPE; r repair_jobs%ROWTYPE; repair_count integer:=0;
BEGIN
  SELECT * INTO l FROM laptops WHERE id=p_laptop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy laptop'; END IF;
  FOR r IN SELECT * FROM repair_jobs WHERE laptop_id=l.id AND status='COMPLETED' LOOP
    INSERT INTO laptop_cost_components(laptop_id,cost_type,amount_vnd,source_type,source_id,description,occurred_at,created_by)
    VALUES(l.id,'REPAIR',round(r.total_cost_vnd,0),'REPAIR_JOB',r.id::text,'Chi phí '||r.repair_code,coalesce(r.completed_at,r.updated_at),p_actor)
    ON CONFLICT(laptop_id,source_type,source_id,cost_type) WHERE source_id IS NOT NULL AND voided_at IS NULL
    DO UPDATE SET amount_vnd=excluded.amount_vnd,description=excluded.description;
    repair_count:=repair_count+1;
  END LOOP;
  RETURN jsonb_build_object('laptop_id',l.id,'repair_jobs_synced',repair_count);
END $$;

CREATE OR REPLACE VIEW public.laptop_landed_costs WITH (security_invoker=true) AS
WITH component_sums AS (
 SELECT laptop_id,
  sum(amount_vnd) FILTER(WHERE cost_type='TRADE_IN_ACQUISITION') trade_in_cost_vnd,
  sum(amount_vnd) FILTER(WHERE cost_type='VN_SHIPPING') vn_shipping_vnd,
  sum(amount_vnd) FILTER(WHERE cost_type='REPAIR') repair_cost_vnd,
  sum(amount_vnd) FILTER(WHERE cost_type IN('RAM_UPGRADE','SSD_UPGRADE')) upgrade_cost_vnd,
  sum(amount_vnd) FILTER(WHERE cost_type='ACCESSORY') accessory_cost_vnd,
  sum(amount_vnd) FILTER(WHERE cost_type IN('CLEANING','OTHER','PAYMENT_FEE')) other_cost_vnd,
  sum(amount_vnd) FILTER(WHERE cost_type='REFUND_CREDIT') refund_credit_vnd
 FROM laptop_cost_components WHERE voided_at IS NULL GROUP BY laptop_id
), calculated AS (
 SELECT l.*,
  CASE WHEN l.source_type='TRADE_IN' THEN coalesce(c.trade_in_cost_vnd,0)
       WHEN l.purchase_exchange_rate IS NOT NULL THEN round(l.purchase_price_rmb*l.purchase_exchange_rate,2)
       ELSE 0 END purchase_cost_vnd,
  CASE WHEN l.purchase_exchange_rate IS NOT NULL THEN round(l.shipping_rmb*l.purchase_exchange_rate,2) ELSE 0 END cn_shipping_vnd,
  c.vn_shipping_vnd,c.repair_cost_vnd,c.upgrade_cost_vnd,c.accessory_cost_vnd,c.other_cost_vnd,c.refund_credit_vnd,
  CASE
    WHEN l.source_type='UNKNOWN' THEN 'INCOMPLETE'
    WHEN l.source_type IN('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT') AND (l.purchase_batch_id IS NULL OR l.purchase_exchange_rate IS NULL) THEN 'INCOMPLETE'
    WHEN l.source_type='TRADE_IN' AND coalesce(c.trade_in_cost_vnd,0)<=0 THEN 'INCOMPLETE'
    WHEN EXISTS(SELECT 1 FROM repair_jobs r WHERE r.laptop_id=l.id AND r.status NOT IN('COMPLETED','CANCELLED')) THEN 'INCOMPLETE'
    ELSE 'COMPLETE' END cost_status
 FROM laptops l LEFT JOIN component_sums c ON c.laptop_id=l.id
)
SELECT id laptop_id,coalesce(purchase_cost_vnd,0)::numeric(18,2) purchase_cost_vnd,
 coalesce(cn_shipping_vnd,0)::numeric(18,2) cn_shipping_vnd,
 coalesce(vn_shipping_vnd,0)::numeric(18,2) vn_shipping_vnd,
 coalesce(repair_cost_vnd,0)::numeric(18,2) repair_cost_vnd,
 coalesce(upgrade_cost_vnd,0)::numeric(18,2) upgrade_cost_vnd,
 coalesce(accessory_cost_vnd,0)::numeric(18,2) accessory_cost_vnd,
 coalesce(other_cost_vnd,0)::numeric(18,2) other_cost_vnd,
 coalesce(refund_credit_vnd,0)::numeric(18,2) refund_credit_vnd,
 greatest(coalesce(purchase_cost_vnd,0)+coalesce(cn_shipping_vnd,0)+coalesce(vn_shipping_vnd,0)+
  coalesce(repair_cost_vnd,0)+coalesce(upgrade_cost_vnd,0)+coalesce(accessory_cost_vnd,0)+
  coalesce(other_cost_vnd,0)-coalesce(refund_credit_vnd,0),0)::numeric(18,2) landed_cost_vnd,
 cost_status,
 array_remove(ARRAY[
   CASE WHEN source_type='UNKNOWN' THEN 'UNKNOWN_SOURCE' END,
   CASE WHEN source_type IN('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT') AND purchase_batch_id IS NULL THEN 'MISSING_PURCHASE_BATCH' END,
   CASE WHEN source_type IN('SUPPLIER_PURCHASE','SUPPLIER_REPLACEMENT') AND purchase_exchange_rate IS NULL THEN 'MISSING_EXCHANGE_RATE' END,
   CASE WHEN source_type='TRADE_IN' AND purchase_cost_vnd<=0 THEN 'MISSING_TRADE_IN_ACQUISITION' END,
   CASE WHEN EXISTS(SELECT 1 FROM repair_jobs r WHERE r.laptop_id=calculated.id AND r.status NOT IN('COMPLETED','CANCELLED')) THEN 'ACTIVE_REPAIR_COST_PENDING' END
 ],NULL) reasons
FROM calculated;

CREATE OR REPLACE VIEW public.unified_inventory WITH (security_invoker=true) AS
SELECT l.id::text entity_key,'LAPTOP'::text entity_type,l.id entity_id,l.id laptop_id,
  l.name,l.configuration,l.serial,l.tracking_code_cn,l.status display_status,l.status backend_status,
  s.name supplier_name,b.batch_code,l.received_at,l.available_for_sale_at,b.purchase_date,
  CASE WHEN b.purchase_date IS NULL THEN NULL ELSE to_char(b.purchase_date,'MM/YYYY') END month_key,
  l.purchase_price_rmb,l.shipping_rmb,l.purchase_exchange_rate exchange_rate,
  CASE WHEN l.purchase_exchange_rate IS NULL THEN NULL ELSE round((l.purchase_price_rmb+l.shipping_rmb)*l.purchase_exchange_rate,2) END landed_cost_vnd,
  (l.source_type='UNKNOWN') source_unresolved,l.condition_note notes
FROM laptops l LEFT JOIN purchase_batches b ON b.id=l.purchase_batch_id
LEFT JOIN suppliers s ON s.id=b.supplier_id;

CREATE OR REPLACE FUNCTION public.get_management_dashboard()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH available AS (
 SELECT l.id,l.serial,l.name,l.location,l.retail_price_vnd,l.available_for_sale_at,c.landed_cost_vnd,c.cost_status,
   CASE WHEN l.available_for_sale_at IS NULL THEN NULL
        ELSE greatest(floor(extract(epoch FROM(now()-l.available_for_sale_at))/86400),0)::integer END age_days
 FROM laptops l LEFT JOIN laptop_landed_costs c ON c.laptop_id=l.id
 WHERE l.is_active IS TRUE AND l.status='available'
), aging AS (
 SELECT bucket_key,bucket_label,sort_order,count(*)::integer units,
   coalesce(sum(landed_cost_vnd) FILTER(WHERE cost_status='COMPLETE'),0)::numeric(18,2) landed_cost_value,
   round(avg(age_days),1) average_age
 FROM available a CROSS JOIN LATERAL(VALUES(
   CASE WHEN age_days<=7 THEN '0_7' WHEN age_days<=15 THEN '8_15' WHEN age_days<=30 THEN '16_30'
        WHEN age_days<=60 THEN '31_60' WHEN age_days<=90 THEN '61_90' ELSE '90_plus' END,
   CASE WHEN age_days<=7 THEN '0–7 ngày' WHEN age_days<=15 THEN '8–15 ngày' WHEN age_days<=30 THEN '16–30 ngày'
        WHEN age_days<=60 THEN '31–60 ngày' WHEN age_days<=90 THEN '61–90 ngày' ELSE '90+ ngày' END,
   CASE WHEN age_days<=7 THEN 1 WHEN age_days<=15 THEN 2 WHEN age_days<=30 THEN 3
        WHEN age_days<=60 THEN 4 WHEN age_days<=90 THEN 5 ELSE 6 END
 )) b(bucket_key,bucket_label,sort_order) WHERE age_days IS NOT NULL GROUP BY bucket_key,bucket_label,sort_order
), states AS (
 SELECT status state,count(*)::integer units FROM laptops WHERE is_active IS TRUE GROUP BY status
), active_repairs AS (
 SELECT r.*,c.landed_cost_vnd,c.cost_status FROM repair_jobs r LEFT JOIN laptop_landed_costs c ON c.laptop_id=r.laptop_id
 WHERE r.status NOT IN('COMPLETED','CANCELLED')
), active_returns AS (
 SELECT r.id,r.status,ri.laptop_id,coalesce(ri.agreed_refund_rmb,ri.expected_refund_rmb,0) refundable_rmb,
   c.landed_cost_vnd,c.cost_status
 FROM supplier_returns r JOIN supplier_return_items ri ON ri.supplier_return_id=r.id
 LEFT JOIN laptop_landed_costs c ON c.laptop_id=ri.laptop_id
 WHERE r.status NOT IN('REFUNDED','REPLACED','REJECTED','CLOSED','CANCELLED')
), refunds AS (SELECT supplier_return_id,sum(amount_rmb) amount_rmb FROM supplier_refunds GROUP BY supplier_return_id)
SELECT jsonb_build_object(
 'generated_at',timezone('utc',now()),'thresholds',jsonb_build_object('warning_days',30,'critical_days',60),
 'available',jsonb_build_object('units',(SELECT count(*) FROM available),
   'cost_complete',(SELECT count(*) FROM available WHERE cost_status='COMPLETE'),
   'cost_incomplete',(SELECT count(*) FROM available WHERE cost_status='INCOMPLETE'),
   'legacy',0,'missing_aging_timestamp',(SELECT count(*) FROM available WHERE available_for_sale_at IS NULL),
   'known_inventory_cost_vnd',(SELECT coalesce(sum(landed_cost_vnd),0) FROM available WHERE cost_status='COMPLETE')),
 'aging',coalesce((SELECT jsonb_agg(to_jsonb(aging) ORDER BY sort_order) FROM aging),'[]'::jsonb),
 'state_summary',(SELECT coalesce(jsonb_object_agg(state,units),'{}'::jsonb) FROM states),
 'transit',jsonb_build_object('units',(SELECT count(*) FROM laptops WHERE status='in_transit'),
   'purchase_value_vnd',(SELECT coalesce(sum((purchase_price_rmb+shipping_rmb)*purchase_exchange_rate),0) FROM laptops WHERE status='in_transit'),
   'by_stage',jsonb_build_object('IN_TRANSIT',(SELECT count(*) FROM laptops WHERE status='in_transit'))),
 'qc',jsonb_build_object('waiting_qc',jsonb_build_object('units',(SELECT count(*) FROM laptops WHERE status='waiting_qc'),'oldest_age',0),
   'qc_in_progress',jsonb_build_object('units',(SELECT count(*) FROM qc_inspections WHERE status='IN_PROGRESS'),'oldest_age',0),
   'qc_failed',jsonb_build_object('units',0,'oldest_age',0),
   'known_cost_vnd',(SELECT coalesce(sum(c.landed_cost_vnd),0) FROM laptops l JOIN laptop_landed_costs c ON c.laptop_id=l.id WHERE l.status='waiting_qc' AND c.cost_status='COMPLETE')),
 'repairs',jsonb_build_object('active_jobs',(SELECT count(*) FROM active_repairs),
   'waiting_parts',(SELECT count(*) FROM active_repairs WHERE status='WAITING_PART'),'oldest_age',0,
   'accumulated_cost_vnd',(SELECT coalesce(sum(total_cost_vnd),0) FROM active_repairs),
   'known_laptop_cost_vnd',(SELECT coalesce(sum(landed_cost_vnd),0) FROM active_repairs WHERE cost_status='COMPLETE')),
 'supplier_returns',jsonb_build_object('pending',(SELECT count(DISTINCT id) FROM active_returns),
   'shipped',(SELECT count(DISTINCT id) FROM active_returns WHERE status IN('SHIPPED','SUPPLIER_RECEIVED')),
   'waiting_refund',(SELECT count(DISTINCT id) FROM active_returns WHERE status IN('WAITING_REFUND','PARTIALLY_RESOLVED')),
   'waiting_replacement',(SELECT count(DISTINCT id) FROM active_returns WHERE status='WAITING_REPLACEMENT'),
   'known_cost_exposure_vnd',(SELECT coalesce(sum(landed_cost_vnd),0) FROM active_returns WHERE cost_status='COMPLETE'),
   'refund_pending_rmb',(SELECT coalesce(sum(greatest(x.refundable-coalesce(rf.amount_rmb,0),0)),0)
      FROM(SELECT id,sum(refundable_rmb) refundable FROM active_returns GROUP BY id)x LEFT JOIN refunds rf ON rf.supplier_return_id=x.id)),
 'slow_moving',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY age_days DESC,laptop_id) FROM(
   SELECT id laptop_id,serial,name model,location,age_days,landed_cost_vnd,cost_status,
    round(coalesce(retail_price_vnd,0)*1000000,0) selling_price_vnd,
    CASE WHEN cost_status='COMPLETE' THEN round(coalesce(retail_price_vnd,0)*1000000-landed_cost_vnd,0) END gross_margin_potential_vnd
   FROM available WHERE age_days>=30 ORDER BY age_days DESC,id LIMIT 25)x),'[]'::jsonb)
)
$$;

CREATE OR REPLACE FUNCTION public.refresh_laptop_inventory(p_laptop_id bigint)
RETURNS public.laptops LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l laptops%ROWTYPE; has_committed boolean; has_reserved boolean;
BEGIN
  IF p_laptop_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO l FROM laptops WHERE id=p_laptop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop % không tồn tại',p_laptop_id; END IF;
  UPDATE orders SET laptop_locked=public.order_uses_laptop(laptop_id,is_active,order_status,payment_status,reservation_expires_at)
  WHERE laptop_id=p_laptop_id AND laptop_locked IS DISTINCT FROM public.order_uses_laptop(laptop_id,is_active,order_status,payment_status,reservation_expires_at);
  SELECT exists(SELECT 1 FROM orders WHERE laptop_id=p_laptop_id
    AND public.order_uses_laptop(laptop_id,is_active,order_status,payment_status,reservation_expires_at)
    AND order_status IN('prepared','shipping','done')) INTO has_committed;
  SELECT exists(SELECT 1 FROM orders WHERE (laptop_id=p_laptop_id OR requested_laptop_id=p_laptop_id)
    AND is_active IS TRUE AND coalesce(payment_status,'')<>'refunded'
    AND coalesce(order_status,'') NOT IN('cancelled','returned')
    AND (public.order_uses_laptop(laptop_id,is_active,order_status,payment_status,reservation_expires_at)
      OR ((order_status='deposited' OR payment_status='deposited')
        AND (reservation_expires_at IS NULL OR reservation_expires_at>CURRENT_TIMESTAMP)))) INTO has_reserved;
  PERFORM set_config('app.laptop_transition','on',true);
  UPDATE laptops SET status=CASE
      WHEN status IN('in_transit','waiting_qc','repair','supplier_return','ignored') THEN status
      WHEN has_committed THEN 'sold'
      WHEN has_reserved THEN 'reserved'
      ELSE 'available' END,
    sold_at=CASE WHEN has_committed THEN coalesce(sold_at,timezone('utc',now())) ELSE sold_at END
  WHERE id=p_laptop_id RETURNING * INTO l;
  RETURN l;
END $$;

CREATE OR REPLACE FUNCTION public.guard_order_sellable_laptop()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE candidate_id bigint; candidate_status text;
BEGIN
  candidate_id:=coalesce(NEW.laptop_id,NEW.requested_laptop_id);
  IF candidate_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND candidate_id=coalesce(OLD.laptop_id,OLD.requested_laptop_id)
     AND NEW.laptop_id IS NOT DISTINCT FROM OLD.laptop_id
     AND NEW.requested_laptop_id IS NOT DISTINCT FROM OLD.requested_laptop_id THEN RETURN NEW; END IF;
  SELECT status INTO candidate_status FROM laptops WHERE id=candidate_id AND is_active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop không tồn tại hoặc đã ngừng sử dụng'; END IF;
  IF candidate_status NOT IN('available','reserved') THEN
    RAISE EXCEPTION 'Laptop chưa sẵn sàng để bán (trạng thái: %)',candidate_status;
  END IF;
  RETURN NEW;
END $$;

-- QC keeps the laptop in WAITING_QC while the inspection is in progress. A
-- completed PASS is the only path to AVAILABLE; FAIL remains WAITING_QC.
CREATE OR REPLACE FUNCTION public.start_qc_inspection(p_laptop_id bigint,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l laptops%ROWTYPE; q qc_inspections%ROWTYPE;
BEGIN
 SELECT * INTO q FROM qc_inspections WHERE idempotency_key=p_idempotency_key;
 IF FOUND THEN RETURN to_jsonb(q); END IF;
 IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Idempotency key không hợp lệ'; END IF;
 SELECT * INTO l FROM laptops WHERE id=p_laptop_id AND is_active IS TRUE FOR UPDATE;
 IF NOT FOUND OR l.status<>'waiting_qc' THEN RAISE EXCEPTION 'Laptop không ở trạng thái Chờ QC'; END IF;
 IF EXISTS(SELECT 1 FROM qc_inspections WHERE laptop_id=l.id AND status='IN_PROGRESS') THEN RAISE EXCEPTION 'Laptop đang có phiên QC hoạt động'; END IF;
 INSERT INTO qc_inspections(inspection_code,laptop_id,started_by,idempotency_key)
 VALUES(next_qc_inspection_code(),l.id,p_actor,p_idempotency_key) RETURNING * INTO q;
 PERFORM seed_qc_checklist(q.id,p_actor);
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
 VALUES('QC_INSPECTION',q.id::text,'CREATE',jsonb_build_object('inspection_code',q.inspection_code,'laptop_id',l.id),p_actor);
 RETURN to_jsonb(q);
EXCEPTION WHEN unique_violation THEN
 SELECT * INTO q FROM qc_inspections WHERE idempotency_key=p_idempotency_key;
 IF FOUND THEN RETURN to_jsonb(q); END IF; RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.complete_qc_inspection(p_inspection_id uuid,p_result text,p_mainboard_status text,p_charger_status text,p_cosmetic_grade text,p_notes text,p_items jsonb,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q qc_inspections%ROWTYPE; l laptops%ROWTYPE; failed_keys text; incomplete_keys text;
BEGIN
 SELECT * INTO q FROM qc_inspections WHERE id=p_inspection_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên QC'; END IF;
 IF q.status='COMPLETED' AND q.completion_idempotency_key=p_idempotency_key THEN RETURN to_jsonb(q); END IF;
 IF q.status<>'IN_PROGRESS' OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Phiên QC không còn hợp lệ'; END IF;
 IF p_result NOT IN('PASS','FAIL') OR p_mainboard_status NOT IN('ORIGINAL','OFFICIAL_REPLACED','REPAIRED','UNKNOWN')
   OR p_charger_status NOT IN('ORIGINAL','ORIGINAL_US','COMPATIBLE','MISSING','UNKNOWN') THEN RAISE EXCEPTION 'Kết quả QC không hợp lệ'; END IF;
 IF p_cosmetic_grade IS NOT NULL AND p_cosmetic_grade NOT IN('A','B','C','D') THEN RAISE EXCEPTION 'Phân hạng ngoại hình không hợp lệ'; END IF;
 PERFORM save_qc_checklist(q.id,p_items,p_actor);
 SELECT string_agg(check_key,', ' ORDER BY sort_order) INTO failed_keys FROM qc_check_items WHERE qc_inspection_id=q.id AND requirement='REQUIRED' AND result='FAIL';
 SELECT string_agg(check_key,', ' ORDER BY sort_order) INTO incomplete_keys FROM qc_check_items WHERE qc_inspection_id=q.id AND requirement='REQUIRED' AND result IN('NOT_TESTED','NOT_APPLICABLE');
 IF p_result='PASS' AND (failed_keys IS NOT NULL OR incomplete_keys IS NOT NULL OR p_mainboard_status='REPAIRED' OR p_charger_status='MISSING') THEN RAISE EXCEPTION 'Không thể PASS khi checklist bắt buộc chưa đạt'; END IF;
 SELECT * INTO l FROM laptops WHERE id=q.laptop_id FOR UPDATE;
 IF l.status<>'waiting_qc' THEN RAISE EXCEPTION 'Trạng thái laptop không khớp phiên QC'; END IF;
 UPDATE qc_inspections SET status='COMPLETED',result=p_result,completed_by=p_actor,completed_at=timezone('utc',now()),
  completion_idempotency_key=p_idempotency_key,overall_notes=left(coalesce(p_notes,''),5000),mainboard_status=p_mainboard_status,
  charger_status=p_charger_status,cosmetic_grade=p_cosmetic_grade WHERE id=q.id RETURNING * INTO q;
 PERFORM set_config('app.laptop_transition','on',true);
 UPDATE laptops SET status=CASE WHEN p_result='PASS' THEN 'available' ELSE 'waiting_qc' END,
  available_for_sale_at=CASE WHEN p_result='PASS' THEN coalesce(available_for_sale_at,timezone('utc',now())) ELSE NULL END,
  condition_note=CASE WHEN btrim(coalesce(p_notes,''))<>'' THEN left(p_notes,2000) ELSE condition_note END
 WHERE id=l.id;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
 VALUES('QC_INSPECTION',q.id::text,'UPDATE',jsonb_build_object('result',p_result,'laptop_id',l.id),p_actor);
 RETURN to_jsonb(q);
END $$;

CREATE OR REPLACE FUNCTION public.start_repair_job(p_data jsonb,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l laptops%ROWTYPE; j repair_jobs%ROWTYPE; sid text:=nullif(p_data->>'source_id',''); assignee uuid:=nullif(p_data->>'assigned_to','')::uuid;
BEGIN
 SELECT * INTO j FROM repair_jobs WHERE idempotency_key=p_idempotency_key; IF FOUND THEN RETURN to_jsonb(j); END IF;
 PERFORM validate_repair_assignee(assignee);
 SELECT * INTO l FROM laptops WHERE id=(p_data->>'laptop_id')::bigint AND is_active FOR UPDATE;
 IF NOT FOUND OR l.status<>'waiting_qc' THEN RAISE EXCEPTION 'Laptop không ở trạng thái được tạo phiếu sửa'; END IF;
 IF p_data->>'source_type'='QC' AND (sid IS NULL OR NOT EXISTS(SELECT 1 FROM qc_inspections WHERE id::text=sid AND laptop_id=l.id AND result='FAIL')) THEN RAISE EXCEPTION 'QC nguồn không hợp lệ'; END IF;
 INSERT INTO repair_jobs(repair_code,laptop_id,source_type,source_id,reported_issue,priority,assigned_to,requires_re_qc,created_by,idempotency_key)
 VALUES(next_repair_code(),l.id,p_data->>'source_type',sid,btrim(p_data->>'reported_issue'),coalesce(p_data->>'priority','NORMAL'),assignee,true,p_actor,p_idempotency_key) RETURNING * INTO j;
 PERFORM set_config('app.laptop_transition','on',true); UPDATE laptops SET status='repair',available_for_sale_at=NULL WHERE id=l.id;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('REPAIR_JOB',j.id::text,'CREATE',jsonb_build_object('repair_code',j.repair_code,'laptop_id',l.id),p_actor);
 RETURN to_jsonb(j);
END $$;

CREATE OR REPLACE FUNCTION public.complete_repair_job(p_id uuid,p_resolution text,p_outcome text,p_recommended_action text,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j repair_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM repair_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu sửa'; END IF;
 IF j.status='COMPLETED' AND j.completion_idempotency_key=p_idempotency_key THEN RETURN to_jsonb(j); END IF;
 IF j.status<>'TESTING' OR btrim(coalesce(p_resolution,''))='' OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Chỉ có thể hoàn tất phiếu đang TESTING'; END IF;
 IF p_outcome NOT IN('REPAIRED','NOT_REPAIRED','PARTIALLY_REPAIRED','NO_FAULT_FOUND') OR p_recommended_action NOT IN('RE_QC','SUPPLIER_RETURN','NO_FURTHER_ACTION','OTHER') THEN RAISE EXCEPTION 'Kết quả sửa chữa không hợp lệ'; END IF;
 UPDATE repair_jobs SET status='COMPLETED',resolution=left(p_resolution,5000),outcome=p_outcome,recommended_action=p_recommended_action,
  completed_at=timezone('utc',now()),completion_idempotency_key=p_idempotency_key,
  parts_cost_vnd=(SELECT coalesce(sum(total_cost_vnd),0) FROM repair_parts WHERE repair_job_id=p_id)
 WHERE id=p_id RETURNING * INTO j;
 PERFORM set_config('app.laptop_transition','on',true); UPDATE laptops SET status='waiting_qc',available_for_sale_at=NULL WHERE id=j.laptop_id;
 PERFORM sync_laptop_cost_components(j.laptop_id,p_actor);
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('REPAIR_JOB',j.id::text,'UPDATE',jsonb_build_object('status','COMPLETED','outcome',p_outcome,'recommended_action',p_recommended_action),p_actor);
 RETURN to_jsonb(j);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_repair_job(p_id uuid,p_reason text,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j repair_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM repair_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status IN('COMPLETED','CANCELLED') OR btrim(coalesce(p_reason,''))='' THEN
   RAISE EXCEPTION 'Không thể hủy phiếu sửa';
 END IF;
 UPDATE repair_jobs SET status='CANCELLED',resolution=left('Hủy: '||btrim(p_reason),5000),completed_at=timezone('utc',now())
 WHERE id=p_id RETURNING * INTO j;
 PERFORM set_config('app.laptop_transition','on',true);
 UPDATE laptops SET status='waiting_qc',available_for_sale_at=NULL WHERE id=j.laptop_id;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
 VALUES('REPAIR_JOB',j.id::text,'UPDATE',jsonb_build_object('event','REPAIR_CANCELLED','status','CANCELLED','reason',left(p_reason,1000)),p_actor);
 RETURN to_jsonb(j);
END $$;

CREATE OR REPLACE FUNCTION public.expire_reservations(p_actor text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer; laptop_key bigint;
BEGIN
 FOR laptop_key IN SELECT DISTINCT laptop_id FROM reservations WHERE status='ACTIVE' AND expires_at<=timezone('utc',now()) FOR UPDATE LOOP
  UPDATE reservations SET status='EXPIRED',expired_at=timezone('utc',now()),updated_at=timezone('utc',now()) WHERE laptop_id=laptop_key AND status='ACTIVE' AND expires_at<=timezone('utc',now());
  IF NOT EXISTS(SELECT 1 FROM reservations WHERE laptop_id=laptop_key AND status='ACTIVE' AND expires_at>timezone('utc',now())) THEN
   PERFORM set_config('app.laptop_transition','on',true); UPDATE laptops SET status='available' WHERE id=laptop_key AND status='reserved';
  END IF;
 END LOOP;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.create_reservation(p_laptop_id bigint,p_customer_id bigint,p_order_id bigint,p_expires_at timestamptz,p_deposit_payment_id bigint,p_notes text,p_user_id uuid,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r reservations%ROWTYPE; l laptops%ROWTYPE;
BEGIN
 SELECT * INTO r FROM reservations WHERE idempotency_key=p_idempotency_key; IF FOUND THEN RETURN to_jsonb(r); END IF;
 PERFORM expire_reservations(p_actor); SELECT * INTO l FROM laptops WHERE id=p_laptop_id FOR UPDATE;
 IF NOT FOUND OR l.status<>'available' OR NOT l.is_active THEN RAISE EXCEPTION 'Laptop không đủ điều kiện giữ máy'; END IF;
 IF p_expires_at<=timezone('utc',now()) THEN RAISE EXCEPTION 'Thời hạn giữ máy không hợp lệ'; END IF;
 INSERT INTO reservations(reservation_code,laptop_id,customer_id,order_id,status,reserved_by,expires_at,deposit_payment_id,notes,idempotency_key,created_by)
 VALUES(next_salesops_code('RSV','public.reservations'::regclass,'reservation_code'),l.id,p_customer_id,p_order_id,'ACTIVE',p_user_id,p_expires_at,p_deposit_payment_id,left(coalesce(p_notes,''),2000),p_idempotency_key,p_actor) RETURNING * INTO r;
 PERFORM set_config('app.laptop_transition','on',true); UPDATE laptops SET status='reserved' WHERE id=l.id;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('RESERVATION',r.id::text,'CREATE',jsonb_build_object('event','RESERVATION_CREATED','laptop_id',l.id),p_actor);
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_reservation(p_id uuid,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r reservations%ROWTYPE;
BEGIN
 SELECT * INTO r FROM reservations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy reservation'; END IF;
 IF r.status='CANCELLED' THEN RETURN to_jsonb(r); END IF;
 IF r.status<>'ACTIVE' THEN RAISE EXCEPTION 'Chỉ reservation ACTIVE được hủy'; END IF;
 UPDATE reservations SET status='CANCELLED',cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()) WHERE id=r.id RETURNING * INTO r;
 IF NOT EXISTS(SELECT 1 FROM reservations WHERE laptop_id=r.laptop_id AND status='ACTIVE' AND expires_at>timezone('utc',now())) THEN
  PERFORM set_config('app.laptop_transition','on',true); UPDATE laptops SET status='available' WHERE id=r.laptop_id AND status='reserved';
 END IF;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('RESERVATION',r.id::text,'UPDATE',jsonb_build_object('event','RESERVATION_CANCELLED','idempotency_key',p_idempotency_key),p_actor);
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.convert_reservation_to_order(p_id uuid,p_order_id bigint,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r reservations%ROWTYPE; o orders%ROWTYPE; l laptops%ROWTYPE;
BEGIN
 SELECT * INTO r FROM reservations WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy reservation'; END IF;
 IF r.status='CONVERTED' THEN RETURN to_jsonb(r); END IF;
 SELECT * INTO l FROM laptops WHERE id=r.laptop_id FOR UPDATE;
 IF r.status<>'ACTIVE' OR r.expires_at<=timezone('utc',now()) OR l.status<>'reserved' THEN RAISE EXCEPTION 'Reservation không còn hiệu lực'; END IF;
 SELECT * INTO o FROM orders WHERE id=coalesce(p_order_id,r.order_id) AND is_active FOR UPDATE;
 IF NOT FOUND OR o.order_status IN('cancelled','returned','prepared','shipping','done') THEN RAISE EXCEPTION 'Cần draft order hợp lệ để chuyển đổi'; END IF;
 PERFORM set_config('app.reservation_conversion','on',true);
 UPDATE orders SET laptop_id=r.laptop_id,requested_laptop_id=r.laptop_id,reservation_expires_at=r.expires_at,updated_at=timezone('utc',now()) WHERE id=o.id;
 UPDATE reservations SET status='CONVERTED',order_id=o.id,converted_at=timezone('utc',now()),updated_at=timezone('utc',now()) WHERE id=r.id RETURNING * INTO r;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('RESERVATION',r.id::text,'UPDATE',jsonb_build_object('event','RESERVATION_CONVERTED','order_id',o.id,'idempotency_key',p_idempotency_key),p_actor);
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.convert_trade_in_to_inventory(p_id uuid,p_data jsonb,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t trade_ins%ROWTYPE; l laptops%ROWTYPE;
BEGIN
 SELECT * INTO t FROM trade_ins WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy trade-in'; END IF;
 IF t.inventory_laptop_id IS NOT NULL THEN SELECT * INTO l FROM laptops WHERE id=t.inventory_laptop_id; RETURN to_jsonb(l); END IF;
 IF t.status<>'RECEIVED' OR t.agreed_value_vnd<=0 THEN RAISE EXCEPTION 'Trade-in chưa được nhận hợp lệ'; END IF;
 INSERT INTO laptops(serial,name,configuration,category,status,location,is_active,source_type,source_reference_id,received_at,warehouse_date,created_by)
 VALUES(coalesce(nullif(t.serial,''),'TI-'||left(t.id::text,8)),concat_ws(' ',t.brand,t.model),concat_ws(' · ',t.cpu,t.gpu,t.ram,t.ssd),
  coalesce(p_data->>'category','TRADE_IN'),'waiting_qc',coalesce(p_data->>'location','store'),true,'TRADE_IN',t.id::text,timezone('utc',now()),current_date,p_actor) RETURNING * INTO l;
 INSERT INTO laptop_cost_components(laptop_id,cost_type,amount_vnd,source_type,source_id,description,created_by)
 VALUES(l.id,'TRADE_IN_ACQUISITION',t.agreed_value_vnd,'TRADE_IN',t.id::text,'Thu cũ đổi mới '||t.trade_in_code,p_actor);
 UPDATE trade_ins SET status='CONVERTED_TO_INVENTORY',inventory_laptop_id=l.id,updated_at=timezone('utc',now()) WHERE id=t.id;
 RETURN to_jsonb(l);
END $$;

CREATE OR REPLACE FUNCTION public.create_supplier_return(p_data jsonb,p_items jsonb,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r supplier_returns%ROWTYPE; entry jsonb; l laptops%ROWTYPE; requested_supplier uuid:=(p_data->>'supplier_id')::uuid; item_supplier uuid;
BEGIN
 SELECT * INTO r FROM supplier_returns WHERE idempotency_key=p_idempotency_key; IF FOUND THEN RETURN to_jsonb(r); END IF;
 IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Yêu cầu tạo phiếu trả không hợp lệ'; END IF;
 IF NOT EXISTS(SELECT 1 FROM suppliers WHERE id=requested_supplier AND active) THEN RAISE EXCEPTION 'Nhà cung cấp không hợp lệ'; END IF;
 INSERT INTO supplier_returns(return_code,supplier_id,reason,reason_notes,notes,created_by,idempotency_key)
 VALUES(next_supplier_return_code(),requested_supplier,p_data->>'reason',left(coalesce(p_data->>'reason_notes',''),3000),left(coalesce(p_data->>'notes',''),3000),p_actor,p_idempotency_key) RETURNING * INTO r;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO l FROM laptops WHERE id=(entry->>'laptop_id')::bigint AND is_active FOR UPDATE;
  IF NOT FOUND OR l.status NOT IN('waiting_qc','repair') OR l.purchase_batch_id IS NULL THEN RAISE EXCEPTION 'Laptop không đủ điều kiện trả nhà cung cấp'; END IF;
  SELECT supplier_id INTO item_supplier FROM purchase_batches WHERE id=l.purchase_batch_id;
  IF item_supplier IS DISTINCT FROM requested_supplier THEN RAISE EXCEPTION 'Laptop không thuộc nhà cung cấp đã chọn'; END IF;
  IF EXISTS(SELECT 1 FROM repair_jobs WHERE laptop_id=l.id AND status NOT IN('COMPLETED','CANCELLED')) THEN RAISE EXCEPTION 'Laptop còn phiếu sửa đang hoạt động'; END IF;
  INSERT INTO supplier_return_items(supplier_return_id,laptop_id,repair_job_id,qc_inspection_id,reason,condition_notes,expected_refund_rmb,agreed_refund_rmb)
  VALUES(r.id,l.id,nullif(entry->>'repair_job_id','')::uuid,nullif(entry->>'qc_inspection_id','')::uuid,entry->>'reason',left(coalesce(entry->>'condition_notes',''),3000),nullif(entry->>'expected_refund_rmb','')::numeric,nullif(entry->>'agreed_refund_rmb','')::numeric);
 END LOOP;
 INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by) VALUES(r.id,'CREATED',jsonb_build_object('item_count',jsonb_array_length(p_items)),p_actor);
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.transition_supplier_return(p_id uuid,p_target text,p_data jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r supplier_returns%ROWTYPE; resolution text:=nullif(p_data->>'resolution_type','');
BEGIN
 SELECT * INTO r FROM supplier_returns WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu trả nhà cung cấp'; END IF;
 IF NOT ((r.status='DRAFT' AND p_target IN('APPROVED','CANCELLED')) OR (r.status='APPROVED' AND p_target IN('READY_TO_SHIP','CANCELLED')) OR
  (r.status='READY_TO_SHIP' AND p_target IN('SHIPPED','CANCELLED')) OR (r.status='SHIPPED' AND p_target='SUPPLIER_RECEIVED') OR
  (r.status='SUPPLIER_RECEIVED' AND p_target IN('WAITING_REFUND','WAITING_REPLACEMENT','REJECTED')) OR
  (r.status IN('REFUNDED','REPLACED','REJECTED') AND p_target='CLOSED')) THEN RAISE EXCEPTION 'Chuyển trạng thái trả NCC không hợp lệ'; END IF;
 IF p_target='SHIPPED' AND (btrim(coalesce(p_data->>'carrier',r.return_carrier,''))='' OR btrim(coalesce(p_data->>'tracking_number',r.return_tracking_number,''))='') THEN RAISE EXCEPTION 'Cần đơn vị vận chuyển và tracking'; END IF;
 UPDATE supplier_returns SET status=p_target,resolution_type=coalesce(resolution,resolution_type),
  return_carrier=left(coalesce(nullif(p_data->>'carrier',''),return_carrier),160),return_tracking_number=left(coalesce(nullif(p_data->>'tracking_number',''),return_tracking_number),200),
  approved_by=CASE WHEN p_target='APPROVED' THEN p_actor ELSE approved_by END,approved_at=CASE WHEN p_target='APPROVED' THEN timezone('utc',now()) ELSE approved_at END,
  shipped_at=CASE WHEN p_target='SHIPPED' THEN timezone('utc',now()) ELSE shipped_at END,supplier_received_at=CASE WHEN p_target='SUPPLIER_RECEIVED' THEN timezone('utc',now()) ELSE supplier_received_at END,
  closed_at=CASE WHEN p_target IN('CLOSED','CANCELLED') THEN timezone('utc',now()) ELSE closed_at END WHERE id=r.id RETURNING * INTO r;
 IF p_target IN('APPROVED','READY_TO_SHIP','SHIPPED','SUPPLIER_RECEIVED','WAITING_REFUND','WAITING_REPLACEMENT') THEN
  PERFORM set_config('app.laptop_transition','on',true); UPDATE laptops SET status='supplier_return',available_for_sale_at=NULL WHERE id IN(SELECT laptop_id FROM supplier_return_items WHERE supplier_return_id=r.id);
 END IF;
 IF p_target='CANCELLED' THEN
  PERFORM set_config('app.laptop_transition','on',true); UPDATE laptops SET status='waiting_qc' WHERE id IN(SELECT laptop_id FROM supplier_return_items WHERE supplier_return_id=r.id);
  UPDATE supplier_return_items SET status='CANCELLED' WHERE supplier_return_id=r.id;
 END IF;
 IF p_target='SHIPPED' THEN UPDATE supplier_return_items SET status='SHIPPED' WHERE supplier_return_id=r.id; END IF;
 IF p_target='SUPPLIER_RECEIVED' THEN UPDATE supplier_return_items SET status='SUPPLIER_RECEIVED' WHERE supplier_return_id=r.id; END IF;
 INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by) VALUES(r.id,p_target,jsonb_build_object('resolution_type',r.resolution_type),p_actor);
 RETURN to_jsonb(r);
END $$;

DROP FUNCTION IF EXISTS public.link_supplier_replacement(bigint,bigint,bigint,text);
CREATE FUNCTION public.link_supplier_replacement(p_item_id bigint,p_replacement_laptop_id bigint,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item supplier_return_items%ROWTYPE; r supplier_returns%ROWTYPE; replacement laptops%ROWTYPE; replacement_supplier uuid;
BEGIN
 SELECT * INTO item FROM supplier_return_items WHERE id=p_item_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm trả'; END IF;
 SELECT * INTO r FROM supplier_returns WHERE id=item.supplier_return_id FOR UPDATE; IF r.status<>'WAITING_REPLACEMENT' THEN RAISE EXCEPTION 'Phiếu trả chưa chờ replacement'; END IF;
 SELECT * INTO replacement FROM laptops WHERE id=p_replacement_laptop_id FOR UPDATE;
 IF NOT FOUND OR replacement.source_type<>'SUPPLIER_REPLACEMENT' OR replacement.status NOT IN('in_transit','waiting_qc') THEN RAISE EXCEPTION 'Laptop replacement không hợp lệ'; END IF;
 SELECT supplier_id INTO replacement_supplier FROM purchase_batches WHERE id=replacement.purchase_batch_id;
 IF replacement_supplier IS DISTINCT FROM r.supplier_id THEN RAISE EXCEPTION 'Replacement không cùng nhà cung cấp'; END IF;
 UPDATE supplier_return_items SET replacement_laptop_id=replacement.id,status='REPLACED' WHERE id=item.id RETURNING * INTO item;
 IF NOT EXISTS(SELECT 1 FROM supplier_return_items WHERE supplier_return_id=r.id AND status NOT IN('REPLACED','CANCELLED')) THEN UPDATE supplier_returns SET status='REPLACED' WHERE id=r.id; END IF;
 INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by) VALUES(r.id,'REPLACEMENT_LINKED',jsonb_build_object('item_id',item.id,'replacement_laptop_id',replacement.id),p_actor);
 RETURN to_jsonb(item);
END $$;

DELETE FROM app_options WHERE group_key='laptopStatus';
INSERT INTO app_options(group_key,option_key,label,sort_order) VALUES
 ('laptopStatus','in_transit','Chưa về hàng',0),('laptopStatus','waiting_qc','Chờ QC',1),
 ('laptopStatus','available','Sẵn hàng',2),('laptopStatus','reserved','Đã cọc',3),
 ('laptopStatus','sold','Đã bán',4),('laptopStatus','supplier_return','Back lại NCC',5),
 ('laptopStatus','repair','Đang sửa chữa',6),('laptopStatus','ignored','Bỏ qua',7);

REVOKE ALL ON public.operation_requests,public.purchase_batch_summaries,public.unified_inventory,public.laptop_landed_costs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.operation_requests TO service_role;
GRANT SELECT ON public.purchase_batch_summaries,public.unified_inventory,public.laptop_landed_costs TO service_role;
REVOKE ALL ON FUNCTION public.next_purchase_batch_code(date),
 public.create_purchase_batch(jsonb,jsonb,text,text),public.receive_purchase_laptops(jsonb,text,text,text),
 public.receive_unknown_laptop(jsonb,text,text),public.receive_inventory(jsonb,jsonb,text,text,text),
 public.reconcile_unknown_laptop(bigint,bigint,text,text),
 public.update_incoming_tracking(bigint,text,text),public.ignore_incoming_laptop(bigint,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.refresh_laptop_inventory(bigint),public.guard_order_sellable_laptop()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_laptop_purchase_fields(),public.sync_laptop_cost_components(bigint,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guard_laptop_status_transition() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_management_dashboard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_qc_inspection(bigint,text,text),
 public.complete_qc_inspection(uuid,text,text,text,text,text,jsonb,text,text),
 public.start_repair_job(jsonb,text,text),public.complete_repair_job(uuid,text,text,text,text,text),public.cancel_repair_job(uuid,text,text),
 public.expire_reservations(text),public.create_reservation(bigint,bigint,bigint,timestamptz,bigint,text,uuid,text,text),
 public.cancel_reservation(uuid,text,text),public.convert_reservation_to_order(uuid,bigint,text,text),
 public.convert_trade_in_to_inventory(uuid,jsonb,text,text),public.create_supplier_return(jsonb,jsonb,text,text),
 public.transition_supplier_return(uuid,text,jsonb,text),public.link_supplier_replacement(bigint,bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_batch(jsonb,jsonb,text,text),
 public.receive_purchase_laptops(jsonb,text,text,text),public.receive_unknown_laptop(jsonb,text,text),
 public.receive_inventory(jsonb,jsonb,text,text,text),
 public.reconcile_unknown_laptop(bigint,bigint,text,text),public.update_incoming_tracking(bigint,text,text),
 public.ignore_incoming_laptop(bigint,text,text),public.refresh_laptop_inventory(bigint),
 public.sync_laptop_cost_components(bigint,text),public.get_management_dashboard() TO service_role;

REVOKE ALL ON FUNCTION public.record_supplier_payment(bigint,numeric,numeric,text,text,date,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(bigint,numeric,numeric,text,text,date,text,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.start_qc_inspection(bigint,text,text),
 public.complete_qc_inspection(uuid,text,text,text,text,text,jsonb,text,text),
 public.start_repair_job(jsonb,text,text),public.complete_repair_job(uuid,text,text,text,text,text),public.cancel_repair_job(uuid,text,text),
 public.expire_reservations(text),public.create_reservation(bigint,bigint,bigint,timestamptz,bigint,text,uuid,text,text),
 public.cancel_reservation(uuid,text,text),public.convert_reservation_to_order(uuid,bigint,text,text),
 public.convert_trade_in_to_inventory(uuid,jsonb,text,text),public.create_supplier_return(jsonb,jsonb,text,text),
 public.transition_supplier_return(uuid,text,jsonb,text),public.link_supplier_replacement(bigint,bigint,text)
 TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
