import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
const dir='docs/database-audit-assets/';
const read=name=>JSON.parse(readFileSync(dir+name+'.json','utf8'));
const schema=read('remote-schema')[0].results;
const tables=schema.filter(x=>x.type==='table'&&!['d1_migrations','sqlite_sequence','_cf_KV'].includes(x.name));
const columns=read('remote-columns').flatMap(x=>x.results).filter(x=>tables.some(t=>t.name===x.table_name));
const counts=read('remote-counts')[0].results[0];
const files=[];
function walk(path){if(!existsSync(path))return;for(const e of readdirSync(path,{withFileTypes:true})){const f=path+'/'+e.name;if(e.isDirectory())walk(f);else if(/\.(mjs|js|jsx|ts|tsx|sql|json|toml|jsonc)$/.test(f))files.push({path:f,text:readFileSync(f,'utf8')});}}
for(const root of ['app','lib','components','context','scripts','qa','db/d1','supabase','db/migrations','db/migrations_archive'])walk(root);
for(const f of files)f.lines=f.text.split(/\r?\n/);
const runtime=files.filter(f=>/^(app|lib|components|context)\//.test(f.path)&&!/(schema|relations)\.json$/.test(f.path));
const linkPath=path=>path.replaceAll('(','%28').replaceAll(')','%29').replaceAll(' ','%20');
const ref=(f,line)=>`[${f.path}:${line+1}](../${linkPath(f.path)}#L${line+1})`;
const escape=s=>String(s??'').replaceAll('|','&#124;').replaceAll('\n',' ');
const lineRef=(path,token)=>{const f=files.find(f=>f.path===path);const i=f?.lines.findIndex(x=>x.includes(token));return f?ref(f,Math.max(0,i)):'`'+path+'`';};
const purposes={
accessories:['Settings / Sales','Danh mục quà, phụ kiện hóa đơn','invoice-catalog; remaining; Invoices'],
account_reconciliations:['Finance / Reconciliation','Biên bản đối soát số thực tế với số sổ','accounts; account-reconciliations; Finance'],
account_transactions:['Cash / Finance','Sổ tiền từng tài khoản, kể cả chuyển tiền hai vế','accounts; payments; supplier-payments; supplier-returns; cod; commissions'],
activity_logs:['Audit','Lịch sử thay đổi có actor và before/after/event','route-helpers; các service; activity-logs'],
app_options:['Settings','Danh mục lựa chọn cấu hình UI/nghiệp vụ','options; optionPolicy; useFieldOptions'],
app_settings:['Settings','Công thức giá và preset cấu hình JSON','settings; presets; procurement'],
auth_rate_limits:['Users / Auth','Giới hạn lần đăng nhập theo khóa','auth/session; session'],
auth_sessions:['Users / Auth','Hash token, phiên đăng nhập hết hạn','session; users'],
auth_users:['Users / Auth','Email và mật khẩu đã băm','session; users'],
branches:['Settings / Sales','Chi nhánh hiển thị trên hóa đơn','invoice-catalog; remaining'],
cash_accounts:['Cash / Finance','Danh mục tài khoản, tiền tệ và số dư đầu kỳ','accounts; cash-accounts'],
cod_receivables:['COD / Receivables','Nghĩa vụ hãng vận chuyển trả tiền','cod; financial; Finance'],
cod_settlements:['COD / Cash','Các lần hãng vận chuyển thanh toán','cod; financial'],
commissions:['Sales / Finance','Hoa hồng, duyệt và chi tiền','commissions; sales-operations'],
customers:['Sales','Khách hàng; đơn và hóa đơn tham chiếu','customers; orders; remaining'],
financial_records:['Finance','Phân loại thu/chi kinh doanh và bản chiếu payment','financial; payments; payment-correction; Finance'],
image_objects:['Storage','Metadata object ảnh trong R2','images; images API'],
invoices:['Sales / History','Snapshot chứng từ theo order','remaining; invoices; invoiceSnapshot'],
laptop_cost_components:['Landed Cost','Chi phí bổ sung/thu cũ/sửa, void theo nguồn','costs; repairs; trade-ins; laptop_landed_costs'],
laptops:['Inventory / Logistics','Một bản ghi máy xuyên suốt mua, nhận, QC, bán','inventory; procurement; qc; repairs; orders'],
operation_requests:['Idempotency','Kết quả request nghiệp vụ đã xử lý và staging hợp nhất','procurement'],
orders:['Orders / Receivables','Một đơn một máy, tiền thu/công nợ/snapshot','orders; remaining; allocations; payments'],
payments:['Sales / Finance','Các lần thu/hoàn khách; COD delivered','payments; cod; payment-correction'],
purchase_batches:['Procurement / Supplier','Đầu lô mua; máy chi tiết nằm trong laptops','procurement; intake; supplier-payments'],
qc_check_items:['QC / Legacy history','Checklist QC cũ còn API đọc','qc API; migration/import lịch sử'],
qc_inspections:['QC','Phiên kiểm tra, disposition, kết quả và thời điểm','procurement; qc; QC'],
repair_actions:['Repair / History','Thao tác thực hiện sửa chữa','repairs; Repairs'],
repair_jobs:['Repair','Phiếu sửa, lifecycle, kết quả và tổng chi phí','repairs; qc; Repairs'],
repair_parts:['Repair','Linh kiện và chi phí của phiếu sửa','repairs; Repairs'],
reservations:['Sales / Inventory','Giữ máy có thời hạn và chuyển thành phân bổ đơn','reservations; sales-operations'],
sheet_import_sources:['Import / History','Payload nguồn sheet phục vụ truy vết và tái dựng import','0013; 0015; scripts/build-october-replacement'],
stock_movements:['Inventory / History','Lịch sử nhận, QC, giữ, bán, giải phóng máy','procurement; qc; payments; stock-movements'],
supplier_payments:['Payables / Cash','Thanh toán nhà cung cấp theo lô','supplier-payments; payables'],
supplier_refunds:['Supplier Refund / Cash','Các lần hoàn tiền NCC, gắn phiếu trả','supplier-returns'],
supplier_return_events:['Supplier Return / History','Mốc xử lý, nhận refund, liên kết thay thế','supplier-returns; SupplierReturns'],
supplier_return_items:['Supplier Return / Replacement','Máy trả, mức hoàn, máy thay thế và trạng thái item','supplier-returns; qc'],
supplier_returns:['Supplier Return','Đầu phiếu trả cho một NCC, trạng thái giải quyết','supplier-returns; qc'],
suppliers:['Supplier','Danh mục nguồn nhập và thông tin liên hệ','suppliers; procurement; intake'],
trade_in_check_items:['Trade-in / QC','Checklist kiểm tra thu cũ','trade-ins; sales-operations'],
trade_in_inspections:['Trade-in / QC','Phiên định giá kỹ thuật thu cũ','trade-ins; sales-operations'],
trade_ins:['Trade-in / Orders','Hồ sơ đổi máy, credit và máy nhận vào kho','trade-ins; sales-operations'],
user_profiles:['Users / Roles','Tên, role canonical và active của tài khoản','session; users; roles'],
warranty_cases:['Warranty / Repair','Tiếp nhận bảo hành gắn laptop/đơn gốc','warranty; Warranty']};
const questionable=new Set(['orders','laptops','invoices','repair_jobs','reservations','purchase_batches','account_reconciliations','trade_ins','supplier_returns']);
const tableClass=t=>t==='qc_check_items'?'POSSIBLY LEGACY':t==='sheet_import_sources'?'ACTIVE (import/history)':questionable.has(t)?'QUESTIONABLE DESIGN':'ACTIVE';
const explicitIndexes=schema.filter(x=>x.type==='index'&&x.sql&&tables.some(t=>t.name===x.tbl_name));
const automaticIndexes=schema.filter(x=>x.type==='index'&&!x.sql&&tables.some(t=>t.name===x.tbl_name));
const refs={};
for(const t of tables){refs[t.name]=runtime.filter(f=>new RegExp('\\b'+t.name+'\\b').test(f.text));}
const profiles={};
for(const file of ['profiles','profiles-retry'])if(existsSync(dir+file+'.json'))for(const x of read(file)){const t=/FROM "([^"]+)"$/.exec(x.query)?.[1];if(t&&x.result)profiles[t]={...profiles[t],...Object.fromEntries(Object.entries(x.result[0].results[0]).map(([k,v])=>[k,JSON.parse(v)]))};}
const overrides={
'laptops.price_rmb':['DUPLICATED','Alias của purchase_price_rmb cho nguồn NCC; trigger 0020 đồng bộ. R12: chuyển dần DTO, chưa DROP.'],
'laptops.exchange_rate':['DUPLICATED','Alias purchase_exchange_rate; không gộp với tỷ giá snapshot supplier payment. R12.'],
'laptops.screen_status':['DUPLICATED','Projection của qc_details.screen; QC có ghi, inventory vẫn cho sửa. Chọn một writer canonical.'],
'laptops.mainboard_status':['DUPLICATED','Projection QC hiện tại; không đồng nhất với mainboard originality trên inspection.'],
'laptops.camera_mic_status':['DUPLICATED','Projection kết quả camera/microphone, giữ tương thích UI đến khi thay reader.'],
'laptops.status':['QUESTIONABLE DESIGN','Canonical trạng thái vận hành; R01/R02/R03 phải giữ transition nguyên tử.'],
'laptops.import_price_vnd':['USED','Giá vốn quản trị mutable trước bán, đơn vị TRIỆU VND; snapshot sale dùng *1e6.'],
'orders.profit_vnd':['REDUNDANT','Cache sale_price - import_price_vnd, đơn vị triệu VND; không dùng làm COGS lịch sử. R04/R12.'],
'orders.amount_paid':['USED','Cache ledger payments; không được sửa bằng ordinary order edit.'],
'orders.debt_amount':['REDUNDANT','Cache max(sale_price-paid-credit/1e6,0); giữ nhất quán trong batch.'],
'orders.cod_amount':['REDUNDANT','Hiện service thường đồng bộ debt_amount; khác nghĩa kỳ vọng COD trong cod_receivables.'],
'orders.laptop_locked':['QUESTIONABLE DESIGN','Boolean giữ máy, nhiều predicate khác nhau; R01 thống nhất owner predicate.'],
'purchase_batches.procurement_flow':['POSSIBLY UNUSED','Runtime tạo DIRECT, LEGACY còn CHECK/default. Chưa chứng minh bỏ an toàn qua import/export.'],
'purchase_batches.subtotal_rmb':['WRITE_ONLY','Runtime create/import ghi tổng ban đầu; view tính lại từ laptops. Không coi tổng header là payable canonical. R07/R12.'],
'purchase_batches.domestic_shipping_rmb':['WRITE_ONLY','Header snapshot ban đầu; chi phí đang dùng laptops.shipping_rmb. Cần quy định snapshot hoặc bỏ writer mới.'],
'purchase_batches.other_cost_rmb':['POSSIBLY UNUSED','Có default/writer nhưng chưa thấy tác động trong landed-cost view hiện tại. Không tự xóa dữ liệu cũ.'],
'qc_inspections.detail_snapshot':['READ_ONLY / HISTORICAL','Import có ghi; quick QC mới không ghi; current state ở laptops.qc_details. Giữ lịch sử đã có.'],
'qc_inspections.overall_notes':['READ_ONLY / HISTORICAL','UI có fallback đọc; quick QC mới ghi chuỗi rỗng và dùng condition_note chung.'],
'qc_inspections.mainboard_status':['READ_ONLY / HISTORICAL','Metadata QC cũ/default UNKNOWN; quick QC dùng laptops.qc_details.'],
'qc_inspections.charger_status':['READ_ONLY / HISTORICAL','Metadata QC cũ, không phải laptops.charger_status hiện tại.'],
'qc_inspections.cosmetic_grade':['READ_ONLY / HISTORICAL','Metadata/import lịch sử; quick QC lưu cosmeticGrade trong JSON hiện tại.'],
'invoices.snapshot':['SNAPSHOT','Giữ bất biến chứng từ; hiện issueInvoice còn bổ sung gift khi gọi lại. R05.'],
'commissions.calculation_snapshot_json':['SNAPSHOT','Cơ sở tính hoa hồng tại lúc tạo; không normalize bỏ.'],
'operation_requests.result':['SNAPSHOT','Kết quả retry, không phải bản sao current state để cập nhật; cần request identity R08.'],
'sheet_import_sources.payload':['SNAPSHOT','Nguồn import lịch sử; lưu lại đến khi có chính sách archive có kiểm chứng.'],
};
const allEvidence=[];const columnRows=[];const classes={};
for(const c of columns){
  const t=c.table_name,camel=c.name.replace(/_([a-z])/g,(_,x)=>x.toUpperCase());
  const token=new RegExp('\\b(?:'+c.name+'|'+camel+')\\b');
  const matched=refs[t].flatMap(f=>f.lines.flatMap((line,i)=>token.test(line)?[{path:f.path,line:i+1,text:line.slice(0,350)}]:[]));
  const other=files.filter(f=>!runtime.includes(f)).flatMap(f=>f.lines.flatMap((line,i)=>token.test(line)&&f.text.includes(t)?[{path:f.path,line:i+1}]:[]));
  const projected=refs[t].flatMap(f=>f.lines.flatMap((line,i)=>line.includes(t)&&/select\(['"]\*|SELECT \*|rowJson|laptopJson/.test(line)?[{path:f.path,line:i+1}]:[]));
  let classification=matched.length||projected.length||c.pk||c.hidden?'USED':'POSSIBLY UNUSED';
  let recommendation=classification==='USED'?'Giữ; tham chiếu là evidence truy cập, không tự suy ra giá trị nghiệp vụ từ số lần xuất hiện.':'Giữ tạm; xác minh consumer gián tiếp, import/export và lịch sử trước khi loại bỏ.';
  if(c.hidden){classification='REDUNDANT';recommendation='Generated column, DB tự derive; không phải cache có writer độc lập. Giữ.';}
  if(c.name.includes('snapshot')&&t==='orders'){classification='SNAPSHOT';recommendation='Giữ giá trị lịch sử; R04 xử lý missing/guard, không tính lại từ laptop hiện tại.';}
  if(t==='qc_check_items'){classification='READ_ONLY / HISTORICAL';recommendation='API QC vẫn đọc checklist cũ; 0 row live không đủ kết luận UNUSED.';}
  if(overrides[t+'.'+c.name])[classification,recommendation]=overrides[t+'.'+c.name];
  classes[classification]=(classes[classification]||0)+1;
  const evidence=(matched.length?matched:projected).slice(0,3).map(e=>`[${e.path}:${e.line}](../${linkPath(e.path)}#L${e.line})`).join('; ')||'PK/default/generated hoặc chưa trace consumer trực tiếp; xem DDL và reference inventory';
  const p=profiles[t]?.[c.name];
  const profile=p?`; live null=${p.nulls??0}, distinct=${p.distinct}, nonempty=${p.nonempty??0}`:'';
  columnRows.push(`| ${t} | ${c.name} | ${classification} | ${escape(evidence)}; ${c.type}, ${c.notnull?'NOT NULL':'nullable'}, default=${escape(c.dflt_value??'none')}${c.hidden?', generated':''}${profile} | ${recommendation} |`);
  allEvidence.push({table:t,column:c.name,classification,profile:p,runtimeCandidates:matched,projectionCandidates:projected,otherReferences:other});
}
writeFileSync(dir+'column-references.json',JSON.stringify(allEvidence,null,2));
const tableMap=tables.map(t=>{const cols=columns.filter(c=>c.table_name===t.name);return `| ${t.name} | ${purposes[t.name]?.[0]} | ${purposes[t.name]?.[1]} | ${cols.filter(c=>c.pk).map(c=>c.name+': '+c.type).join(', ')} | ${cols.length} | ${counts[t.name]} | ${purposes[t.name]?.[2]} |`;}).join('\n');
const tableAudit=tables.map(t=>`| ${t.name} | ${tableClass(t.name)} | ${purposes[t.name]?.[1]} | ${t.name==='qc_check_items'?'Giữ reader lịch sử; cân nhắc retirement riêng.':t.name==='sheet_import_sources'?'Archive sau khi đối soát, không DROP theo zero runtime references.':questionable.has(t.name)?'Giữ entity; sửa invariant/nguồn dữ liệu được mô tả trong R01–R15.':'Giữ; bảng rỗng vẫn có workflow đang implement.'} |`).join('\n');
const appendix=[];
for(const t of tables){
  const cols=columns.filter(c=>c.table_name===t.name),idx=schema.filter(x=>x.type==='index'&&x.tbl_name===t.name);
  const fk=[...t.sql.matchAll(/FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s*["`]?([\w]+)["`]?\s*\(([^)]+)\)(?:\s+ON DELETE\s+(RESTRICT|CASCADE|SET NULL|NO ACTION))?/gi)].map(x=>`${x[1]} → ${x[2]}(${x[3]}); DELETE ${x[4]||'NO ACTION'}`);
  for(const c of cols){const line=t.sql.split('\n').find(l=>new RegExp('^\\s*["`]?'+c.name+'["`]?\\s').test(l));if(line&&/REFERENCES/i.test(line))fk.push(line.trim());}
  const back=tables.filter(x=>x.name!==t.name&&new RegExp('REFERENCES\\s+["`]?'+t.name+'["`]?\\s*\\(','i').test(x.sql)).map(x=>x.name);
  const runtimeRefs=refs[t.name].map(f=>{const i=f.lines.findIndex(l=>l.includes(t.name));return ref(f,i);});
  const operations=new Set();
  for(const f of refs[t.name])for(const line of f.lines){if(!line.includes(t.name))continue;if(/SELECT|select\(/i.test(line))operations.add('R');if(/INSERT|insert\(|upsert\(/i.test(line))operations.add('C');if(/UPDATE|update\(/i.test(line))operations.add('U');if(/DELETE|delete\(/i.test(line))operations.add('D');}
  appendix.push(`## ${t.name}\n\nDomain: ${purposes[t.name]?.[0]}. Purpose/workflow: ${purposes[t.name]?.[1]}. Classification: ${tableClass(t.name)}. Live rows: ${counts[t.name]}.\n\nPK: ${cols.filter(c=>c.pk).map(c=>c.name+' '+c.type).join(', ')}. FK: ${fk.join('; ')||'Không có FK khai báo'}. Inbound: ${back.join(', ')||'Không có FK inbound'}.\n\nCRUD nhìn thấy trực tiếp (heuristic, SQL nhiều dòng/adapter cần xem module): ${[...operations].join('/')||'import/history hoặc qua wrapper'}. Module chính: ${purposes[t.name]?.[2]}.\n\nRuntime references: ${runtimeRefs.join('; ')||'Không có reference trực tiếp trong runtime; đối chiếu import/history/tests.'}\n\nTất cả columns/NOT NULL/default/generated/UNIQUE/CHECK/FK chính xác theo remote sqlite_schema:\n\n\`\`\`sql\n${t.sql};\n\`\`\`\n\nIndexes (${idx.length}, gồm autoindex):\n\n${idx.map(i=>'- `'+i.name+'`: '+(i.sql?'`'+i.sql+'`':'autoindex của PRIMARY KEY/UNIQUE trong DDL trên')).join('\n')||'Không có secondary index.'}\n`);
}
appendix.push('## Views và triggers\n\n'+schema.filter(x=>['view','trigger'].includes(x.type)).map(x=>`### ${x.name}\n\n\`\`\`sql\n${x.sql};\n\`\`\``).join('\n\n'));
writeFileSync(dir+'database-map.md','# Database map — remote D1, 2026-10-07\n\n'+appendix.join('\n').replaceAll('](../','](../../'));
const indexRows=explicitIndexes.map(i=>`| ${i.tbl_name} | ${i.name} | ${escape(i.sql)} | ${/tracking/.test(i.name)?'QUESTIONABLE: expression/partial index không hỗ trợ substring search hiện tại; không DROP nếu còn exact lookup.':/one_active|unique|idempotency|one_open/.test(i.name)?'KEEP: structural/uniqueness invariant, không đánh giá chỉ theo query planner.':'KEEP pending workload metrics; xem EXPLAIN mẫu.'} |`).join('\n');
writeFileSync(dir+'index-review.md',`# Index inventory\n\n${explicitIndexes.length} explicit + ${automaticIndexes.length} automatic indexes trên application tables. Không gộp autoindex với index thừa.\n\n| Table | Index | Definition | Classification |\n|---|---|---|---|\n${indexRows}\n\nAutomatic indexes: ${automaticIndexes.map(x=>'`'+x.name+'`').join(', ')}.\n`);
const candidateRows=allEvidence.filter(x=>x.classification==='POSSIBLY UNUSED').map(x=>`- \`${x.table}.${x.column}\`: ${overrides[x.table+'.'+x.column]?.[1]||'Chưa chứng minh reader business; xem toàn bộ evidence dòng tương ứng.'}`).join('\n');
const tpl=readFileSync(dir+'report-template.md','utf8');
writeFileSync('docs/database-audit.md',tpl.replace('{{TABLE_MAP}}',tableMap).replace('{{TABLE_AUDIT}}',tableAudit).replace('{{COLUMNS}}',columnRows.join('\n')).replace('{{POSSIBLE}}',candidateRows||'Không có field được xác định ở nhóm này.').replace('{{COLUMN_CLASSES}}',Object.entries(classes).map(([k,v])=>`${k}: ${v}`).join('; ')));
writeFileSync(dir+'coverage.json',JSON.stringify({tables:tables.length,columns:columns.length,explicitIndexes:explicitIndexes.length,automaticIndexes:automaticIndexes.length,columnClassifications:classes,sourceFilesScanned:files.length,runtimeFilesScanned:runtime.length,missingPurposes:tables.filter(t=>!purposes[t.name]).map(t=>t.name)},null,2));
console.log(JSON.stringify({tables:tables.length,columns:columns.length,explicitIndexes:explicitIndexes.length,automaticIndexes:automaticIndexes.length,classes}));
