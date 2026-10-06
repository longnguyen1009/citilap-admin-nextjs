import { NextResponse } from 'next/server';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';
import { TECHNICAL_ROLES } from '@/lib/roles.mjs';

const ROLES = TECHNICAL_ROLES;
const numericId = value => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? Number(value) : null;

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings();
    await requireSession(DB, request, ROLES);
    const db = createDatabase(DB);
    const params = new URL(request.url).searchParams;
    const inspectionId = params.get('id');
    const laptopId = numericId(params.get('laptopId'));

    if (inspectionId) {
      const [head, items] = await Promise.all([
        db.from('qc_inspections').select('*,laptops(id,serial,name,status,location,battery_health,qc_details,condition_note,purchase_batch_id,source_type)').eq('id', inspectionId).maybeSingle(),
        db.from('qc_check_items').select('*').eq('qc_inspection_id', inspectionId).order('id'),
      ]);
      if (head.error || items.error) throw new Error(head.error?.message || items.error?.message);
      return NextResponse.json({ inspection: head.data, items: items.data }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const requestedPage = numericId(params.get('page'));
    const requestedLimit = numericId(params.get('limit'));
    const paginated = Boolean(requestedPage || requestedLimit);
    const page = requestedPage || 1;
    const limit = Math.min(requestedLimit || 50, 100);
    const offset = (page - 1) * limit;
    let query = db.from('qc_inspections')
      .select('id,inspection_code,laptop_id,status,result,disposition,started_at,completed_at,started_by,completed_by,laptops(id,sku,serial,name)',
        paginated ? { count: 'exact' } : undefined)
      .order('started_at', { ascending: false }).order('id', { ascending: false });
    if (laptopId) query = query.eq('laptop_id', laptopId);
    if (paginated) query = query.range(offset, offset + limit - 1);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    if (!paginated) return NextResponse.json(result.data, { headers: { 'Cache-Control': 'private, no-store' } });
    const total = result.count || 0;
    return NextResponse.json({ data: result.data, total, page, limit, pageCount: Math.max(1, Math.ceil(total / limit)) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể tải dữ liệu QC' }, { status: error.status || 503 });
  }
}

export async function POST(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, ROLES);
    const db = createDatabase(DB);
    const body = await request.json();
    const actor = profile.name || 'Kỹ thuật';
    let result;
    if (body.action === 'quick-complete' || body.action === 'complete') {
      const key = String(body.idempotencyKey || '');
      if (!/^[0-9a-f-]{36}$/i.test(String(body.inspectionId || ''))
        || !['PASS', 'FAIL', 'REPAIR', 'RETURN_CN'].includes(body.disposition)
        || key.length < 8 || key.length > 100) throw new Error('Kết quả QC không hợp lệ');
      result = await db.rpc('complete_qc_with_details', {
        p_inspection_id: body.inspectionId, p_disposition: body.disposition,
        p_notes: String(body.notes || '').trim().slice(0, 2000), p_actor: actor,
        p_idempotency_key: key, p_details: body.details || {},
      });
    } else if (body.action === 'start') {
      const laptopId = numericId(body.laptopId), key = String(body.idempotencyKey || '');
      if (!laptopId || key.length < 8 || key.length > 100) throw new Error('Yêu cầu bắt đầu QC không hợp lệ');
      result = await db.rpc('start_qc_inspection', {
        p_laptop_id: laptopId, p_actor: actor, p_idempotency_key: key,
      });
    } else throw new Error('Thao tác QC không hợp lệ');
    if (result.error) throw Object.assign(new Error(result.error.message), { status: result.error.status });
    return NextResponse.json(result.data, { status: body.action === 'start' ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể xử lý QC' }, { status: error.status || 400 });
  }
}
