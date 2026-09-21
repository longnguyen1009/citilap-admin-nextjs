import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

const ROLES = ['ADMIN', 'TECH', 'TECHNICAL'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
const money = value => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error('Chi phí không hợp lệ');
  return number;
};

export async function GET(request) {
  const auth = await requireUser(request, ROLES);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const params = new URL(request.url).searchParams;
  const jobId = params.get('id');

  if (jobId) {
    if (!UUID.test(jobId)) return NextResponse.json({ error: 'Mã phiếu sửa không hợp lệ' }, { status: 400 });
    const [job, parts, actions] = await Promise.all([
      db.from('repair_jobs').select('*, laptops(id,serial,name,status,location)').eq('id', jobId).maybeSingle(),
      db.from('repair_parts').select('*').eq('repair_job_id', jobId).order('created_at'),
      db.from('repair_actions').select('*').eq('repair_job_id', jobId).order('performed_at'),
    ]);
    if (job.error || parts.error || actions.error) return NextResponse.json({ error: 'Không thể tải chi tiết sửa chữa' }, { status: 503 });
    let sourceQc = null;
    if (job.data?.source_type === 'QC' && UUID.test(job.data.source_id || '')) {
      const result = await db.from('qc_inspections').select('id,inspection_code,result,overall_notes,mainboard_status,charger_status,completed_at').eq('id', job.data.source_id).maybeSingle();
      sourceQc = result.data || null;
    }
    return NextResponse.json({ job: job.data, parts: parts.data, actions: actions.data, sourceQc });
  }

  let query = db.from('repair_jobs').select('*, laptops(id,serial,name,status,location)').order('created_at', { ascending: false });
  const status = params.get('status');
  const laptopId = params.get('laptopId');
  if (status) query = query.eq('status', status);
  if (laptopId && /^\d+$/.test(laptopId)) query = query.eq('laptop_id', Number(laptopId));
  const [jobs, users] = await Promise.all([
    query,
    db.from('user_profiles').select('id,name,role').eq('is_active', true).in('role', ROLES).order('name'),
  ]);
  if (jobs.error || users.error) return NextResponse.json({ error: 'Chưa tải được Repair Jobs. Hãy áp dụng migration Phase 4.' }, { status: 503 });
  return NextResponse.json({ jobs: jobs.data, technicians: users.data });
}

export async function POST(request) {
  const auth = await requireUser(request, ROLES);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const db = getSupabaseAdminClient();
    const jobId = String(body.jobId || '');
    let result;
    if (body.action === 'start') {
      const laptopId = Number(body.laptopId);
      const key = text(body.idempotencyKey, 100);
      if (!Number.isInteger(laptopId) || laptopId <= 0 || key.length < 8) throw new Error('Yêu cầu tạo phiếu sửa không hợp lệ');
      if (!['QC', 'INTERNAL'].includes(body.sourceType)) throw new Error('Phase 4 chỉ hỗ trợ nguồn QC hoặc INTERNAL');
      result = await db.rpc('start_repair_job', { p_data: { laptop_id: laptopId, source_type: body.sourceType, source_id: body.sourceId || null, reported_issue: text(body.reportedIssue), priority: body.priority || 'NORMAL', assigned_to: body.assignedTo || null }, p_actor: auth.profile.name, p_idempotency_key: key });
    } else {
      if (!UUID.test(jobId)) throw new Error('Mã phiếu sửa không hợp lệ');
      if (body.action === 'update') result = await db.rpc('update_repair_job', { p_id: jobId, p_data: { reported_issue: text(body.reportedIssue), status: body.status, diagnosis: text(body.diagnosis), repair_plan: text(body.repairPlan), priority: body.priority, assigned_to: body.assignedTo || null, labor_cost_vnd: money(body.laborCostVnd), notes: text(body.notes) }, p_actor: auth.profile.name });
      else if (body.action === 'addPart') result = await db.rpc('add_repair_part', { p_job: jobId, p_data: { part_type: body.partType, part_name: text(body.partName, 240), serial: text(body.serial, 100), quantity: Number(body.quantity), unit_cost_vnd: money(body.unitCostVnd), source: body.source, notes: text(body.notes, 3000) }, p_actor: auth.profile.name });
      else if (body.action === 'removePart') result = await db.rpc('remove_repair_part', { p_part_id: Number(body.partId), p_actor: auth.profile.name });
      else if (body.action === 'addAction') result = await db.rpc('add_repair_action', { p_job: jobId, p_data: { action_type: body.actionType, description: text(body.description) }, p_actor: auth.profile.name });
      else if (body.action === 'complete') {
        const key = text(body.idempotencyKey, 100);
        if (key.length < 8) throw new Error('Idempotency key không hợp lệ');
        const outcome = String(body.outcome || '');
        const recommendedAction = String(body.recommendedAction || '');
        if (!['REPAIRED','NOT_REPAIRED','PARTIALLY_REPAIRED','NO_FAULT_FOUND'].includes(outcome)) throw new Error('Kết quả sửa chữa không hợp lệ');
        if (!['RE_QC','SUPPLIER_RETURN','NO_FURTHER_ACTION','OTHER'].includes(recommendedAction)) throw new Error('Hành động đề xuất không hợp lệ');
        result = await db.rpc('complete_repair_job', { p_id: jobId, p_resolution: text(body.resolution), p_outcome: outcome, p_recommended_action: recommendedAction, p_actor: auth.profile.name, p_idempotency_key: key });
      } else if (body.action === 'cancel') result = await db.rpc('cancel_repair_job', { p_id: jobId, p_reason: text(body.reason, 1000), p_actor: auth.profile.name });
      else throw new Error('Thao tác sửa chữa không hợp lệ');
    }
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json(result.data, { status: body.action === 'start' ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể xử lý phiếu sửa' }, { status: 400 });
  }
}
