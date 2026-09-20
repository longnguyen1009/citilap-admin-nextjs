import { NextResponse } from 'next/server';
import { fetchWarrantyCasesFromCloud, saveWarrantyCaseToCloud } from '../../../lib/services/dbService';
import { requireUser, sanitizePayload, validateWarrantyPayload, WARRANTY_PAYLOAD_KEYS } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { diffObject, pickAuditFields, logActivity } from '@/lib/services/logger';
import { keysToCamel } from '@/lib/services/dbService';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  const data = await fetchWarrantyCasesFromCloud();
  if (!data) return NextResponse.json({ error: 'Failed to fetch warranty cases' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF']);
  if (!auth.ok) return auth.response;
  try {
    const body = sanitizePayload(await request.json(), WARRANTY_PAYLOAD_KEYS);
    // Server-set audit fields: ignore client-sent timestamps and actor
    delete body.createdAt;
    delete body.updatedAt;
    body.handledBy = auth.profile.name;
    validateWarrantyPayload(body);
    const adminClient = getSupabaseAdminClient();
    let previous = null;
    if (adminClient && body.id && /^\d+$/.test(String(body.id))) {
      const { data: oldData, error: oldError } = await adminClient.from('warranty_cases').select('*').eq('id', Number(body.id)).maybeSingle();
      if (oldError) return NextResponse.json({ error: oldError.message }, { status: 500 });
      previous = oldData ? keysToCamel(oldData) : null;
    }
    const data = await saveWarrantyCaseToCloud(body);
    if (!data) return NextResponse.json({ error: 'Failed to save warranty case' }, { status: 500 });
    const fields = ['orderId', 'laptopId', 'reportedIssue', 'status', 'receivedDate', 'resolvedDate', 'repairCost', 'partsReplaced', 'diagnosis', 'resolution', 'resolutionNote', 'notes', 'customerInfo', 'handledBy'];
    await logActivity('WARRANTY', data.id, previous ? 'UPDATE' : 'CREATE', previous ? diffObject(previous, data, fields) : pickAuditFields(data, fields), auth.profile.name);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
