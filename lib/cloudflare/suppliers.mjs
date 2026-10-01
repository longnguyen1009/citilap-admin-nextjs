import { randomUUID } from 'node:crypto';
const fields=['code','name','display_name','wechat_name','wechat_id','phone','country','province','city','address','bank_name','bank_account_name','bank_account_number','alipay_account','preferred_shipping_destination','notes','active'];
export async function saveSupplier(db,input,actor) {
  const clean=(value,max=500)=>String(value??'').replace(/<[^>]*>/g,'').trim().slice(0,max);
  const row=Object.fromEntries(fields.map(field=>[field,clean(input[field],field==='notes'?3000:500)]));
  row.code=clean(input.code,40).toUpperCase(); row.name=clean(input.name,200); row.active=input.active!==false?1:0;
  if(!/^[A-Z0-9_-]{2,40}$/.test(row.code)||!row.name) throw new Error('Mã và tên nhà cung cấp không hợp lệ');
  if(!['YUNNAN','GUANGXI','OTHER'].includes(row.preferred_shipping_destination)) row.preferred_shipping_destination='OTHER';
  const id=input.id||randomUUID(), statements=[];
  if(input.id) statements.push(db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM suppliers WHERE id=?) THEN 1 ELSE json('supplier not found') END`).bind(id));
  const snapshot=`json_object(${fields.map(field=>`'${field}',${field}`).join(',')})`;
  if(input.id) statements.push(db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
    SELECT 'SUPPLIER',id,'UPDATE',json_object('before',${snapshot},'after',json(?)),? FROM suppliers WHERE id=?`).bind(JSON.stringify(row),actor,id));
  statements.push(input.id
    ? db.prepare(`UPDATE suppliers SET ${fields.map(field=>`${field}=?`).join(',')},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(...fields.map(field=>row[field]),id)
    : db.prepare(`INSERT INTO suppliers(id,${fields.join(',')},created_by) VALUES (${Array(fields.length+2).fill('?').join(',')})`).bind(id,...fields.map(field=>row[field]),actor));
  if(!input.id) statements.push(db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
    SELECT 'SUPPLIER',id,'CREATE',${snapshot},? FROM suppliers WHERE id=?`).bind(actor,id));
  statements.push(db.prepare('SELECT * FROM suppliers WHERE id=?').bind(id));
  const result=await db.batch(statements), saved=result.at(-1).results[0];
  return {...saved,active:Boolean(saved.active)};
}
