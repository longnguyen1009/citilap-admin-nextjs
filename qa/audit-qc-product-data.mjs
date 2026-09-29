// Read-only audit. Never prints credentials, notes, serials or customer data.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd());
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function all(table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from(table).select(columns).order('id').range(offset, offset + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
const [laptops, inspections, checks] = await Promise.all([
  all('laptops', 'id,serial,battery_health,qc_details,screen_status,mainboard_status,camera_mic_status'),
  all('qc_inspections', 'id,laptop_id,detail_snapshot,overall_notes'),
  all('qc_check_items', 'id,qc_inspection_id'),
]);
const ids = predicate => laptops.filter(predicate).map(l => l.id);
const own = (o, k) => Object.hasOwn(o || {}, k);
const normalized = value => value == null ? '' : String(value).trim();
const result = {
  laptopCount: laptops.length, inspectionCount: inspections.length, legacyCheckCount: checks.length,
  duplicatedSerialIds: ids(l => own(l.qc_details, 'serialNumber')),
  serialConflictIds: ids(l => own(l.qc_details, 'serialNumber') && normalized(l.serial) !== normalized(l.qc_details.serialNumber)),
  duplicatedBatteryIds: ids(l => own(l.qc_details, 'batteryHealth')),
  batteryConflictIds: ids(l => own(l.qc_details, 'batteryHealth') && normalized(l.battery_health) !== normalized(l.qc_details.batteryHealth)),
  inspectionSnapshotCount: inspections.filter(q => q.detail_snapshot != null).length,
  inspectionNoteCount: inspections.filter(q => q.overall_notes?.trim()).length,
  keyboardConflictIds: ids(l => l.qc_details?.keyboard && l.qc_details?.keyboard_backlight && l.qc_details.keyboard.result !== l.qc_details.keyboard_backlight.result),
  coolingConflictIds: ids(l => l.qc_details?.fan && l.qc_details?.cooling && l.qc_details.fan.result !== l.qc_details.cooling.result),
};
console.log(JSON.stringify(result, null, 2));
