import { NextResponse } from 'next/server';
import { fetchLaptopsFromCloud, saveLaptopToCloud } from '../../../lib/services/dbService';
import { getUserRole, filterSensitiveFields, SENSITIVE_LAPTOP_KEYS } from '../../../lib/apiAuth';

export async function GET(request) {
  const role = await getUserRole(request);
  const isAdmin = role === 'ADMIN';

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get('monthKey');
  const all = searchParams.get('all') === 'true';
  const data = await fetchLaptopsFromCloud({ monthKey, all });
  
  if (!data) return NextResponse.json({ error: 'Failed to fetch laptops' }, { status: 500 });
  
  const filteredData = isAdmin ? data : filterSensitiveFields(data, SENSITIVE_LAPTOP_KEYS);
  return NextResponse.json(filteredData);
}

export async function POST(request) {
  const role = await getUserRole(request);
  const isAdmin = role === 'ADMIN';

  try {
    const body = await request.json();
    
    // Non-admin shouldn't be updating prices or profit
    if (!isAdmin) {
      SENSITIVE_LAPTOP_KEYS.forEach(key => {
        delete body[key];
      });
    }

    const data = await saveLaptopToCloud(body);
    if (!data) return NextResponse.json({ error: 'Failed to save laptop' }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
