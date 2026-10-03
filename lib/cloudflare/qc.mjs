import { randomUUID } from 'node:crypto';

const dispositions = new Set(['PASS', 'FAIL', 'REPAIR', 'RETURN_CN']);
const results = new Set(['NOT_TESTED', 'PASS', 'FAIL', 'WARNING', 'NOT_APPLICABLE']);
const detailKeys = new Set([
  'serial', 'model', 'cpu', 'gpu', 'ram', 'ssd', 'mainboard', 'screen', 'keyboard', 'keyboard_backlight',
  'touchpad', 'camera', 'microphone', 'speaker', 'wifi', 'bluetooth', 'usb', 'usb_c', 'hdmi', 'lan',
  'battery', 'ssd_health', 'fan', 'cooling', 'cpu_stress', 'gpu_stress', 'charger', 'exterior',
]);

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };

function normalizeDetails(value) {
  const input = value == null ? {} : value;
  if (typeof input !== 'object' || Array.isArray(input)) invalid('Chi tiet QC khong hop le');
  const details = { ...input };
  for (const [legacyKey, canonicalKey] of [
    ['battery_health', 'batteryHealth'],
    ['serial_number', 'serialNumber'],
    ['cosmetic_grade', 'cosmeticGrade'],
  ]) {
    if (!Object.hasOwn(details, canonicalKey) && Object.hasOwn(details, legacyKey)) {
      details[canonicalKey] = details[legacyKey];
    }
    delete details[legacyKey];
  }
  if (typeof details !== 'object' || Array.isArray(details)) invalid('Chi tiết QC không hợp lệ');
  if (new TextEncoder().encode(JSON.stringify(details)).length > 50000) invalid('Chi tiết QC quá dài');

  for (const [name, item] of Object.entries(details)) {
    if (name === 'batteryHealth') {
      if (item !== null && item !== '' && (!/^\d{1,3}$/.test(String(item)) || Number(item) > 100)) {
        invalid('Pin phải là số từ 0 đến 100');
      }
    } else if (name === 'serialNumber') {
      if (typeof item !== 'string' || item.trim().length > 100) invalid('Serial không hợp lệ');
    } else if (name === 'cosmeticGrade') {
      if (typeof item !== 'string' || !['', 'A', 'B', 'C', 'D'].includes(item)) invalid('Ngoại hình không hợp lệ');
    } else if (!detailKeys.has(name) || !item || typeof item !== 'object' || Array.isArray(item)
      || !results.has(item.result) || (item.note != null && (typeof item.note !== 'string' || item.note.length > 1000))) {
      invalid(`Mục QC không hợp lệ: ${name}`);
    }
  }

  const stored = { ...details };
  delete stored.batteryHealth;
  delete stored.serialNumber;
  const hasBattery = Object.hasOwn(details, 'batteryHealth');
  const hasSerial = Object.hasOwn(details, 'serialNumber') && details.serialNumber.trim() !== '';
  const status = name => {
    if (!Object.hasOwn(details, name)) return { present: false, value: null };
    const result = details[name]?.result;
    return { present: true, value: result === 'PASS' ? 'ok' : ['FAIL', 'WARNING'].includes(result) ? 'error' : null };
  };
  const screen = status('screen'), mainboard = status('mainboard');
  const hasCameraMic = Object.hasOwn(details, 'camera') || Object.hasOwn(details, 'microphone');
  const camera = details.camera?.result, microphone = details.microphone?.result;
  const cameraMic = [camera, microphone].some(result => ['FAIL', 'WARNING'].includes(result)) ? 'error'
    : camera === 'PASS' && microphone === 'PASS' ? 'ok' : null;
  return {
    stored: JSON.stringify(stored),
    hasBattery, battery: details.batteryHealth === '' || details.batteryHealth === null ? null : Number(details.batteryHealth),
    hasSerial, serial: hasSerial ? details.serialNumber.trim() : null,
    screen, mainboard, hasCameraMic, cameraMic,
  };
}

