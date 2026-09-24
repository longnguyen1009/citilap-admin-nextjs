import { readFile } from 'node:fs/promises';

const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
}));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const app = process.env.APP_URL || 'http://localhost:3000';
if (!base || !anon || !service || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('Missing pilot environment');

const tag = `PILOT-WARRANTY-${Date.now().toString(36).toUpperCase()}`;
const checks = [];
const parse = async response => { const value = await response.text(); try { return JSON.parse(value); } catch { return value; } };
const check = (name, pass, detail = {}) => {
  checks.push({ name, pass: Boolean(pass), ...detail });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`);
};
const rest = async (path, method = 'GET', body) => {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: { apikey: service, Authorization: `Bearer ${service}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json', Prefer: 'return=representation' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};
const loginResponse = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
});
const login = await parse(loginResponse);
check('admin login', loginResponse.ok, { status: loginResponse.status });
const api = async (path, body) => {
  const response = await fetch(`${app}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${login.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};

const sourceOrderResult = await rest('orders?id=eq.133&select=id,laptop_id,customer_info,order_status,payment_status');
check('pilot sold order available', sourceOrderResult.ok && sourceOrderResult.body.length === 1 && sourceOrderResult.body[0].laptop_id, { order: sourceOrderResult.body });
const sourceOrder = sourceOrderResult.body[0];
const otherOrderResult = await rest(`orders?id=neq.${sourceOrder.id}&laptop_id=not.is.null&select=id,laptop_id&order=id&limit=1`);
check('unrelated order available for negative test', otherOrderResult.ok && otherOrderResult.body.length === 1);
const today = new Date().toLocaleDateString('vi-VN');
const todayIso = new Date().toISOString().slice(0, 10);
const baseCase = {
  laptopId: sourceOrder.laptop_id, orderId: sourceOrder.id, customerInfo: sourceOrder.customer_info,
  receivedDate: today, reportedIssue: `${tag}: máy không nhận sạc ổn định`, status: 'received',
  diagnosis: '', resolution: '', repairCost: 0, notes: tag,
};

const mismatched = await api('/api/warranty', { ...baseCase, orderId: otherOrderResult.body[0].id });
check('reject order from another laptop', !mismatched.ok && mismatched.status === 400, { status: mismatched.status, error: mismatched.body?.error });
const directMismatch = await rest('warranty_cases', 'POST', {
  laptop_id: sourceOrder.laptop_id, order_id: otherOrderResult.body[0].id, status: 'received',
  received_date: todayIso, reported_issue: `${tag}: direct mismatch`, handled_by: tag,
});
check('database rejects mismatched order and laptop', !directMismatch.ok, { status: directMismatch.status, error: directMismatch.body });
const directUnknownStatus = await rest('warranty_cases', 'POST', {
  laptop_id: sourceOrder.laptop_id, order_id: sourceOrder.id, status: 'unknown',
  received_date: todayIso, reported_issue: `${tag}: direct unknown status`, handled_by: tag,
});
check('database rejects unknown warranty status', !directUnknownStatus.ok, { status: directUnknownStatus.status, error: directUnknownStatus.body });
const created = await api('/api/warranty', baseCase);
check('create warranty case', created.ok && created.body?.id, { status: created.status, error: created.body?.error });
let warranty = created.body;
check('case links sold laptop and order', String(warranty.laptopId) === String(sourceOrder.laptop_id) && String(warranty.orderId) === String(sourceOrder.id) && warranty.status === 'received' && !warranty.resolvedDate, { warranty });
const duplicate = await api('/api/warranty', baseCase);
check('reject second open case for same laptop', duplicate.status === 409, { status: duplicate.status, error: duplicate.body?.error });
const changedLaptop = await api('/api/warranty', { ...warranty, laptopId: otherOrderResult.body[0].laptop_id });
check('reject changing warranty laptop', !changedLaptop.ok && changedLaptop.status === 400, { status: changedLaptop.status, error: changedLaptop.body?.error });
const invalidStatus = await api('/api/warranty', { ...warranty, status: 'arbitrary' });
check('reject unknown warranty status', !invalidStatus.ok && invalidStatus.status === 400, { status: invalidStatus.status, error: invalidStatus.body?.error });

const intakeMovement = await api('/api/stock-movements', { laptopId: warranty.laptopId, orderId: warranty.orderId, warrantyCaseId: warranty.id, type: 'TIẾP NHẬN BẢO HÀNH', note: warranty.reportedIssue });
check('record warranty intake movement', intakeMovement.ok, { status: intakeMovement.status, error: intakeMovement.body?.error });
const checking = await api('/api/warranty', { ...warranty, status: 'checking', diagnosis: 'Cổng sạc tiếp xúc kém', repairCost: 0.25 });
check('move case to checking', checking.ok && checking.body.status === 'checking' && Number(checking.body.repairCost) === 0.25 && !checking.body.resolvedDate, { status: checking.status, error: checking.body?.error });
warranty = checking.body;
const checkingMovement = await api('/api/stock-movements', { laptopId: warranty.laptopId, orderId: warranty.orderId, warrantyCaseId: warranty.id, type: 'BẢO HÀNH: checking', note: warranty.diagnosis });
check('record diagnosis movement', checkingMovement.ok, { status: checkingMovement.status });
const done = await api('/api/warranty', { ...warranty, status: 'done', resolution: 'Vệ sinh và cố định lại cổng sạc; test tải đạt', repairCost: 0.25 });
check('complete warranty case', done.ok && done.body.status === 'done' && Boolean(done.body.resolvedDate), { status: done.status, error: done.body?.error, body: done.body });
warranty = done.body;
const doneMovement = await api('/api/stock-movements', { laptopId: warranty.laptopId, orderId: warranty.orderId, warrantyCaseId: warranty.id, type: 'BẢO HÀNH: done', note: warranty.resolution });
check('record completion movement', doneMovement.ok, { status: doneMovement.status });

const [persistedCase, movements, activity, sourceOrderAfter, sourceLaptopAfter] = await Promise.all([
  rest(`warranty_cases?id=eq.${warranty.id}&select=id,laptop_id,order_id,status,received_date,resolved_date,repair_cost,diagnosis,resolution`),
  rest(`stock_movements?warranty_case_id=eq.${warranty.id}&select=id,laptop_id,order_id,movement_type,note&order=created_at`),
  rest(`activity_logs?entity_type=eq.WARRANTY&entity_id=eq.${warranty.id}&select=id,action,changes&order=created_at`),
  rest(`orders?id=eq.${sourceOrder.id}&select=id,order_status,payment_status,amount_paid,debt_amount`),
  rest(`laptops?id=eq.${sourceOrder.laptop_id}&select=id,status,is_locked`),
]);
const finalCase = persistedCase.body[0];
check('warranty persists after reload', persistedCase.ok && finalCase.status === 'done' && finalCase.resolved_date && Number(finalCase.repair_cost) === 0.25, { warranty: finalCase });
check('three lifecycle stock movements persist', movements.ok && movements.body.length === 3 && movements.body.every(row => String(row.laptop_id) === String(sourceOrder.laptop_id) && String(row.order_id) === String(sourceOrder.id)), { movements: movements.body });
check('create and update audit entries persist', activity.ok && activity.body.filter(row => row.action === 'CREATE').length === 1 && activity.body.filter(row => row.action === 'UPDATE').length === 2, { activity: activity.body });
check('warranty does not mutate sale settlement', sourceOrderAfter.ok && sourceOrderAfter.body[0].payment_status === 'paid' && Number(sourceOrderAfter.body[0].debt_amount) === 0, { order: sourceOrderAfter.body[0] });
check('sold device ownership state remains locked', sourceLaptopAfter.ok && sourceLaptopAfter.body[0].status === 'sold' && sourceLaptopAfter.body[0].is_locked === true, { laptop: sourceLaptopAfter.body[0] });

const reopened = await api('/api/warranty', { ...warranty, status: 'repairing', resolvedDate: today });
check('reopening clears resolved date', reopened.ok && reopened.body.status === 'repairing' && !reopened.body.resolvedDate, { status: reopened.status, body: reopened.body });
const reclosed = await api('/api/warranty', { ...reopened.body, status: 'done', resolution: warranty.resolution });
check('reclosing restores resolved date', reclosed.ok && Boolean(reclosed.body.resolvedDate), { status: reclosed.status, body: reclosed.body });

const concurrencyPayload = { ...baseCase, reportedIssue: `${tag}: concurrent open case` };
const concurrentCreates = await Promise.all([
  api('/api/warranty', concurrencyPayload),
  api('/api/warranty', concurrencyPayload),
]);
const concurrentSuccesses = concurrentCreates.filter(result => result.ok);
const concurrentFailures = concurrentCreates.filter(result => !result.ok);
check('database allows exactly one concurrent open case', concurrentSuccesses.length === 1 && concurrentFailures.length === 1, { statuses: concurrentCreates.map(result => result.status) });
const concurrentCase = concurrentSuccesses[0].body;
const openCases = await rest(`warranty_cases?laptop_id=eq.${sourceOrder.laptop_id}&status=in.(received,checking,wait_parts,repairing)&select=id,status`);
check('one open warranty remains after race', openCases.ok && openCases.body.length === 1 && String(openCases.body[0].id) === String(concurrentCase.id), { rows: openCases.body });
const closeConcurrent = await api('/api/warranty', { ...concurrentCase, status: 'done', resolution: 'Đóng fixture kiểm tra cạnh tranh', repairCost: 0 });
check('close concurrent fixture', closeConcurrent.ok && closeConcurrent.body.status === 'done' && Boolean(closeConcurrent.body.resolvedDate), { status: closeConcurrent.status, error: closeConcurrent.body?.error });

console.log(JSON.stringify({ tag, checksPassed: checks.length, warrantyCaseId: warranty.id, orderId: sourceOrder.id, laptopId: sourceOrder.laptop_id, checks }, null, 2));
