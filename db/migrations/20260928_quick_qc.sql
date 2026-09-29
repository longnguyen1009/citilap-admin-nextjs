BEGIN;
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS disposition text
  CHECK (disposition IN ('PASS','FAIL','REPAIR','RETURN_CN'));
-- Summary decisions preserve actual measurements; never autofill the checklist.
DROP TRIGGER IF EXISTS sync_completed_qc_product ON public.qc_inspections;
CREATE TRIGGER sync_completed_qc_product AFTER UPDATE OF status ON public.qc_inspections
FOR EACH ROW WHEN (NEW.disposition IS NULL) EXECUTE FUNCTION public.sync_completed_qc_product();

CREATE OR REPLACE FUNCTION public.complete_quick_qc(
  p_inspection_id uuid, p_disposition text, p_notes text, p_actor text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE q qc_inspections%ROWTYPE; l laptops%ROWTYPE; linked jsonb; target text;
BEGIN
  IF coalesce(p_disposition,'') NOT IN ('PASS','FAIL','REPAIR','RETURN_CN')
    OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'Kết quả QC không hợp lệ';
  END IF;
  SELECT * INTO q FROM qc_inspections WHERE id=p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên QC'; END IF;
  IF q.status='COMPLETED' AND q.completion_idempotency_key=p_idempotency_key
    AND q.disposition=p_disposition THEN RETURN to_jsonb(q); END IF;
  IF q.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Phiên QC đã kết thúc'; END IF;
  SELECT * INTO l FROM laptops WHERE id=q.laptop_id AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND OR l.status<>'waiting_qc' THEN RAISE EXCEPTION 'Máy không còn ở trạng thái chờ QC'; END IF;
  IF EXISTS(SELECT 1 FROM repair_jobs WHERE laptop_id=l.id AND status NOT IN ('COMPLETED','CANCELLED'))
    OR EXISTS(SELECT 1 FROM supplier_return_items WHERE laptop_id=l.id AND status NOT IN ('REFUNDED','REPLACED','REJECTED','CANCELLED')) THEN
    RAISE EXCEPTION 'Máy còn phiếu sửa hoặc trả nhà cung cấp đang xử lý';
  END IF;
  IF p_disposition='RETURN_CN' AND (l.purchase_batch_id IS NULL OR l.source_type='UNKNOWN') THEN
    RAISE EXCEPTION 'Cần đối chiếu nhà cung cấp và lô mua trước khi BACK về TQ';
  END IF;
  UPDATE qc_inspections SET status='COMPLETED',
    result=CASE WHEN p_disposition='PASS' THEN 'PASS' ELSE 'FAIL' END,
    disposition=p_disposition, overall_notes=left(coalesce(p_notes,''),5000),
    completed_by=p_actor,completed_at=now(),completion_idempotency_key=p_idempotency_key
  WHERE id=q.id RETURNING * INTO q;
  target:=CASE p_disposition WHEN 'PASS' THEN 'available' WHEN 'REPAIR' THEN 'repair'
    WHEN 'RETURN_CN' THEN 'supplier_return' ELSE 'waiting_qc' END;
  IF p_disposition='REPAIR' THEN
    linked:=start_repair_job(jsonb_build_object('laptop_id',l.id,'source_type','QC','source_id',q.id,
      'reported_issue',coalesce(nullif(btrim(p_notes),''),'QC: Cần sửa chữa')),
      p_actor,'qc-repair-'||q.id::text);
  ELSIF p_disposition='RETURN_CN' THEN
    linked:=create_supplier_return(jsonb_build_object('reason','OTHER','reason_notes',coalesce(p_notes,'')),
      jsonb_build_array(jsonb_build_object('laptop_id',l.id,'qc_inspection_id',q.id,
        'reason','OTHER','condition_notes',coalesce(p_notes,''))),p_actor,'qc-return-'||q.id::text);
  ELSE
    PERFORM set_config('app.laptop_transition','on',true);
    UPDATE laptops SET status=target,
      available_for_sale_at=CASE WHEN p_disposition='PASS' THEN now() ELSE NULL END
    WHERE id=l.id;
  END IF;
  INSERT INTO stock_movements(laptop_id,movement_type,reference_type,reference_id,note,performed_by)
  VALUES(l.id,'QC_'||p_disposition,'QC_INSPECTION',q.id::text,coalesce(p_notes,''),p_actor);
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('QC_INSPECTION',q.id::text,'UPDATE',jsonb_build_object('disposition',p_disposition,
    'laptop_id',l.id,'status',target,'linked_record',linked),p_actor);
  RETURN to_jsonb(q);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_quick_qc(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_quick_qc(uuid,text,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
