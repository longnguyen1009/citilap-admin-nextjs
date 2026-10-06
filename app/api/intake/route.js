import { NextResponse } from 'next/server';
import { parseListScope, monthDateRange } from '@/lib/listScope';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { createDatabase } from '@/lib/cloudflare/database.mjs';
import { requireSession } from '@/lib/cloudflare/session.mjs';
import { SALES_TECHNICAL_ROLES } from '@/lib/roles.mjs';

const RECEIVING_ROLES = SALES_TECHNICAL_ROLES;
const RECEIVING_PRICE_FIELDS = ['purchase_price_rmb', 'shipping_rmb', 'purchase_exchange_rate', 'import_price_vnd', 'price_rmb', 'exchange_rate'];
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const keyOf = value => {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 80) throw new Error('Mã chống gửi trùng không hợp lệ');
  return key;
};
async function allRows(query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const result = await query().range(offset, offset + 499);
    if (result.error) return result;
    rows.push(...result.data);
    if (result.data.length < 500) return { data: rows, error: null };
  }
}

export async function GET(request) {
  let db, profile;
  const params = new URL(request.url).searchParams;
  const receiving = params.get('mode') === 'receiving';
  try {
    const { DB } = getCloudflareBindings();
    profile = await requireSession(DB, request, receiving ? RECEIVING_ROLES : ['ADMIN']);
    db = createDatabase(DB);
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
  let scope;
  try { scope = parseListScope(params); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const batchId = params.get('batchId');
  if (batchId && !validId(batchId)) return NextResponse.json({ error: 'Mã lô không hợp lệ' }, { status: 400 });
  const isAdmin = profile.role === 'ADMIN';
  const purchaseRange = !batchId && !scope.all && !receiving ? monthDateRange(scope.monthKey) : null;
  const laptopFields = batchJoin => `id,sku,purchase_batch_id,source_type,name,category,serial,tracking_code_cn,purchase_price_rmb,shipping_rmb,purchase_exchange_rate,import_price_vnd,status,received_at,condition_note,month_key,${batchJoin}`;
  const baseLaptopQuery = batchJoin => db.from('laptops')
    .select(laptopFields(batchJoin))
    .orEquals({ is_active: true, status: 'ignored' })
    .in('source_type', ['SUPPLIER_PURCHASE', 'SUPPLIER_REPLACEMENT', 'UNKNOWN'])
    .order('id', { ascending: false });
  const [laptops, suppliers, options] = await Promise.all([
    purchaseRange ? (async () => {
      const batchJoin = 'purchase_batches!inner(id,batch_code,supplier_id,purchase_date,exchange_rate,suppliers(name))';
      const [dated, unresolved] = await Promise.all([
        allRows(() => baseLaptopQuery(batchJoin)
          .gte('purchase_batches.purchase_date', purchaseRange.start)
          .lt('purchase_batches.purchase_date', purchaseRange.end)),
        allRows(() => baseLaptopQuery('purchase_batches(id,batch_code,supplier_id,purchase_date,exchange_rate,suppliers(name))')
          .eq('source_type', 'UNKNOWN')
          .eq('month_key', scope.monthKey)),
      ]);
      if (dated.error) return dated;
      if (unresolved.error) return unresolved;
      const unique = new Map([...dated.data, ...unresolved.data].map(row => [String(row.id), row]));
      return { data: [...unique.values()].sort((a, b) => Number(b.id) - Number(a.id)), error: null };
    })() : allRows(() => {
      let query = baseLaptopQuery('purchase_batches(id,batch_code,supplier_id,purchase_date,exchange_rate,suppliers(name))');
      if (batchId) query = query.eq('purchase_batch_id', Number(batchId));
      if (receiving) query = query.eq('status', 'in_transit');
      return query;
    }),
    allRows(() => db.from('suppliers').select('id,name,code').eq('active', true).order('name')),
    db.from('app_options').select('group_key,option_key,label,sort_order').eq('group_key', 'category').eq('is_active', true).order('sort_order')
  ]);
  const failed = [laptops, suppliers, options].find(result => result.error);
  if (failed) return NextResponse.json({ error: failed.error.message || 'Không tải được dữ liệu nhập hàng' }, { status: 503 });
  const categories = options.data.filter(row => row.group_key === 'category');
  const batches = new Map();
  const rows = laptops.data.map(({ purchase_batches: batch, ...laptop }) => {
    if (batch) batches.set(batch.id, { id: batch.id, batch_code: batch.batch_code, supplier_id: batch.supplier_id,
      purchase_date: batch.purchase_date, ...(isAdmin ? { exchange_rate: batch.exchange_rate } : {}),
      supplier_name: batch.suppliers?.name || '' });
    if (isAdmin) return laptop;
    return Object.fromEntries(Object.entries(laptop).filter(([key]) => !RECEIVING_PRICE_FIELDS.includes(key)));
  });
  return NextResponse.json({
    batches: [...batches.values()],
    laptops: rows,
    unresolved: rows.filter(row => row.source_type === 'UNKNOWN'),
    suppliers: isAdmin ? suppliers.data : [],
    categories
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request) {
  try {
    const { DB } = getCloudflareBindings();
    const profile = await requireSession(DB, request, RECEIVING_ROLES);
    const body = await request.json();
    if (profile.role !== 'ADMIN' && body.action !== 'receive') {
      return NextResponse.json({ error: 'Bạn chỉ có quyền xác nhận nhận hàng.' }, { status: 403 });
    }
    const db = createDatabase(DB);
    const actor = profile.name || 'Admin';
    let result;
    if (body.action === 'create') {
      result = await db.rpc('create_purchase_batch', {
        p_batch: body.batch, p_laptops: body.laptops || body.items, p_actor: actor,
        p_idempotency_key: keyOf(body.key)
      });
    } else if (body.action === 'addToBatch') {
      if (!validId(body.batchId)) throw new Error('Mã lô không hợp lệ');
      result = await db.rpc('add_laptop_to_purchase_batch', {
        p_batch_id: Number(body.batchId), p_laptop: body.laptop || {}, p_actor: actor,
        p_idempotency_key: keyOf(body.key)
      });
    } else if (body.action === 'receive') {
      result = await db.rpc('receive_inventory', {
        p_expected: body.expected || [], p_unknown: body.unknown || [], p_notes: String(body.notes || ''),
        p_actor: actor, p_idempotency_key: keyOf(body.key)
      });
    } else if (body.action === 'tracking') {
      if (!validId(body.laptopId)) throw new Error('Mã laptop không hợp lệ');
      result = await db.rpc('update_incoming_tracking', {
        p_laptop_id: Number(body.laptopId), p_tracking: String(body.tracking || ''), p_actor: actor
      });
    } else if (body.action === 'edit') {
      if (!validId(body.laptopId)) throw new Error('Mã laptop không hợp lệ');
      const allowed = ['name','category','serial','tracking_code_cn','purchase_price_rmb','shipping_rmb','import_price_vnd','notes','purchase_batch_id'];
      const payload = Object.fromEntries(Object.entries(body.data || {}).filter(([key]) => allowed.includes(key)));
      result = await db.rpc('update_laptop_procurement', { p_laptop_id: Number(body.laptopId), p_data: payload, p_actor: actor });
    } else if (body.action === 'reconcile') {
      const unknownId = body.unknownLaptopId || body.unknownId;
      const expectedId = body.expectedLaptopId || body.expectedId;
      if (!validId(unknownId) || !validId(expectedId)) throw new Error('Mã laptop không hợp lệ');
      result = await db.rpc('reconcile_unknown_laptop', {
        p_unknown_laptop_id: Number(unknownId), p_expected_laptop_id: Number(expectedId),
        p_actor: actor, p_idempotency_key: keyOf(body.key)
      });
    } else if (body.action === 'ignore') {
      if (!validId(body.laptopId)) throw new Error('Mã laptop không hợp lệ');
      result = await db.rpc('ignore_incoming_laptop', {
        p_laptop_id: Number(body.laptopId), p_reason: String(body.reason || ''), p_actor: actor
      });
    } else throw new Error('Thao tác không hợp lệ');
    if (result.error) throw new Error(body.action === 'ignore' ? 'Không thể HỦY: máy đã khóa, đang gắn với đơn hàng hoặc giữ chỗ. Hãy tải lại và xử lý liên kết trước.' : result.error.message);
    let outputData = result.data;
    if (profile.role !== 'ADMIN' && outputData) {
      const redact = row => Object.fromEntries(Object.entries(row || {}).filter(([k]) => !RECEIVING_PRICE_FIELDS.includes(k)));
      outputData = {
        ...outputData,
        ...(Array.isArray(outputData.expected) ? { expected: outputData.expected.map(redact) } : {}),
        ...(Array.isArray(outputData.unknown) ? { unknown: outputData.unknown.map(redact) } : {}),
        ...(Array.isArray(outputData.laptops) ? { laptops: outputData.laptops.map(redact) } : {})
      };
    }
    return NextResponse.json(outputData);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Không thể lưu nhập hàng' }, { status: 400 });
  }
}
