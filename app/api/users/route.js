import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/apiAuth';

export async function GET(request) {
  const role = await getUserRole(request);
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized (Admin only)' }, { status: 401 });
  }

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
  }

  try {
    // 1. Fetch users from auth.users (via admin API)
    const { data: authData, error: authError } = await adminClient.auth.admin.listUsers();
    if (authError) throw authError;

    // 2. Fetch profiles from user_profiles
    const { data: profiles, error: profileError } = await adminClient
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (profileError) throw profileError;

    // 3. Merge data
    const users = authData.users.map(u => {
      const profile = profiles.find(p => p.id === u.id) || {};
      return {
        id: u.id,
        email: u.email,
        name: profile.name || '',
        role: profile.role || 'SALES',
        is_active: profile.is_active !== false,
        created_at: profile.created_at || u.created_at,
        last_sign_in_at: u.last_sign_in_at
      };
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const role = await getUserRole(request);
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized (Admin only)' }, { status: 401 });
  }

  const adminClient = getSupabaseAdminClient();
  const payload = await request.json();

  if (!payload.email || !payload.password || !payload.name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    // 1. Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true
    });

    if (authError) throw authError;

    // 2. Wait a moment for trigger (if any) or directly upsert profile
    const userId = authData.user.id;
    
    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .upsert({
        id: userId,
        name: payload.name,
        role: payload.role || 'SALES',
        is_active: true
      })
      .select()
      .single();

    if (profileError) throw profileError;

    return NextResponse.json({
      id: userId,
      email: authData.user.email,
      name: profile.name,
      role: profile.role,
      is_active: profile.is_active
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  const role = await getUserRole(request);
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized (Admin only)' }, { status: 401 });
  }

  const adminClient = getSupabaseAdminClient();
  const payload = await request.json();

  if (!payload.id) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
  }

  try {
    // 1. Update auth email/password if provided
    const authUpdates = {};
    if (payload.email) authUpdates.email = payload.email;
    if (payload.password) authUpdates.password = payload.password;
    
    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(payload.id, authUpdates);
      if (authError) throw authError;
    }

    // 2. Update profile
    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .update({
        name: payload.name,
        role: payload.role,
        is_active: payload.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', payload.id)
      .select()
      .single();

    if (profileError) throw profileError;

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
