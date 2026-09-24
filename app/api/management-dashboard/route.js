import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const [management, finance, expiringReservations, inspectionTradeIns, pendingCommissions] = await Promise.all([
    db.rpc('get_management_dashboard'),
    db.rpc('get_financial_operations_summary'),
    db.from('reservations').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').gt('expires_at', now.toISOString()).lte('expires_at', soon),
    db.from('trade_ins').select('*', { count: 'exact', head: true }).eq('status', 'DRAFT'),
    db.from('commissions').select('*', { count: 'exact', head: true }).eq('status', 'PENDING')
  ]);
  if (management.error) return NextResponse.json({ error: management.error.message }, { status: 503 });
  return NextResponse.json({
    ...management.data,
    financial_operations: finance.error ? null : finance.data,
    financial_operations_error: finance.error?.message || null,
    sales_operations_actions: {
      reservations_expiring_2h: expiringReservations.count || 0,
      trade_ins_waiting_inspection: inspectionTradeIns.count || 0,
      commissions_pending: pendingCommissions.count || 0
    }
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
