'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, RefreshCw, Repeat2, Trophy } from 'lucide-react';
import { getAuthHeaders } from '@/lib/apiFetchers';
import { useAuth } from '@/context/AuthContext';
import { useSubmission } from '@/lib/useSubmission';
import ListPagination, { useListPagination } from '../ui/ListPagination';

const modeMeta = {
  reservations: { eyebrow: 'BÁN HÀNG', title: 'Giữ máy', icon: CalendarClock },
  'trade-ins': { eyebrow: 'THU ĐỔI', title: 'Thu cũ đổi mới', icon: Repeat2 },
  commissions: { eyebrow: 'NHÂN SỰ BÁN HÀNG', title: 'Hoa hồng bán hàng', icon: Trophy },
};
const money = value => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} ₫`;
const date = value => value ? new Date(value).toLocaleString('vi-VN') : '—';
const statusNames = {
  ALL: 'Tất cả trạng thái', ACTIVE: 'Đang giữ', EXPIRED: 'Hết hạn', CANCELLED: 'Đã hủy',
  CONVERTED: 'Đã chuyển đơn', DRAFT: 'Bản nháp', INSPECTING: 'Đang kiểm tra',
  QUOTED: 'Đã báo giá', ACCEPTED: 'Đã chấp nhận', REJECTED: 'Đã từ chối',
  RECEIVED: 'Đã nhận máy', CONVERTED_TO_INVENTORY: 'Đã nhập kho',
  PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', PAID: 'Đã chi'
};
const statusLabel = value => statusNames[value] || value;

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể xử lý yêu cầu');
  return data;
}

export default function SalesOperations({ mode }) {
  const { user } = useAuth();
  const submission = useSubmission();
  const searchParams = useSearchParams();
  const meta = modeMeta[mode];
  const Icon = meta.icon;
  const allowed = mode === 'commissions' ? user?.role === 'ADMIN' : mode === 'reservations' ? ['ADMIN', 'SALES'].includes(user?.role) : ['ADMIN', 'SALES', 'TECH', 'TECHNICAL'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [loadedAt] = useState(() => Date.now());
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [status, setStatus] = useState(() => searchParams.get('status') || 'ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return setLoading(false);
    setLoading(true);setError('');
    try {
      if (mode === 'reservations') await api('/api/sales-operations', { method: 'POST', body: JSON.stringify({ action: 'expireReservations' }) });
      setRows(await api(`/api/sales-operations?type=${mode}`));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [allowed, mode]);
  // Network synchronization intentionally refreshes server-owned sales operations data.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter(row => {
    const haystack = JSON.stringify(row).toLowerCase();
    const isExpiring = searchParams.get('expiring') !== '1' || (row.expires_at && new Date(row.expires_at).getTime() <= loadedAt + 2 * 60 * 60 * 1000);
    return (status === 'ALL' || row.status === status) && isExpiring && haystack.includes(query.toLowerCase());
  }), [loadedAt, rows, query, searchParams, status]);
  const statuses = useMemo(() => ['ALL', ...new Set(rows.map(row => row.status))], [rows]);
  const salesOpsPages = useListPagination(filtered, `${mode}|${query}|${status}|${searchParams.toString()}`);

  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const action = mode === 'reservations' ? 'createReservation' : mode === 'trade-ins' ? 'createTradeIn' : 'generateCommission';
    try { await api('/api/sales-operations', { method: 'POST', body: JSON.stringify({ action, ...values, idempotencyKey: crypto.randomUUID() }) });setDialog(false);await load(); } catch (err) { setError(err.message); }
  }

  async function act(action, row) {
    const body = { action, id: row.id, idempotencyKey: crypto.randomUUID() };
    if (action === 'convertReservation') body.orderId = window.prompt('Order ID cần liên kết');
    if (action === 'extendReservation') body.expiresAt = window.prompt('Thời hạn mới (ISO hoặc YYYY-MM-DD HH:mm)');
    if (action === 'startInspection') body.findings = '';
    if (action === 'completeInspection') { body.mainboardStatus = 'UNKNOWN';body.findings = window.prompt('Kết luận kỹ thuật');body.checks = [{ check_key: 'GENERAL_INSPECTION', result: 'PASS', notes: body.findings }];body.id = row.trade_in_inspections?.find(item => item.status === 'IN_PROGRESS')?.id; }
    if (action === 'acceptTradeIn') { body.orderId = window.prompt('Order ID');body.estimatedValueVnd = window.prompt('Giá trị ước tính VND');body.agreedValueVnd = window.prompt('Giá trị thỏa thuận VND'); }
    if (action === 'rejectTradeIn') body.reason = window.prompt('Lý do từ chối');
    if (action === 'convertTradeIn') { body.category = 'TRADE_IN';body.location = 'BAC_NINH'; }
    if (action === 'payCommission') { body.accountId = window.prompt('UUID tài khoản tiền VND');body.reference = window.prompt('Tham chiếu (không bắt buộc)'); }
    // Cancelled prompts stop the action. Optional notes may legitimately be empty.
    if (Object.values(body).some(value => value === null)) return;
    const optionalFields = ['findings', 'reference'];
    if (Object.entries(body).some(([key, value]) => !optionalFields.includes(key) && (value === undefined || String(value).trim() === ''))) {
      setError('Thiếu thông tin bắt buộc để thực hiện thao tác. Vui lòng kiểm tra lại.');
      return;
    }
    try { await api('/api/sales-operations', { method: 'POST', body: JSON.stringify(body) });await load(); } catch (err) { setError(err.message); }
  }

  if (!allowed) return <main className="salesops-page"><div className="salesops-empty">Bạn không có quyền truy cập khu vực này.</div></main>;
  return <main className="salesops-page">
    <header className="salesops-hero"><div className="salesops-title"><Icon/><div><span>{meta.eyebrow}</span><h1>{meta.title}</h1><p>Theo dõi hồ sơ, trạng thái và các bước xử lý trong cùng một nơi.</p></div></div><button onClick={load}><RefreshCw size={16}/> Đồng bộ</button></header>
    {error && <div className="error-message">{error}<button onClick={() => setError('')}>×</button></div>}
    <section className="salesops-toolbar"><input aria-label="Tìm hồ sơ" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm mã, serial, khách hàng…"/><select aria-label="Lọc theo trạng thái" value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(item => <option key={item} value={item}>{statusLabel(item)}</option>)}</select>{(mode !== 'trade-ins' || ['ADMIN', 'SALES'].includes(user?.role)) && <button onClick={() => setDialog(true)}>Tạo mới</button>}</section>
    {loading ? <div className="salesops-empty">Đang tải dữ liệu…</div> : <><SalesOpsTable mode={mode} rows={salesOpsPages.pageRows} role={user?.role} act={(action, row) => submission.run(() => act(action, row))}/><ListPagination {...salesOpsPages}/></>}
    {dialog && <CreateDialog mode={mode} submit={event => { event.preventDefault(); return submission.run(() => submit(event)); }} pending={submission.pending} error={error} close={() => setDialog(false)}/>}
  </main>;
}

function SalesOpsTable({ mode, rows, role, act }) {
  if (!rows.length) return <div className="salesops-empty">Chưa có dữ liệu phù hợp.</div>;
  return <div className="salesops-grid">{rows.map(row => <article key={row.id} className="salesops-card"><header><div><small>{row.reservation_code || row.trade_in_code || `ORDER #${row.order_id}`}</small><h3>{mode === 'reservations' ? row.laptops?.name : mode === 'trade-ins' ? `${row.brand} ${row.model}` : row.beneficiary_name || row.beneficiary_type}</h3></div><span data-status={row.status}>{statusLabel(row.status)}</span></header>{mode === 'reservations' ? <><p><b>{row.laptops?.serial}</b> · {row.customers?.name || 'Chưa gắn khách'}</p><dl><div><dt>Hết hạn</dt><dd>{date(row.expires_at)}</dd></div><div><dt>Đặt cọc</dt><dd>{row.deposit_payment_id ? `Đang giữ · #${row.deposit_payment_id}` : 'Không có'}</dd></div></dl><footer>{row.status === 'ACTIVE' && <><button onClick={() => act('convertReservation', row)}>Chuyển thành đơn</button><button className="quiet" onClick={() => act('cancelReservation', row)}>Hủy giữ</button></>}</footer></> : mode === 'trade-ins' ? <><p><b>{row.serial || 'Chưa có serial'}</b> · {row.cpu || '—'} · {row.ram || '—'} · {row.ssd || '—'}</p>{['ADMIN', 'SALES'].includes(role) && <dl><div><dt>Ước tính</dt><dd>{money(row.estimated_value_vnd)}</dd></div><div><dt>Thỏa thuận</dt><dd>{money(row.agreed_value_vnd)}</dd></div></dl>}<footer>{['ADMIN', 'TECH', 'TECHNICAL'].includes(role) && row.status === 'DRAFT' && <button onClick={() => act('startInspection', row)}>Bắt đầu kiểm tra</button>}{['ADMIN', 'TECH', 'TECHNICAL'].includes(role) && row.status === 'INSPECTING' && <button onClick={() => act('completeInspection', row)}>Hoàn tất kiểm tra</button>}{role === 'ADMIN' && row.status === 'QUOTED' && <><button onClick={() => act('acceptTradeIn', row)}>Chấp nhận</button><button className="quiet" onClick={() => act('rejectTradeIn', row)}>Từ chối</button></>}{role === 'ADMIN' && row.status === 'ACCEPTED' && <button onClick={() => act('receiveTradeIn', row)}>Xác nhận đã nhận</button>}{role === 'ADMIN' && row.status === 'RECEIVED' && <button onClick={() => act('convertTradeIn', row)}>Nhập kho chờ QC</button>}</footer></> : <><p>Order #{row.order_id} · {row.orders?.customer_info || 'Khách lẻ'}</p><dl><div><dt>Số tiền</dt><dd>{money(row.amount_vnd)}</dd></div><div><dt>Ghi nhận</dt><dd>{date(row.earned_at)}</dd></div></dl><footer>{row.status === 'PENDING' && <button onClick={() => act('approveCommission', row)}>Duyệt</button>}{row.status === 'APPROVED' && <button onClick={() => act('payCommission', row)}>Chi hoa hồng</button>}</footer></>}</article>)}</div>;
}

