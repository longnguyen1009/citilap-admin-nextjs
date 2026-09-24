import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allRoles = ['ADMIN', 'SALES', 'TECH', 'TECHNICAL'];
const salesRoles = ['ADMIN', 'SALES'];
const technicalRoles = ['ADMIN', 'TECH', 'TECHNICAL'];

function idempotencyKey(value) {
  const result = String(value || '').trim();
  if (result.length < 8 || result.length > 100) throw new Error('Idempotency key không hợp lệ');
  return result;
}

function positive(value) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error('Số tiền phải lớn hơn 0');
  return result;
}

function assertRole(profile, roles) {
  if (!roles.includes(profile.role)) throw new Error('Forbidden');
}

export async function GET(request) {
  const auth = await requireUser(request, allRoles);
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  const type = new URL(request.url).searchParams.get('type') || 'reservations';
  let result;

  if (type === 'reservations') {
    if (!salesRoles.includes(auth.profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await db.rpc('expire_reservations', { p_actor: auth.profile.name });
    result = await db.from('reservations').select('*,laptops(id,serial,name,status),customers(id,name,phone),payments(id,amount,payment_method)').order('created_at', { ascending: false }).limit(200);
  } else if (type === 'trade-ins') {
    const salesFields = '*,customers(id,name,phone),trade_in_inspections(*,trade_in_check_items(*))';
    const technicalFields = 'id,trade_in_code,brand,model,serial,cpu,gpu,ram,ssd,status,reported_condition,notes,inventory_laptop_id,trade_in_inspections(*,trade_in_check_items(*))';
    result = await db.from('trade_ins').select(salesRoles.includes(auth.profile.role) ? salesFields : technicalFields).order('created_at', { ascending: false }).limit(200);
  } else if (type === 'commissions') {
    if (auth.profile.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    result = await db.from('commissions').select('*,orders(id,customer_info,sale_price,gross_profit_snapshot_vnd,net_contribution_snapshot_vnd),cash_accounts(code,name)').order('created_at', { ascending: false }).limit(200);
  } else {
    return NextResponse.json({ error: 'Loại dữ liệu không hợp lệ' }, { status: 400 });
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 503 });
  return NextResponse.json(result.data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request) {
  const auth = await requireUser(request, allRoles);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const db = getSupabaseAdminClient();
    let result;

    if (body.action === 'createReservation') {
      assertRole(auth.profile, salesRoles);
      const orderId = body.orderId ? Number(body.orderId) : null;
      const depositPaymentId = body.depositPaymentId ? Number(body.depositPaymentId) : null;
      if (depositPaymentId && !orderId) throw new Error('Payment đặt cọc phải đi kèm order');
      if (depositPaymentId) {
        const { data: payment, error: paymentError } = await db
          .from('payments')
          .select('order_id,payment_type,amount')
          .eq('id', depositPaymentId)
          .maybeSingle();
        if (paymentError || !payment || Number(payment.order_id) !== orderId || payment.payment_type === 'refund' || Number(payment.amount) <= 0) {
          throw new Error('Payment đặt cọc không thuộc order hoặc không hợp lệ');
        }
      }
      result = await db.rpc('create_reservation', { p_laptop_id: Number(body.laptopId), p_customer_id: body.customerId ? Number(body.customerId) : null, p_order_id: orderId, p_expires_at: body.expiresAt, p_deposit_payment_id: depositPaymentId, p_notes: String(body.notes || ''), p_user_id: auth.profile.id, p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'cancelReservation') {
      assertRole(auth.profile, salesRoles);
      if (!UUID.test(body.id)) throw new Error('Reservation không hợp lệ');
      result = await db.rpc('cancel_reservation', { p_id: body.id, p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'extendReservation') {
      assertRole(auth.profile, salesRoles);
      if (!UUID.test(body.id)) throw new Error('Reservation không hợp lệ');
      result = await db.rpc('extend_reservation', { p_id: body.id, p_expires_at: body.expiresAt, p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'convertReservation') {
      assertRole(auth.profile, salesRoles);
      if (!UUID.test(body.id)) throw new Error('Reservation không hợp lệ');
      result = await db.rpc('convert_reservation_to_order', { p_id: body.id, p_order_id: Number(body.orderId), p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'createTradeIn') {
      assertRole(auth.profile, salesRoles);
      result = await db.rpc('create_trade_in', { p_data: { customer_id: body.customerId || '', order_id: body.orderId || '', brand: body.brand, model: body.model, serial: body.serial || '', cpu: body.cpu || '', gpu: body.gpu || '', ram: body.ram || '', ssd: body.ssd || '', reported_condition: body.reportedCondition || '', notes: body.notes || '' }, p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'startInspection') {
      assertRole(auth.profile, technicalRoles);
      if (!UUID.test(body.id)) throw new Error('Trade-in không hợp lệ');
      result = await db.rpc('start_trade_in_inspection', { p_id: body.id, p_user_id: auth.profile.id, p_mainboard_status: body.mainboardStatus || 'UNKNOWN', p_findings: String(body.findings || ''), p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'completeInspection') {
      assertRole(auth.profile, technicalRoles);
      if (!UUID.test(body.id)) throw new Error('Inspection không hợp lệ');
      result = await db.rpc('complete_trade_in_inspection', { p_id: body.id, p_mainboard_status: body.mainboardStatus || 'UNKNOWN', p_findings: String(body.findings || ''), p_checks: Array.isArray(body.checks) ? body.checks : [], p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'acceptTradeIn') {
      assertRole(auth.profile, ['ADMIN']);
      if (!UUID.test(body.id)) throw new Error('Trade-in không hợp lệ');
      result = await db.rpc('accept_trade_in', { p_id: body.id, p_order_id: Number(body.orderId), p_estimated: positive(body.estimatedValueVnd), p_agreed: positive(body.agreedValueVnd), p_actor: auth.profile.name });
    } else if (body.action === 'rejectTradeIn') {
      assertRole(auth.profile, ['ADMIN']);
      if (!UUID.test(body.id) || !String(body.reason || '').trim()) throw new Error('Lý do từ chối là bắt buộc');
      result = await db.rpc('reject_trade_in', { p_id: body.id, p_reason: body.reason, p_actor: auth.profile.name });
    } else if (body.action === 'receiveTradeIn') {
      assertRole(auth.profile, ['ADMIN']);
      if (!UUID.test(body.id)) throw new Error('Trade-in không hợp lệ');
      result = await db.rpc('receive_trade_in', { p_id: body.id, p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'convertTradeIn') {
      assertRole(auth.profile, ['ADMIN']);
      if (!UUID.test(body.id)) throw new Error('Trade-in không hợp lệ');
      result = await db.rpc('convert_trade_in_to_inventory', { p_id: body.id, p_data: { category: body.category, location: body.location }, p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'generateCommission') {
      assertRole(auth.profile, ['ADMIN']);
      result = await db.rpc('generate_commission', { p_order_id: Number(body.orderId), p_data: { beneficiary_type: body.beneficiaryType, beneficiary_user_id: body.beneficiaryUserId || '', beneficiary_name: body.beneficiaryName || '', commission_type: body.commissionType || 'FIXED', amount_vnd: positive(body.amountVnd), notes: body.notes || '' }, p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else if (body.action === 'approveCommission') {
      assertRole(auth.profile, ['ADMIN']);
      if (!UUID.test(body.id)) throw new Error('Commission không hợp lệ');
      result = await db.rpc('approve_commission', { p_id: body.id, p_actor: auth.profile.name });
    } else if (body.action === 'payCommission') {
      assertRole(auth.profile, ['ADMIN']);
      if (!UUID.test(body.id) || !UUID.test(body.accountId)) throw new Error('Commission hoặc tài khoản không hợp lệ');
      result = await db.rpc('pay_commission', { p_id: body.id, p_account_id: body.accountId, p_reference: body.reference || '', p_actor: auth.profile.name, p_idempotency_key: idempotencyKey(body.idempotencyKey) });
    } else {
      throw new Error('Thao tác Phase 9 không hợp lệ');
    }

    if (result.error) throw new Error(result.error.message);
    return NextResponse.json(result.data, { status: ['createReservation', 'createTradeIn', 'generateCommission'].includes(body.action) ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.message === 'Forbidden' ? 403 : 400 });
  }
}
