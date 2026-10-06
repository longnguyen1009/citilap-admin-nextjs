import { readFileSync } from 'node:fs';

// Google Sheets TSV uses quoted multiline cells; quotes inside unquoted models
// (for example 14" displays) are literal characters.
export function parseTsv(text) {
  const rows=[]; let row=[],cell='',quoted=false;
  text=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) {
      if(c==='"' && text[i+1]==='"') {cell+='"';i++;}
      else if(c==='"') quoted=false;
      else cell+=c;
    } else if(c==='"' && cell==='' && !/^"0606(?:\t|\n|$)/.test(text.slice(i))) quoted=true;
    else if(c==='\t') {row.push(cell.trim());cell='';}
    else if(c==='\n') {row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('Unclosed quoted TSV cell');
  if(cell||row.length){row.push(cell.trim());rows.push(row);}
  return rows;
}

const sources={
  september:'C:/Users/Admin/.codex/attachments/b3fa4bc3-e6fb-4364-92b2-01cda6ada111/pasted-text.txt',
  october:'C:/Users/Admin/.codex/attachments/f08de112-2184-4aca-80b2-0f0bfbbe7661/pasted-text.txt',
  orders:'C:/Users/Admin/.codex/attachments/16432f03-825c-42f3-865f-d8ca8f6e285e/pasted-text.txt',
  orderNotes:'C:/Users/Admin/.codex/attachments/89c0f5b0-12b8-40f9-ae15-7dffdec07aae/pasted-text.txt',
};
export const sheets=Object.fromEntries(Object.entries(sources).map(([key,path])=>[key,parseTsv(readFileSync(path,'utf8'))]));
// Export review data only. No database writes or inferred payment/QC events.
export function normalize() {
  for (const [name, rows] of Object.entries(sheets).filter(([name]) => name !== 'orderNotes')) {
    rows.forEach((row, index) => {
      if (row.length !== rows[0].length) throw new Error(`${name} row ${index + 1}: invalid width`);
    });
  }
  const issues = [];
  const confirmedNotes = new Map();
  for (const row of sheets.orderNotes.slice(1)) {
    if (!/^\d+$/.test(row[0])) continue;
    const notes = [row[1], row[2]].map(value => value?.trim()).filter(Boolean);
    if (notes.length) confirmedNotes.set(row[0], notes);
  }
  const money = (value) => {
    if (!value?.trim()) return null;
    const number = Number(value.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  };
  const raw = (name, row) => Object.fromEntries(sheets[name][0].map((key, i) => [key, row[i]]));
  const laptop = (name, row, index) => {
    const oct = name === 'october';
    return {source: name, source_row: index + 2, id: row[0], month: oct ? '2026-10' : '2026-09',
      category: row[oct ? 2 : 1], configuration: row[oct ? 3 : 2],
      condition_notes: row[oct ? 4 : 3], status_raw: row[oct ? 5 : 4],
      serial: row[oct ? 6 : 5] || null, supplier_raw: row[oct ? 7 : 11] || null,
      purchase_cny: money(row[oct ? 8 : 6]), shipping_cny: money(row[oct ? 9 : 7]),
      exchange_rate: money(row[oct ? 10 : 8]), import_price_million_vnd: money(row[oct ? 11 : 9]),
      tracking_raw: row[oct ? 12 : 10], raw: raw(name, row)};
  };
  const october = sheets.october.slice(1).map((r, i) => laptop('october', r, i)).filter(r => r.id && r.configuration);
  const september = sheets.september.slice(1).map((r, i) => laptop('september', r, i)).filter(r => r.id && r.configuration);
  let date = '', section = 'carryover';
  const orders = [], carryover = [];
  sheets.orders.slice(1).forEach((r, index) => {
    if (r[0] === 'T10.26') { section = 'october'; date = ''; return; }
    if (!(r[10] || r[11])) return;
    if (r[0]) date = r[0];
    const key = `${section}:row-${index + 2}`;
    const match = date.match(/^(\d{1,2})\/(\d{1,2})$/);
    let iso = null;
    if (match) {
      const d = new Date(Date.UTC(2026, Number(match[2]) - 1, Number(match[1])));
      if (d.getUTCMonth() + 1 === Number(match[2]) && d.getUTCDate() === Number(match[1])) iso = d.toISOString().slice(0, 10);
    }
    if (!iso) issues.push({key, type:'invalid_date', value: date});
    const dep = r[12].match(/^\s*(\d+(?:[.,]\d+)?)\s*(tr|k|đ)/i);
    const deposit = dep ? Number(dep[1].replace(',', '.')) * (dep[2].toLowerCase() === 'k' ? .001 : 1) : null;
    const sale = money(r[11]);
    const order = {key, source_row:index + 2, external_number:r[1], created_date:iso, date_raw:date,
      laptop_id:/^\d+$/.test(r[9]) ? r[9] : null, configuration:r[10], sale_million_vnd:sale,
      deposit_million_vnd:deposit, remainder_million_vnd:sale !== null && deposit !== null ? Math.round((sale-deposit)*1000000)/1000000 : null,
      sheet_balance_million_vnd:money(r[13]), status_raw:r[7], payment_status_raw:r[8],
      customer_raw:r[17], address_raw:r[18], raw:raw('orders',r)};
    order.confirmed_notes = confirmedNotes.get(order.external_number) ?? [];
    if (deposit === null) issues.push({key,type:'unresolved_deposit',value:r[12]});
    if (order.sheet_balance_million_vnd !== null && order.remainder_million_vnd !== null && Math.abs(order.sheet_balance_million_vnd-order.remainder_million_vnd) > .000001) issues.push({key,type:'balance_disagreement'});
    (section === 'october' ? orders : carryover).push(order);
  });
  // User confirmations on 2026-10-06 override conflicting sheet cells.
  for (const order of carryover) {
    if (order.external_number === '267') {
      order.created_date = '2026-09-30';
      const index = issues.findIndex(r => r.key === order.key && r.type === 'invalid_date');
      if (index >= 0) issues.splice(index, 1);
    }
    order.laptop_id = null;
    order.status_raw = 'ĐANG CHỜ';
    order.payment_status_raw = 'ĐÃ CỌC';
    order.confirmation = 'Đơn chuyển tiếp: đã cọc, chưa phân máy, chưa hoàn thành';
  }
  for (const order of orders) {
    if (['3', '14'].includes(order.external_number)) {
      order.deposit_million_vnd = 0;
      order.remainder_million_vnd = order.sale_million_vnd;
      order.confirmation = 'Người dùng xác nhận cọc 0';
      const index = issues.findIndex(r => r.key === order.key && r.type === 'unresolved_deposit');
      if (index >= 0) issues.splice(index, 1);
      if (order.external_number === '14') {
        order.confirmed_paid_million_vnd = 31.5;
        order.payment_status_raw = 'HOÀN THÀNH';
        order.confirmation += ', đã thu đủ 31,5 triệu';
      }
    }
    if (order.laptop_id === '1878' && order.created_date === '2026-10-06') order.external_number = '46';
    if (order.laptop_id === '1810') {
      order.payment_status_raw = 'HOÀN THÀNH';
      order.confirmation = 'Người dùng xác nhận đã thu đủ';
      const issue = issues.findIndex(r => r.key === order.key && r.type === 'balance_disagreement');
      if (issue >= 0) issues.splice(issue, 1);
    }
  }
  // Enrich missing purchase fields only from the same laptop ID in September.
  for (const row of october) {
    const previous = september.find(r => r.id === row.id);
    for (const field of ['supplier_raw', 'purchase_cny', 'shipping_cny', 'exchange_rate', 'import_price_million_vnd']) {
      if (row[field] === null && previous?.[field] != null) {
        row[field] = previous[field];
        (row.field_sources ??= {})[field] = {source:previous.source,source_row:previous.source_row};
      }
    }
  }
  const needed = new Set(orders.map(r => r.laptop_id).filter(id => id && !october.some(r => r.id === id)));
  const supplemental = september.filter(r => needed.has(r.id));
  for (const id of needed) if (!supplemental.some(r => r.id === id)) issues.push({type:'missing_laptop',id});
  for (const collection of [october, supplemental, orders]) {
    const seen = new Set();
    for (const row of collection) {
      const id = row.external_number ?? row.id;
      if (seen.has(id)) issues.push({type:'duplicate_identifier',id,key:row.key,source:row.source});
      seen.add(id);
    }
  }
  for (const row of [...october, ...supplemental]) {
    if (row.id === '1966') {
      row.supplier_raw = 'QA MUA';
      (row.field_sources ??= {}).supplier_raw = {source:'user_confirmation'};
    }
    const aliases = {
      'thu lại khách lẻ':'RETAIL_BUYBACK', 'qa mua':'QUEANH',
      'nhập thợ hn':'VN_TECH', 'thợ lẻ':'VN_TECH', 'tuấn hcm':'VN_TECH',
      'thợ lẻ wechat':'WE_TECH', 'we-a bút kí':'WE_A_BUT_KI',
      'we-大唐数码（出售 出租）':'WE_DATANG',
      'we-可一件代发':'WE_LENOVO_01', 'we-莫名':'WECHAT001',
      'we-a bắc':'WE_A_BAC', 'we-mão':'WE_MAO', 'we-aaalenovo':'WE_LENOVO_02',
      'we-勇哥📱 13878190009':'WE_003', 'we-hướng':'WE_HUONG',
      'we-千百渡（微信没回复及时打语音）':'WE_004', 'we-万法唯':'WE_005', 'we-maxwell':'WE_MAXWELL',
    };
    row.supplier_code = aliases[row.supplier_raw?.toLowerCase()] ?? null;
    if (!row.supplier_code) issues.push({type:'unresolved_supplier',id:row.id,value:row.supplier_raw});
    if (!row.supplier_raw || row.import_price_million_vnd === null) issues.push({type:'incomplete_laptop',id:row.id,month:row.month});
  }
  return {scope:'Replacement approved; three new suppliers explicitly approved. Review data, not executable migration.',
    new_suppliers:[{code:'WE_TECH',name:'Nhập thợ WECHAT'},{code:'WE_A_BUT_KI',name:'We-A Bút Kí'},{code:'WE_DATANG',name:'We-大唐数码（出售 出租）'}],
    counts:{october_laptops:october.length,september_supplement:supplemental.length,october_orders:orders.length,carryover_orders:carryover.length},
    october_laptops:october,september_supplement:supplemental,october_orders:orders,carryover_orders:carryover,orders:[...carryover,...orders],issues};
}
if (process.argv.includes('--json')) console.log(JSON.stringify(normalize(), null, 2));
if(process.argv.includes('--inspect')) {
  for(const [key,rows] of Object.entries(sheets)) {
    console.log(key,JSON.stringify({header:rows[0],rows:rows.length-1,widths:[...new Set(rows.slice(1).map(row=>row.length))]}));
    if(key==='orders') console.log(JSON.stringify(rows.slice(1).filter(row=>row[10]||row[11]).map(row=>({date:row[0],id:row[1],laptop:row[9],status:row[7],payment:row[8],sale:row[11],deposit:row[12],balance:row[13],method:row[19]}))));
    else console.log(JSON.stringify({statuses:[...new Set(rows.slice(1).map(row=>row[key==='october'?5:4]))],suppliers:[...new Set(rows.slice(1).map(row=>row[key==='october'?7:11]))]}));
  }
}
if(process.argv.includes('--audit')) {
  const october=sheets.october.slice(1).filter(row=>/^\d+$/.test(row[0])&&row[3]);
  const september=sheets.september.slice(1).filter(row=>/^\d+$/.test(row[0])&&row[2]);
  const orders=sheets.orders.slice(1).filter(row=>row[10]||row[11]);
  const missing=[...new Set(orders.map(row=>row[9]).filter(id=>/^\d+$/.test(id)&&!october.some(row=>row[0]===id)))];
  console.log(JSON.stringify({october:october.length,september:september.length,orders:orders.length,missing,foundSeptember:september.filter(row=>missing.includes(row[0])),absent:missing.filter(id=>!september.some(row=>row[0]===id)),oddRows:Object.fromEntries(['october','september'].map(key=>[key,sheets[key].slice(1).filter(row=>row.length!==sheets[key][0].length||!/^\d+$/.test(row[0]))])),octoberRows:october.map(row=>[row[0],row[1],row[4],row[5],row[6],row[7],row[11]])},null,2));
}