function CreateDialog({ mode, submit, close, pending, error }) {
  return <div className="modal-backdrop active"><form aria-busy={pending} className="salesops-dialog" onSubmit={submit}><header><div><small>HỒ SƠ MỚI</small><h2>{mode === 'reservations' ? 'Tạo giữ máy' : mode === 'trade-ins' ? 'Tạo hồ sơ thu cũ' : 'Tạo hoa hồng'}</h2></div><button type="button" aria-label="Close" disabled={pending} onClick={close}>Đóng</button></header>{mode === 'reservations' ? <><label>Mã laptop<input name="laptopId" type="number" required/></label><label>Mã khách hàng<input name="customerId" type="number"/></label><label>Mã đơn hàng<input name="orderId" type="number"/></label><label>Hết hạn<input name="expiresAt" type="datetime-local" required/></label><label>Mã thanh toán cọc<input name="depositPaymentId" type="number"/></label><label className="wide">Ghi chú<textarea name="notes"/></label></> : mode === 'trade-ins' ? <><label>Hãng<input name="brand" required/></label><label>Model<input name="model" required/></label><label>Serial<input name="serial"/></label><label>Mã khách hàng<input name="customerId" type="number"/></label><label>Mã đơn hàng<input name="orderId" type="number"/></label><label>Tình trạng khách báo<textarea name="reportedCondition"/></label></> : <><label>Mã đơn hàng<input name="orderId" type="number" required/></label><label>Đối tượng<select name="beneficiaryType"><option value="CTV">CTV</option><option value="EMPLOYEE">Nhân viên</option><option value="OTHER">Khác</option></select></label><label>Tên người nhận<input name="beneficiaryName" required/></label><label>Số tiền VND<input name="amountVnd" type="number" min="1" required/></label></>}<footer>{error && <p role="alert" className="form-submit-error">{error}</p>}<button type="button" aria-label="Close" disabled={pending} onClick={close}>Đóng</button><button disabled={pending}>{pending ? "Đang lưu…" : "Xác nhận"}</button></footer></form></div>;
}
