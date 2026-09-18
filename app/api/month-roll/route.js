import { NextResponse } from 'next/server';
import { rollForwardMonth } from '../../../lib/services/dbService';
import { requireUser } from '../../../lib/apiAuth';

export async function POST(request) {
  // Chỉ ADMIN mới được chuyển tháng
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const { profile } = auth;

  try {
    // Chức năng này luôn đưa dữ liệu tồn từ các tháng trước về tháng hiện tại,
    // không cộng thêm một tháng dựa trên tháng đang xem hoặc giá trị client gửi.
    await request.json().catch(() => ({}));
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(new Date());
    const month = parts.find(part => part.type === 'month')?.value;
    const year = parts.find(part => part.type === 'year')?.value;
    const newMonthKey = `${month}/${year}`;

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
