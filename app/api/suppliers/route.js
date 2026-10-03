import { NextResponse } from 'next/server';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';
import { saveSupplier } from '@/lib/cloudflare/suppliers.mjs';

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'SALES_TECH', 'STAFF']);
    const id = new URL(request.url).searchParams.get('id');
    if (id && profile.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ quản trị viên được xem chi tiết nhà cung cấp.' }, { status: 403 });
    }
    let query = createDatabase(DB).from('suppliers')
      .select(profile.role === 'ADMIN' ? '*' : 'id,name,display_name')
      .order('name');
    if (profile.role !== 'ADMIN') query = query.eq('active', true);
    else query = query.order('active', { ascending: false });
    if (id) query = query.eq('id', id).maybeSingle();
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể tải nhà cung cấp' }, { status: error.status || 503 });
  }
}

export async function POST(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, ['ADMIN']);
    const input = await request.json();
    const data = await saveSupplier(DB, input, profile.name);
    return NextResponse.json(data, { status: input.id ? 200 : 201 });
  } catch (error) {
    const duplicate = /UNIQUE constraint failed: suppliers\.code/i.test(error.message || '');
    return NextResponse.json({ error: duplicate ? 'Mã nhà cung cấp đã tồn tại' : error.message || 'Không thể lưu nhà cung cấp' },
      { status: duplicate ? 409 : error.status || 400 });
  }
}
