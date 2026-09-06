import { NextResponse } from 'next/server';
import { fetchLaptopsFromCloud, saveLaptopToCloud } from '../../../lib/services/dbService';
import { logActivity } from '../../../lib/services/logger';
import { getUserProfile, filterSensitiveFields, SENSITIVE_LAPTOP_KEYS } from '../../../lib/apiAuth';
import { getSupabaseAdminClient } from '../../../lib/supabaseClient';

export async function GET(request) {
  const profile = await getUserProfile(request);
  const isAdmin = profile.role === 'ADMIN';

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get('monthKey');
  const all = searchParams.get('all') === 'true';
  const data = await fetchLaptopsFromCloud({ monthKey, all });
  
  if (!data) return NextResponse.json({ error: 'Failed to fetch laptops' }, { status: 500 });
  
  const filteredData = isAdmin ? data : filterSensitiveFields(data, SENSITIVE_LAPTOP_KEYS);
  return NextResponse.json(filteredData);
}

export async function POST(request) {
  const profile = await getUserProfile(request);
  const isAdmin = profile.role === 'ADMIN';

  try {
    const body = await request.json();
    
    // Non-admin shouldn't be updating prices or profit
    if (!isAdmin) {
      SENSITIVE_LAPTOP_KEYS.forEach(key => {
        delete body[key];
      });
    }

    // Lấy dữ liệu cũ để diff
    let oldData = null;
    let action = 'CREATE';
    if (body.id && !String(body.id).startsWith('#')) {
      const adminClient = getSupabaseAdminClient();
      const { data } = await adminClient.from('laptops').select('*').eq('id', body.id).single();
      if (data) {
        oldData = data;
        action = 'UPDATE';
      }
    }

    const data = await saveLaptopToCloud(body);
    if (!data) return NextResponse.json({ error: 'Failed to save laptop' }, { status: 500 });

    // So sánh thay đổi (chỉ so sánh một số trường quan trọng hoặc toàn bộ)
    let changes = {};
    if (action === 'UPDATE' && oldData) {
       Object.keys(body).forEach(k => {
         // Chuyển đổi tên key về dạng snake_case nếu cần để so sánh, nhưng dbService keysToCamel đã handle
         // Ta sẽ so sánh đơn giản các trường có trong body
         const camelKey = k;
         const snakeKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
         
         let oldVal = oldData[snakeKey];
         let newVal = body[k];
         
         // Bỏ qua nếu là updated_at
         if (snakeKey === 'updated_at' || snakeKey === 'id') return;
         
         // So sánh loose vì string / number có thể lệch type
         if (oldVal != newVal && (oldVal || newVal)) {
           // Bỏ qua nếu 1 bên rỗng và 1 bên null
           if ((oldVal === null || oldVal === '') && (newVal === null || newVal === '')) return;
           changes[k] = { old: oldVal, new: newVal };
         }
       });
    } else {
       changes = body; // Tạo mới thì lưu toàn bộ
    }

    await logActivity('LAPTOP', data.id, action, changes, profile.name);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
