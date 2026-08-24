import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/apiAuth';

export async function GET(request) {
  const role = await getUserRole(request);
  if (!['ADMIN', 'SALES', 'TECHNICAL'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('app_options').select('*').order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const role = await getUserRole(request);
  if (!['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  const payload = await request.json();

  const { data, error } = await supabase
    .from('app_options')
    .insert([{
      group_key: payload.group_key,
      option_key: payload.option_key,
      label: payload.label,
      is_active: payload.is_active ?? true,
      sort_order: payload.sort_order ?? 0
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request) {
  const role = await getUserRole(request);
  if (!['ADMIN', 'SALES'].includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  const payload = await request.json();

  if (!payload.id) {
    return NextResponse.json({ error: 'Missing option ID' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('app_options')
    .update({
      option_key: payload.option_key,
      label: payload.label,
      is_active: payload.is_active,
      sort_order: payload.sort_order,
      updated_at: new Date().toISOString()
    })
    .eq('id', payload.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request) {
  const role = await getUserRole(request);
  if (!['ADMIN'].includes(role)) return NextResponse.json({ error: 'Unauthorized (Admin only)' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing option ID' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('app_options')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
