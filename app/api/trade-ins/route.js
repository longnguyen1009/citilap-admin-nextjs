import { NextResponse } from 'next/server';
import { routeContext } from '@/lib/cloudflare/route-helpers.mjs';
import { SALES_TECHNICAL_ROLES } from '@/lib/roles.mjs';
import { receiveCustomerLaptop } from '@/lib/cloudflare/trade-in-workflows.mjs';

export async function GET(request) {
  try {
    const { DB, profile } = await routeContext(request, SALES_TECHNICAL_ROLES);
    const params = new URL(request.url).searchParams;
    const type = params.get('type') || 'list';
    const q = `%${(params.get('q') || '').trim().slice(0, 100)}%`;
    if (type !== 'list' && profile.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    let result;
    if (type === 'orders') {
      result = await DB.prepare(`SELECT o.id,o.customer_id,o.customer_info,o.customer_address,o.sale_price,o.debt_amount,
        c.name AS customer_name,c.phone AS customer_phone,l.name,l.serial,l.category
        FROM orders o JOIN laptops l ON l.id=o.laptop_id LEFT JOIN customers c ON c.id=o.customer_id
        WHERE o.is_active=1 AND o.order_status IN ('done','shipping','prepared') AND l.status='sold' AND l.acquisition_closed=0
        AND NOT EXISTS(SELECT 1 FROM trade_ins t WHERE t.order_id=o.id)
        AND (CAST(o.id AS TEXT) LIKE ? OR o.customer_info LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR l.serial LIKE ?)
        ORDER BY o.id DESC LIMIT 30`).bind(q, q, q, q, q).all();
    } else if (type === 'laptops') {
      result = await DB.prepare(`SELECT l.id,l.name,l.serial,l.category,l.retail_price_vnd FROM laptops l
        WHERE l.status='available' AND l.is_active=1 AND l.acquisition_closed=0
        AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.laptop_id=l.id AND o.is_active=1 AND o.order_status NOT IN ('cancelled','returned'))
        AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.laptop_id=l.id AND r.status='ACTIVE')
        AND (l.name LIKE ? OR l.serial LIKE ?) ORDER BY l.id DESC LIMIT 30`).bind(q, q).all();
    } else if (type === 'options') {
      const [accounts, categories] = await Promise.all([
        DB.prepare("SELECT id,name FROM cash_accounts WHERE is_active=1 AND currency='VND' AND date(opening_balance_at)<=date('now','+7 hours') ORDER BY name").all(),
        DB.prepare("SELECT option_key,label FROM app_options WHERE group_key='category' AND is_active=1 ORDER BY sort_order").all(),
      ]);
      return NextResponse.json({ accounts: accounts.results, categories: categories.results }, { headers: { 'Cache-Control': 'private, no-store' } });
    } else if (type === 'list') {
      const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)));
      const sales = ['ADMIN', 'SALES', 'SALES_TECH'].includes(profile.role);
      const fields = sales ? 't.*' : 't.id,t.trade_in_code,t.workflow,t.model,t.serial,t.status,t.inventory_laptop_id,t.original_laptop_id,t.created_at';
      const where = `(t.trade_in_code LIKE ? OR t.model LIKE ? OR t.serial LIKE ? ${sales ? 'OR t.seller_name LIKE ? OR t.seller_phone LIKE ?' : ''})`;
      const args = sales ? [q, q, q, q, q] : [q, q, q];
      const [rows, count] = await Promise.all([
        DB.prepare(`SELECT ${fields} FROM trade_ins t WHERE ${where} ORDER BY t.created_at DESC LIMIT 20 OFFSET ?`).bind(...args, (page - 1) * 20).all(),
        DB.prepare(`SELECT count(*) AS total FROM trade_ins t WHERE ${where}`).bind(...args).first(),
      ]);
      return NextResponse.json({ rows: rows.results, total: count.total, page }, { headers: { 'Cache-Control': 'private, no-store' } });
    } else return NextResponse.json({ error: 'Loại tra cứu không hợp lệ' }, { status: 400 });
    return NextResponse.json(result.results, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
}

export async function POST(request) {
  try {
    const { DB, profile } = await routeContext(request, ['ADMIN']);
    return NextResponse.json(await receiveCustomerLaptop(DB, profile, await request.json()), { status: 201 });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }); }
}
