import { NextResponse } from 'next/server';
import { rollForwardMonth } from '../../../lib/services/dbService';
import { requireUser } from '../../../lib/apiAuth';

export async function POST(request) {
  // Chỉ ADMIN mới được chuyển tháng
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const { profile } = auth;

  try {
    const body = await request.json().catch(() => ({}));
    const newMonthKey = body.monthKey || null;
    if (!newMonthKey || !/^\d{2}\/\d{4}$/.test(newMonthKey)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai định dạng tháng (cần MM/YYYY).' }, { status: 400 });
    }

    const result = await rollForwardMonth(newMonthKey);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Chuyển tháng thất bại.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      monthKey: newMonthKey,
      laptopsMoved: result.laptopsMoved,
      ordersMoved: result.ordersMoved,
      by: profile.name,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Lỗi server.' }, { status: 500 });
  }
}
