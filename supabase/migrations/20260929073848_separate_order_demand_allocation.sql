BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS requested_configuration text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS requested_category text;

-- References describe demand only; a physical allocation alone reserves stock.
CREATE OR REPLACE FUNCTION public.order_uses_laptop(p_laptop_id bigint, p_is_active boolean, p_order_status text, p_payment_status text, p_reservation_expires_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO public, pg_temp AS $$
 SELECT coalesce(p_laptop_id IS NOT NULL AND p_is_active IS TRUE
   AND coalesce(p_order_status,'') NOT IN ('cancelled','returned')
   AND coalesce(p_payment_status,'') <> 'refunded', false);
$$;

DO $$
DECLARE definition text;
BEGIN
 definition := pg_get_functiondef('public.refresh_laptop_inventory(bigint)'::regprocedure);
 IF position('(laptop_id=p_laptop_id OR requested_laptop_id=p_laptop_id)' in definition)=0 THEN
   RAISE EXCEPTION 'Unexpected refresh_laptop_inventory definition';
 END IF;
 EXECUTE replace(definition,'(laptop_id=p_laptop_id OR requested_laptop_id=p_laptop_id)','laptop_id=p_laptop_id');
 definition := pg_get_functiondef('public.guard_order_sellable_laptop()'::regprocedure);
 EXECUTE replace(replace(definition,'coalesce(NEW.laptop_id,NEW.requested_laptop_id)','NEW.laptop_id'),'coalesce(OLD.laptop_id,OLD.requested_laptop_id)','OLD.laptop_id');
 definition := pg_get_functiondef('public.guard_active_reservation_order_assignment()'::regprocedure);
 EXECUTE replace(definition,'(r.laptop_id = NEW.laptop_id OR r.laptop_id = NEW.requested_laptop_id)','r.laptop_id = NEW.laptop_id');
END $$;

CREATE OR REPLACE FUNCTION public.save_order_demand(p_order jsonb, p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO public, pg_temp AS $$
DECLARE saved orders; source laptops;
BEGIN
 SELECT * INTO saved FROM orders WHERE id=(p_result->'order'->>'id')::bigint;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order save did not return an order'; END IF;
 IF p_order ? 'requested_laptop_id' THEN
   SELECT * INTO source FROM laptops WHERE id=nullif(p_order->>'requested_laptop_id','')::bigint;
   UPDATE orders SET requested_laptop_id=source.id,
     requested_configuration=CASE WHEN requested_laptop_id IS DISTINCT FROM source.id OR requested_configuration IS NULL THEN coalesce(source.name,requested_configuration) ELSE requested_configuration END,
     requested_category=CASE WHEN requested_laptop_id IS DISTINCT FROM source.id OR requested_configuration IS NULL THEN coalesce(source.category,requested_category) ELSE requested_category END
   WHERE id=saved.id RETURNING * INTO saved;
 END IF;
 RETURN jsonb_set(p_result,'{order}',to_jsonb(saved));
END $$;

CREATE OR REPLACE FUNCTION public.create_order_with_inventory(p_order jsonb,p_recorded_by text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $$
BEGIN RETURN save_order_demand(p_order,save_order_invoice_fields(p_order,create_order_before_invoice(p_order,p_recorded_by))); END $$;
CREATE OR REPLACE FUNCTION public.update_order_with_inventory(p_order jsonb,p_recorded_by text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $$
BEGIN RETURN save_order_demand(p_order,save_order_invoice_fields(p_order,update_order_before_invoice(p_order,p_recorded_by))); END $$;

UPDATE orders o SET requested_configuration=l.name,requested_category=l.category
FROM laptops l WHERE l.id=coalesce(o.requested_laptop_id,o.laptop_id) AND o.requested_configuration IS NULL;

-- Existing physical allocations remain allocated; references no longer reserve.
DO $$ DECLARE target bigint; BEGIN
 FOR target IN SELECT DISTINCT requested_laptop_id FROM orders WHERE requested_laptop_id IS NOT NULL LOOP
   PERFORM refresh_laptop_inventory(target);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.allocate_order_laptop(p_order_id bigint,p_laptop_id bigint,p_expected_owner bigint DEFAULT NULL,p_actor text DEFAULT 'SYSTEM')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $$
DECLARE target orders; owner orders; machine laptops; previous_id bigint;
BEGIN
 -- Serialize allocation operations, including transfers of different machines.
 PERFORM pg_advisory_xact_lock(726481321);
 SELECT * INTO target FROM orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR target.is_active IS NOT TRUE OR target.order_status IN ('prepared','shipping','done','cancelled','returned') OR target.payment_status='refunded' THEN
   RAISE EXCEPTION 'Đơn không thể phân hoặc đổi máy';
 END IF;
 previous_id:=target.laptop_id;
 IF p_laptop_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(p_laptop_id);
   SELECT * INTO machine FROM laptops WHERE id=p_laptop_id FOR UPDATE;
   IF NOT FOUND OR machine.is_active IS NOT TRUE OR machine.status NOT IN ('available','reserved') THEN RAISE EXCEPTION 'Máy chưa sẵn sàng'; END IF;
   SELECT * INTO owner FROM orders WHERE laptop_id=p_laptop_id AND id<>target.id
     AND order_uses_laptop(laptop_id,is_active,order_status,payment_status,reservation_expires_at) FOR UPDATE;
   IF owner.id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Đơn giữ máy đã thay đổi. Vui lòng tải lại'; END IF;
   IF owner.id IS NOT NULL THEN
     IF owner.order_status IN ('prepared','shipping','done') THEN RAISE EXCEPTION 'Không thể chuyển máy đã chuẩn bị giao'; END IF;
     UPDATE orders SET laptop_id=NULL,laptop_locked=false,profit_vnd=0 WHERE id=owner.id;
   END IF;
 END IF;
 UPDATE orders SET laptop_id=p_laptop_id,laptop_locked=(p_laptop_id IS NOT NULL),reservation_expires_at=NULL WHERE id=target.id;
 PERFORM refresh_laptop_inventory(previous_id);
 IF p_laptop_id IS DISTINCT FROM previous_id THEN PERFORM refresh_laptop_inventory(p_laptop_id); END IF;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
 VALUES('ORDER',target.id::text,'UPDATE',jsonb_build_object('event','LAPTOP_ALLOCATION','previous_laptop_id',previous_id,'laptop_id',p_laptop_id,'previous_order_id',owner.id),p_actor);
 IF owner.id IS NOT NULL THEN
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
 VALUES('ORDER',owner.id::text,'UPDATE',jsonb_build_object('event','LAPTOP_TRANSFERRED','laptop_id',p_laptop_id,'target_order_id',target.id),p_actor);
 END IF;
 RETURN jsonb_build_object('order_id',target.id,'laptop_id',p_laptop_id);
END $$;
REVOKE ALL ON FUNCTION public.save_order_demand(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.allocate_order_laptop(bigint,bigint,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_demand(jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_order_laptop(bigint,bigint,bigint,text) TO service_role;
CREATE OR REPLACE FUNCTION public.require_order_allocation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO public, pg_temp AS $$
BEGIN
 IF NEW.order_status IN ('prepared','shipping','done') AND NEW.laptop_id IS NULL THEN
   RAISE EXCEPTION 'Phải phân máy trước khi chuẩn bị giao hàng';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER orders_require_allocation BEFORE INSERT OR UPDATE OF order_status,laptop_id ON orders
FOR EACH ROW EXECUTE FUNCTION require_order_allocation();
COMMIT;
