import { NextResponse } from 'next/server';
import { financeAdmin } from '@/lib/financeApi';

export async function GET(request) {
  const context = await financeAdmin(request); if (context.response) return context.response;
  const { data, error } = await context.db.rpc('get_financial_operations_summary');
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

