BEGIN;
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS qc_details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS detail_snapshot jsonb;

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
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS laptops_qc_details ON public.laptops;
CREATE TRIGGER laptops_qc_details BEFORE INSERT OR UPDATE OF qc_details ON public.laptops
FOR EACH ROW EXECUTE FUNCTION public.validate_product_qc_details();

CREATE OR REPLACE FUNCTION public.complete_qc_with_details(p_inspection_id uuid,p_disposition text,p_notes text,p_actor text,p_idempotency_key text,p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q qc_inspections%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO q FROM qc_inspections WHERE id=p_inspection_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên QC'; END IF;
 IF q.status='COMPLETED' AND q.completion_idempotency_key=p_idempotency_key AND q.disposition=p_disposition THEN RETURN to_jsonb(q); END IF;
 IF q.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Phiên QC đã kết thúc'; END IF;
 UPDATE laptops SET qc_details=p_details WHERE id=q.laptop_id;
 UPDATE qc_inspections SET detail_snapshot=p_details WHERE id=q.id;
 result:=complete_quick_qc(p_inspection_id,p_disposition,p_notes,p_actor,p_idempotency_key);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.complete_qc_with_details(uuid,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_qc_with_details(uuid,text,text,text,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
