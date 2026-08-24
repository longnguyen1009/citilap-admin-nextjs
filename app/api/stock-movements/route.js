import { NextResponse } from 'next/server';
import { fetchStockMovementsFromCloud, saveStockMovementToCloud } from '../../../lib/services/dbService';

export async function GET() {
  const data = await fetchStockMovementsFromCloud();
  if (!data) return NextResponse.json({ error: 'Failed to fetch stock movements' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await saveStockMovementToCloud(body);
    if (!data) return NextResponse.json({ error: 'Failed to save stock movement' }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
