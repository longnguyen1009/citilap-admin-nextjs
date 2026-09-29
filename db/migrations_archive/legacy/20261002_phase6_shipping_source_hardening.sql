-- Phase 6 shipping source hardening. Apply after 20261001_phase6_landed_cost_hardening.sql.
-- Current shipments expose one combined shipping source total, not independent
-- CN and VN totals. Therefore one shipment may produce only one authoritative
-- active allocation; cost_type classifies that source but cannot duplicate it.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_cost_allocation(p_shipment_id bigint,p_cost_type text,p_method text,p_exchange_rate numeric,p_items jsonb,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s shipments%ROWTYPE;a cost_allocations%ROWTYPE;row_data record;entry jsonb;source_vnd numeric;allocated numeric:=0;eligible_count integer;base numeric;remainder integer;i integer:=0;amount numeric;
BEGIN
 SELECT * INTO a FROM cost_allocations WHERE idempotency_key=p_idempotency_key;IF FOUND THEN RETURN to_jsonb(a);END IF;
 IF p_cost_type NOT IN('CN_SHIPPING','VN_SHIPPING') OR p_method NOT IN('EQUAL','MANUAL') OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Yêu cầu phân bổ không hợp lệ';END IF;
 SELECT * INTO s FROM shipments WHERE id=p_shipment_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy shipment';END IF;
 IF EXISTS(SELECT 1 FROM cost_allocations WHERE shipment_id=s.id AND status<>'VOIDED') THEN RAISE EXCEPTION 'Chi phí shipment đã được phân bổ; một nguồn vận chuyển không thể phân bổ lần hai';END IF;
 source_vnd:=CASE WHEN s.shipping_cost_vnd>0 THEN round(s.shipping_cost_vnd,0) WHEN s.shipping_cost_rmb>0 AND p_exchange_rate>0 THEN round(s.shipping_cost_rmb*p_exchange_rate,0) ELSE 0 END;
 IF source_vnd<=0 THEN RAISE EXCEPTION 'Shipment chưa có chi phí VND hoặc tỷ giá RMB hợp lệ';END IF;
 SELECT count(*) INTO eligible_count FROM shipment_items WHERE shipment_id=s.id AND status='RECEIVED' AND laptop_id IS NOT NULL;
 IF eligible_count=0 THEN RAISE EXCEPTION 'Shipment chưa có laptop đã nhận để phân bổ';END IF;
 IF p_method='MANUAL' AND (jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<>eligible_count) THEN RAISE EXCEPTION 'Manual allocation phải bao gồm toàn bộ laptop đã nhận';END IF;
 INSERT INTO cost_allocations(shipment_id,cost_type,method,source_amount_vnd,source_amount_rmb,exchange_rate,idempotency_key,created_by)
 VALUES(s.id,p_cost_type,p_method,source_vnd,CASE WHEN s.shipping_cost_vnd=0 THEN s.shipping_cost_rmb ELSE NULL END,CASE WHEN s.shipping_cost_vnd=0 THEN p_exchange_rate ELSE NULL END,p_idempotency_key,p_actor) RETURNING * INTO a;
 IF p_method='EQUAL' THEN
  base:=floor(source_vnd/eligible_count);remainder:=(source_vnd-base*eligible_count)::integer;
  FOR row_data IN SELECT id,laptop_id FROM shipment_items WHERE shipment_id=s.id AND status='RECEIVED' AND laptop_id IS NOT NULL ORDER BY id LOOP i:=i+1;amount:=base+CASE WHEN i<=remainder THEN 1 ELSE 0 END;INSERT INTO cost_allocation_items(cost_allocation_id,shipment_item_id,laptop_id,amount_vnd) VALUES(a.id,row_data.id,row_data.laptop_id,amount);allocated:=allocated+amount;END LOOP;
 ELSE
  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   SELECT id,laptop_id INTO row_data FROM shipment_items WHERE id=(entry->>'shipment_item_id')::bigint AND shipment_id=s.id AND status='RECEIVED' AND laptop_id=(entry->>'laptop_id')::bigint;
   IF NOT FOUND OR coalesce((entry->>'amount_vnd')::numeric,-1)<0 OR (entry->>'amount_vnd')::numeric<>round((entry->>'amount_vnd')::numeric,0) THEN RAISE EXCEPTION 'Allocation item không hợp lệ';END IF;
   amount:=(entry->>'amount_vnd')::numeric;INSERT INTO cost_allocation_items(cost_allocation_id,shipment_item_id,laptop_id,amount_vnd) VALUES(a.id,row_data.id,row_data.laptop_id,amount);allocated:=allocated+amount;
  END LOOP;
 END IF;
 IF allocated<>source_vnd THEN RAISE EXCEPTION 'Tổng phân bổ (%) phải bằng source cost (%)',allocated,source_vnd;END IF;
 UPDATE cost_allocations SET status='FINALIZED',finalized_by=p_actor,finalized_at=timezone('utc',now()) WHERE id=a.id RETURNING * INTO a;
 INSERT INTO laptop_cost_components(laptop_id,cost_type,amount_vnd,source_type,source_id,allocation_batch_id,description,occurred_at,created_by) SELECT laptop_id,a.cost_type,amount_vnd,'COST_ALLOCATION',a.id::text,a.id,'Phân bổ shipment '||s.shipment_code,coalesce(s.received_at,timezone('utc',now())),p_actor FROM cost_allocation_items WHERE cost_allocation_id=a.id;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('COST_ALLOCATION',a.id::text,'CREATE',jsonb_build_object('event','COST_ALLOCATION_FINALIZED','shipment_id',s.id,'method',a.method,'cost_type',a.cost_type,'amount_vnd',source_vnd),p_actor);RETURN to_jsonb(a);
EXCEPTION WHEN unique_violation THEN SELECT * INTO a FROM cost_allocations WHERE idempotency_key=p_idempotency_key;IF FOUND THEN RETURN to_jsonb(a);END IF;RAISE;
END $$;

REVOKE ALL ON FUNCTION public.create_cost_allocation(bigint,text,text,numeric,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_cost_allocation(bigint,text,text,numeric,jsonb,text,text) TO service_role;
COMMIT;
