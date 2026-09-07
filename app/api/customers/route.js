import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { requireUser, sanitizePayload, CUSTOMER_PAYLOAD_KEYS } from '@/lib/apiAuth';
import { diffObject, pickAuditFields, logActivity } from '@/lib/services/logger';
import { keysToCamel } from '@/lib/services/dbService';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const payload = sanitizePayload(await request.json(), CUSTOMER_PAYLOAD_KEYS);
  const name = String(payload.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Tên khách hàng là bắt buộc' }, { status: 400 });

  const customerData = {
    name,
    phone: String(payload.phone || '').trim() || null,
    address: String(payload.address || '').trim() || null
  };
  let previous = null;
  if (typeof payload.id === 'number' || (typeof payload.id === 'string' && /^\d+$/.test(payload.id))) {
    customerData.id = Number(payload.id);
    const { data: oldData, error: oldError } = await supabase.from('customers').select('*').eq('id', customerData.id).maybeSingle();
    if (oldError) return NextResponse.json({ error: oldError.message }, { status: 500 });
    previous = oldData ? keysToCamel(oldData) : null;
  }

  const { data, error } = await supabase.from('customers').upsert(customerData, { onConflict: 'id' }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const current = keysToCamel(data);
  const fields = ['name', 'phone', 'address'];
  await logActivity(
    'CUSTOMER',
    current.id,
    previous ? 'UPDATE' : 'CREATE',
    previous ? diffObject(previous, current, fields) : pickAuditFields(current, fields),
    auth.profile.name
  );
  return NextResponse.json(data);
}
