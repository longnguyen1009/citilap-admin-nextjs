import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';
import { requireUser } from '../../../lib/apiAuth';

const ENTITY_TYPES = new Set([
  'LAPTOP',
  'ORDER',
  'CUSTOMER',
  'WARRANTY',
  'STOCK_MOVEMENT',
  'SETTING',
  'OPTION',
  'PAYMENT',
  'FINANCIAL_RECORD'
]);

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const entityType = String(searchParams.get('entityType') || '').trim().toUpperCase();
  const entityId = String(searchParams.get('entityId') || '').trim();

  if (!ENTITY_TYPES.has(entityType) || !entityId || entityId.length > 100) {
    return NextResponse.json({ error: 'Missing entityType or entityId' }, { status: 400 });
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const { data, error } = await adminClient
      .from('activity_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching activity logs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Exception fetching activity logs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
