import { NextResponse } from 'next/server';
import { fetchAllSettings, saveSettings } from '../../../lib/services/dbService';
import { requireUser } from '../../../lib/apiAuth';
import { diffObject, logActivity } from '../../../lib/services/logger';

const canonicalSettings = settings => {
  if (!settings?.formula || typeof settings.formula !== 'object') return settings;
  const { shippingVnd, divisor, defaultRate } = settings.formula;
  return { ...settings, formula: { shippingVnd, divisor, defaultRate } };
};

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  const data = await fetchAllSettings();
  if (!data) return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  return NextResponse.json(canonicalSettings(data));
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
      if (!formula || typeof formula !== 'object' || Array.isArray(formula)) {
        return NextResponse.json({ error: 'Cấu hình công thức không hợp lệ' }, { status: 400 });
      }
      const formulaKeys = Object.keys(formula);
      const allowedFormulaKeys = ['shippingVnd', 'divisor', 'defaultRate'];
      const unknown = formulaKeys.find(k => !allowedFormulaKeys.includes(k));
      if (unknown) {
        return NextResponse.json({ error: `Field không được phép trong formula: ${unknown}` }, { status: 400 });
      }
      if (!Number.isFinite(Number(formula.shippingVnd)) || Number(formula.shippingVnd) < 0 || Number(formula.shippingVnd) > 1e9
        || !Number.isFinite(Number(formula.divisor)) || Number(formula.divisor) <= 0 || Number(formula.divisor) > 1e9
        || !Number.isFinite(Number(formula.defaultRate)) || Number(formula.defaultRate) <= 0 || Number(formula.defaultRate) > 1e9) {
        return NextResponse.json({ error: 'Cấu hình công thức không hợp lệ (giá trị ngoài phạm vi)' }, { status: 400 });
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
