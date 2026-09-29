-- QC and procurement edit the same current note stored on laptops.condition_note.
BEGIN;

CREATE OR REPLACE FUNCTION public.complete_qc_with_details(
  p_inspection_id uuid,
  p_disposition text,
  p_notes text,
  p_actor text,
  p_idempotency_key text,
  p_details jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  q qc_inspections%ROWTYPE;
  result jsonb;
  shared_note text:=left(coalesce(p_notes,''),2000);
BEGIN
  SELECT * INTO q FROM qc_inspections WHERE id=p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên QC'; END IF;
  IF q.status='COMPLETED' AND q.completion_idempotency_key=p_idempotency_key
     AND q.disposition=p_disposition THEN
    RETURN to_jsonb(q);
  END IF;
  IF q.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Phiên QC đã kết thúc'; END IF;

  UPDATE laptops
  SET qc_details=coalesce(p_details,'{}'::jsonb), condition_note=shared_note
  WHERE id=q.laptop_id;
  UPDATE qc_inspections SET detail_snapshot=coalesce(p_details,'{}'::jsonb) WHERE id=q.id;

  result:=complete_quick_qc(
    p_inspection_id,p_disposition,shared_note,p_actor,p_idempotency_key
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_qc_with_details(uuid,text,text,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_qc_with_details(uuid,text,text,text,text,jsonb)
  TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
