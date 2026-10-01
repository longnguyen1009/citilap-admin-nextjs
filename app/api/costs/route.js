import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';

const id = value => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? Number(value) : null;
const money = value => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('Số tiền không hợp lệ');
  return number;
};

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings();
    await requireSession(DB, request, ['ADMIN']);
    const db = createDatabase(DB);
    const laptopId = id(new URL(request.url).searchParams.get('laptopId'));
    if (laptopId) {
      const [summary, components] = await Promise.all([
        db.from('laptop_landed_costs').select('*').eq('laptop_id', laptopId).maybeSingle(),
        db.from('laptop_cost_components').select('*').eq('laptop_id', laptopId).order('occurred_at'),
      ]);
      if (summary.error || components.error) throw new Error(summary.error?.message || components.error?.message);
      return Response.json({ summary: summary.data, components: components.data });
    }
    const [summaries, laptops] = await Promise.all([
      db.from('laptop_landed_costs').select('*').order('laptop_id', { ascending: false }),
      db.from('laptops').select('id,name,serial,status,location'),
    ]);
    if (summaries.error || laptops.error) throw new Error(summaries.error?.message || laptops.error?.message);
    const byId = new Map(laptops.data.map(row => [Number(row.id), row]));
    return Response.json(summaries.data.map(row => ({ ...row, laptops: byId.get(Number(row.laptop_id)) || null })));
  } catch (error) {
    return Response.json({ error: error.message || 'Không thể tải landed cost' }, { status: error.status || 503 });
  }
}

export async function POST(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, ['ADMIN']);
    const body = await request.json();
    const db = createDatabase(DB);
    let result;
    if (body.action === 'sync') {
      if (!id(body.laptopId)) throw new Error('Laptop không hợp lệ');
      result = await db.rpc('sync_laptop_cost_components', { p_laptop_id: id(body.laptopId), p_actor: profile.name });
    } else if (body.action === 'add') {
      const key = String(body.idempotencyKey || '');
      if (key.length < 8) throw new Error('Idempotency key không hợp lệ');
      result = await db.rpc('add_manual_laptop_cost', { p_laptop_id: id(body.laptopId), p_cost_type: body.costType,
        p_amount_vnd: money(body.amountVnd), p_description: String(body.description || '').trim(),
        p_occurred_at: body.occurredAt || new Date().toISOString(), p_actor: profile.name, p_idempotency_key: key });
    } else if (body.action === 'void') {
      result = await db.rpc('void_manual_laptop_cost', { p_id: body.id, p_reason: String(body.reason || '').trim(), p_actor: profile.name });
    } else throw new Error('Thao tác cost không hợp lệ');
    if (result.error) throw new Error(result.error.message);
    return Response.json(result.data, { status: body.action === 'add' ? 201 : 200 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 400 });
  }
}
