import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

const idOf = value => /^\d+$/.test(String(value || '')) && Number(value) > 0 ? Number(value) : null;

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const id = idOf(new URL(request.url).searchParams.get('id'));
  if (!id) {
    const { data, error } = await db.from('purchase_batch_summaries').select('*').order('purchase_date', { ascending: false }).order('id', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json(data);
  }
  const [batch, laptops, payments] = await Promise.all([
    db.from('purchase_batch_summaries').select('*').eq('id', id).maybeSingle(),
    db.from('laptops').select('*').eq('purchase_batch_id', id).order('id'),
    db.from('supplier_payments').select('*').eq('purchase_batch_id', id).order('payment_date', { ascending: false }).order('id', { ascending: false })
  ]);
  if (batch.error || laptops.error || payments.error) return NextResponse.json({ error: batch.error?.message || laptops.error?.message || payments.error?.message }, { status: 503 });
  if (!batch.data) return NextResponse.json({ error: 'Không tìm thấy lô mua' }, { status: 404 });
  return NextResponse.json({ batch: batch.data, laptops: laptops.data, payments: payments.data });
}
