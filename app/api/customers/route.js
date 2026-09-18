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

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count, page, limit });
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const payload = sanitizePayload(await request.json(), CUSTOMER_PAYLOAD_KEYS);
  const name = String(payload.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Tên khách hàng là bắt buộc' }, { status: 400 });

  if (name.length > 160) return NextResponse.json({ error: 'Customer name is too long' }, { status: 400 });

  const customerData = {
    name,
    phone: String(payload.phone || '').trim() || null,
    address: String(payload.address || '').trim() || null
  };
  if (customerData.phone && customerData.phone.length > 40) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
  if (customerData.address && customerData.address.length > 500) return NextResponse.json({ error: 'Customer address is too long' }, { status: 400 });
  let previous = null;
  if (typeof payload.id === 'number' || (typeof payload.id === 'string' && /^\d+$/.test(payload.id))) {
    customerData.id = Number(payload.id);
    const { data: oldData, error: oldError } = await supabase.from('customers').select('*').eq('id', customerData.id).maybeSingle();
    if (oldError) return NextResponse.json({ error: oldError.message }, { status: 500 });
    previous = oldData ? keysToCamel(oldData) : null;
  }

  // Prevent duplicate customers when the same phone is entered in another format.
  if (customerData.phone) {
    const normalizedPhone = customerData.phone.replace(/\D/g, '');
    if (normalizedPhone.length >= 8) {
      // FIX-13: Use ilike with last 8 digits for faster lookup instead of fetching all rows
      const tail8 = normalizedPhone.slice(-8);
      const { data: candidates, error: phoneError } = await supabase
        .from('customers')
        .select('id, phone')
        .not('phone', 'is', null)
        .or(`phone.ilike.%${tail8}%`);
      if (phoneError) return NextResponse.json({ error: phoneError.message }, { status: 500 });
      const duplicate = (candidates || []).find(row => (
        String(row.phone || '').replace(/\D/g, '') === normalizedPhone
        && String(row.id) !== String(customerData.id || '')
      ));
      if (duplicate) return NextResponse.json({ error: 'Số điện thoại khách hàng đã tồn tại.' }, { status: 409 });
    }
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
