import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

const positiveId = value => /^\d+$/.test(String(value || '')) && Number(value)>0 ? Number(value) : null;
const text = (value,max) => String(value ?? '').replace(/<[^>]*>/g,'').trim().slice(0,max);

export async function GET(request) {
  const auth=await requireUser(request,['ADMIN']); if(!auth.ok)return auth.response;
  const db=getSupabaseAdminClient(); const params=new URL(request.url).searchParams; const id=positiveId(params.get('id'));
  if(params.get('available')==='true'){
    const {data,error}=await db.from('purchase_items').select('id,purchase_batch_id,brand,model,cpu,gpu,ram,ssd,serial,purchase_price_rmb,status,purchase_batches!inner(batch_code,status,supplier_id,suppliers(code,name))').eq('status','CONFIRMED').order('id');
    if(error)return NextResponse.json({error:'Không thể tải sản phẩm có thể vận chuyển'},{status:503});
    const {data:assigned}=await db.from('shipment_items').select('purchase_item_id').neq('status','CANCELLED'); const used=new Set((assigned||[]).map(x=>String(x.purchase_item_id)));
    return NextResponse.json((data||[]).filter(x=>!used.has(String(x.id))));
  }
  if(id){
    const [shipment,items,sessions,exceptions]=await Promise.all([
      db.from('shipment_summaries').select('*').eq('id',id).maybeSingle(),
      db.from('shipment_items').select('*, purchase_items(*, purchase_batches(batch_code,supplier_id,suppliers(code,name)))').eq('shipment_id',id).order('id'),
      db.from('receiving_sessions').select('*').eq('shipment_id',id).order('received_at',{ascending:false}),
      db.from('receiving_exceptions').select('*').eq('shipment_id',id).order('created_at',{ascending:false})
    ]);
    if(shipment.error||items.error||sessions.error||exceptions.error)return NextResponse.json({error:'Không thể tải chi tiết shipment'},{status:503});
    if(!shipment.data)return NextResponse.json({error:'Không tìm thấy shipment'},{status:404});
    return NextResponse.json({shipment:shipment.data,items:items.data,sessions:sessions.data,exceptions:exceptions.data});
  }
  const search=text(params.get('search'),200); let query=db.from('shipment_summaries').select('*').order('created_at',{ascending:false});
  if(search)query=query.or(`shipment_code.ilike.%${search}%,tracking_number.ilike.%${search}%`);
  const {data,error}=await query; if(error)return NextResponse.json({error:'Chưa tải được shipment. Hãy áp dụng migration Logistics Phase 2.'},{status:503});
  return NextResponse.json(data);
}

export async function POST(request){
  const auth=await requireUser(request,['ADMIN']); if(!auth.ok)return auth.response;
  try{
    const body=await request.json(); const db=getSupabaseAdminClient(); let result;
    if(body.action==='create'){
      const shipment=body.shipment||{}; const itemIds=body.purchaseItemIds;
      if(!text(shipment.origin_location,160)||!text(shipment.destination_location,160)||!Array.isArray(itemIds)||!itemIds.length||itemIds.some(x=>!positiveId(x)))throw new Error('Điểm đi, điểm đến hoặc sản phẩm không hợp lệ');
      if(shipment.expected_arrival_at&&!/^\d{4}-\d{2}-\d{2}$/.test(String(shipment.expected_arrival_at)))throw new Error('Ngày dự kiến đến không hợp lệ');
      for(const key of ['shipping_cost_rmb','shipping_cost_vnd'])if(!Number.isFinite(Number(shipment[key]||0))||Number(shipment[key]||0)<0)throw new Error('Chi phí vận chuyển không hợp lệ');
      const key=String(body.idempotencyKey||''); if(key.length<8||key.length>100)throw new Error('Idempotency key không hợp lệ');
      result=await db.rpc('create_shipment',{p_shipment:{...shipment,origin_location:text(shipment.origin_location,160),destination_location:text(shipment.destination_location,160)},p_purchase_item_ids:itemIds,p_actor:auth.profile.name,p_idempotency_key:key});
    }else if(body.action==='transition'){
      const id=positiveId(body.id); if(!id)throw new Error('Mã shipment không hợp lệ');
      result=await db.rpc('transition_shipment',{p_shipment_id:id,p_target:String(body.target||''),p_actor:auth.profile.name});
    }else throw new Error('Thao tác không hợp lệ');
    if(result.error)throw new Error(result.error.message); return NextResponse.json(result.data,{status:body.action==='create'?201:200});
  }catch(error){return NextResponse.json({error:error.message||'Không thể lưu shipment'},{status:400});}
}
