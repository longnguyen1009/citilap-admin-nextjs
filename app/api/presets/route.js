import { NextResponse } from 'next/server';
import { routeContext } from '@/lib/cloudflare/route-helpers.mjs';

const PRESET_KEY = 'preset_configs';

const isPresetMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) => (
    key.length <= 120 && typeof item === 'string' && item.trim().length <= 500
  ));
};

export async function GET(request) {
  try {
  const { db } = await routeContext(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', PRESET_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ presets: data?.value || {} });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
}

export async function POST(request) {
  try {
    const { db } = await routeContext(request, ['ADMIN']);
    const body = await request.json();
    if (!isPresetMap(body?.presets)) {
      return NextResponse.json({ error: 'Presets không hợp lệ' }, { status: 400 });
    }

    const { data, error } = await db
      .from('app_settings')
      .upsert({ key: PRESET_KEY, value: body.presets }, { onConflict: 'key' })
      .select('value')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ presets: data.value });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Payload không hợp lệ' }, { status: 400 });
  }
}
