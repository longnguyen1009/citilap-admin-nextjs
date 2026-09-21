import { NextResponse } from 'next/server';
import { financeAdmin } from '@/lib/financeApi';

export async function GET(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  const params = new URL(request.url).searchParams, page = Math.max(1, Number(params.get('page')) || 1), limit = Math.min(100, Math.max(10, Number(params.get('limit')) || 30));
  let query = context.db.from('customer_receivable_summaries').select('*', { count: 'exact' }).order('payment_due_at', { ascending: true, nullsFirst: false }).order('order_id', { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (params.get('aging')) query = query.eq('aging_bucket', params.get('aging'));
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ data, page, limit, total: count });
}

