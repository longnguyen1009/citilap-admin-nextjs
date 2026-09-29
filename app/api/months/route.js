import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';

const MONTH_KEY_PATTERN = /^(0[1-9]|1[0-2])\/\d{4}$/;

function sortMonths(months) {
  return [...new Set(months.filter(month => MONTH_KEY_PATTERN.test(month)))]
    .sort((a, b) => {
      const [aMonth, aYear] = a.split('/').map(Number);
      const [bMonth, bYear] = b.split('/').map(Number);
      return bYear - aYear || bMonth - aMonth;
    });
}

async function readAllRows(buildQuery) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function listMonthsWithoutRpc(client, scope) {
  if (scope === 'purchases') {
    const batches = await readAllRows(() => client.from('purchase_batches').select('purchase_date').order('id'));
    return sortMonths(batches.map(({ purchase_date: date }) => {
      const [year, month] = String(date || '').split('-');
      return year && month ? `${month}/${year}` : '';
    }));
  }

  const [laptops, orders] = await Promise.all([
    readAllRows(() => client.from('laptops').select('month_key').eq('is_active', true).order('id')),
    readAllRows(() => client.from('orders').select('month_key').eq('is_active', true).order('id'))
  ]);
  return sortMonths([...laptops, ...orders].map(row => row.month_key));
}

export async function GET(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const client = getSupabaseAdminClient();
  const scope = new URL(request.url).searchParams.get('scope') || 'operations';
  if (!['operations', 'purchases'].includes(scope)) return NextResponse.json({ error: 'Phạm vi tháng không hợp lệ' }, { status: 400 });
  if (scope === 'purchases' && auth.profile.role !== 'ADMIN') return NextResponse.json({ error: 'Không có quyền xem lô mua' }, { status: 403 });
  try {
    const { data, error } = await client.rpc('list_data_months', { p_scope: scope });
    const months = error
      ? await listMonthsWithoutRpc(client, scope)
      : sortMonths((data || []).map(row => row.month_key));
    return NextResponse.json(months, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('GET /api/months failed', { scope, message: error?.message });
    return NextResponse.json({ error: 'Không thể tải danh sách tháng.' }, { status: 500 });
  }
}
