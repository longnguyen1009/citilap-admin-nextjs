-- Phase 5 completion: replacement lineage, uniqueness and closed-history immutability.
-- Apply after 20260928_phase5_supplier_returns.sql.
BEGIN;

ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS replacement_for_return_item_id bigint;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='purchase_items_replacement_return_item_fk') THEN
  ALTER TABLE public.purchase_items ADD CONSTRAINT purchase_items_replacement_return_item_fk
   FOREIGN KEY(replacement_for_return_item_id) REFERENCES public.supplier_return_items(id) ON DELETE RESTRICT;
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_items_replacement_return_item_unique
 ON public.purchase_items(replacement_for_return_item_id) WHERE replacement_for_return_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_return_items_replacement_purchase_unique
 ON public.supplier_return_items(replacement_purchase_item_id) WHERE replacement_purchase_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_return_items_replacement_laptop_unique
 ON public.supplier_return_items(replacement_laptop_id) WHERE replacement_laptop_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_supplier_replacement(p_item_id bigint,p_replacement_purchase_item_id bigint,p_replacement_laptop_id bigint,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item supplier_return_items%ROWTYPE;r supplier_returns%ROWTYPE;pi purchase_items%ROWTYPE;replacement_supplier uuid;replacement_laptop bigint;
BEGIN
 SELECT * INTO item FROM supplier_return_items WHERE id=p_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy sản phẩm trả';END IF;
 SELECT * INTO r FROM supplier_returns WHERE id=item.supplier_return_id FOR UPDATE;
 IF item.status='REPLACED' AND item.replacement_purchase_item_id=p_replacement_purchase_item_id THEN RETURN to_jsonb(item);END IF;
 IF r.status<>'WAITING_REPLACEMENT' OR r.resolution_type<>'REPLACEMENT' THEN RAISE EXCEPTION 'Phiếu trả chưa chờ replacement hợp lệ';END IF;
 SELECT * INTO pi FROM purchase_items WHERE id=p_replacement_purchase_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy purchase item replacement';END IF;
 SELECT pb.supplier_id INTO replacement_supplier FROM purchase_items pi2 JOIN purchase_batches pb ON pb.id=pi2.purchase_batch_id WHERE pi2.id=p_replacement_purchase_item_id;
 IF replacement_supplier IS DISTINCT FROM r.supplier_id THEN RAISE EXCEPTION 'Replacement không cùng nhà cung cấp';END IF;
 IF pi.purchase_price_rmb<>0 THEN RAISE EXCEPTION 'Replacement miễn phí phải có giá mua bằng 0 để không tăng công nợ nhà cung cấp';END IF;
 IF pi.id=item.purchase_item_id THEN RAISE EXCEPTION 'Không thể dùng sản phẩm gốc làm replacement';END IF;
 IF pi.replacement_for_return_item_id IS NOT NULL AND pi.replacement_for_return_item_id<>item.id THEN RAISE EXCEPTION 'Purchase item đã được dùng cho phiếu trả khác';END IF;
 replacement_laptop:=coalesce(p_replacement_laptop_id,pi.laptop_id);
 IF replacement_laptop IS NOT NULL AND NOT EXISTS(SELECT 1 FROM laptops WHERE id=replacement_laptop AND purchase_item_id=pi.id) THEN RAISE EXCEPTION 'Laptop replacement không khớp purchase item';END IF;
 UPDATE purchase_items SET replacement_for_return_item_id=item.id WHERE id=pi.id;
 UPDATE supplier_return_items SET replacement_purchase_item_id=pi.id,replacement_laptop_id=replacement_laptop,status='REPLACED' WHERE id=item.id RETURNING * INTO item;
 INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by) VALUES(r.id,'REPLACEMENT_LINKED',jsonb_build_object('item_id',item.id,'replacement_purchase_item_id',pi.id,'replacement_laptop_id',replacement_laptop),p_actor);
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('SUPPLIER_RETURN',r.id::text,'UPDATE',jsonb_build_object('event','REPLACEMENT_LINKED','return_item_id',item.id,'replacement_purchase_item_id',pi.id),p_actor);
 IF NOT EXISTS(SELECT 1 FROM supplier_return_items WHERE supplier_return_id=r.id AND status NOT IN('REPLACED','CANCELLED')) THEN
  UPDATE supplier_returns SET status='REPLACED' WHERE id=r.id;
  INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by) VALUES(r.id,'REPLACED',jsonb_build_object('resolution_type','REPLACEMENT'),p_actor);
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('SUPPLIER_RETURN',r.id::text,'UPDATE',jsonb_build_object('status','REPLACED','resolution_type','REPLACEMENT'),p_actor);
 END IF;
 RETURN to_jsonb(item);
EXCEPTION WHEN unique_violation THEN
 SELECT * INTO item FROM supplier_return_items WHERE id=p_item_id;
 IF item.replacement_purchase_item_id=p_replacement_purchase_item_id THEN RETURN to_jsonb(item);END IF;
 RAISE EXCEPTION 'Replacement item hoặc laptop đã được liên kết với phiếu trả khác';
END $$;

CREATE OR REPLACE FUNCTION public.guard_closed_supplier_return_history()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE parent_status text;
BEGIN
 IF TG_TABLE_NAME='supplier_returns' THEN
  IF TG_OP='DELETE' OR OLD.status IN('CLOSED','CANCELLED') THEN RAISE EXCEPTION 'Lịch sử phiếu trả đã đóng là bất biến';END IF;
 ELSE
  SELECT status INTO parent_status FROM supplier_returns WHERE id=coalesce(NEW.supplier_return_id,OLD.supplier_return_id);
  IF TG_OP='DELETE' OR parent_status IN('CLOSED','CANCELLED') THEN RAISE EXCEPTION 'Chi tiết phiếu trả đã đóng là bất biến';END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS supplier_returns_closed_immutable ON public.supplier_returns;
CREATE TRIGGER supplier_returns_closed_immutable BEFORE UPDATE OR DELETE ON public.supplier_returns FOR EACH ROW EXECUTE FUNCTION public.guard_closed_supplier_return_history();
DROP TRIGGER IF EXISTS supplier_return_items_closed_immutable ON public.supplier_return_items;
CREATE TRIGGER supplier_return_items_closed_immutable BEFORE UPDATE OR DELETE ON public.supplier_return_items FOR EACH ROW EXECUTE FUNCTION public.guard_closed_supplier_return_history();
DROP TRIGGER IF EXISTS supplier_return_events_immutable ON public.supplier_return_events;
CREATE TRIGGER supplier_return_events_immutable BEFORE UPDATE OR DELETE ON public.supplier_return_events FOR EACH ROW EXECUTE FUNCTION public.guard_closed_supplier_return_history();

COMMENT ON COLUMN public.purchase_items.replacement_for_return_item_id IS 'Free replacement lineage. purchase_price_rmb must be zero when linked; normal shipment, receiving and QC still apply.';
REVOKE ALL ON FUNCTION public.link_supplier_replacement(bigint,bigint,bigint,text),public.guard_closed_supplier_return_history() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_supplier_replacement(bigint,bigint,bigint,text) TO service_role;
COMMIT;
