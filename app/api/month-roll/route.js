import { NextResponse } from 'next/server';
import { routeContext } from '../../../lib/cloudflare/route-helpers.mjs';

export async function POST(request) {
  try {
    const { DB, profile } = await routeContext(request, ['ADMIN']);
    await request.json().catch(() => ({}));
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', month: '2-digit', year: 'numeric' }).formatToParts(new Date());
    const monthKey = `${parts.find(part => part.type === 'month')?.value}/${parts.find(part => part.type === 'year')?.value}`;
    const sortable = `${monthKey.slice(3)}${monthKey.slice(0, 2)}`;
    const now = new Date().toISOString();
    const [orders, laptops] = await DB.batch([
      DB.prepare(`UPDATE orders SET month_key=?,updated_at=? WHERE is_active=1
        AND order_status IN ('new','deposited','prepared') AND length(month_key)=7
        AND substr(month_key,4,4)||substr(month_key,1,2)<? RETURNING id,laptop_id`).bind(monthKey, now, sortable),
      DB.prepare(`UPDATE laptops SET month_key=?,updated_at=? WHERE is_active=1 AND length(month_key)=7
        AND substr(month_key,4,4)||substr(month_key,1,2)<? AND (status IN
        ('in_transit','waiting_qc','available','reserved','repair','supplier_return','ignored')
        OR id IN (SELECT laptop_id FROM orders WHERE month_key=? AND order_status IN ('new','deposited','prepared')))
        RETURNING id`).bind(monthKey, now, sortable, monthKey),
    ]);
    return NextResponse.json({ ok: true, monthKey, laptopsMoved: laptops.results.length, ordersMoved: orders.results.length, by: profile.name });
  } catch (error) { return NextResponse.json({ error: error.message || 'Lỗi server.' }, { status: error.status || 500 }); }
}
