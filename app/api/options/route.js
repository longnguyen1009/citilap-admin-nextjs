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
  const groupKey = String(payload.group_key || '').trim();
  const optionKey = String(payload.option_key || '').trim();
  const label = String(payload.label || '').trim();
  if (!groupKey || !optionKey || !label) {
    return NextResponse.json({ error: 'group_key, option_key và label là bắt buộc' }, { status: 400 });
  }
  if (label.length > 120) {
    return NextResponse.json({ error: 'label không được quá 120 ký tự' }, { status: 400 });
  }

  const { data: duplicate } = await supabase
    .from('app_options')
    .select('id')
    .eq('group_key', groupKey)
    .ilike('option_key', optionKey)
    .maybeSingle();
  if (duplicate) {
    return NextResponse.json({ error: 'option_key đã tồn tại trong nhóm này' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('app_options')
    .insert([{
      group_key: groupKey,
      option_key: optionKey,
      label,
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
  if (payload.option_key !== undefined) {
    updates.option_key = String(payload.option_key).trim();
    if (!updates.option_key) {
      return NextResponse.json({ error: 'option_key không được để trống' }, { status: 400 });
    }
  }
  if (payload.label !== undefined) {
    updates.label = String(payload.label).trim();
    if (!updates.label) {
      return NextResponse.json({ error: 'label không được để trống' }, { status: 400 });
    }
    if (updates.label.length > 120) {
      return NextResponse.json({ error: 'label không được quá 120 ký tự' }, { status: 400 });
    }
  }
  if (payload.is_active !== undefined) updates.is_active = Boolean(payload.is_active);
  if (payload.sort_order !== undefined) {
    updates.sort_order = Number(payload.sort_order);
    if (!Number.isFinite(updates.sort_order)) {
      return NextResponse.json({ error: 'sort_order phải là số' }, { status: 400 });
    }
  }

  // Tránh đổi option_key thành key trùng với option khác trong cùng nhóm
  if (updates.option_key && updates.option_key !== previous.option_key) {
    const { data: duplicate } = await supabase
      .from('app_options')
      .select('id')
      .eq('group_key', previous.group_key)
      .ilike('option_key', updates.option_key)
      .neq('id', payload.id)
      .maybeSingle();
    if (duplicate) {
      return NextResponse.json({ error: 'option_key đã tồn tại trong nhóm này' }, { status: 409 });
    }
  }

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
