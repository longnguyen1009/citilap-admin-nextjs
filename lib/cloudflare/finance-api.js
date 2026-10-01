import { NextResponse } from 'next/server';
import { getCloudflareBindings } from './bindings';
import { createDatabase } from './database.mjs';
import { requireSession } from './session.mjs';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const clean = (value, max=1000) => String(value ?? '').trim().slice(0,max);
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
export const financeError = error => NextResponse.json({error:error.message},{status:error.status||400});
export async function financeAdmin(request) {
  try {
    const {DB}=getCloudflareBindings();
    const profile=await requireSession(DB,request,['ADMIN']);
    return {db:createDatabase(DB),auth:{profile}};
  } catch(error) { return {response:financeError(error)}; }
}
