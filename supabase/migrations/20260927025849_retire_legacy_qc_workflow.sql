-- Apply after db/migrations/20260928_quick_qc.sql.
-- Retains historical inspections and checklist rows; retires only old writers.
BEGIN;
CREATE OR REPLACE FUNCTION public.start_qc_inspection(p_laptop_id bigint,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE l laptops%ROWTYPE; q qc_inspections%ROWTYPE;
BEGIN
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'Mã chống gửi trùng không hợp lệ';
  END IF;
  SELECT * INTO l FROM laptops WHERE id=p_laptop_id AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy máy'; END IF;
  SELECT * INTO q FROM qc_inspections WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF q.laptop_id<>l.id THEN RAISE EXCEPTION 'Mã chống gửi trùng đã dùng cho máy khác'; END IF;
    RETURN to_jsonb(q);
  END IF;
  IF l.status<>'waiting_qc' THEN RAISE EXCEPTION 'Máy không ở trạng thái chờ QC'; END IF;
  SELECT * INTO q FROM qc_inspections WHERE laptop_id=l.id AND status='IN_PROGRESS';
  IF FOUND THEN RETURN to_jsonb(q); END IF;
  INSERT INTO qc_inspections(inspection_code,laptop_id,started_by,idempotency_key)
  VALUES(next_qc_inspection_code(),l.id,p_actor,p_idempotency_key) RETURNING * INTO q;
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('QC_INSPECTION',q.id::text,'CREATE',jsonb_build_object('laptop_id',l.id,'inspection_code',q.inspection_code),p_actor);
  RETURN to_jsonb(q);
END;
$$;
DROP TRIGGER IF EXISTS sync_completed_qc_product ON public.qc_inspections;
DROP FUNCTION IF EXISTS public.sync_completed_qc_product();
DROP FUNCTION IF EXISTS public.complete_qc_inspection(uuid,text,text,text,text,text,jsonb,text,text);
DROP FUNCTION IF EXISTS public.save_qc_checklist(uuid,jsonb,text);
DROP FUNCTION IF EXISTS public.seed_qc_checklist(uuid,text);
-- The four-argument overload is a retired stub; current repairs use six arguments.
DROP FUNCTION IF EXISTS public.complete_repair_job(uuid,text,text,text);
REVOKE ALL ON FUNCTION public.start_qc_inspection(bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_qc_inspection(bigint,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
