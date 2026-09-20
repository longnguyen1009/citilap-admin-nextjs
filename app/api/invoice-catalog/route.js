import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser, isValidPositiveId } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const [branches, accessories] = await Promise.all([
    db.from('branches').select('*').order('id'), db.from('accessories').select('*').order('id')
  ]);
  if (branches.error || accessories.error) return NextResponse.json({ error: 'Chưa tải được chi nhánh/phụ kiện. Cần áp dụng migration hóa đơn.' }, { status: 503 });
  return NextResponse.json({ branches: branches.data, accessories: accessories.data });
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  try {
    const input = await request.json();
    const { type, id } = input;
    if (!['branches','accessories'].includes(type) || (id && !isValidPositiveId(id))) throw new Error('Dữ liệu không hợp lệ');
    const name = String(input.name || '').trim();
    if (!name || name.length > 160) throw new Error('Tên bắt buộc, tối đa 160 ký tự');
    const row = { name, active: input.active !== false };
    if (type === 'branches') {
      row.address = String(input.address || '').trim();
      if (row.address.length > 1000) throw new Error('Địa chỉ quá dài');
    } else {
      row.sku = String(input.sku || `PK-${randomUUID().slice(0, 8)}`).trim().toUpperCase();
      row.kind = input.kind || 'other';
      row.price = Number(input.price || 0);
      row.note = String(input.note || '').trim();
      if (!/^[A-Z0-9_-]{1,80}$/.test(row.sku) || !['mouse','backpack','mousepad','sleeve','other'].includes(row.kind)
        || !Number.isFinite(row.price) || row.price < 0 || row.note.length > 2000) throw new Error('Loại hoặc giá phụ kiện không hợp lệ');
    }
    const db = getSupabaseAdminClient();
    const { data, error } = await (id ? db.from(type).update(row).eq('id', id) : db.from(type).insert(row)).select().single();
    if (error) throw new Error(error.code === '23505' ? 'SKU đã tồn tại' : 'Không thể lưu danh mục');
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
