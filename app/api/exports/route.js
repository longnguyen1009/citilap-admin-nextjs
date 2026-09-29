import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { exportTable, csvTable } from '@/lib/exportData';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';
export async function POST(request) {
  const auth = await requireUser(request, ['ADMIN']);
  if (!auth.ok) return auth.response;
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: 'Yêu cầu không hợp lệ' }, { status: 400 }); }
  const { type, format, ids } = input || {};
  if (!['orders', 'laptops'].includes(type) || !['csv', 'xlsx'].includes(format) || !Array.isArray(ids) || !ids.length || ids.length > 50000 || ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    return Response.json({ error: 'Chọn từ 1 đến 50.000 bản ghi và định dạng CSV/Excel hợp lệ' }, { status: 400 });
  }
  try {
    const db = getSupabaseAdminClient();
    const readIds = async (table, values) => {
      const result = [], unique = [...new Set(values.filter(Boolean).map(String))];
      for (let start = 0; start < unique.length; start += 200) {
        const { data, error } = await db.from(table).select('*').in('id', unique.slice(start, start + 200)).order('id');
        if (error) throw error;
        result.push(...data);
      }
      return result;
    };
    const records = await readIds(type, ids);
    const order = new Map(ids.map((id, index) => [String(id), index]));
    records.sort((a, b) => order.get(String(a.id)) - order.get(String(b.id)));
    if (records.length !== new Set(ids.map(String)).size) return Response.json({ error: 'Dữ liệu đã thay đổi. Tải lại danh sách trước khi xuất.' }, { status: 409 });
    const options = [];
    for (let offset = 0; ; offset += 500) {
      const result = await db.from('app_options').select('*').order('id').range(offset, offset + 499);
      if (result.error) throw result.error;
      options.push(...result.data);
      if (result.data.length < 500) break;
    }
    const [laptops, customers, accessories] = type === 'orders' ? await Promise.all([
      readIds('laptops', records.map(row => row.laptop_id || row.requested_laptop_id)),
      readIds('customers', records.map(row => row.customer_id)),
      readIds('accessories', records.flatMap(row => Array.isArray(row.gift_accessory_ids) ? row.gift_accessory_ids : [])),
    ]) : [[], [], []];
    const batches = type === 'laptops' ? await readIds('purchase_batches', records.map(row => row.purchase_batch_id)) : [];
    const suppliers = await readIds('suppliers', batches.map(row => row.supplier_id));
    const table = exportTable(type, records, { laptops, customers, accessories, options, batches, suppliers });
    let body;
    if (format === 'csv') body = csvTable(table);
    else {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(type === 'orders' ? 'Đơn hàng' : 'Kho laptop');
      sheet.addRow(table.headers);
      sheet.addRows(table.rows);
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B60' } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: table.rows.length + 1, column: table.headers.length } };
      sheet.columns.forEach(column => { column.width = 23; });
      body = new Uint8Array(await workbook.xlsx.writeBuffer());
    }
    return new Response(body, { headers: {
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="CitiLap_${type}.${format}"`, 'Cache-Control': 'no-store',
    } });
  } catch (error) {
    console.error('Export failed', error.code || error.name);
    return Response.json({ error: 'Không thể xuất đầy đủ dữ liệu. Vui lòng thử lại.' }, { status: 503 });
  }
}
