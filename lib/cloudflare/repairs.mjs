import { randomUUID } from 'node:crypto';
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const decodeJob = row => ({ ...row, requires_re_qc: Boolean(row.requires_re_qc) });
function assigneeGuard(db, assignee) {
  return db.prepare(`SELECT CASE WHEN ? IS NULL OR EXISTS(SELECT 1 FROM user_profiles
    WHERE id=? AND is_active=1 AND role IN ('ADMIN','TECHNICAL','SALES_TECH'))
    THEN 1 ELSE json('invalid repair assignee') END`).bind(assignee,assignee);
}
function activeJob(db, id) {
  return db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM repair_jobs WHERE id=?
    AND status NOT IN ('COMPLETED','CANCELLED')) THEN 1 ELSE json('repair job is closed or missing') END`).bind(id);
}

function syncRepairCostsStatement(db, laptopId, actor) {
  return db.prepare(`INSERT INTO laptop_cost_components
    (laptop_id,cost_type,amount_vnd,source_type,source_id,description,occurred_at,created_by)
    SELECT laptop_id,'REPAIR',round(total_cost_vnd,0),'REPAIR_JOB',id,'Chi phí '||repair_code,
      COALESCE(completed_at,updated_at),? FROM repair_jobs
    WHERE laptop_id=? AND status='COMPLETED'
    ON CONFLICT(laptop_id,source_type,source_id,cost_type)
      WHERE source_id IS NOT NULL AND voided_at IS NULL
    DO UPDATE SET amount_vnd=excluded.amount_vnd,description=excluded.description`)
    .bind(actor,laptopId);
}

export async function syncLaptopCostComponents(db, { p_laptop_id: laptopId, p_actor: actor }) {
  laptopId = Number(laptopId);
  if (!Number.isSafeInteger(laptopId) || laptopId <= 0 || !actor) invalid('Laptop không hợp lệ');
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM laptops WHERE id=?)
      THEN 1 ELSE json('laptop not found') END`).bind(laptopId),
    syncRepairCostsStatement(db,laptopId,actor),
    db.prepare(`SELECT count(*) AS repair_jobs_synced FROM repair_jobs
      WHERE laptop_id=? AND status='COMPLETED'`).bind(laptopId),
  ]);
  return { laptop_id: laptopId, repair_jobs_synced: Number(results[2].results[0].repair_jobs_synced) };
}

