import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';

const idOf = value => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? Number(value) : null;

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings();
    await requireSession(DB, request, ['ADMIN']);
    const db = createDatabase(DB);
    const id = idOf(new URL(request.url).searchParams.get('id'));
    if (!id) {
      const result = await db.from('purchase_batch_summaries').select('*')
        .order('purchase_date', { ascending: false }).order('id', { ascending: false });
      if (result.error) throw new Error(result.error.message);
      return Response.json(result.data);
    }
    const [batch, laptops, payments] = await Promise.all([
      db.from('purchase_batch_summaries').select('*').eq('id', id).maybeSingle(),
      db.from('laptops').select('*').eq('purchase_batch_id', id).order('id'),
      db.from('supplier_payments').select('*').eq('purchase_batch_id', id)
        .order('payment_date', { ascending: false }).order('id', { ascending: false }),
    ]);
    if (batch.error || laptops.error || payments.error) throw new Error(batch.error?.message || laptops.error?.message || payments.error?.message);
    if (!batch.data) return Response.json({ error: 'Không tìm thấy lô mua' }, { status: 404 });
    return Response.json({ batch: batch.data, laptops: laptops.data, payments: payments.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 503 });
  }
}
