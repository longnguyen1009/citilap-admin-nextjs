-- Phase 9 live hardening: cross-workflow sale gates and immutable economic sources.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS laptop_cost_components_trade_in_source_unique
 ON public.laptop_cost_components(source_id)
 WHERE source_type='TRADE_IN' AND cost_type='TRADE_IN_ACQUISITION' AND voided_at IS NULL;

CREATE OR REPLACE FUNCTION public.guard_active_reservation_order_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.laptop_id IS NOT NULL
    AND current_setting('app.reservation_conversion',true) IS DISTINCT FROM 'on'
    AND EXISTS(
      SELECT 1 FROM reservations r
      WHERE r.laptop_id=NEW.laptop_id AND r.status='ACTIVE' AND r.expires_at>timezone('utc',now())
        AND r.order_id IS DISTINCT FROM NEW.id
    ) THEN
  RAISE EXCEPTION 'Laptop đang được giữ cho reservation khác';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_active_reservation_gate ON public.orders;
CREATE TRIGGER orders_active_reservation_gate
 BEFORE INSERT OR UPDATE OF laptop_id,requested_laptop_id ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.guard_active_reservation_order_assignment();

CREATE OR REPLACE FUNCTION public.convert_reservation_to_order(p_id uuid,p_order_id bigint,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r reservations%ROWTYPE;o orders%ROWTYPE;l laptops%ROWTYPE;
BEGIN
 SELECT * INTO r FROM reservations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy reservation';END IF;
 IF r.status='CONVERTED' THEN RETURN to_jsonb(r);END IF;
 SELECT * INTO l FROM laptops WHERE id=r.laptop_id FOR UPDATE;
 IF r.status<>'ACTIVE' OR r.expires_at<=timezone('utc',now()) OR NOT l.is_active OR lower(l.status)<>'available' THEN RAISE EXCEPTION 'Reservation không còn hiệu lực';END IF;
 SELECT * INTO o FROM orders WHERE id=coalesce(p_order_id,r.order_id) AND is_active FOR UPDATE;
 IF NOT FOUND OR o.order_status IN('cancelled','returned','prepared','shipping','done') THEN RAISE EXCEPTION 'Cần draft order hợp lệ để chuyển đổi';END IF;
 IF r.order_id IS NOT NULL AND r.order_id<>o.id THEN RAISE EXCEPTION 'Reservation đã thuộc order khác';END IF;
 IF o.laptop_id IS NOT NULL AND o.laptop_id<>r.laptop_id THEN RAISE EXCEPTION 'Order đã gắn laptop khác';END IF;
 PERFORM set_config('app.reservation_conversion','on',true);
 UPDATE orders SET laptop_id=r.laptop_id,requested_laptop_id=r.laptop_id,reservation_expires_at=r.expires_at,updated_at=timezone('utc',now()) WHERE id=o.id;
 UPDATE reservations SET status='CONVERTED',order_id=o.id,converted_at=timezone('utc',now()),updated_at=timezone('utc',now()) WHERE id=r.id RETURNING * INTO r;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('RESERVATION',r.id::text,'UPDATE',jsonb_build_object('event','RESERVATION_CONVERTED','order_id',o.id,'idempotency_key',p_idempotency_key),p_actor);
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.complete_trade_in_inspection(p_id uuid,p_mainboard_status text,p_findings text,p_checks jsonb,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i trade_in_inspections%ROWTYPE;entry jsonb;
BEGIN
 SELECT * INTO i FROM trade_in_inspections WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy inspection';END IF;
 IF i.status='COMPLETED' THEN RETURN to_jsonb(i);END IF;
 IF p_mainboard_status NOT IN('ORIGINAL','OFFICIAL_REPLACED','REPAIRED','UNKNOWN') OR jsonb_typeof(coalesce(p_checks,'[]'::jsonb))<>'array' OR jsonb_array_length(coalesce(p_checks,'[]'::jsonb))=0 THEN RAISE EXCEPTION 'Kết quả inspection không hợp lệ';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_checks) LOOP
  IF entry->>'result' NOT IN('PASS','FAIL','WARNING','NOT_TESTED') OR btrim(coalesce(entry->>'check_key',''))='' THEN RAISE EXCEPTION 'Checklist không hợp lệ';END IF;
  INSERT INTO trade_in_check_items(inspection_id,check_key,result,notes) VALUES(i.id,upper(left(entry->>'check_key',60)),entry->>'result',left(coalesce(entry->>'notes',''),1000));
 END LOOP;
 UPDATE trade_in_inspections SET status='COMPLETED',mainboard_status=p_mainboard_status,findings=left(coalesce(p_findings,''),5000),completed_at=timezone('utc',now()) WHERE id=i.id RETURNING * INTO i;
 UPDATE trade_ins SET status='QUOTED',updated_at=timezone('utc',now()) WHERE id=i.trade_in_id;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('TRADE_IN_INSPECTION',i.id::text,'UPDATE',jsonb_build_object('event','TRADE_IN_INSPECTION_COMPLETED','idempotency_key',p_idempotency_key),p_actor);
 RETURN to_jsonb(i);
END $$;

CREATE OR REPLACE FUNCTION public.guard_trade_in_economic_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.status IN('ACCEPTED','RECEIVED','CONVERTED_TO_INVENTORY') THEN RAISE EXCEPTION 'Trade-in đã cam kết kinh tế không thể xóa';END IF;
 IF TG_OP='UPDATE' AND OLD.status='INSPECTING' AND NEW.status='ACCEPTED' THEN RAISE EXCEPTION 'Trade-in phải hoàn tất inspection trước khi chấp nhận';END IF;
 IF TG_OP='UPDATE' AND OLD.status IN('ACCEPTED','RECEIVED','CONVERTED_TO_INVENTORY')
    AND (NEW.agreed_value_vnd IS DISTINCT FROM OLD.agreed_value_vnd OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.inventory_laptop_id IS DISTINCT FROM OLD.inventory_laptop_id OR NEW.serial IS DISTINCT FROM OLD.serial) THEN
  IF NOT (OLD.status='RECEIVED' AND NEW.status='CONVERTED_TO_INVENTORY' AND OLD.inventory_laptop_id IS NULL AND NEW.inventory_laptop_id IS NOT NULL AND NEW.agreed_value_vnd=OLD.agreed_value_vnd AND NEW.order_id IS NOT DISTINCT FROM OLD.order_id AND NEW.serial IS NOT DISTINCT FROM OLD.serial) THEN RAISE EXCEPTION 'Nguồn kinh tế trade-in đã cam kết là bất biến';END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS trade_ins_economic_history ON public.trade_ins;
CREATE TRIGGER trade_ins_economic_history BEFORE UPDATE OR DELETE ON public.trade_ins FOR EACH ROW EXECUTE FUNCTION public.guard_trade_in_economic_history();

CREATE OR REPLACE FUNCTION public.guard_commission_history() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.status IN('APPROVED','PAID') THEN RAISE EXCEPTION 'Commission đã duyệt/chi không thể xóa';END IF;
 IF TG_OP='UPDATE' AND OLD.status IN('APPROVED','PAID') AND (NEW.amount_vnd IS DISTINCT FROM OLD.amount_vnd OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.beneficiary_type IS DISTINCT FROM OLD.beneficiary_type OR NEW.beneficiary_user_id IS DISTINCT FROM OLD.beneficiary_user_id OR NEW.beneficiary_name IS DISTINCT FROM OLD.beneficiary_name OR NEW.commission_type IS DISTINCT FROM OLD.commission_type OR NEW.calculation_basis IS DISTINCT FROM OLD.calculation_basis OR NEW.calculation_snapshot_json IS DISTINCT FROM OLD.calculation_snapshot_json) THEN RAISE EXCEPTION 'Commission đã duyệt là bất biến';END IF;
 IF TG_OP='UPDATE' AND OLD.status='PAID' AND NEW.status<>'PAID' THEN RAISE EXCEPTION 'Commission đã chi không thể đổi trạng thái';END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS commissions_immutable ON public.commissions;
CREATE TRIGGER commissions_immutable BEFORE UPDATE OR DELETE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.guard_commission_history();

REVOKE ALL ON FUNCTION guard_active_reservation_order_assignment(),guard_trade_in_economic_history(),guard_commission_history() FROM PUBLIC,anon,authenticated;
COMMIT;
