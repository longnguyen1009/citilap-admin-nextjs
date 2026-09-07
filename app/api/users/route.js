import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';

const ALLOWED_ROLES = new Set(['ADMIN', 'SALES', 'TECHNICAL', 'TECH', 'STAFF']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validateEmail = (email) => typeof email === 'string'
  && email.trim().length <= 254
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const validateUserId = (id) => typeof id === 'string' && UUID_RE.test(id);

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

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
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
  const payload = await request.json();

  if (!validateEmail(payload.email) || typeof payload.password !== 'string' || payload.password.length < 8
    || payload.password.length > 128 || typeof payload.name !== 'string' || !payload.name.trim()) {
    return NextResponse.json({ error: 'Email, tên và mật khẩu tối thiểu 8 ký tự là bắt buộc' }, { status: 400 });
  }
  if (payload.role !== undefined && !ALLOWED_ROLES.has(payload.role)) {
    return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 });
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

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId);
      throw profileError;
    }

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
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
  const payload = await request.json();

  if (!validateUserId(payload.id)) {
    return NextResponse.json({ error: 'User ID không hợp lệ' }, { status: 400 });
  }
  if (payload.email !== undefined && !validateEmail(payload.email)) {
    return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 });
  }
  if (payload.password !== undefined && (typeof payload.password !== 'string' || payload.password.length < 8 || payload.password.length > 128)) {
    return NextResponse.json({ error: 'Mật khẩu phải dài từ 8 đến 128 ký tự' }, { status: 400 });
  }
  if (payload.name !== undefined && (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 120)) {
    return NextResponse.json({ error: 'Tên không hợp lệ' }, { status: 400 });
  }
  if (payload.role !== undefined && !ALLOWED_ROLES.has(payload.role)) {
    return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 });
  }
  if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active không hợp lệ' }, { status: 400 });
  }
  if (payload.id === auth.profile.id && payload.is_active === false) {
    return NextResponse.json({ error: 'Không thể tự khóa tài khoản đang đăng nhập' }, { status: 400 });
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
    const profileUpdates = { updated_at: new Date().toISOString() };
    if (payload.name !== undefined) profileUpdates.name = payload.name.trim();
    if (payload.role !== undefined) profileUpdates.role = payload.role;
    if (payload.is_active !== undefined) profileUpdates.is_active = payload.is_active;

    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .update(profileUpdates)
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
