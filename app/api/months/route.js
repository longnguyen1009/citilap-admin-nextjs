import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request);
    const scope = new URL(request.url).searchParams.get('scope') || 'operations';
    if (!['operations', 'purchases'].includes(scope)) return Response.json({ error: 'Phạm vi tháng không hợp lệ' }, { status: 400 });
    if (scope === 'purchases' && profile.role !== 'ADMIN') return Response.json({ error: 'Không có quyền xem lô mua' }, { status: 403 });
    const result = await createDatabase(DB).rpc('list_data_months', { p_scope: scope });
    if (result.error) throw new Error(result.error.message);
    return Response.json(result.data.map(row => row.month_key), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Không thể tải danh sách tháng.' }, { status: error.status || 500 });
  }
}
