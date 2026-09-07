import { NextResponse } from 'next/server';
import { fetchAllSettings, saveSettings } from '../../../lib/services/dbService';
import { requireUser } from '../../../lib/apiAuth';

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
    const data = await saveSettings(body);
    if (!data) return NextResponse.json({ error: 'Failed to save settings or unauthenticated' }, { status: 401 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
