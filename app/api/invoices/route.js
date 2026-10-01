import { NextResponse } from 'next/server';
import { isValidPositiveId } from '@/lib/apiAuth';
import { publicInvoice } from '@/lib/responseVisibility';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';

function visibleInvoice(invoice, role) {
  return role === 'ADMIN' ? invoice : publicInvoice(invoice);
}

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, ['ADMIN', 'SALES']);
    const params = new URL(request.url).searchParams;
    const db = createDatabase(DB);
    let query = db.from('invoices').select('*').order('created_at', { ascending: false });
    for (const [param, column] of [['id', 'id'], ['orderId', 'order_id'], ['laptopId', 'laptop_id'], ['customerId', 'customer_id']]) {
      if (params.has(param)) {
        if (!isValidPositiveId(params.get(param))) return NextResponse.json({ error: 'Mã không hợp lệ' }, { status: 400 });
        query = query.eq(column, Number(params.get(param)));
      }
    }
    const { data, error } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json(data.map(row => visibleInvoice(row, profile.role)));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, ['ADMIN', 'SALES']);
    const { orderId } = await request.json();
    if (!isValidPositiveId(orderId)) return NextResponse.json({ error: 'Mã đơn không hợp lệ' }, { status: 400 });
    const { data, error } = await createDatabase(DB).rpc('issue_invoice', {
      p_order_id: Number(orderId), p_actor: profile.name,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: error.status || 409 });
    return NextResponse.json(visibleInvoice(data, profile.role), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Yêu cầu xuất hóa đơn không hợp lệ' }, { status: error.status || 400 });
  }
}
