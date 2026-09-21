import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { diffObject, logActivity, pickAuditFields } from '@/lib/services/logger';

const clean = (value, max = 500) => String(value ?? '').replace(/<[^>]*>/g, '').trim().slice(0, max);
const fields = ['code','name','display_name','wechat_name','wechat_id','phone','country','province','city','address','bank_name','bank_account_name','bank_account_number','alipay_account','preferred_shipping_destination','notes','active'];

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const id = new URL(request.url).searchParams.get('id');
  let query = db.from('suppliers').select('*').order('active', { ascending: false }).order('name');
  if (id) query = query.eq('id', id).maybeSingle();
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Chưa tải được nhà cung cấp. Hãy áp dụng migration Procurement Phase 1.' }, { status: 503 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  try {
    const input = await request.json();
    const code = clean(input.code, 40).toUpperCase();
    const name = clean(input.name, 200);
    if (!/^[A-Z0-9_-]{2,40}$/.test(code) || !name) throw new Error('Mã và tên nhà cung cấp không hợp lệ');
    const row = { code, name, active: input.active !== false };
    for (const key of fields.filter(key => !['code','name','active'].includes(key))) row[key] = clean(input[key], key === 'notes' ? 3000 : 500);
    if (!['YUNNAN','GUANGXI','OTHER'].includes(row.preferred_shipping_destination)) row.preferred_shipping_destination = 'OTHER';
    const db = getSupabaseAdminClient();
    let previous = null;
    if (input.id) ({ data: previous } = await db.from('suppliers').select('*').eq('id', input.id).maybeSingle());
    if (!input.id) row.created_by = auth.profile.name;
    const result = input.id ? db.from('suppliers').update(row).eq('id', input.id) : db.from('suppliers').insert(row);
    const { data, error } = await result.select().single();
    if (error) throw new Error(error.code === '23505' ? 'Mã nhà cung cấp đã tồn tại' : error.message);
    await logActivity('SUPPLIER', data.id, previous ? 'UPDATE' : 'CREATE', previous ? diffObject(previous, data, fields) : pickAuditFields(data, fields), auth.profile.name);
    return NextResponse.json(data, { status: previous ? 200 : 201 });
  } catch (error) { return NextResponse.json({ error: error.message || 'Không thể lưu nhà cung cấp' }, { status: 400 }); }
}

