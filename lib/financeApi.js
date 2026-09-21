import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
export const positive = value => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error('Số tiền phải lớn hơn 0');
  return number;
};
export const idempotency = value => {
  const key = clean(value, 90);
  if (key.length < 8) throw new Error('Idempotency key không hợp lệ');
  return key;
};
export const financeAdmin = async request => {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return { response: auth.response };
  const db = getSupabaseAdminClient();
  if (!db) return { response: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) };
  return { auth, db };
};
export const financeError = error => NextResponse.json({ error: error.message || 'Không thể xử lý yêu cầu tài chính' }, { status: 400 });

