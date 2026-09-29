-- Phase 6 live hardening. Apply after 20260930_phase6_landed_cost.sql.
BEGIN;

-- A finalized allocation is an accounting snapshot. Its shipment source and
-- eligible laptop set must not drift underneath it.
CREATE OR REPLACE FUNCTION public.guard_allocated_shipment_cost_source()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (NEW.shipping_cost_vnd IS DISTINCT FROM OLD.shipping_cost_vnd OR
     NEW.shipping_cost_rmb IS DISTINCT FROM OLD.shipping_cost_rmb) AND
    EXISTS(SELECT 1 FROM cost_allocations WHERE shipment_id=OLD.id AND status='FINALIZED') THEN
   RAISE EXCEPTION 'Chi phí shipment đã được phân bổ; cần void/reverse allocation trước khi thay đổi nguồn';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shipments_cost_source_immutable ON public.shipments;
CREATE TRIGGER shipments_cost_source_immutable
BEFORE UPDATE OF shipping_cost_vnd,shipping_cost_rmb ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.guard_allocated_shipment_cost_source();

CREATE OR REPLACE FUNCTION public.guard_allocated_shipment_item()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM cost_allocation_items cai JOIN cost_allocations ca ON ca.id=cai.cost_allocation_id WHERE cai.shipment_item_id=OLD.id AND ca.status='FINALIZED') AND
    (TG_OP='DELETE' OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id OR NEW.purchase_item_id IS DISTINCT FROM OLD.purchase_item_id OR NEW.laptop_id IS DISTINCT FROM OLD.laptop_id OR NEW.status IS DISTINCT FROM OLD.status) THEN
   RAISE EXCEPTION 'Shipment item đã tham gia allocation finalized và không thể thay đổi lineage';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS shipment_items_cost_lineage_immutable ON public.shipment_items;
CREATE TRIGGER shipment_items_cost_lineage_immutable
BEFORE UPDATE OR DELETE ON public.shipment_items
FOR EACH ROW EXECUTE FUNCTION public.guard_allocated_shipment_item();

-- VND accounting is rounded once in PostgreSQL. Historical batch rate remains
-- the only rate used for the purchase component.
CREATE OR REPLACE FUNCTION public.sync_laptop_cost_components(p_laptop_id bigint,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l laptops%ROWTYPE;pi purchase_items%ROWTYPE;pb purchase_batches%ROWTYPE;r repair_jobs%ROWTYPE;purchase_amount numeric;repair_count integer:=0;
BEGIN
 SELECT * INTO l FROM laptops WHERE id=p_laptop_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy laptop';END IF;
 PERFORM set_config('app.cost_component_sync','on',true);
 IF l.purchase_item_id IS NOT NULL THEN
  SELECT * INTO pi FROM purchase_items WHERE id=l.purchase_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop có purchase lineage không hợp lệ';END IF;
  SELECT * INTO pb FROM purchase_batches WHERE id=pi.purchase_batch_id;
  IF FOUND AND pb.exchange_rate IS NOT NULL AND pb.exchange_rate>0 THEN
   purchase_amount:=round(pi.purchase_price_rmb*pb.exchange_rate,0);
   INSERT INTO laptop_cost_components(laptop_id,cost_type,amount_vnd,amount_rmb,exchange_rate,source_type,source_id,description,occurred_at,created_by)
   VALUES(l.id,'PURCHASE',purchase_amount,pi.purchase_price_rmb,pb.exchange_rate,'PURCHASE_ITEM',pi.id::text,'Giá mua từ '||pb.batch_code,pb.purchase_date::timestamptz,p_actor)
   ON CONFLICT(laptop_id,source_type,source_id,cost_type) WHERE source_id IS NOT NULL AND voided_at IS NULL DO UPDATE SET amount_vnd=excluded.amount_vnd,amount_rmb=excluded.amount_rmb,exchange_rate=excluded.exchange_rate,description=excluded.description;
  END IF;
 END IF;
 FOR r IN SELECT * FROM repair_jobs WHERE laptop_id=l.id AND status='COMPLETED' LOOP
  INSERT INTO laptop_cost_components(laptop_id,cost_type,amount_vnd,source_type,source_id,description,occurred_at,created_by)
  VALUES(l.id,'REPAIR',round(r.total_cost_vnd,0),'REPAIR_JOB',r.id::text,'Chi phí '||r.repair_code,coalesce(r.completed_at,r.updated_at),p_actor)
  ON CONFLICT(laptop_id,source_type,source_id,cost_type) WHERE source_id IS NOT NULL AND voided_at IS NULL DO UPDATE SET amount_vnd=excluded.amount_vnd,description=excluded.description;
  repair_count:=repair_count+1;
 END LOOP;
 RETURN jsonb_build_object('laptop_id',l.id,'purchase_cost_vnd',purchase_amount,'repair_jobs_synced',repair_count);
END $$;

CREATE OR REPLACE FUNCTION public.add_manual_laptop_cost(p_laptop_id bigint,p_cost_type text,p_amount_vnd numeric,p_description text,p_occurred_at timestamptz,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE c laptop_cost_components%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM laptops WHERE id=p_laptop_id) THEN RAISE EXCEPTION 'Không tìm thấy laptop';END IF;
 IF p_cost_type NOT IN('RAM_UPGRADE','SSD_UPGRADE','ACCESSORY','CLEANING','OTHER') OR p_amount_vnd<=0 OR p_amount_vnd<>round(p_amount_vnd,0) OR btrim(coalesce(p_description,''))='' OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Chi phí thủ công không hợp lệ';END IF;
 SELECT * INTO c FROM laptop_cost_components WHERE laptop_id=p_laptop_id AND source_type='MANUAL' AND source_id=p_idempotency_key AND cost_type=p_cost_type AND voided_at IS NULL;IF FOUND THEN RETURN to_jsonb(c);END IF;
 INSERT INTO laptop_cost_components(laptop_id,cost_type,amount_vnd,source_type,source_id,description,occurred_at,created_by) VALUES(p_laptop_id,p_cost_type,p_amount_vnd,'MANUAL',p_idempotency_key,left(p_description,1000),coalesce(p_occurred_at,timezone('utc',now())),p_actor) RETURNING * INTO c;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('LAPTOP_COST',c.id::text,'CREATE',jsonb_build_object('event','COST_COMPONENT_ADDED','laptop_id',p_laptop_id,'cost_type',p_cost_type,'amount_vnd',p_amount_vnd),p_actor);RETURN to_jsonb(c);
END $$;

ALTER TABLE public.laptop_cost_components DROP CONSTRAINT IF EXISTS laptop_cost_components_source_identity_check;
ALTER TABLE public.laptop_cost_components ADD CONSTRAINT laptop_cost_components_source_identity_check
 CHECK(source_id IS NOT NULL AND length(btrim(source_id)) BETWEEN 1 AND 100);

REVOKE ALL ON FUNCTION public.guard_allocated_shipment_cost_source(),public.guard_allocated_shipment_item() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_laptop_cost_components(bigint,text),public.add_manual_laptop_cost(bigint,text,numeric,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_laptop_cost_components(bigint,text),public.add_manual_laptop_cost(bigint,text,numeric,text,timestamptz,text,text) TO service_role;
COMMIT;
