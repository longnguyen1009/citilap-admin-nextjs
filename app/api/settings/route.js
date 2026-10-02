import { NextResponse } from 'next/server';
import { routeContext, writeAudit } from '../../../lib/cloudflare/route-helpers.mjs';

const canonicalSettings = settings => {
  if (!settings?.formula || typeof settings.formula !== 'object') return settings;
  const { shippingVnd, divisor, defaultRate } = settings.formula;
  return { ...settings, formula: { shippingVnd, divisor, defaultRate } };
};

async function readSettings(db) {
  const { data, error } = await db.from('app_settings').select('*');
  if (error) throw new Error(error.message);
  return Object.fromEntries(data.map(row => [row.key, row.value]));
}

export async function GET(request) {
  try {
    const { db } = await routeContext(request, ['ADMIN']);
    return NextResponse.json(canonicalSettings(await readSettings(db)));
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
}

export async function POST(request) {
  try {
    const { DB, db, profile } = await routeContext(request, ['ADMIN']);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'formula')) {
      return NextResponse.json({ error: 'Settings không hợp lệ' }, { status: 400 });
    }
    const formula = body.formula;
    if (!formula || typeof formula !== 'object' || Array.isArray(formula)
      || Object.keys(formula).some(key => !['shippingVnd', 'divisor', 'defaultRate'].includes(key))) {
      return NextResponse.json({ error: 'Cấu hình công thức không hợp lệ' }, { status: 400 });
    }
    const value = {
      shippingVnd: Number(formula.shippingVnd), divisor: Number(formula.divisor), defaultRate: Number(formula.defaultRate),
    };
    if (!Number.isFinite(value.shippingVnd) || value.shippingVnd < 0 || value.shippingVnd > 1e9
      || !Number.isFinite(value.divisor) || value.divisor <= 0 || value.divisor > 1e9
      || !Number.isFinite(value.defaultRate) || value.defaultRate <= 0 || value.defaultRate > 1e9) {
      return NextResponse.json({ error: 'Cấu hình công thức có giá trị ngoài phạm vi' }, { status: 400 });
    }
    const previous = await readSettings(db);
    const { error } = await db.from('app_settings').upsert({ key: 'formula', value, updated_at: new Date().toISOString() }, { onConflict: 'key' }).select().single();
    if (error) throw new Error(error.message);
    await writeAudit(DB, 'SETTING', 'formula', previous.formula === undefined ? 'CREATE' : 'UPDATE', { before: previous.formula, after: value }, profile.name);
    return NextResponse.json(true);
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); }
}
