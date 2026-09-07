import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { diffObject, pickAuditFields, logActivity } from '@/lib/services/logger';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const { data, error } = await supabase.from('app_options').select('*').order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const payload = await request.json();
  if (!payload.group_key || !payload.option_key || !payload.label) {
    return NextResponse.json({ error: 'group_key, option_key và label là bắt buộc' }, { status: 400 });
  }

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
  await logActivity(
    'OPTION',
    data.id,
    'CREATE',
    pickAuditFields(data, ['group_key', 'option_key', 'label', 'is_active', 'sort_order']),
    auth.profile.name
  );
  return NextResponse.json(data);
}

export async function PUT(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const payload = await request.json();

  if (!payload.id) {
    return NextResponse.json({ error: 'Missing option ID' }, { status: 400 });
  }

  const { data: previous, error: previousError } = await supabase
    .from('app_options')
    .select('*')
    .eq('id', payload.id)
    .maybeSingle();
  if (previousError) return NextResponse.json({ error: previousError.message }, { status: 500 });
  if (!previous) return NextResponse.json({ error: 'Option not found' }, { status: 404 });

  const updates = { updated_at: new Date().toISOString() };
  if (payload.option_key !== undefined) updates.option_key = payload.option_key;
  if (payload.label !== undefined) updates.label = payload.label;
  if (payload.is_active !== undefined) updates.is_active = payload.is_active;
  if (payload.sort_order !== undefined) updates.sort_order = payload.sort_order;

  const { data, error } = await supabase
    .from('app_options')
    .update(updates)
    .eq('id', payload.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(
    'OPTION',
    data.id,
    'UPDATE',
    diffObject(previous, data, ['group_key', 'option_key', 'label', 'is_active', 'sort_order']),
    auth.profile.name
  );
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
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  const { data: previous, error: previousError } = await supabase
    .from('app_options')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (previousError) return NextResponse.json({ error: previousError.message }, { status: 500 });
  if (!previous) return NextResponse.json({ error: 'Option not found' }, { status: 404 });
  const { error } = await supabase
    .from('app_options')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(
    'OPTION',
    id,
    'DELETE',
    pickAuditFields(previous, ['group_key', 'option_key', 'label', 'is_active', 'sort_order']),
    auth.profile.name
  );
  return NextResponse.json({ success: true });
}
