import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

const positiveId=value=>/^\d+$/.test(String(value||''))&&Number(value)>0?Number(value):null;
const TYPES=new Set(['MISSING_ITEM','WRONG_SERIAL','WRONG_MODEL','DAMAGED_PACKAGE','MISSING_CHARGER','UNEXPECTED_ITEM','OTHER']);

export async function GET(request){
  const auth=await requireUser(request,['ADMIN']);if(!auth.ok)return auth.response;const db=getSupabaseAdminClient();const shipmentId=positiveId(new URL(request.url).searchParams.get('shipmentId'));
  let query=db.from('receiving_sessions').select('*, shipments(shipment_code,tracking_number)').order('received_at',{ascending:false});if(shipmentId)query=query.eq('shipment_id',shipmentId);
  const {data,error}=await query;if(error)return NextResponse.json({error:'Không thể tải lịch sử nhận hàng'},{status:503});return NextResponse.json(data);
}

export async function POST(request){
  const auth=await requireUser(request,['ADMIN']);if(!auth.ok)return auth.response;
  try{const body=await request.json();const db=getSupabaseAdminClient();let result;
    if(body.action==='receive'){
      const shipmentId=positiveId(body.shipmentId);const items=body.items;const exceptions=Array.isArray(body.exceptions)?body.exceptions:[];const key=String(body.idempotencyKey||'');
      if(!shipmentId||!Array.isArray(items)||!items.length||items.some(x=>!positiveId(x.purchase_item_id)||typeof x.received!=='boolean'))throw new Error('Danh sách nhận hàng không hợp lệ');
      if(new Set(items.map(x=>String(x.purchase_item_id))).size!==items.length)throw new Error('Sản phẩm nhận bị trùng');
      if(exceptions.some(x=>!TYPES.has(x.type)))throw new Error('Loại exception không hợp lệ');
      if(key.length<8||key.length>100)throw new Error('Idempotency key không hợp lệ');
      result=await db.rpc('receive_shipment_items',{p_shipment_id:shipmentId,p_items:items.map(x=>({...x,actual_serial:String(x.actual_serial||'').trim().slice(0,100),actual_model:String(x.actual_model||'').trim().slice(0,240),physical_condition:String(x.physical_condition||'').trim().slice(0,1000)})),p_exceptions:exceptions,p_notes:String(body.notes||'').trim().slice(0,3000),p_actor:auth.profile.name,p_idempotency_key:key});
    }else if(body.action==='resolve'){
      const id=positiveId(body.exceptionId);if(!id||!['RESOLVED','IGNORED'].includes(body.status))throw new Error('Yêu cầu xử lý exception không hợp lệ');
      result=await db.rpc('resolve_receiving_exception',{p_exception_id:id,p_status:body.status,p_actor:auth.profile.name});
    }else throw new Error('Thao tác không hợp lệ');
    if(result.error)throw new Error(result.error.message);return NextResponse.json(result.data,{status:body.action==='receive'?201:200});
  }catch(error){return NextResponse.json({error:error.message||'Không thể nhận hàng'},{status:400});}
}
