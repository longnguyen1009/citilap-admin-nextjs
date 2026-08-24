import { NextResponse } from 'next/server';
import { fetchWarrantyCasesFromCloud, saveWarrantyCaseToCloud } from '../../../lib/services/dbService';

export async function GET() {
  const data = await fetchWarrantyCasesFromCloud();
  if (!data) return NextResponse.json({ error: 'Failed to fetch warranty cases' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await saveWarrantyCaseToCloud(body);
    if (!data) return NextResponse.json({ error: 'Failed to save warranty case' }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
