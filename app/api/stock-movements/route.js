import { NextResponse } from 'next/server';
import { fetchStockMovementsFromCloud, saveStockMovementToCloud } from '../../../lib/services/dbService';
import { requireUser, sanitizePayload, STOCK_MOVEMENT_PAYLOAD_KEYS } from '../../../lib/apiAuth';
import { logActivity, pickAuditFields } from '../../../lib/services/logger';

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
    const body = sanitizePayload(await request.json(), STOCK_MOVEMENT_PAYLOAD_KEYS);
    // Server-set audit fields
    delete body.createdAt;
    const data = await saveStockMovementToCloud({ ...body, performedBy: auth.profile.name });
    if (!data) return NextResponse.json({ error: 'Failed to save stock movement' }, { status: 500 });
    await logActivity('STOCK_MOVEMENT', data.id, 'CREATE', pickAuditFields(data, ['laptopId', 'movementType', 'type', 'fromLocation', 'toLocation', 'orderId', 'warrantyCaseId', 'note', 'performedBy']), auth.profile.name);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
