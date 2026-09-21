import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const [management, finance] = await Promise.all([db.rpc('get_management_dashboard'), db.rpc('get_financial_operations_summary')]);
  if (management.error) return NextResponse.json({ error: management.error.message }, { status: 503 });
  return NextResponse.json({ ...management.data, financial_operations: finance.error ? null : finance.data, financial_operations_error: finance.error?.message || null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
