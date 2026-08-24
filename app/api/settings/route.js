import { NextResponse } from 'next/server';
import { fetchAllSettings, saveSettings } from '../../../lib/services/dbService';
import { getUserRole } from '../../../lib/apiAuth';

export async function GET() {
  const data = await fetchAllSettings();
  if (!data) return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const role = await getUserRole(request);
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized: Only ADMIN can modify settings' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data = await saveSettings(body);
    if (!data) return NextResponse.json({ error: 'Failed to save settings or unauthenticated' }, { status: 401 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
