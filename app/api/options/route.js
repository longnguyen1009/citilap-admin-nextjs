import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from('app_options').select('*').order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdminClient();
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
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdminClient();
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
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing option ID' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('app_options')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