export async function completeQcWithDetails(db, {
  p_inspection_id: inspectionId, p_disposition: disposition, p_notes: notes,
  p_actor: actor, p_idempotency_key: idempotencyKey, p_details: details,
}) {
  const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  const sharedNote = String(notes ?? '').trim().slice(0, 2000);
  if (!inspectionId || !dispositions.has(disposition) || !actor || key.length < 8 || key.length > 100) {
    invalid('Kết quả QC không hợp lệ');
  }
  const normalized = normalizeDetails(details);
  const repairId = randomUUID(), returnId = randomUUID();
  const repairKey = `qc-repair-${inspectionId}`, returnKey = `qc-return-${inspectionId}`;
  const target = disposition === 'PASS' ? 'available' : disposition === 'REPAIR' ? 'repair'
    : disposition === 'RETURN_CN' ? 'supplier_return' : 'waiting_qc';
  const linked = disposition === 'REPAIR' ? { repair_job_id: repairId }
    : disposition === 'RETURN_CN' ? { supplier_return_id: returnId } : null;
  const batch = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM qc_inspections q WHERE q.id=? AND
      ((q.status='COMPLETED' AND q.completion_idempotency_key=? AND q.disposition=?) OR
       (q.status='IN_PROGRESS' AND EXISTS(SELECT 1 FROM laptops l WHERE l.id=q.laptop_id AND l.is_active=1
          AND l.status='waiting_qc' AND NOT EXISTS(SELECT 1 FROM repair_jobs r WHERE r.laptop_id=l.id
            AND r.status NOT IN ('COMPLETED','CANCELLED'))
          AND NOT EXISTS(SELECT 1 FROM supplier_return_items i WHERE i.laptop_id=l.id
            AND i.status NOT IN ('REFUNDED','REPLACED','REJECTED','CANCELLED'))
          AND (?<>'RETURN_CN' OR (l.purchase_batch_id IS NOT NULL AND l.source_type<>'UNKNOWN'
            AND EXISTS(SELECT 1 FROM purchase_batches b WHERE b.id=l.purchase_batch_id AND b.active=1)))))))
      THEN 1 ELSE json('QC completion validation failed') END`).bind(inspectionId, key, disposition, disposition),
    db.prepare(`UPDATE laptops SET qc_details=?,condition_note=?,
      battery_health=CASE WHEN ?=1 THEN ? ELSE battery_health END,
      serial=CASE WHEN ?=1 THEN ? ELSE serial END,
      screen_status=CASE WHEN ?=1 THEN ? ELSE screen_status END,
      mainboard_status=CASE WHEN ?=1 THEN ? ELSE mainboard_status END,
      camera_mic_status=CASE WHEN ?=1 THEN ? ELSE camera_mic_status END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=(SELECT laptop_id FROM qc_inspections WHERE id=? AND status='IN_PROGRESS')`)
      .bind(normalized.stored, sharedNote, Number(normalized.hasBattery), normalized.battery,
        Number(normalized.hasSerial), normalized.serial, Number(normalized.screen.present), normalized.screen.value,
        Number(normalized.mainboard.present), normalized.mainboard.value, Number(normalized.hasCameraMic), normalized.cameraMic,
        inspectionId),
    db.prepare(`INSERT INTO repair_jobs(id,repair_code,laptop_id,source_type,source_id,reported_issue,priority,
      requires_re_qc,created_by,idempotency_key)
      SELECT ?,'REP-'||strftime('%Y%m%d','now')||'-'||printf('%03d',COALESCE((SELECT max(CAST(substr(repair_code,14) AS INTEGER))
        FROM repair_jobs WHERE repair_code LIKE 'REP-'||strftime('%Y%m%d','now')||'-%'),0)+1),
        q.laptop_id,'QC',q.id,?, 'NORMAL',1,?,? FROM qc_inspections q
      WHERE q.id=? AND q.status='IN_PROGRESS' AND ?='REPAIR'`)
      .bind(repairId, sharedNote || 'QC: Cần sửa chữa', actor, repairKey, inspectionId, disposition),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'REPAIR_JOB',id,'CREATE',json_object('repair_code',repair_code,'laptop_id',laptop_id),?
      FROM repair_jobs WHERE id=?`).bind(actor, repairId),
    db.prepare(`INSERT INTO supplier_returns(id,return_code,supplier_id,reason,reason_notes,created_by,idempotency_key)
      SELECT ?,'SR-'||strftime('%Y%m%d','now')||'-'||printf('%03d',COALESCE((SELECT max(CAST(substr(return_code,13) AS INTEGER))
        FROM supplier_returns WHERE return_code LIKE 'SR-'||strftime('%Y%m%d','now')||'-%'),0)+1),
        b.supplier_id,'OTHER',?,?,? FROM qc_inspections q JOIN laptops l ON l.id=q.laptop_id
        JOIN purchase_batches b ON b.id=l.purchase_batch_id
      WHERE q.id=? AND q.status='IN_PROGRESS' AND ?='RETURN_CN'`)
      .bind(returnId, sharedNote, actor, returnKey, inspectionId, disposition),
    db.prepare(`INSERT INTO supplier_return_items(supplier_return_id,laptop_id,qc_inspection_id,reason,condition_notes,previous_laptop_status)
      SELECT ?,q.laptop_id,q.id,'OTHER',?,l.status FROM qc_inspections q JOIN laptops l ON l.id=q.laptop_id
      WHERE q.id=? AND q.status='IN_PROGRESS' AND ?='RETURN_CN'`).bind(returnId, sharedNote, inspectionId, disposition),
    db.prepare(`INSERT INTO supplier_return_events(supplier_return_id,event_type,details,performed_by)
      SELECT id,'CREATED',json_object('item_count',1,'supplier_derived',json('true')),? FROM supplier_returns WHERE id=?`)
      .bind(actor, returnId),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'SUPPLIER_RETURN',id,'CREATE',json_object('event','SUPPLIER_RETURN_CREATED','supplier_id',supplier_id,'item_count',1),?
      FROM supplier_returns WHERE id=?`).bind(actor, returnId),
    db.prepare(`UPDATE laptops SET status=?,available_for_sale_at=CASE WHEN ?='PASS'
      THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=(SELECT laptop_id FROM qc_inspections WHERE id=? AND status='IN_PROGRESS')`).bind(target, disposition, inspectionId),
    db.prepare(`INSERT INTO stock_movements(laptop_id,movement_type,reference_type,reference_id,note,performed_by)
      SELECT laptop_id,'QC_'||?,'QC_INSPECTION',id,?,? FROM qc_inspections WHERE id=? AND status='IN_PROGRESS'`)
      .bind(disposition, sharedNote, actor, inspectionId),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'QC_INSPECTION',id,'UPDATE',json_object('disposition',?,'laptop_id',laptop_id,'status',?,'linked_record',json(?)),?
      FROM qc_inspections WHERE id=? AND status='IN_PROGRESS'`)
      .bind(disposition, target, JSON.stringify(linked), actor, inspectionId),
    db.prepare(`UPDATE qc_inspections SET status='COMPLETED',result=CASE WHEN ?='PASS' THEN 'PASS' ELSE 'FAIL' END,
      disposition=?,overall_notes='',completed_by=?,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      completion_idempotency_key=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND status='IN_PROGRESS'`).bind(disposition, disposition, actor, key, inspectionId),
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM qc_inspections WHERE id=? AND status='COMPLETED'
      AND completion_idempotency_key=? AND disposition=?) THEN 1 ELSE json('QC completion failed') END`)
      .bind(inspectionId, key, disposition),
    db.prepare('SELECT * FROM qc_inspections WHERE id=?').bind(inspectionId),
  ]);
  return batch.at(-1).results[0];
}
