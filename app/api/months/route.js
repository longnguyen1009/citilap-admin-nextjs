import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';

export async function GET(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const client = getSupabaseAdminClient();
  try {
    const months = new Set();
    for (const table of ['laptops', 'orders']) {
      // Read only month metadata, including datasets larger than PostgREST's row limit.
      for (let start = 0; ; start += 1000) {
        const { data, error } = await client.from(table).select('month_key')
          .eq('is_active', true).order('id').range(start, start + 999);
        if (error) throw error;
        data.forEach(row => { if (row.month_key) months.add(row.month_key); });
        if (data.length < 1000) break;
      }
    }
    return NextResponse.json([...months]);
  } catch {
    return NextResponse.json({ error: 'Không thể tải danh sách tháng.' }, { status: 500 });
  }
}