export async function completeRepairJob(db, {
  p_id: id, p_resolution: resolution, p_outcome: outcome,
  p_recommended_action: recommendedAction, p_actor: actor, p_idempotency_key: key,
}) {
  resolution = String(resolution ?? '').trim();
  if (!id || !actor || typeof key !== 'string') invalid('Thông tin hoàn tất không hợp lệ');
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM repair_jobs WHERE id=? AND
      ((status='COMPLETED' AND completion_idempotency_key=?
        AND resolution=? AND outcome=? AND recommended_action=?) OR
       (status='TESTING' AND length(trim(?))>0 AND length(trim(?)) BETWEEN 8 AND 100
        AND ? IN ('REPAIRED','NOT_REPAIRED','PARTIALLY_REPAIRED','NO_FAULT_FOUND')
        AND ? IN ('RE_QC','SUPPLIER_RETURN','NO_FURTHER_ACTION','OTHER')
        AND EXISTS(SELECT 1 FROM laptops l WHERE l.id=repair_jobs.laptop_id AND l.status='repair'))))
      THEN 1 ELSE json('repair cannot be completed') END`)
      .bind(id,key,resolution.slice(0,5000),outcome,recommendedAction,resolution,key,outcome,recommendedAction),
    db.prepare(`UPDATE repair_jobs SET status='COMPLETED',resolution=?,outcome=?,recommended_action=?,
      completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),completion_idempotency_key=?,
      parts_cost_vnd=(SELECT COALESCE(sum(total_cost_vnd),0) FROM repair_parts WHERE repair_job_id=?),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='TESTING' RETURNING *`)
      .bind(resolution.slice(0,5000),outcome,recommendedAction,key,id,id),
    // Keep each side effect adjacent to the prior DML. On a replay the first UPDATE changes 0 rows;
    // all subsequent writes also change 0 rows, even if the laptop was sold after completion.
    db.prepare(`UPDATE laptops SET status='waiting_qc',available_for_sale_at=NULL,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=(SELECT laptop_id FROM repair_jobs
      WHERE id=? AND status='COMPLETED' AND completion_idempotency_key=?) AND status='repair' AND changes()=1`).bind(id,key),
    db.prepare(`INSERT INTO laptop_cost_components
      (laptop_id,cost_type,amount_vnd,source_type,source_id,description,occurred_at,created_by)
      SELECT laptop_id,'REPAIR',round(total_cost_vnd,0),'REPAIR_JOB',id,'Chi phí '||repair_code,
        COALESCE(completed_at,updated_at),? FROM repair_jobs WHERE id=? AND status='COMPLETED' AND changes()=1
      ON CONFLICT(laptop_id,source_type,source_id,cost_type)
        WHERE source_id IS NOT NULL AND voided_at IS NULL
      DO UPDATE SET amount_vnd=excluded.amount_vnd,description=excluded.description`).bind(actor,id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'REPAIR_JOB',?,'UPDATE',json_object('status','COMPLETED','outcome',?,'recommended_action',?),?
      WHERE changes()=1`).bind(id,outcome,recommendedAction,actor),
    db.prepare('SELECT * FROM repair_jobs WHERE id=?').bind(id),
  ]);
  return decodeJob(results.at(-1).results[0]);
}

export async function addRepairAction(db, { p_job: job, p_data: data, p_actor: actor }) {
  const description = typeof data?.description === 'string' ? data.description.trim() : '';
  if (!job || !actor || !description || description.length > 5000
    || !['DIAGNOSIS','CLEANING','PART_REPLACEMENT','BIOS','SOFTWARE','THERMAL_SERVICE','TEST','OTHER'].includes(data.action_type)) invalid('Nội dung thao tác không hợp lệ');
  const results = await db.batch([
    activeJob(db, job),
    db.prepare('INSERT INTO repair_actions(repair_job_id,action_type,description,performed_by) VALUES (?,?,?,?) RETURNING *')
      .bind(job, data.action_type, description, actor),
    // Capture the inserted ID before the audit INSERT changes last_insert_rowid().
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'REPAIR_ACTION',CAST(id AS TEXT),'CREATE',json_object('repair_job_id',repair_job_id,'action_type',action_type),?
      FROM repair_actions WHERE id=last_insert_rowid()`).bind(actor),
  ]);
  return results[1].results[0];
}

export async function cancelRepairJob(db, { p_id: id, p_reason: reason, p_actor: actor }) {
  if (!id || !actor || typeof reason !== 'string' || !reason.trim()) invalid('Không thể hủy phiếu sửa');
  const results = await db.batch([
    activeJob(db, id),
    db.prepare(`UPDATE repair_jobs SET status='CANCELLED',resolution=?,
      completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? RETURNING *`).bind(`Hủy: ${reason.trim()}`.slice(0,5000), id),
    db.prepare(`UPDATE laptops SET status='waiting_qc',available_for_sale_at=NULL,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=(SELECT laptop_id FROM repair_jobs WHERE id=?)`).bind(id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      VALUES ('REPAIR_JOB',?,'UPDATE',json_object('event','REPAIR_CANCELLED','status','CANCELLED','reason',?),?)`)
      .bind(id, reason.slice(0,1000), actor),
  ]);
  return decodeJob(results[1].results[0]);
}

