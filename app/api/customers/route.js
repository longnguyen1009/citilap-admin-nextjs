import { NextResponse } from 'next/server';
import { initSupabaseClient } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/apiAuth';

export async function GET(request) {
  const role = await getUserRole(request);
  if (!['ADMIN', 'SALES', 'TECHNICAL'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = initSupabaseClient();
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request) {
  const role = await getUserRole(request);
  if (!['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = initSupabaseClient();
  const customerData = await request.json();

  const { data, error } = await supabase.from('customers').upsert(customerData, { onConflict: 'id' }).select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}
