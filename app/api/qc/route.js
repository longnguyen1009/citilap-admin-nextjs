import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

const ROLES=['ADMIN','TECH','TECHNICAL'];
const id=v=>/^\d+$/.test(String(v||''))&&Number(v)>0?Number(v):null;
export async function GET(request){
  const auth=await requireUser(request,ROLES);if(!auth.ok)return auth.response;const db=getSupabaseAdminClient();const p=new URL(request.url).searchParams;const inspection=p.get('id');const laptopId=id(p.get('laptopId'));
  if(inspection){const [head,items]=await Promise.all([db.from('qc_inspections').select('*, laptops(id,serial,name,status,location)').eq('id',inspection).maybeSingle(),db.from('qc_check_items').select('*').eq('qc_inspection_id',inspection).order('id')]);if(head.error||items.error)return NextResponse.json({error:'Không thể tải chi tiết QC'},{status:503});return NextResponse.json({inspection:head.data,items:items.data});}
  let query=db.from('qc_inspections').select('*, laptops(id,serial,name,status,location)').order('started_at',{ascending:false});if(laptopId)query=query.eq('laptop_id',laptopId);const {data,error}=await query;if(error)return NextResponse.json({error:'Chưa tải được QC. Hãy áp dụng migration Phase 3.'},{status:503});return NextResponse.json(data);
}
export async function POST(request){
  const auth=await requireUser(request,ROLES);if(!auth.ok)return auth.response;
  try{const body=await request.json();const db=getSupabaseAdminClient();let result;
    if(body.action==='start'){const laptopId=id(body.laptopId),key=String(body.idempotencyKey||'');if(!laptopId||key.length<8||key.length>100)throw new Error('Yêu cầu bắt đầu QC không hợp lệ');result=await db.rpc('start_qc_inspection',{p_laptop_id:laptopId,p_actor:auth.profile.name,p_idempotency_key:key});}
    else if(body.action==='save'||body.action==='complete'){if(!/^[0-9a-f-]{36}$/i.test(String(body.inspectionId||''))||!Array.isArray(body.items))throw new Error('Yêu cầu cập nhật QC không hợp lệ');const items=body.items.map(x=>({check_key:String(x.checkKey||''),result:String(x.result||''),note:String(x.note||'').slice(0,1000)}));if(body.action==='save')result=await db.rpc('save_qc_checklist',{p_inspection_id:body.inspectionId,p_items:items,p_actor:auth.profile.name});else{const key=String(body.idempotencyKey||'');if(key.length<8||key.length>100)throw new Error('Idempotency key hoàn tất không hợp lệ');result=await db.rpc('complete_qc_inspection',{p_inspection_id:body.inspectionId,p_result:body.result,p_mainboard_status:body.mainboardStatus,p_charger_status:body.chargerStatus,p_cosmetic_grade:body.cosmeticGrade||null,p_notes:String(body.notes||'').trim().slice(0,5000),p_items:items,p_actor:auth.profile.name,p_idempotency_key:key});}}
    else throw new Error('Thao tác QC không hợp lệ');if(result.error)throw new Error(result.error.message);return NextResponse.json(result.data,{status:body.action==='start'?201:200});
  }catch(error){return NextResponse.json({error:error.message||'Không thể xử lý QC'},{status:400});}
}
