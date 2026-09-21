import { NextResponse } from 'next/server';
import { financeAdmin } from '@/lib/financeApi';

export async function GET(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  const params = new URL(request.url).searchParams, page = Math.max(1, Number(params.get('page')) || 1), limit = Math.min(100, Math.max(10, Number(params.get('limit')) || 30));
  const { data, count, error } = await context.db.from('purchase_batch_summaries').select('*', { count: 'exact' }).gt('debt_rmb', 0).not('status', 'in', '(DRAFT,CANCELLED,CLOSED)').order('purchase_date', { ascending: true }).range((page - 1) * limit, page * limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ data, page, limit, total: count });
}

