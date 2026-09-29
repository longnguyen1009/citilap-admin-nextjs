-- Canonical serial/battery live on laptops. Legacy form JSON is input only.
BEGIN;
CREATE OR REPLACE FUNCTION public.validate_product_qc_details() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE entry record; health numeric;
BEGIN
 IF jsonb_typeof(NEW.qc_details) IS DISTINCT FROM 'object' OR octet_length(NEW.qc_details::text)>50000 THEN
   RAISE EXCEPTION 'Chi tiết QC không hợp lệ'; END IF;
 FOR entry IN SELECT * FROM jsonb_each(NEW.qc_details) LOOP
   IF entry.key='batteryHealth' THEN
     IF entry.value<>'null'::jsonb AND entry.value<>'""'::jsonb THEN
       IF jsonb_typeof(entry.value) NOT IN ('number','string') OR (entry.value#>>'{}') !~ '^\d{1,3}$' THEN RAISE EXCEPTION 'Pin phải là số'; END IF;
       health:=(entry.value#>>'{}')::numeric;
       IF health<0 OR health>100 OR health<>trunc(health) THEN RAISE EXCEPTION 'Pin phải từ 0 đến 100'; END IF;
     END IF;
   ELSIF entry.key='serialNumber' THEN
     IF jsonb_typeof(entry.value)<>'string' OR length(btrim(entry.value#>>'{}'))>100 THEN RAISE EXCEPTION 'Serial không hợp lệ'; END IF;
   ELSIF entry.key='cosmeticGrade' THEN
     IF entry.value#>>'{}' NOT IN ('','A','B','C','D') OR jsonb_typeof(entry.value)<>'string' THEN RAISE EXCEPTION 'Ngoại hình không hợp lệ'; END IF;
   ELSE
     IF entry.key NOT IN ('serial','model','cpu','gpu','ram','ssd','mainboard','screen','keyboard','keyboard_backlight','touchpad','camera','microphone','speaker','wifi','bluetooth','usb','usb_c','hdmi','lan','battery','ssd_health','fan','cooling','cpu_stress','gpu_stress','charger','exterior')
       OR jsonb_typeof(entry.value)<>'object'
       OR coalesce(entry.value->>'result','') NOT IN ('NOT_TESTED','PASS','FAIL','WARNING','NOT_APPLICABLE')
       OR length(coalesce(entry.value->>'note',''))>1000 THEN RAISE EXCEPTION 'Mục QC không hợp lệ: %',entry.key; END IF;
   END IF;
 END LOOP;
 IF NEW.qc_details ? 'batteryHealth' THEN NEW.battery_health:=nullif(NEW.qc_details->>'batteryHealth','')::integer; END IF;
 IF NEW.qc_details ? 'serialNumber' AND btrim(NEW.qc_details->>'serialNumber')<>'' THEN NEW.serial:=btrim(NEW.qc_details->>'serialNumber'); END IF;
 IF NEW.qc_details ? 'screen' THEN NEW.screen_status:=CASE NEW.qc_details#>>'{screen,result}' WHEN 'PASS' THEN 'ok' WHEN 'FAIL' THEN 'error' WHEN 'WARNING' THEN 'error' ELSE NULL END; END IF;
 IF NEW.qc_details ? 'mainboard' THEN NEW.mainboard_status:=CASE NEW.qc_details#>>'{mainboard,result}' WHEN 'PASS' THEN 'ok' WHEN 'FAIL' THEN 'error' WHEN 'WARNING' THEN 'error' ELSE NULL END; END IF;
 IF NEW.qc_details ? 'camera' OR NEW.qc_details ? 'microphone' THEN
   NEW.camera_mic_status:=CASE WHEN NEW.qc_details#>>'{camera,result}' IN ('FAIL','WARNING') OR NEW.qc_details#>>'{microphone,result}' IN ('FAIL','WARNING') THEN 'error'
     WHEN NEW.qc_details#>>'{camera,result}'='PASS' AND NEW.qc_details#>>'{microphone,result}'='PASS' THEN 'ok' ELSE NULL END;
 END IF;
 NEW.qc_details:=NEW.qc_details-'serialNumber'-'batteryHealth';
 RETURN NEW;
END $$;

ALTER TABLE public.laptops DISABLE TRIGGER laptops_qc_details;
UPDATE public.laptops SET qc_details=qc_details-'serialNumber'-'batteryHealth' WHERE qc_details ?| ARRAY['serialNumber','batteryHealth'];
ALTER TABLE public.laptops ENABLE TRIGGER laptops_qc_details;
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
    disposition=p_disposition, overall_notes='',
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
