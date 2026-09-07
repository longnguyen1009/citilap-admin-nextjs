import { NextResponse } from 'next/server';
import { fetchStockMovementsFromCloud, saveStockMovementToCloud } from '../../../lib/services/dbService';
import { requireUser } from '../../../lib/apiAuth';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  const data = await fetchStockMovementsFromCloud();
  if (!data) return NextResponse.json({ error: 'Failed to fetch stock movements' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const data = await saveStockMovementToCloud(body);
    if (!data) return NextResponse.json({ error: 'Failed to save stock movement' }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
