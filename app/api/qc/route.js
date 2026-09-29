import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

const ROLES=['ADMIN','TECH','TECHNICAL'];
const id=v=>/^\d+$/.test(String(v||''))&&Number(v)>0?Number(v):null;
export async function GET(request){
  const auth=await requireUser(request,ROLES);if(!auth.ok)return auth.response;const db=getSupabaseAdminClient();const p=new URL(request.url).searchParams;const inspection=p.get('id');const laptopId=id(p.get('laptopId'));
  if(inspection){const [head,items]=await Promise.all([db.from('qc_inspections').select('*, laptops(id,serial,name,status,location,battery_health,qc_details,condition_note)').eq('id',inspection).maybeSingle(),db.from('qc_check_items').select('*').eq('qc_inspection_id',inspection).order('id')]);if(head.error||items.error)return NextResponse.json({error:'Không thể tải chi tiết QC'},{status:503});return NextResponse.json({inspection:head.data,items:items.data});}
  // List cards do not use technical snapshots; fetch those only by inspection ID.
  const requestedPage=id(p.get('page')),requestedLimit=id(p.get('limit'));
  const paginated=Boolean(requestedPage||requestedLimit);const page=requestedPage||1;const limit=Math.min(requestedLimit||50,100);const offset=(page-1)*limit;
  let query=db.from('qc_inspections').select('id,inspection_code,laptop_id,status,result,disposition,started_at,completed_at,started_by,completed_by,laptops(id,sku,serial,name)',paginated?{count:'exact'}:undefined).order('started_at',{ascending:false}).order('id',{ascending:false});
  if(laptopId)query=query.eq('laptop_id',laptopId);if(paginated)query=query.range(offset,offset+limit-1);
  const {data,error,count}=await query;if(error)return NextResponse.json({error:'Không thể tải lịch sử QC.'},{status:503});
  if(!paginated)return NextResponse.json(data);
  const total=count||0;return NextResponse.json({data,total,page,limit,pageCount:Math.max(1,Math.ceil(total/limit))});
}
export async function POST(request){
  const auth=await requireUser(request,ROLES);if(!auth.ok)return auth.response;
  try{const body=await request.json();const db=getSupabaseAdminClient();let result;
    if(body.action==='quick-complete'){
      const key=String(body.idempotencyKey||'');
      if(!/^[0-9a-f-]{36}$/i.test(String(body.inspectionId||'')) || !['PASS','FAIL','REPAIR','RETURN_CN'].includes(body.disposition) || key.length<8 || key.length>100) throw new Error('Kết quả QC không hợp lệ');
      result=await db.rpc('complete_qc_with_details',{p_inspection_id:body.inspectionId,p_disposition:body.disposition,p_notes:String(body.notes||'').trim().slice(0,2000),p_actor:auth.profile.name,p_idempotency_key:key,p_details:body.details || {}});
    }
    else if(body.action==='start'){const laptopId=id(body.laptopId),key=String(body.idempotencyKey||'');if(!laptopId||key.length<8||key.length>100)throw new Error('Yêu cầu bắt đầu QC không hợp lệ');result=await db.rpc('start_qc_inspection',{p_laptop_id:laptopId,p_actor:auth.profile.name,p_idempotency_key:key});}
    else throw new Error('Thao tác QC không hợp lệ');if(result.error)throw new Error(result.error.message);return NextResponse.json(result.data,{status:body.action==='start'?201:200});
  }catch(error){return NextResponse.json({error:error.message||'Không thể xử lý QC'},{status:400});}
}
