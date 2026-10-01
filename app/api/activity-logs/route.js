import { NextResponse } from 'next/server';
import { canReadAudit, visibleAuditChanges } from '@/lib/auditVisibility';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';

const ROLES = ['ADMIN', 'SALES', 'TECH', 'TECHNICAL', 'STAFF'];
const ENTITY_TYPES = new Set([
  'LAPTOP', 'ORDER', 'CUSTOMER', 'WARRANTY', 'STOCK_MOVEMENT', 'SETTING', 'OPTION', 'PAYMENT', 'FINANCIAL_RECORD',
]);

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, ROLES);
    const { searchParams } = new URL(request.url);
    const entityType = String(searchParams.get('entityType') || '').trim().toUpperCase();
    const entityId = String(searchParams.get('entityId') || '').trim();
    if (!ENTITY_TYPES.has(entityType) || !entityId || entityId.length > 100) {
      return NextResponse.json({ error: 'Missing entityType or entityId' }, { status: 400 });
    }
    if (!canReadAudit(profile.role, entityType)) {
      return NextResponse.json({ error: 'Không có quyền xem lịch sử này.' }, { status: 403 });
    }
    const result = await createDatabase(DB).from('activity_logs').select('*')
      .eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: false });
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json(result.data.map(row => ({
      ...row, changes: visibleAuditChanges(row.changes, profile.role),
    })), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể tải lịch sử hoạt động' }, { status: error.status || 500 });
  }
}
