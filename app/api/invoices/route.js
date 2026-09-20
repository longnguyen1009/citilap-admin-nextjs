import { NextResponse } from 'next/server';
import { requireUser, isValidPositiveId } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

function visibleInvoice(invoice, role) {
  if (role === 'ADMIN' || !invoice.snapshot) return invoice;
  const snapshot = { ...invoice.snapshot, order: { ...invoice.snapshot.order } };
  delete snapshot.order.profit_vnd;
  snapshot.financial_records = (snapshot.financial_records || []).filter(row => row.payment_id);
  return { ...invoice, snapshot };
}

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;
  const params = new URL(request.url).searchParams;
  const db = getSupabaseAdminClient();
  let query = db.from('invoices').select('*').order('created_at', { ascending: false });
  for (const [param, column] of [['id','id'],['orderId','order_id'],['laptopId','laptop_id'],['customerId','customer_id']]) {
    if (params.has(param)) {
      if (!isValidPositiveId(params.get(param))) return NextResponse.json({ error: 'Mã không hợp lệ' }, { status: 400 });
      query = query.eq(column, params.get(param));
    }
  }
  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: 'Không thể tải hóa đơn. Kiểm tra migration hóa đơn đã được áp dụng.' }, { status: 503 });
  return NextResponse.json(data.map(row => visibleInvoice(row, auth.profile.role)));
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;
  try {
    const { orderId } = await request.json();
    if (!isValidPositiveId(orderId)) return NextResponse.json({ error: 'Mã đơn không hợp lệ' }, { status: 400 });
    const { data, error } = await getSupabaseAdminClient().rpc('issue_invoice', { p_order_id: Number(orderId), p_actor: auth.profile.name });
    if (error) return NextResponse.json({ error: error.code === 'P0001' ? error.message : 'Không thể xuất hóa đơn. Kiểm tra migration và dữ liệu đơn hàng.' }, { status: 409 });
    return NextResponse.json(visibleInvoice(data, auth.profile.role), { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Yêu cầu xuất hóa đơn không hợp lệ' }, { status: 400 });
  }
}
