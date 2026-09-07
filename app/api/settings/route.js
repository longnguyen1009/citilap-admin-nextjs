import { NextResponse } from 'next/server';
import { fetchAllSettings, saveSettings } from '../../../lib/services/dbService';
import { requireUser } from '../../../lib/apiAuth';
import { diffObject, logActivity } from '../../../lib/services/logger';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const data = await fetchAllSettings();
  if (!data) return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Settings không hợp lệ' }, { status: 400 });
    }
    const allowedKeys = new Set(['formula']);
    const unknownKey = Object.keys(body).find(key => !allowedKeys.has(key));
    if (unknownKey) {
      return NextResponse.json({ error: `Setting không được phép: ${unknownKey}` }, { status: 400 });
    }
    if (body.formula !== undefined) {
      const formula = body.formula;
      if (!formula || typeof formula !== 'object' || Array.isArray(formula)
        || !Number.isFinite(Number(formula.shippingVnd))
        || !Number.isFinite(Number(formula.divisor))
        || !Number.isFinite(Number(formula.defaultRate))
        || Number(formula.shippingVnd) < 0
        || Number(formula.divisor) <= 0
        || Number(formula.defaultRate) <= 0) {
        return NextResponse.json({ error: 'Cấu hình công thức không hợp lệ' }, { status: 400 });
      }
      body.formula = {
        shippingVnd: Number(formula.shippingVnd),
        divisor: Number(formula.divisor),
        defaultRate: Number(formula.defaultRate)
      };
    }
    const previousSettings = await fetchAllSettings() || {};
    const data = await saveSettings(body);
    if (!data) return NextResponse.json({ error: 'Không thể lưu settings' }, { status: 500 });
    for (const [key, value] of Object.entries(body)) {
      await logActivity(
        'SETTING',
        key,
        previousSettings[key] === undefined ? 'CREATE' : 'UPDATE',
        diffObject({ value: previousSettings[key] }, { value }, ['value']),
        auth.profile.name
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
