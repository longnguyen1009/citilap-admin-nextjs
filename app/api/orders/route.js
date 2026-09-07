import { NextResponse } from 'next/server';
import { fetchOrdersFromCloud, saveOrderToCloud } from '../../../lib/services/dbService';
import { logActivity } from '../../../lib/services/logger';
import { requireUser, filterSensitiveFields, SENSITIVE_ORDER_KEYS } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin';

export async function GET(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  const isAdmin = profile.role === 'ADMIN';

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get('monthKey');
  const all = searchParams.get('all') === 'true';
  const data = await fetchOrdersFromCloud({ monthKey, all });
  
  if (!data) return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  
  const filteredData = isAdmin ? data : filterSensitiveFields(data, SENSITIVE_ORDER_KEYS);
  return NextResponse.json(filteredData);
}

export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN', 'SALES']);
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  const isAdmin = profile.role === 'ADMIN';

  try {
    const body = await request.json();
    
    // Non-admin shouldn't be updating profit directly
    if (!isAdmin) {
      SENSITIVE_ORDER_KEYS.forEach(key => {
        delete body[key];
      });
    }

    let oldData = null;
    let action = 'CREATE';
    if (body.id && !String(body.id).startsWith('#')) {
      const adminClient = getSupabaseAdminClient();
      const { data } = await adminClient.from('orders').select('*').eq('id', body.id).single();
      if (data) {
        oldData = data;
        action = 'UPDATE';
      }
    }

    const data = await saveOrderToCloud(body);
    if (data === null || data === false) {
      return NextResponse.json({ error: 'Failed to save order (saveOrderToCloud returned null or false)' }, { status: 500 });
    }

    let changes = {};
    if (action === 'UPDATE' && oldData) {
       Object.keys(body).forEach(k => {
         const camelKey = k;
         const snakeKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
         let oldVal = oldData[snakeKey];
         let newVal = body[k];
         
         if (snakeKey === 'updated_at' || snakeKey === 'id') return;
         if (oldVal != newVal && (oldVal || newVal)) {
           if ((oldVal === null || oldVal === '') && (newVal === null || newVal === '')) return;
           changes[k] = { old: oldVal, new: newVal };
         }
       });
    } else {
       changes = body;
    }

    await logActivity('ORDER', data.id, action, changes, profile.name);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
