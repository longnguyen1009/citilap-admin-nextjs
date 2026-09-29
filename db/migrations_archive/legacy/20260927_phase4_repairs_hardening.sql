-- Phase 4 live hardening. Apply after 20260926_phase4_repairs.sql.
BEGIN;

-- A repair must be diagnosed, worked and tested before completion.
CREATE OR REPLACE FUNCTION public.update_repair_job(p_id uuid,p_data jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j repair_jobs%ROWTYPE; assignee uuid:=nullif(p_data->>'assigned_to','')::uuid; target text:=coalesce(p_data->>'status','');
BEGIN
 SELECT * INTO j FROM repair_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status IN('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'Phiếu sửa không còn được cập nhật'; END IF;
 PERFORM validate_repair_assignee(assignee);
 IF NOT ((j.status='OPEN' AND target IN('OPEN','IN_PROGRESS')) OR
         (j.status='IN_PROGRESS' AND target IN('IN_PROGRESS','WAITING_PART','TESTING')) OR
         (j.status='WAITING_PART' AND target IN('WAITING_PART','IN_PROGRESS')) OR
         (j.status='TESTING' AND target IN('TESTING','IN_PROGRESS','WAITING_PART'))) THEN
   RAISE EXCEPTION 'Chuyển trạng thái sửa chữa không hợp lệ (% → %)',j.status,target;
 END IF;
 UPDATE repair_jobs SET
   reported_issue=left(coalesce(nullif(btrim(p_data->>'reported_issue'),''),reported_issue),5000),
   status=target,diagnosis=left(coalesce(p_data->>'diagnosis',''),5000),repair_plan=left(coalesce(p_data->>'repair_plan',''),5000),
   priority=coalesce(p_data->>'priority',priority),assigned_to=assignee,
   labor_cost_vnd=coalesce((p_data->>'labor_cost_vnd')::numeric,labor_cost_vnd),notes=left(coalesce(p_data->>'notes',''),5000),
   started_at=CASE WHEN target<>'OPEN' THEN coalesce(started_at,timezone('utc',now())) ELSE started_at END
 WHERE id=p_id RETURNING * INTO j;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('REPAIR_JOB',j.id::text,'UPDATE',jsonb_build_object('status',j.status,'priority',j.priority,'assigned_to',j.assigned_to,'labor_cost_vnd',j.labor_cost_vnd),p_actor);
 RETURN to_jsonb(j);
END $$;

CREATE OR REPLACE FUNCTION public.complete_repair_job(p_id uuid,p_resolution text,p_actor text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j repair_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM repair_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu sửa'; END IF;
 IF j.status='COMPLETED' AND j.completion_idempotency_key=p_idempotency_key THEN RETURN to_jsonb(j); END IF;
 IF j.status<>'TESTING' OR btrim(coalesce(p_resolution,''))='' OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN
   RAISE EXCEPTION 'Chỉ có thể hoàn tất phiếu đang TESTING với kết quả hợp lệ';
 END IF;
 UPDATE repair_jobs SET status='COMPLETED',resolution=left(p_resolution,5000),completed_at=timezone('utc',now()),completion_idempotency_key=p_idempotency_key,
   parts_cost_vnd=(SELECT coalesce(sum(total_cost_vnd),0) FROM repair_parts WHERE repair_job_id=p_id)
 WHERE id=p_id RETURNING * INTO j;
 PERFORM set_config('app.repair_transition','on',true);
 UPDATE laptops SET status='qc_failed',is_locked=true,available_for_sale_at=NULL WHERE id=j.laptop_id;
 INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name) VALUES('REPAIR_JOB',j.id::text,'UPDATE',jsonb_build_object('status','COMPLETED','total_cost_vnd',j.total_cost_vnd,'requires_re_qc',true),p_actor);
 RETURN to_jsonb(j);
END $$;

REVOKE ALL ON FUNCTION public.update_repair_job(uuid,jsonb,text),public.complete_repair_job(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_repair_job(uuid,jsonb,text),public.complete_repair_job(uuid,text,text,text) TO service_role;
COMMIT;
