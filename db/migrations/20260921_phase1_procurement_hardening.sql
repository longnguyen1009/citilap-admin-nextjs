-- Phase 1 verification hardening. Apply after 20260920_phase1_procurement.sql.
BEGIN;

ALTER TABLE public.purchase_batches
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_batches_idempotency_unique
  ON public.purchase_batches(idempotency_key) WHERE idempotency_key IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='purchase_batches_id_supplier_unique') THEN
    ALTER TABLE public.purchase_batches ADD CONSTRAINT purchase_batches_id_supplier_unique UNIQUE(id,supplier_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_payments_batch_supplier_fk') THEN
    ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_batch_supplier_fk
      FOREIGN KEY(purchase_batch_id,supplier_id) REFERENCES public.purchase_batches(id,supplier_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_payments_idempotency_not_blank') THEN
    ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_idempotency_not_blank CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 100);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_confirmed_purchase_batch()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.status<>'DRAFT' AND (
    NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.purchase_date IS DISTINCT FROM OLD.purchase_date OR
    NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate OR NEW.subtotal_rmb IS DISTINCT FROM OLD.subtotal_rmb OR
    NEW.domestic_shipping_rmb IS DISTINCT FROM OLD.domestic_shipping_rmb OR NEW.other_cost_rmb IS DISTINCT FROM OLD.other_cost_rmb OR
    NEW.destination IS DISTINCT FROM OLD.destination
  ) THEN RAISE EXCEPTION 'Không thể thay đổi thông tin tài chính của lô đã xác nhận'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_confirmed_purchase_batch_trigger ON public.purchase_batches;
CREATE TRIGGER guard_confirmed_purchase_batch_trigger BEFORE UPDATE ON public.purchase_batches
FOR EACH ROW EXECUTE FUNCTION public.guard_confirmed_purchase_batch();

CREATE OR REPLACE FUNCTION public.guard_confirmed_purchase_item()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE batch_status text;
BEGIN
  SELECT status INTO batch_status FROM purchase_batches WHERE id=coalesce(NEW.purchase_batch_id,OLD.purchase_batch_id);
  IF batch_status<>'DRAFT' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Không thể xóa sản phẩm của lô đã xác nhận'; END IF;
    IF NEW.purchase_batch_id IS DISTINCT FROM OLD.purchase_batch_id OR NEW.supplier_item_ref IS DISTINCT FROM OLD.supplier_item_ref OR
       NEW.brand IS DISTINCT FROM OLD.brand OR NEW.model IS DISTINCT FROM OLD.model OR NEW.cpu IS DISTINCT FROM OLD.cpu OR
       NEW.gpu IS DISTINCT FROM OLD.gpu OR NEW.ram IS DISTINCT FROM OLD.ram OR NEW.ssd IS DISTINCT FROM OLD.ssd OR
       NEW.screen IS DISTINCT FROM OLD.screen OR NEW.purchase_price_rmb IS DISTINCT FROM OLD.purchase_price_rmb OR
       NEW.condition IS DISTINCT FROM OLD.condition THEN
      RAISE EXCEPTION 'Không thể thay đổi sản phẩm hoặc giá mua của lô đã xác nhận';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS guard_confirmed_purchase_item_trigger ON public.purchase_items;
CREATE TRIGGER guard_confirmed_purchase_item_trigger BEFORE UPDATE OR DELETE ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.guard_confirmed_purchase_item();

CREATE OR REPLACE FUNCTION public.prevent_supplier_payment_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Thanh toán nhà cung cấp là sổ bất biến; hãy tạo giao dịch điều chỉnh'; END $$;
DROP TRIGGER IF EXISTS supplier_payments_append_only_trigger ON public.supplier_payments;
CREATE TRIGGER supplier_payments_append_only_trigger BEFORE UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_supplier_payment_mutation();

DROP FUNCTION IF EXISTS public.create_purchase_batch(jsonb,jsonb,text);
CREATE OR REPLACE FUNCTION public.create_purchase_batch(p_batch jsonb,p_items jsonb,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b purchase_batches%ROWTYPE; item jsonb; computed_subtotal numeric := 0;
BEGIN
  SELECT * INTO b FROM purchase_batches WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(b); END IF;
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Idempotency key không hợp lệ'; END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>200 THEN RAISE EXCEPTION 'Lô mua phải có từ 1 đến 200 sản phẩm'; END IF;
  IF NOT EXISTS(SELECT 1 FROM suppliers WHERE id=(p_batch->>'supplier_id')::uuid AND active) THEN RAISE EXCEPTION 'Nhà cung cấp không tồn tại hoặc đã ngừng sử dụng'; END IF;
  IF coalesce((p_batch->>'exchange_rate')::numeric,0)<=0 OR coalesce((p_batch->>'domestic_shipping_rmb')::numeric,0)<0 OR coalesce((p_batch->>'other_cost_rmb')::numeric,0)<0 THEN RAISE EXCEPTION 'Tỷ giá hoặc chi phí không hợp lệ'; END IF;
  IF coalesce(length(p_batch->>'notes'),0)>3000 THEN RAISE EXCEPTION 'Ghi chú quá dài'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE length(btrim(coalesce(x->>'model',''))) NOT BETWEEN 1 AND 240 OR coalesce((x->>'purchase_price_rmb')::numeric,-1)<0) THEN RAISE EXCEPTION 'Sản phẩm có model hoặc giá mua không hợp lệ'; END IF;
  SELECT coalesce(sum((x->>'purchase_price_rmb')::numeric),0) INTO computed_subtotal FROM jsonb_array_elements(p_items) x;
  INSERT INTO purchase_batches(batch_code,supplier_id,purchase_date,exchange_rate,subtotal_rmb,domestic_shipping_rmb,other_cost_rmb,destination,notes,created_by,updated_by,idempotency_key)
  VALUES(next_purchase_batch_code((p_batch->>'purchase_date')::date),(p_batch->>'supplier_id')::uuid,(p_batch->>'purchase_date')::date,
    (p_batch->>'exchange_rate')::numeric,computed_subtotal,coalesce((p_batch->>'domestic_shipping_rmb')::numeric,0),coalesce((p_batch->>'other_cost_rmb')::numeric,0),
    coalesce(nullif(p_batch->>'destination',''),'OTHER'),coalesce(p_batch->>'notes',''),p_actor,p_actor,p_idempotency_key) RETURNING * INTO b;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO purchase_items(purchase_batch_id,supplier_item_ref,brand,model,cpu,gpu,ram,ssd,screen,serial,supplier_serial,purchase_price_rmb,condition,notes)
    VALUES(b.id,left(coalesce(item->>'supplier_item_ref',''),160),left(coalesce(item->>'brand',''),100),btrim(item->>'model'),left(coalesce(item->>'cpu',''),160),left(coalesce(item->>'gpu',''),160),left(coalesce(item->>'ram',''),100),left(coalesce(item->>'ssd',''),100),left(coalesce(item->>'screen',''),160),nullif(left(btrim(item->>'serial'),100),''),nullif(left(btrim(item->>'supplier_serial'),100),''),(item->>'purchase_price_rmb')::numeric,left(coalesce(item->>'condition',''),500),left(coalesce(item->>'notes',''),3000));
  END LOOP;
  RETURN to_jsonb(b);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO b FROM purchase_batches WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(b); END IF;
  RAISE;
END $$;

REVOKE ALL ON FUNCTION public.guard_confirmed_purchase_batch(),public.guard_confirmed_purchase_item(),public.prevent_supplier_payment_mutation(),public.create_purchase_batch(jsonb,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_batch(jsonb,jsonb,text,text) TO service_role;

COMMENT ON TABLE public.supplier_payments IS 'Procurement source-of-truth ledger. It is not mirrored to financial_records; doing so would double count cash outflow.';
COMMIT;
