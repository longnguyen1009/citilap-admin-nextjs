import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const { data, error } = await db.rpc('get_management_dashboard');
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