export async function startRepairJob(db, { p_data: data, p_actor: actor, p_idempotency_key: key }) {
  const laptopId = Number(data?.laptop_id), issue = String(data?.reported_issue ?? '').trim();
  if (!actor || typeof key !== 'string' || key.trim().length < 8 || key.length > 100
    || !Number.isSafeInteger(laptopId) || laptopId <= 0 || !issue || issue.length > 5000
    || !['QC','WARRANTY','TRADE_IN','INTERNAL'].includes(data.source_type)) invalid('Thông tin phiếu sửa không hợp lệ');
  const id = randomUUID(), assignee = data.assigned_to || null, source = data.source_id || null;
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM repair_jobs WHERE idempotency_key=? AND laptop_id<>?)
      THEN 1 ELSE json('repair key belongs to another laptop') END`).bind(key,laptopId),
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM repair_jobs WHERE idempotency_key=?) OR
      (EXISTS(SELECT 1 FROM laptops WHERE id=? AND is_active=1 AND status='waiting_qc')
      AND (? IS NULL OR EXISTS(SELECT 1 FROM user_profiles WHERE id=? AND is_active=1 AND role IN ('ADMIN','TECH','TECHNICAL')))
      AND (?<>'QC' OR EXISTS(SELECT 1 FROM qc_inspections WHERE id=? AND laptop_id=? AND result='FAIL')))
      THEN 1 ELSE json('invalid repair source, laptop or assignee') END`).bind(key,laptopId,assignee,assignee,data.source_type,source,laptopId),
    db.prepare(`INSERT INTO repair_jobs(id,repair_code,laptop_id,source_type,source_id,reported_issue,priority,assigned_to,requires_re_qc,created_by,idempotency_key)
      SELECT ?,'REP-'||strftime('%Y%m%d','now')||'-'||printf('%03d',COALESCE((SELECT max(CAST(substr(repair_code,14) AS INTEGER))
        FROM repair_jobs WHERE repair_code LIKE 'REP-'||strftime('%Y%m%d','now')||'-%'),0)+1),?,?,?,?,?,?,1,?,?
      WHERE NOT EXISTS(SELECT 1 FROM repair_jobs WHERE idempotency_key=?)`)
      .bind(id,laptopId,data.source_type,source,issue,data.priority ?? 'NORMAL',assignee,actor,key,key),
    db.prepare(`UPDATE laptops SET status='repair',available_for_sale_at=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND EXISTS(SELECT 1 FROM repair_jobs WHERE id=?)`).bind(laptopId,id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'REPAIR_JOB',id,'CREATE',json_object('repair_code',repair_code,'laptop_id',laptop_id),? FROM repair_jobs WHERE id=?`).bind(actor,id),
    db.prepare('SELECT * FROM repair_jobs WHERE idempotency_key=?').bind(key),
  ]);
  return decodeJob(results.at(-1).results[0]);
}

export async function updateRepairJob(db, { p_id: id, p_data: data, p_actor: actor }) {
  if (!id || !data || !actor) invalid('Thông tin phiếu sửa không hợp lệ');
  const assignee = data.assigned_to || null, target = data.status || '';
  const labor = data.labor_cost_vnd == null ? null : Number(data.labor_cost_vnd);
  if (labor !== null && (!Number.isFinite(labor) || labor < 0)) invalid('Chi phí công không hợp lệ');
  const results = await db.batch([
    activeJob(db,id), assigneeGuard(db,assignee),
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM repair_jobs WHERE id=? AND
      ((status='OPEN' AND ? IN ('OPEN','IN_PROGRESS')) OR
       (status='IN_PROGRESS' AND ? IN ('IN_PROGRESS','WAITING_PART','TESTING')) OR
       (status='WAITING_PART' AND ? IN ('WAITING_PART','IN_PROGRESS')) OR
       (status='TESTING' AND ? IN ('TESTING','IN_PROGRESS','WAITING_PART'))))
      THEN 1 ELSE json('invalid repair transition') END`).bind(id,target,target,target,target),
    db.prepare(`UPDATE repair_jobs SET reported_issue=COALESCE(nullif(?,''),reported_issue),status=?,diagnosis=?,repair_plan=?,
      priority=COALESCE(?,priority),assigned_to=?,labor_cost_vnd=COALESCE(?,labor_cost_vnd),notes=?,
      started_at=CASE WHEN ?<>'OPEN' THEN COALESCE(started_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE started_at END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? RETURNING *`)
      .bind(String(data.reported_issue ?? '').trim().slice(0,5000),target,String(data.diagnosis ?? '').slice(0,5000),
        String(data.repair_plan ?? '').slice(0,5000),data.priority ?? null,assignee,labor,String(data.notes ?? '').slice(0,5000),target,id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'REPAIR_JOB',id,'UPDATE',json_object('status',status,'priority',priority,'assigned_to',assigned_to,'labor_cost_vnd',labor_cost_vnd),?
      FROM repair_jobs WHERE id=?`).bind(actor,id),
  ]);
  return decodeJob(results[3].results[0]);
}

export async function addRepairPart(db, { p_job: job, p_data: data, p_actor: actor }) {
  const name = typeof data?.part_name === 'string' ? data.part_name.trim() : '';
  const quantity = Number(data?.quantity), cost = Number(data?.unit_cost_vnd);
  if (!job || !actor || !name || name.length > 240 || !Number.isSafeInteger(quantity) || quantity <= 0
    || data.unit_cost_vnd == null || data.unit_cost_vnd === '' || !Number.isFinite(cost) || cost < 0
    || typeof data.part_type !== 'string' || typeof data.source !== 'string') invalid('Linh kiện không hợp lệ');
  const results = await db.batch([
    activeJob(db, job),
    db.prepare(`INSERT INTO repair_parts(repair_job_id,part_type,part_name,serial,quantity,unit_cost_vnd,source,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?) RETURNING *`).bind(job,data.part_type,name,String(data.serial ?? '').trim().slice(0,100)||null,
      quantity,cost,data.source,String(data.notes ?? '').slice(0,3000),actor),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'REPAIR_PART',CAST(id AS TEXT),'CREATE',json_object('repair_job_id',repair_job_id,'part_name',part_name,
        'quantity',quantity,'total_cost_vnd',total_cost_vnd),? FROM repair_parts WHERE id=last_insert_rowid()`).bind(actor),
    db.prepare(`UPDATE repair_jobs SET parts_cost_vnd=(SELECT COALESCE(sum(total_cost_vnd),0) FROM repair_parts WHERE repair_job_id=?),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(job,job),
  ]);
  return results[1].results[0];
}

export async function removeRepairPart(db, { p_part_id: id, p_actor: actor }) {
  if (!Number.isSafeInteger(id) || id <= 0 || !actor) invalid('Linh kiện không hợp lệ');
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM repair_parts p JOIN repair_jobs j ON j.id=p.repair_job_id
      WHERE p.id=? AND j.status NOT IN ('COMPLETED','CANCELLED')) THEN 1 ELSE json('repair part is missing or closed') END`).bind(id),
    // Compute the remaining total while the part still identifies its parent job.
    db.prepare(`UPDATE repair_jobs SET parts_cost_vnd=(SELECT COALESCE(sum(total_cost_vnd),0) FROM repair_parts
      WHERE repair_job_id=repair_jobs.id AND id<>?),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=(SELECT repair_job_id FROM repair_parts WHERE id=?)`).bind(id,id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'REPAIR_PART',CAST(id AS TEXT),'DELETE',json_object('repair_job_id',repair_job_id,'part_name',part_name),?
      FROM repair_parts WHERE id=?`).bind(actor,id),
    db.prepare('DELETE FROM repair_parts WHERE id=? RETURNING *').bind(id),
  ]);
  return results.at(-1).results[0];
}
