-- Phase 3 live hardening. Apply after 20260924_phase3_qc.sql.
BEGIN;

ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS available_for_sale_at timestamptz;
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS completion_idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS qc_inspections_completion_idempotency_unique ON public.qc_inspections(completion_idempotency_key) WHERE completion_idempotency_key IS NOT NULL;
ALTER TABLE public.qc_check_items ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'OTHER';
ALTER TABLE public.qc_check_items ADD COLUMN IF NOT EXISTS requirement text NOT NULL DEFAULT 'REQUIRED';
ALTER TABLE public.qc_check_items ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.qc_check_items DROP CONSTRAINT IF EXISTS qc_check_items_requirement_check;
ALTER TABLE public.qc_check_items ADD CONSTRAINT qc_check_items_requirement_check CHECK(requirement IN('REQUIRED','OPTIONAL','CONDITIONAL'));

CREATE OR REPLACE FUNCTION public.seed_qc_checklist(p_inspection_id uuid,p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO qc_check_items(qc_inspection_id,check_key,label,category,requirement,sort_order,result,checked_by)
  SELECT p_inspection_id,x.key,x.label,x.category,x.requirement,x.ord,'NOT_TESTED',p_actor FROM (VALUES
    ('serial','Serial','IDENTITY','REQUIRED',10),('model','Model','IDENTITY','REQUIRED',20),
    ('cpu','CPU','CONFIGURATION','REQUIRED',30),('gpu','GPU','CONFIGURATION','REQUIRED',40),('ram','RAM','CONFIGURATION','REQUIRED',50),('ssd','SSD','CONFIGURATION','REQUIRED',60),
    ('mainboard','Mainboard','MAINBOARD','REQUIRED',70),('screen','Màn hình','DISPLAY','REQUIRED',80),
    ('keyboard','Bàn phím','INPUT','REQUIRED',90),('keyboard_backlight','Đèn bàn phím','INPUT','CONDITIONAL',100),('touchpad','Touchpad','INPUT','REQUIRED',110),
    ('camera','Camera','CAMERA_AUDIO','CONDITIONAL',120),('speaker','Loa','CAMERA_AUDIO','OPTIONAL',130),('microphone','Microphone','CAMERA_AUDIO','OPTIONAL',140),
    ('wifi','Wi-Fi','CONNECTIVITY','REQUIRED',150),('bluetooth','Bluetooth','CONNECTIVITY','CONDITIONAL',160),
    ('usb','USB','PORTS','OPTIONAL',170),('usb_c','USB-C','PORTS','CONDITIONAL',180),('hdmi','HDMI','PORTS','CONDITIONAL',190),('lan','LAN','PORTS','CONDITIONAL',200),
    ('battery','Pin','BATTERY_POWER','OPTIONAL',210),('ssd_health','Sức khỏe SSD','STORAGE_MEMORY','REQUIRED',220),
    ('fan','Quạt','THERMAL','REQUIRED',230),('cooling','Tản nhiệt','THERMAL','OPTIONAL',240),
    ('cpu_stress','CPU stress','STRESS','REQUIRED',250),('gpu_stress','GPU stress','STRESS','REQUIRED',260),
    ('charger','Sạc','CHARGER','REQUIRED',270),('exterior','Ngoại hình','COSMETIC','OPTIONAL',280)
  ) AS x(key,label,category,requirement,ord)
  ON CONFLICT(qc_inspection_id,check_key) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.start_qc_inspection(p_laptop_id bigint,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l laptops%ROWTYPE; q qc_inspections%ROWTYPE;
BEGIN
  SELECT * INTO q FROM qc_inspections WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(q); END IF;
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Idempotency key không hợp lệ'; END IF;
  SELECT * INTO l FROM laptops WHERE id=p_laptop_id AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy laptop'; END IF;
  IF l.status NOT IN('waiting_qc','qc_failed') THEN RAISE EXCEPTION 'Laptop không ở trạng thái có thể bắt đầu QC (%)',l.status; END IF;
  INSERT INTO qc_inspections(inspection_code,laptop_id,started_by,idempotency_key) VALUES(next_qc_inspection_code(),l.id,p_actor,p_idempotency_key) RETURNING * INTO q;
  PERFORM seed_qc_checklist(q.id,p_actor);
  PERFORM set_config('app.qc_transition','on',true);
  UPDATE laptops SET status='qc_in_progress',is_locked=true WHERE id=l.id;
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('QC_INSPECTION',q.id::text,'CREATE',jsonb_build_object('inspection_code',q.inspection_code,'laptop_id',l.id,'check_count',28),p_actor);
  RETURN to_jsonb(q);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO q FROM qc_inspections WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(q); END IF; RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.save_qc_checklist(p_inspection_id uuid,p_items jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q qc_inspections%ROWTYPE; item jsonb;
BEGIN
  SELECT * INTO q FROM qc_inspections WHERE id=p_inspection_id FOR UPDATE;
  IF NOT FOUND OR q.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Chỉ có thể cập nhật phiên QC đang thực hiện'; END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Checklist QC không hợp lệ'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF coalesce(item->>'result','') NOT IN('PASS','FAIL','WARNING','NOT_TESTED','NOT_APPLICABLE') THEN RAISE EXCEPTION 'Kết quả checklist không hợp lệ'; END IF;
    IF item->>'result' IN('FAIL','WARNING') AND btrim(coalesce(item->>'note',''))='' THEN RAISE EXCEPTION 'Mục FAIL/WARNING phải có ghi chú (%)',item->>'check_key'; END IF;
    UPDATE qc_check_items SET result=item->>'result',note=left(coalesce(item->>'note',''),1000),checked_by=p_actor,checked_at=timezone('utc',now()) WHERE qc_inspection_id=q.id AND check_key=item->>'check_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'Mục checklist không thuộc inspection (%)',item->>'check_key'; END IF;
  END LOOP;
  RETURN jsonb_build_object('inspection_id',q.id,'updated',jsonb_array_length(p_items));
END $$;

DROP FUNCTION IF EXISTS public.complete_qc_inspection(uuid,text,text,text,text,text,jsonb,text);
CREATE OR REPLACE FUNCTION public.complete_qc_inspection(p_inspection_id uuid,p_result text,p_mainboard_status text,p_charger_status text,p_cosmetic_grade text,p_notes text,p_items jsonb,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q qc_inspections%ROWTYPE; l laptops%ROWTYPE; failed_keys text; incomplete_keys text;
BEGIN
  SELECT * INTO q FROM qc_inspections WHERE id=p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên QC'; END IF;
  IF q.status='COMPLETED' AND q.completion_idempotency_key=p_idempotency_key THEN RETURN to_jsonb(q); END IF;
  IF q.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Phiên QC đã kết thúc'; END IF;
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Idempotency key hoàn tất không hợp lệ'; END IF;
  IF p_result NOT IN('PASS','FAIL') OR p_mainboard_status NOT IN('ORIGINAL','OFFICIAL_REPLACED','REPAIRED','UNKNOWN') OR p_charger_status NOT IN('ORIGINAL','ORIGINAL_US','COMPATIBLE','MISSING','UNKNOWN') THEN RAISE EXCEPTION 'Kết quả QC không hợp lệ'; END IF;
  IF p_cosmetic_grade IS NOT NULL AND p_cosmetic_grade NOT IN('A','B','C','D') THEN RAISE EXCEPTION 'Phân hạng ngoại hình không hợp lệ'; END IF;
  PERFORM save_qc_checklist(q.id,p_items,p_actor);
  SELECT string_agg(check_key,', ' ORDER BY sort_order) INTO failed_keys FROM qc_check_items WHERE qc_inspection_id=q.id AND requirement='REQUIRED' AND result='FAIL';
  SELECT string_agg(check_key,', ' ORDER BY sort_order) INTO incomplete_keys FROM qc_check_items WHERE qc_inspection_id=q.id AND requirement='REQUIRED' AND result IN('NOT_TESTED','NOT_APPLICABLE');
  IF p_result='PASS' AND failed_keys IS NOT NULL THEN RAISE EXCEPTION 'Không thể PASS; mục bắt buộc bị lỗi: %',failed_keys; END IF;
  IF p_result='PASS' AND incomplete_keys IS NOT NULL THEN RAISE EXCEPTION 'Không thể PASS; mục bắt buộc chưa đạt: %',incomplete_keys; END IF;
  IF p_result='PASS' AND p_mainboard_status='REPAIRED' THEN RAISE EXCEPTION 'Không thể PASS với mainboard đã sửa'; END IF;
  IF p_result='PASS' AND p_charger_status='MISSING' THEN RAISE EXCEPTION 'Không thể PASS khi thiếu sạc'; END IF;
  SELECT * INTO l FROM laptops WHERE id=q.laptop_id FOR UPDATE;
  IF l.status<>'qc_in_progress' THEN RAISE EXCEPTION 'Trạng thái laptop không khớp phiên QC'; END IF;
  UPDATE qc_inspections SET status='COMPLETED',result=p_result,completed_by=p_actor,completed_at=timezone('utc',now()),completion_idempotency_key=p_idempotency_key,overall_notes=left(coalesce(p_notes,''),5000),mainboard_status=p_mainboard_status,charger_status=p_charger_status,cosmetic_grade=p_cosmetic_grade WHERE id=q.id RETURNING * INTO q;
  PERFORM set_config('app.qc_transition','on',true);
  UPDATE laptops SET status=CASE WHEN p_result='PASS' THEN 'available' ELSE 'qc_failed' END,is_locked=(p_result<>'PASS'),available_for_sale_at=CASE WHEN p_result='PASS' THEN timezone('utc',now()) ELSE NULL END,condition_note=CASE WHEN btrim(coalesce(p_notes,''))<>'' THEN left(p_notes,2000) ELSE condition_note END WHERE id=l.id;
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('QC_INSPECTION',q.id::text,'UPDATE',jsonb_build_object('result',p_result,'laptop_id',l.id,'mainboard_status',p_mainboard_status),p_actor);
  RETURN to_jsonb(q);
END $$;

CREATE OR REPLACE FUNCTION public.prevent_completed_qc_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE parent_status text;
BEGIN
  IF TG_TABLE_NAME='qc_inspections' THEN
    IF TG_OP='DELETE' OR OLD.status IN('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'Lịch sử QC đã kết thúc là bất biến'; END IF;
  ELSE
    SELECT status INTO parent_status FROM qc_inspections WHERE id=coalesce(NEW.qc_inspection_id,OLD.qc_inspection_id);
    IF TG_OP='DELETE' OR parent_status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Checklist của phiên QC đã kết thúc là bất biến'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS qc_inspections_immutable_trigger ON public.qc_inspections;
CREATE TRIGGER qc_inspections_immutable_trigger BEFORE UPDATE OR DELETE ON public.qc_inspections FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_qc_mutation();
DROP TRIGGER IF EXISTS qc_check_items_immutable_trigger ON public.qc_check_items;
CREATE TRIGGER qc_check_items_immutable_trigger BEFORE UPDATE OR DELETE ON public.qc_check_items FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_qc_mutation();

REVOKE ALL ON FUNCTION public.seed_qc_checklist(uuid,text),public.save_qc_checklist(uuid,jsonb,text),public.complete_qc_inspection(uuid,text,text,text,text,text,jsonb,text,text),public.prevent_completed_qc_mutation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_qc_inspection(bigint,text,text),public.save_qc_checklist(uuid,jsonb,text),public.complete_qc_inspection(uuid,text,text,text,text,text,jsonb,text,text) TO service_role;
COMMIT;
