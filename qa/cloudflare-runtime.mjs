import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';

// Exercise the actual workerd crypto implementation and D1 transactions.
// No remote resources or credentials are used.
const bundle = await build({
  stdin: {
    contents: `import {hashPassword, verifyPassword, signIn, findSession, signOut} from './lib/cloudflare/session.mjs';
      import {createPurchaseBatch,addLaptopToPurchaseBatch,startQcInspection,updateIncomingTracking,ignoreIncomingLaptop,updateLaptopProcurement,receivePurchaseLaptops,receiveInventory,reconcileUnknownLaptop} from './lib/cloudflare/procurement.mjs';
      import {createUser,updateUser,listUsers} from './lib/cloudflare/users.mjs';
      import {D1ReadQuery} from './lib/cloudflare/query.mjs';
      import {D1Mutation} from './lib/cloudflare/mutation.mjs';
      import {createDatabase} from './lib/cloudflare/database.mjs';
      import {createSupplierReturn} from './lib/cloudflare/supplier-returns.mjs';
      import {saveSupplier} from './lib/cloudflare/suppliers.mjs';
      import {createFinancialRecord} from './lib/cloudflare/financial.mjs';
      export default {async fetch(request,env) {
        const password='runtime-test-password-only';
        const hash=await hashPassword(password);
        if (!await verifyPassword(password,hash)) throw new Error('Password roundtrip failed');
        await env.DB.batch([
          env.DB.prepare('INSERT INTO auth_users(id,email,password_hash) VALUES (?,?,?)').bind('runtime-user','runtime@example.com',hash),
          env.DB.prepare('INSERT INTO user_profiles(id,name,role,is_active) VALUES (?,?,?,1)').bind('runtime-user','Runtime','ADMIN')
        ]);
        const req=new Request('https://test.example/api/auth/session',{method:'POST',headers:{origin:'https://test.example'}});
        const login=await signIn(env.DB,req,{email:'runtime@example.com',password});
        const cookie=login.cookie.split(';')[0];
        const session=await findSession(env.DB,new Request(req.url,{headers:{cookie}}));
        if(session?.id!=='runtime-user') throw new Error('D1 session persistence failed');
        await env.IMAGES.put('test-image',new Uint8Array([1,2,3]));
        const image=await env.IMAGES.get('test-image');
        if(image.size!==3) throw new Error('R2 persistence failed');
        await env.IMAGES.delete('test-image');
        await signOut(env.DB,new Request(req.url,{method:'DELETE',headers:{origin:'https://test.example',cookie}}));
        const revoked=await findSession(env.DB,new Request(req.url,{headers:{cookie}}));
        if(revoked) throw new Error('Logout did not revoke session');
        const staff=await createUser(env.DB,{email:'staff@example.com',name:'Staff',password,role:'SALES'});
        const listed=await listUsers(env.DB);
        if(listed.length!==2||listed.some(user=>'password_hash' in user)) throw new Error('User list contract failed');
        const staffLogin=await signIn(env.DB,req,{email:staff.email,password});
        await updateUser(env.DB,{id:staff.id,password:password+'-changed'},'runtime-user');
        if(await findSession(env.DB,new Request(req.url,{headers:{cookie:staffLogin.cookie.split(';')[0]}}))) throw new Error('Password update failed to revoke session');
        const disabled=await updateUser(env.DB,{id:staff.id,is_active:false},'runtime-user');
        if(disabled.is_active!==false) throw new Error('Account disable failed');
        let duplicateRejected=false;
        try {await createUser(env.DB,{email:staff.email,name:'Duplicate',password});} catch {duplicateRejected=true;}
        if(!duplicateRejected||(await listUsers(env.DB)).length!==2) throw new Error('Duplicate account rollback failed');
        await env.DB.prepare("INSERT INTO suppliers(id,code,name,created_by) VALUES ('supplier-test','TEST','Supplier','Runtime')").run();
        await env.DB.prepare("INSERT INTO app_options(group_key,option_key,label,is_active) VALUES ('category','test','Test',1)").run();
        const input={p_batch:{supplier_id:'supplier-test',purchase_date:'2026-09-30',exchange_rate:3990},
          p_laptops:[{name:'Test laptop',category:'test',purchase_price_rmb:1000,shipping_rmb:10,import_price_vnd:4.43}],
          p_actor:'Runtime',p_idempotency_key:'purchase-test-key'};
        const purchase=await createPurchaseBatch(env.DB,input);
        const repeated=await createPurchaseBatch(env.DB,input);
        if(JSON.stringify(purchase)!==JSON.stringify(repeated)) throw new Error('Purchase replay mismatch');
        const addInput={p_batch_id:purchase.batch.id,p_laptop:{name:'Added laptop',category:'test',purchase_price_rmb:100,shipping_rmb:5,tracking_code_cn:'ADD-TRACK'},p_actor:'Runtime',p_idempotency_key:'add-laptop-key'};
        const added=await addLaptopToPurchaseBatch(env.DB,addInput);
        const addedReplay=await addLaptopToPurchaseBatch(env.DB,addInput);
        const addedCount=await env.DB.prepare("SELECT count(*) AS n FROM laptops WHERE name='Added laptop'").first();
        if(added.id!==addedReplay.id||addedCount.n!==1||added.purchase_batch_id!==purchase.batch.id||added.month_key!=='09/2026'||added.import_price_vnd!==0.81895) throw new Error('Add-to-batch replay or formula failed: '+JSON.stringify(added));
        const laptop=purchase.laptops[0];
        if(laptop.status!=='in_transit'||laptop.is_active!==true||laptop.month_key!=='09/2026') throw new Error('Purchase contract mismatch');
        const second=await createPurchaseBatch(env.DB,{...input,p_idempotency_key:'purchase-second-key'});
        if(second.batch.batch_code!=='PO-20260930-002') throw new Error('Batch sequence mismatch');
        let rejected=false;
        try {await startQcInspection(env.DB,{p_laptop_id:laptop.id,p_actor:'Runtime',p_idempotency_key:'qc-invalid-state'});} catch {rejected=true;}
        if(!rejected) throw new Error('QC accepted in-transit machine');
        const receiving={p_items:[{laptop_id:laptop.id,serial:'RECEIVED-SERIAL',received_at:'2026-10-01'}],p_actor:'Runtime',p_notes:'Received',p_idempotency_key:'receive-runtime-key'};
        const received=await receivePurchaseLaptops(env.DB,receiving);
        const receivedAgain=await receivePurchaseLaptops(env.DB,receiving);
        if(JSON.stringify(received)!==JSON.stringify(receivedAgain)||received.laptops[0].id!==laptop.id||received.laptops[0].month_key!=='09/2026'||received.laptops[0].warehouse_date!=='2026-10-01') throw new Error('Receiving identity/month/replay mismatch');
        const movements=await env.DB.prepare('SELECT count(*) AS n FROM stock_movements').first();
        if(movements.n!==1) throw new Error('Duplicate receiving stock movement');
        const inventoryInput={p_expected:[{laptop_id:added.id,serial:'ADDED-RECEIVED',received_at:'2026-10-01',notes:'Expected note'}],p_unknown:[{name:'Unknown received',serial:'UNKNOWN-1',tracking_code_cn:'UNKNOWN-TRACK',notes:'Unknown note',received_at:'2026-10-01'}],p_notes:'Mixed receipt',p_actor:'Runtime',p_idempotency_key:'inventory-runtime-key'};
        const inventory=await receiveInventory(env.DB,inventoryInput);
        const inventoryReplay=await receiveInventory(env.DB,inventoryInput);
        const inventoryMovements=await env.DB.prepare("SELECT count(*) AS n FROM stock_movements WHERE reference_type IN ('PURCHASE_BATCH','UNKNOWN_INTAKE')").first();
        if(JSON.stringify(inventory)!==JSON.stringify(inventoryReplay)||inventory.received_count!==2||inventory.expected[0].condition_note!=='Expected note'||inventory.unknown[0].source_type!=='UNKNOWN'||inventoryMovements.n!==3) throw new Error('Mixed receiving replay failed: '+JSON.stringify(inventory));
        const expectedMatch=await addLaptopToPurchaseBatch(env.DB,{p_batch_id:second.batch.id,p_laptop:{name:'Expected match',category:'test',serial:'EXPECTED-SERIAL',purchase_price_rmb:220,shipping_rmb:8,tracking_code_cn:'EXPECTED-TRACK'},p_actor:'Runtime',p_idempotency_key:'expected-match-key'});
        const reconcileInput={p_unknown_laptop_id:inventory.unknown[0].id,p_expected_laptop_id:expectedMatch.id,p_actor:'Runtime',p_idempotency_key:'reconcile-runtime-key'};
        const reconciled=await reconcileUnknownLaptop(env.DB,reconcileInput);
        const reconcileReplay=await reconcileUnknownLaptop(env.DB,reconcileInput);
        const deletedExpected=await env.DB.prepare('SELECT count(*) AS n FROM laptops WHERE id=?').bind(expectedMatch.id).first();
        if(reconciled.id!==inventory.unknown[0].id||reconcileReplay.id!==reconciled.id||reconciled.source_type!=='SUPPLIER_PURCHASE'||reconciled.purchase_batch_id!==second.batch.id||reconciled.serial!=='UNKNOWN-1'||deletedExpected.n!==0) throw new Error('Unknown reconciliation failed: '+JSON.stringify(reconciled));
        const qcInput={p_laptop_id:laptop.id,p_actor:'Runtime',p_idempotency_key:'qc-runtime-key'};
        const qc=await startQcInspection(env.DB,qcInput);
        const qcRepeat=await startQcInspection(env.DB,{...qcInput,p_idempotency_key:'qc-another-key'});
        if(qc.id!==qcRepeat.id) throw new Error('Duplicate active QC session');
        rejected=false;
        try {await startQcInspection(env.DB,{...qcInput,p_laptop_id:second.laptops[0].id});} catch {rejected=true;}
        if(!rejected) throw new Error('QC key reused for another laptop');
        const counts=await env.DB.prepare("SELECT (SELECT count(*) FROM purchase_batches) AS batches,(SELECT count(*) FROM laptops) AS laptops,(SELECT count(*) FROM qc_inspections) AS qc,(SELECT count(*) FROM activity_logs) AS audit").first();
        if(counts.batches!==2||counts.laptops!==4||counts.qc!==1||counts.audit!==7) throw new Error('Unexpected duplicate rows: '+JSON.stringify(counts));
        // Force a late error after earlier statements have inserted rows: the whole batch must roll back.
        await env.DB.prepare("CREATE TRIGGER reject_test_audit BEFORE INSERT ON activity_logs WHEN NEW.user_name='Reject' BEGIN SELECT RAISE(ABORT,'test rollback'); END").run();
        rejected=false;
        try {await createPurchaseBatch(env.DB,{...input,p_actor:'Reject',p_idempotency_key:'purchase-rollback-key'});} catch {rejected=true;}
        if(!rejected) throw new Error('Expected transaction rejection');
        const after=await env.DB.prepare('SELECT count(*) AS n FROM laptops').first();
        if(after.n!==4) throw new Error('Purchase was only partially rolled back');
        const tracked=await updateIncomingTracking(env.DB,{p_laptop_id:laptop.id,p_tracking:' CN123 ',p_actor:'Runtime'});
        if(tracked.tracking_code_cn!=='CN123'||tracked.tracking_code!=='CN123') throw new Error('Tracking fields differ');
        const cleared=await updateIncomingTracking(env.DB,{p_laptop_id:laptop.id,p_tracking:' ',p_actor:'Runtime'});
        if(cleared.tracking_code_cn!==''||cleared.tracking_code!==null) throw new Error('Tracking clear mismatch');
        const ignored=await ignoreIncomingLaptop(env.DB,{p_laptop_id:second.laptops[0].id,p_reason:'Test ignore',p_actor:'Runtime'});
        if(ignored.is_active!==false||ignored.status!=='ignored') throw new Error('Ignore failed');
        rejected=false;
        try {await ignoreIncomingLaptop(env.DB,{p_laptop_id:laptop.id,p_reason:'Test invalid',p_actor:'Runtime'});} catch {rejected=true;}
        if(!rejected) throw new Error('Ignore accepted a waiting-QC machine');
        rejected=false;
        try {await updateIncomingTracking(env.DB,{p_laptop_id:ignored.id,p_tracking:'No',p_actor:'Runtime'});} catch {rejected=true;}
        if(!rejected) throw new Error('Tracking accepted an inactive laptop');
        const edited=await updateLaptopProcurement(env.DB,{p_laptop_id:laptop.id,p_data:{purchase_price_rmb:1200,shipping_rmb:20,notes:'Line 1\\nLine 2',purchase_batch_id:second.batch.id},p_actor:'Runtime'});
        if(edited.price_rmb!==1200||edited.purchase_price_rmb!==1200||edited.shipping_rmb!==20||edited.purchase_batch_id!==second.batch.id||edited.condition_note!=='Line 1\\nLine 2') throw new Error('Procurement correction mismatch');
        rejected=false;
        try {await updateLaptopProcurement(env.DB,{p_laptop_id:laptop.id,p_data:{name:'Must roll back',category:'missing-category'},p_actor:'Runtime'});} catch {rejected=true;}
        if(!rejected) throw new Error('Unknown category accepted');
        const unchanged=await env.DB.prepare('SELECT name FROM laptops WHERE id=?').bind(laptop.id).first();
        if(unchanged.name!==laptop.name) throw new Error('Invalid procurement partially saved');
        const page=await new D1ReadQuery(env.DB,'laptops').select('id,name,is_active',{count:'exact'}).order('id').range(0,0);
        if(page.error||page.count!==4||page.data.length!==1||page.data[0].is_active!==true) throw new Error('D1 pagination/boolean contract failed');
        const empty=await new D1ReadQuery(env.DB,'laptops').select('*').in('id',[]);
        if(empty.error||empty.data.length) throw new Error('Empty IN failed');
        const absent=await new D1ReadQuery(env.DB,'laptops').select('*').eq('id',999999).maybeSingle();
        if(absent.error||absent.data!==null) throw new Error('Optional single failed');
        const multiple=await new D1ReadQuery(env.DB,'laptops').select('*').single();
        if(multiple.error?.code!=='PGRST116') throw new Error('Multiple single-row result accepted');
        const injection=await new D1ReadQuery(env.DB,'laptops').select('*').eq('name',"' OR 1=1 --");
        if(injection.error||injection.data.length) throw new Error('Filter injection');
        const objects=await new D1ReadQuery(env.DB,'operation_requests').select('result').limit(1);
        if(objects.error||typeof objects.data[0].result!=='object') throw new Error('JSON decoding failed');
        const nested=await new D1ReadQuery(env.DB,'laptops').select('id,purchase_batches!inner(id,suppliers(name,active))').eq('id',laptop.id).gte('purchase_batches.purchase_date','2026-09-01').single();
        if(nested.error||nested.data.purchase_batches.suppliers.name!=='Supplier'||nested.data.purchase_batches.suppliers.active!==true) throw new Error('Nested relationship failed: '+JSON.stringify(nested));
        const reverse=await new D1ReadQuery(env.DB,'purchase_batches').select('id,laptops(id,name)').eq('id',second.batch.id).single();
        if(reverse.error||reverse.data.laptops.length!==3) throw new Error('To-many relationship failed');
        const settings=await new D1Mutation(env.DB,'app_settings','upsert',{key:'runtime-settings',value:{enabled:true}},{onConflict:'key'}).select('*');
        if(settings.error||settings.data[0].value.enabled!==true) throw new Error('JSON upsert failed: '+JSON.stringify(settings));
        const changed=await new D1Mutation(env.DB,'app_settings','update',{value:{enabled:false}}).eq('key','runtime-settings').select('key,value');
        if(changed.error||changed.data[0].value.enabled!==false) throw new Error('Update returning failed: '+JSON.stringify(changed));
        const rollback=await new D1Mutation(env.DB,'app_settings','insert',[{key:'rollback-settings',value:{}},{key:'runtime-settings',value:{}}]);
        if(!rollback.error) throw new Error('Duplicate key accepted');
        const missing=await new D1ReadQuery(env.DB,'app_settings').select('*').eq('key','rollback-settings').maybeSingle();
        if(missing.data!==null) throw new Error('Multirow insert partially committed');
        const singleWrite=await new D1Mutation(env.DB,'app_settings','update',{value:{single:true}}).eq('key','runtime-settings').select('key,value').single();
        if(singleWrite.error||singleWrite.data.value.single!==true) throw new Error('Single-row mutation failed');
        const optionalWrite=await new D1Mutation(env.DB,'app_settings','update',{value:{}}).eq('key','absent').select().maybeSingle();
        if(optionalWrite.error||optionalWrite.data!==null) throw new Error('Optional mutation failed');
        await new D1Mutation(env.DB,'app_settings','insert',{key:'second-settings',value:{original:true}});
        const rejectedWrite=await new D1Mutation(env.DB,'app_settings','update',{value:{corrupted:true}}).in('key',['runtime-settings','second-settings']).select().single();
        if(!rejectedWrite.error) throw new Error('Multirow single mutation accepted');
        const preserved=await new D1ReadQuery(env.DB,'app_settings').select('value').eq('key','second-settings').single();
        if(preserved.data.value.original!==true) throw new Error('Cardinality failure committed writes');
        const client=createDatabase(env.DB);
        const throughAdapter=await client.from('app_settings').upsert({key:'adapter-test',value:{ok:true}},{onConflict:'key'}).select().single();
        if(throughAdapter.error||throughAdapter.data.value.ok!==true) throw new Error('Adapter upsert failed');
        const blocked=await client.rpc('unimplemented_operation');
        if(blocked.error?.code!=='D1_OPERATION_NOT_MIGRATED') throw new Error('Missing operation did not fail closed');
        const replayQc=await client.rpc('start_qc_inspection',qcInput);
        if(replayQc.error||replayQc.data.id!==qc.id) throw new Error('Adapter operation dispatch failed');
        const cash=await client.rpc('create_cash_account',{p_data:{code:'cash_test',name:'Cash',account_type:'CASH',currency:'VND',opening_balance:1000,opening_balance_at:'2026-09-01T00:00:00Z'},p_actor:'Runtime'});
        if(cash.error||cash.data.code!=='CASH_TEST'||cash.data.is_active!==true) throw new Error('Cash account creation failed');
        const renamed=await client.rpc('update_cash_account',{p_id:cash.data.id,p_name:'Renamed',p_is_active:false,p_actor:'Runtime'});
        if(renamed.error||renamed.data.is_active!==false) throw new Error('Cash account update failed');
        const months=await client.rpc('list_data_months',{p_scope:'purchases'});
        if(months.error||months.data[0].month_key!=='09/2026') throw new Error('Month listing failed');
        const repairInput={p_data:{laptop_id:laptop.id,source_type:'INTERNAL',reported_issue:'Test fault',priority:'NORMAL',assigned_to:'runtime-user'},p_actor:'Runtime',p_idempotency_key:'repair-runtime-key'};
        const repair=await client.rpc('start_repair_job',repairInput);
        const repairReplay=await client.rpc('start_repair_job',repairInput);
        if(repair.error||repairReplay.error||repair.data.id!==repairReplay.data.id||repair.data.requires_re_qc!==true) throw new Error('Repair start/replay failed: '+JSON.stringify(repair));
        const repairCount=await env.DB.prepare("SELECT count(*) AS n FROM repair_jobs WHERE idempotency_key='repair-runtime-key'").first();
        if(repairCount.n!==1) throw new Error('Duplicate repair job created');
        const repairLaptop=await env.DB.prepare('SELECT status FROM laptops WHERE id=?').bind(laptop.id).first();
        if(repairLaptop.status!=='repair') throw new Error('Repair start did not update laptop');
        const startedRepair=await client.rpc('update_repair_job',{p_id:repair.data.id,p_data:{status:'IN_PROGRESS',reported_issue:'Test fault updated',diagnosis:'Initial diagnosis',repair_plan:'Replace part',priority:'HIGH',assigned_to:'runtime-user',labor_cost_vnd:250000,notes:'Started'},p_actor:'Runtime'});
        if(startedRepair.error||startedRepair.data.status!=='IN_PROGRESS'||startedRepair.data.priority!=='HIGH'||startedRepair.data.labor_cost_vnd!==250000||!startedRepair.data.started_at) throw new Error('Repair update failed: '+JSON.stringify(startedRepair));
        const invalidTransition=await client.rpc('update_repair_job',{p_id:repair.data.id,p_data:{status:'OPEN',reported_issue:'Must not persist',priority:'HIGH',assigned_to:'runtime-user',labor_cost_vnd:250000},p_actor:'Runtime'});
        if(!invalidTransition.error) throw new Error('Invalid repair transition accepted');
        const transitionPreserved=await env.DB.prepare('SELECT status,reported_issue FROM repair_jobs WHERE id=?').bind(repair.data.id).first();
        if(transitionPreserved.status!=='IN_PROGRESS'||transitionPreserved.reported_issue!=='Test fault updated') throw new Error('Invalid repair transition partially persisted');
        const repairAction=await client.rpc('add_repair_action',{p_job:repair.data.id,p_data:{action_type:'DIAGNOSIS',description:'Checked hardware'},p_actor:'Runtime'});
        if(repairAction.error||repairAction.data.description!=='Checked hardware') throw new Error('Repair action failed');
        const part=await client.rpc('add_repair_part',{p_job:repair.data.id,p_data:{part_type:'RAM',part_name:'RAM test',quantity:2,unit_cost_vnd:500000,source:'PURCHASED'},p_actor:'Runtime'});
        if(part.error||part.data.total_cost_vnd!==1000000) throw new Error('Repair part cost failed: '+JSON.stringify(part));
        const partTotal=await env.DB.prepare('SELECT parts_cost_vnd FROM repair_jobs WHERE id=?').bind(repair.data.id).first();
        if(partTotal.parts_cost_vnd!==1000000) throw new Error('Repair total did not update');
        const failedRemove=await client.rpc('remove_repair_part',{p_part_id:part.data.id,p_actor:'Reject'});
        if(!failedRemove.error) throw new Error('Expected part removal rollback');
        const preservedTotal=await env.DB.prepare('SELECT parts_cost_vnd FROM repair_jobs WHERE id=?').bind(repair.data.id).first();
        if(preservedTotal.parts_cost_vnd!==1000000) throw new Error('Failed removal changed total');
        const removed=await client.rpc('remove_repair_part',{p_part_id:part.data.id,p_actor:'Runtime'});
        if(removed.error||removed.data.id!==part.data.id) throw new Error('Part removal failed');
        const zeroTotal=await env.DB.prepare('SELECT parts_cost_vnd FROM repair_jobs WHERE id=?').bind(repair.data.id).first();
        if(zeroTotal.parts_cost_vnd!==0) throw new Error('Empty parts total not zero');
        const testingRepair=await client.rpc('update_repair_job',{p_id:repair.data.id,p_data:{status:'TESTING',reported_issue:'Test fault updated',diagnosis:'Fixed',repair_plan:'Verify',priority:'HIGH',assigned_to:'runtime-user',labor_cost_vnd:250000,notes:'Testing'},p_actor:'Runtime'});
        if(testingRepair.error||testingRepair.data.status!=='TESTING') throw new Error('Repair testing transition failed');
        const completionInput={p_id:repair.data.id,p_resolution:'Verified repair',p_outcome:'REPAIRED',p_recommended_action:'RE_QC',p_actor:'Runtime',p_idempotency_key:'repair-complete-key'};
        const failedCompletion=await client.rpc('complete_repair_job',{...completionInput,p_actor:'Reject'});
        if(!failedCompletion.error) throw new Error('Expected repair completion rollback');
        const completionRollback=await env.DB.prepare("SELECT r.status,l.status AS laptop_status,(SELECT count(*) FROM laptop_cost_components WHERE source_type='REPAIR_JOB' AND source_id=r.id) AS costs FROM repair_jobs r JOIN laptops l ON l.id=r.laptop_id WHERE r.id=?").bind(repair.data.id).first();
        if(completionRollback.status!=='TESTING'||completionRollback.laptop_status!=='repair'||completionRollback.costs!==0) throw new Error('Failed completion partially persisted');
        const completedRepair=await client.rpc('complete_repair_job',completionInput);
        if(completedRepair.error||completedRepair.data.status!=='COMPLETED'||completedRepair.data.total_cost_vnd!==250000) throw new Error('Repair completion failed: '+JSON.stringify(completedRepair));
        const completionAudit=await env.DB.prepare("SELECT count(*) AS n FROM activity_logs WHERE entity_type='REPAIR_JOB' AND entity_id=? AND json_extract(changes,'$.status')='COMPLETED'").bind(repair.data.id).first();
        const replayCompletion=await client.rpc('complete_repair_job',completionInput);
        const replayAudit=await env.DB.prepare("SELECT count(*) AS n FROM activity_logs WHERE entity_type='REPAIR_JOB' AND entity_id=? AND json_extract(changes,'$.status')='COMPLETED'").bind(repair.data.id).first();
        if(replayCompletion.error||replayCompletion.data.id!==repair.data.id||completionAudit.n!==1||replayAudit.n!==1) throw new Error('Repair completion replay failed');
        const repairCost=await env.DB.prepare("SELECT amount_vnd,created_by FROM laptop_cost_components WHERE source_type='REPAIR_JOB' AND source_id=? AND voided_at IS NULL").bind(repair.data.id).first();
        if(repairCost.amount_vnd!==250000||repairCost.created_by!=='Runtime') throw new Error('Repair cost sync failed');
        const syncedCosts=await client.rpc('sync_laptop_cost_components',{p_laptop_id:laptop.id,p_actor:'Runtime'});
        const repairCostCount=await env.DB.prepare("SELECT count(*) AS n FROM laptop_cost_components WHERE source_type='REPAIR_JOB' AND source_id=? AND voided_at IS NULL").bind(repair.data.id).first();
        if(syncedCosts.error||syncedCosts.data.repair_jobs_synced!==1||repairCostCount.n!==1) throw new Error('Repair cost replay failed');
        const manualCostInput={p_laptop_id:laptop.id,p_cost_type:'CLEANING',p_amount_vnd:120000,p_description:'Deep clean',p_occurred_at:'2026-09-30T03:00:00Z',p_actor:'Runtime',p_idempotency_key:'manual-cost-key'};
        const failedManualCost=await client.rpc('add_manual_laptop_cost',{...manualCostInput,p_actor:'Reject'});
        const failedManualCount=await env.DB.prepare("SELECT count(*) AS n FROM laptop_cost_components WHERE source_type='MANUAL' AND source_id='manual-cost-key'").first();
        if(!failedManualCost.error||failedManualCount.n!==0) throw new Error('Manual cost audit rollback failed');
        const manualCost=await client.rpc('add_manual_laptop_cost',manualCostInput);
        const manualReplay=await client.rpc('add_manual_laptop_cost',manualCostInput);
        const manualAuditCount=await env.DB.prepare("SELECT count(*) AS n FROM activity_logs WHERE entity_type='LAPTOP_COST' AND entity_id=? AND action='CREATE'").bind(manualCost.data?.id).first();
        if(manualCost.error||manualReplay.error||manualReplay.data.id!==manualCost.data.id||manualAuditCount.n!==1) throw new Error('Manual cost replay failed');
        const failedVoid=await client.rpc('void_manual_laptop_cost',{p_id:manualCost.data.id,p_reason:'Rollback void',p_actor:'Reject'});
        const activeManual=await env.DB.prepare('SELECT voided_at FROM laptop_cost_components WHERE id=?').bind(manualCost.data.id).first();
        if(!failedVoid.error||activeManual.voided_at!==null) throw new Error('Manual cost void rollback failed');
        const voidedManual=await client.rpc('void_manual_laptop_cost',{p_id:manualCost.data.id,p_reason:'Correction',p_actor:'Runtime'});
        const duplicateVoid=await client.rpc('void_manual_laptop_cost',{p_id:manualCost.data.id,p_reason:'Again',p_actor:'Runtime'});
        if(voidedManual.error||!voidedManual.data.voided_at||!duplicateVoid.error) throw new Error('Manual cost void failed');
        const cancelCandidate=await client.rpc('start_repair_job',{p_data:{laptop_id:laptop.id,source_type:'INTERNAL',reported_issue:'Cancel test',priority:'LOW',assigned_to:'runtime-user'},p_actor:'Runtime',p_idempotency_key:'repair-cancel-key'});
        if(cancelCandidate.error) throw new Error('Cancellation repair setup failed');
        const failedCancel=await client.rpc('cancel_repair_job',{p_id:cancelCandidate.data.id,p_reason:'Rollback test',p_actor:'Reject'});
        if(!failedCancel.error) throw new Error('Expected audit rejection');
        const stillRepair=await env.DB.prepare('SELECT status FROM laptops WHERE id=?').bind(laptop.id).first();
        if(stillRepair.status!=='repair') throw new Error('Failed cancellation changed laptop');
        const cancelledRepair=await client.rpc('cancel_repair_job',{p_id:cancelCandidate.data.id,p_reason:'Not required',p_actor:'Runtime'});
        if(cancelledRepair.error||cancelledRepair.data.status!=='CANCELLED') throw new Error('Repair cancellation failed');
        const returnedQc=await env.DB.prepare('SELECT status,available_for_sale_at FROM laptops WHERE id=?').bind(laptop.id).first();
        if(returnedQc.status!=='waiting_qc'||returnedQc.available_for_sale_at!==null) throw new Error('Cancellation did not restore QC');
        const closedAction=await client.rpc('add_repair_action',{p_job:repair.data.id,p_data:{action_type:'TEST',description:'Must reject'},p_actor:'Runtime'});
        if(!closedAction.error) throw new Error('Closed repair accepted action');
        const supplierReturnInput={p_data:{reason:'OTHER',reason_notes:'QC return',notes:'Runtime'},p_items:[{laptop_id:laptop.id,repair_job_id:repair.data.id,qc_inspection_id:qc.id,reason:'OTHER',condition_notes:'Return test',expected_refund_rmb:500}],p_actor:'Runtime',p_idempotency_key:'supplier-return-key'};
        const supplierReturn=await createSupplierReturn(env.DB,supplierReturnInput);
        const supplierReturnReplay=await createSupplierReturn(env.DB,supplierReturnInput);
        const supplierReturnState=await env.DB.prepare('SELECT l.status,(SELECT count(*) FROM supplier_return_items WHERE supplier_return_id=?) AS items,(SELECT count(*) FROM supplier_return_events WHERE supplier_return_id=?) AS events FROM laptops l WHERE l.id=?').bind(supplierReturn.id,supplierReturn.id,laptop.id).first();
        if(supplierReturn.id!==supplierReturnReplay.id||supplierReturnState.status!=='supplier_return'||supplierReturnState.items!==1||supplierReturnState.events!==1) throw new Error('Supplier return replay failed');
        const invalidReturnTransition=await client.rpc('transition_supplier_return',{p_id:supplierReturn.id,p_target:'SHIPPED',p_data:{},p_actor:'Runtime'});
        if(!invalidReturnTransition.error) throw new Error('Invalid supplier return transition accepted');
        for(const target of ['APPROVED','READY_TO_SHIP']) {
          const transitioned=await client.rpc('transition_supplier_return',{p_id:supplierReturn.id,p_target:target,p_data:{},p_actor:'Runtime'});
          if(transitioned.error||transitioned.data.status!==target) throw new Error('Supplier transition failed: '+target);
        }
        const missingTracking=await client.rpc('transition_supplier_return',{p_id:supplierReturn.id,p_target:'SHIPPED',p_data:{},p_actor:'Runtime'});
        if(!missingTracking.error) throw new Error('Supplier shipment accepted without tracking');
        for(const [target,data] of [['SHIPPED',{carrier:'Carrier',tracking_number:'RETURN-TRACK'}],['SUPPLIER_RECEIVED',{}],['WAITING_REFUND',{resolution_type:'REFUND'}]]) {
          const transitioned=await client.rpc('transition_supplier_return',{p_id:supplierReturn.id,p_target:target,p_data:data,p_actor:'Runtime'});
          if(transitioned.error||transitioned.data.status!==target) throw new Error('Supplier transition failed: '+target+' '+JSON.stringify(transitioned));
        }
        const cnyAccount=await client.rpc('create_cash_account',{p_data:{code:'cny_test',name:'CNY',account_type:'WECHAT',currency:'CNY',opening_balance:0,opening_balance_at:'2026-09-01T00:00:00Z'},p_actor:'Runtime'});
        if(cnyAccount.error) throw new Error('CNY account setup failed');
        const destinationCash=await client.rpc('create_cash_account',{p_data:{code:'CNY_DEST',name:'Destination',account_type:'CASH',currency:'CNY',opening_balance:0,opening_balance_at:'2026-09-01'},p_actor:'Runtime'});
        const transferInput={p_source:cnyAccount.data.id,p_destination:destinationCash.data.id,p_amount:25,p_description:'Transfer test',p_occurred_at:'2026-10-01',p_actor:'Runtime',p_idempotency_key:'transfer-runtime-test'};
        const failedTransfer=await client.rpc('transfer_cash_accounts',{...transferInput,p_actor:'Reject'});
        const transfer=await client.rpc('transfer_cash_accounts',transferInput);
        const transferReplay=await client.rpc('transfer_cash_accounts',transferInput);
        if(!failedTransfer.error||transfer.error||transferReplay.error||transfer.data.transfer_group_id!==transferReplay.data.transfer_group_id) throw new Error('Transfer failed: '+JSON.stringify(transfer));
        const transferRows=await env.DB.prepare("SELECT count(*) AS n,sum(CASE direction WHEN 'IN' THEN amount ELSE -amount END) AS net FROM account_transactions WHERE transfer_group_id=?").bind(transfer.data.transfer_group_id).first();
        if(transferRows.n!==2||transferRows.net!==0) throw new Error('Transfer legs unbalanced');
        const manualTx={p_account_id:cnyAccount.data.id,p_direction:'IN',p_amount:100,p_description:'Opening cash deposit',p_occurred_at:'2026-10-01T00:00:00Z',p_actor:'Runtime',p_idempotency_key:'manual-account-test'};
        const failedTx=await client.rpc('post_manual_account_transaction',{...manualTx,p_actor:'Reject'});
        const absentTx=await env.DB.prepare('SELECT count(*) AS n FROM account_transactions WHERE idempotency_key=?').bind(manualTx.p_idempotency_key).first();
        if(!failedTx.error||absentTx.n!==0) throw new Error('Manual transaction rollback failed');
        const manualPosted=await client.rpc('post_manual_account_transaction',manualTx);
        const manualRetried=await client.rpc('post_manual_account_transaction',manualTx);
        if(manualPosted.error||manualRetried.error||manualPosted.data.id!==manualRetried.data.id) throw new Error('Manual transaction replay failed: '+JSON.stringify(manualPosted));
        for(const override of [{p_amount:101},{p_account_id:cash.data.id},{p_occurred_at:'2026-08-01',p_idempotency_key:'manual-account-old'}]) {
          if(!(await client.rpc('post_manual_account_transaction',{...manualTx,...override})).error) throw new Error('Invalid manual transaction accepted');
        }
        const supplierPay={p_batch_id:purchase.batch.id,p_amount_rmb:40,p_exchange_rate:4000,p_method:'WECHAT',p_date:'2026-10-01',p_actor:'Runtime',p_account_id:cnyAccount.data.id,p_idempotency_key:'supplier-payment-test'};
        const payRollback=await client.rpc('record_supplier_payment_with_account',{...supplierPay,p_actor:'Reject'});
        const payAbsent=await env.DB.prepare('SELECT count(*) AS n FROM supplier_payments WHERE idempotency_key=?').bind(supplierPay.p_idempotency_key).first();
        if(!payRollback.error||payAbsent.n!==0) throw new Error('Supplier payment rollback failed');
        const paidSupplier=await client.rpc('record_supplier_payment_with_account',supplierPay);
        const paidReplay=await client.rpc('record_supplier_payment_with_account',supplierPay);
        const payLedger=await env.DB.prepare("SELECT count(*) AS n,sum(amount) AS total FROM account_transactions WHERE idempotency_key='supplier-payment-test-CASH' AND direction='OUT'").first();
        if(paidSupplier.error||paidReplay.error||paidSupplier.data.id!==paidReplay.data.id||payLedger.n!==1||payLedger.total!==40||paidSupplier.data.amount_vnd!==160000) throw new Error('Supplier payment/replay failed: '+JSON.stringify(paidSupplier));
        for(const overrides of [{p_amount_rmb:999999,p_idempotency_key:'supplier-payment-overpay'},{p_account_id:cash.data.id},{p_date:'2026-02-30',p_idempotency_key:'supplier-payment-date'},{p_date:'2026-08-01',p_idempotency_key:'supplier-payment-opening'}]) {
          const rejectedPay=await client.rpc('record_supplier_payment_with_account',{...supplierPay,...overrides});
          if(!rejectedPay.error) throw new Error('Invalid supplier payment accepted');
        }
        const refundOne={p_return_id:supplierReturn.id,p_amount_rmb:200,p_exchange_rate:4000,p_method:'WECHAT',p_reference:'Refund 1',p_received_at:'2026-10-01T04:00:00Z',p_actor:'Runtime',p_account_id:cnyAccount.data.id,p_idempotency_key:'supplier-refund-one'};
        const failedRefund=await client.rpc('record_supplier_refund_with_account',{...refundOne,p_actor:'Reject'});
        const failedRefundState=await env.DB.prepare("SELECT (SELECT count(*) FROM supplier_refunds WHERE idempotency_key='supplier-refund-one') AS refunds,(SELECT count(*) FROM account_transactions WHERE idempotency_key='supplier-refund-one-CASH') AS tx").first();
        if(!failedRefund.error||failedRefundState.refunds!==0||failedRefundState.tx!==0) throw new Error('Supplier refund rollback failed');
        const firstRefund=await client.rpc('record_supplier_refund_with_account',refundOne);
        const firstRefundReplay=await client.rpc('record_supplier_refund_with_account',refundOne);
        const partialReturn=await env.DB.prepare('SELECT status FROM supplier_returns WHERE id=?').bind(supplierReturn.id).first();
        const firstRefundCounts=await env.DB.prepare("SELECT (SELECT count(*) FROM supplier_refunds WHERE idempotency_key='supplier-refund-one') AS refunds,(SELECT count(*) FROM account_transactions WHERE idempotency_key='supplier-refund-one-CASH') AS tx").first();
        if(firstRefund.error||firstRefundReplay.error||firstRefund.data.id!==firstRefundReplay.data.id||partialReturn.status!=='PARTIALLY_RESOLVED'||firstRefundCounts.refunds!==1||firstRefundCounts.tx!==1) throw new Error('Partial supplier refund/replay failed');
        const secondRefund=await client.rpc('record_supplier_refund_with_account',{...refundOne,p_amount_rmb:300,p_reference:'Refund 2',p_idempotency_key:'supplier-refund-two'});
        if(secondRefund.error) throw new Error('Second refund failed: '+JSON.stringify(secondRefund));
        const refundedState=await env.DB.prepare("SELECT r.status,i.status AS item_status,(SELECT count(*) FROM account_transactions WHERE reference_type='SUPPLIER_REFUND' AND reference_id=CAST(? AS TEXT)) AS ledger FROM supplier_returns r JOIN supplier_return_items i ON i.supplier_return_id=r.id WHERE r.id=?").bind(String(secondRefund.data.id),supplierReturn.id).first();
        if(secondRefund.error||refundedState.status!=='REFUNDED'||refundedState.item_status!=='REFUNDED'||refundedState.ledger!==1) throw new Error('Final supplier refund failed: '+JSON.stringify(refundedState));
        const closedReturn=await client.rpc('transition_supplier_return',{p_id:supplierReturn.id,p_target:'CLOSED',p_data:{},p_actor:'Runtime'});
        const closedReplay=await client.rpc('record_supplier_refund_with_account',refundOne);
        const closedState=await env.DB.prepare('SELECT status FROM supplier_returns WHERE id=?').bind(supplierReturn.id).first();
        const wrongAccount=await client.rpc('record_supplier_refund_with_account',{...refundOne,p_account_id:cash.data.id});
        const wrongReturn=await client.rpc('record_supplier_refund_with_account',{...refundOne,p_return_id:'another-return'});
        if(closedReturn.error||closedReplay.error||closedState.status!=='CLOSED'||!wrongAccount.error||!wrongReturn.error) throw new Error('Refund replay changed closed return or accepted a conflicting key');
        const qcBatch=await createPurchaseBatch(env.DB,{p_batch:{supplier_id:'supplier-test',purchase_date:'2026-10-01',exchange_rate:4000},
          p_laptops:['Pass','Fail','Repair','Return'].map((name,index)=>({name:'QC '+name,category:'test',purchase_price_rmb:300+index,shipping_rmb:5,import_price_vnd:1.25})),
          p_actor:'Runtime',p_idempotency_key:'qc-dispositions-batch'});
        await receivePurchaseLaptops(env.DB,{p_items:qcBatch.laptops.map((item,index)=>({laptop_id:item.id,serial:'QC-SETUP-'+index,received_at:'2026-10-01'})),
          p_actor:'Runtime',p_notes:'QC setup',p_idempotency_key:'qc-dispositions-receive'});
        const qcSessions=[];
        for(const [index,item] of qcBatch.laptops.entries()) qcSessions.push(await startQcInspection(env.DB,{p_laptop_id:item.id,p_actor:'Runtime',p_idempotency_key:'qc-disposition-start-'+index}));
        const passInput={p_inspection_id:qcSessions[0].id,p_disposition:'PASS',p_notes:'Ready for sale',p_actor:'Runtime',p_idempotency_key:'qc-pass-complete',
          p_details:{serialNumber:'QC-PASS-SERIAL',batteryHealth:'91',screen:{result:'PASS'},mainboard:{result:'WARNING',note:'Observed'},camera:{result:'PASS'},microphone:{result:'PASS'},cosmeticGrade:'A'}};
        const rejectedQc=await client.rpc('complete_qc_with_details',{...passInput,p_actor:'Reject'});
        const qcRollback=await env.DB.prepare('SELECT q.status AS qc_status,l.status,l.serial FROM qc_inspections q JOIN laptops l ON l.id=q.laptop_id WHERE q.id=?').bind(qcSessions[0].id).first();
        if(!rejectedQc.error||qcRollback.qc_status!=='IN_PROGRESS'||qcRollback.status!=='waiting_qc'||qcRollback.serial!=='QC-SETUP-0') throw new Error('QC completion rollback failed: '+JSON.stringify(qcRollback));
        const passQc=await client.rpc('complete_qc_with_details',passInput);
        const passReplay=await client.rpc('complete_qc_with_details',passInput);
        const passState=await env.DB.prepare("SELECT l.status,l.serial,l.battery_health,l.screen_status,l.mainboard_status,l.camera_mic_status,l.condition_note,l.available_for_sale_at,l.qc_details, "+
          "(SELECT count(*) FROM stock_movements WHERE reference_type='QC_INSPECTION' AND reference_id=q.id) AS movements, "+
          "(SELECT count(*) FROM activity_logs WHERE entity_type='QC_INSPECTION' AND entity_id=q.id AND json_extract(changes,'$.disposition') IS NOT NULL) AS audits "+
          'FROM qc_inspections q JOIN laptops l ON l.id=q.laptop_id WHERE q.id=?').bind(qcSessions[0].id).first();
        const passDetails=JSON.parse(passState.qc_details);
        if(passQc.error||passReplay.error||passQc.data.id!==passReplay.data.id||passState.status!=='available'||passState.serial!=='QC-PASS-SERIAL'
          ||passState.battery_health!==91||passState.screen_status!=='ok'||passState.mainboard_status!=='error'||passState.camera_mic_status!=='ok'
          ||passState.condition_note!=='Ready for sale'||!passState.available_for_sale_at||'serialNumber' in passDetails||'batteryHealth' in passDetails
          ||passDetails.cosmeticGrade!=='A'||passState.movements!==1||passState.audits!==1) throw new Error('QC PASS/replay failed: '+JSON.stringify(passState));
        const invalidDetails=await client.rpc('complete_qc_with_details',{p_inspection_id:qcSessions[1].id,p_disposition:'FAIL',p_notes:'Invalid',p_actor:'Runtime',p_idempotency_key:'qc-invalid-details',p_details:{unknown:{result:'PASS'}}});
        if(!invalidDetails.error) throw new Error('Invalid QC details accepted');
        const failQc=await client.rpc('complete_qc_with_details',{p_inspection_id:qcSessions[1].id,p_disposition:'FAIL',p_notes:'Needs review',p_actor:'Runtime',p_idempotency_key:'qc-fail-complete',p_details:{screen:{result:'FAIL'}}});
        const failState=await env.DB.prepare('SELECT q.result,q.disposition,l.status,l.available_for_sale_at FROM qc_inspections q JOIN laptops l ON l.id=q.laptop_id WHERE q.id=?').bind(qcSessions[1].id).first();
        if(failQc.error||failState.result!=='FAIL'||failState.disposition!=='FAIL'||failState.status!=='waiting_qc'||failState.available_for_sale_at!==null) throw new Error('QC FAIL failed: '+JSON.stringify(failState));
        const repairQc=await client.rpc('complete_qc_with_details',{p_inspection_id:qcSessions[2].id,p_disposition:'REPAIR',p_notes:'Replace keyboard',p_actor:'Runtime',p_idempotency_key:'qc-repair-complete',p_details:{keyboard:{result:'FAIL'}}});
        const repairQcState=await env.DB.prepare("SELECT l.status,(SELECT count(*) FROM repair_jobs r WHERE r.laptop_id=l.id AND r.source_type='QC' AND r.source_id=?) AS jobs, "+
          '(SELECT reported_issue FROM repair_jobs r WHERE r.laptop_id=l.id AND r.source_id=?) AS issue FROM laptops l WHERE l.id=?').bind(qcSessions[2].id,qcSessions[2].id,qcBatch.laptops[2].id).first();
        if(repairQc.error||repairQcState.status!=='repair'||repairQcState.jobs!==1||repairQcState.issue!=='Replace keyboard') throw new Error('QC REPAIR failed: '+JSON.stringify(repairQcState));
        const returnQc=await client.rpc('complete_qc_with_details',{p_inspection_id:qcSessions[3].id,p_disposition:'RETURN_CN',p_notes:'Mainboard fault',p_actor:'Runtime',p_idempotency_key:'qc-return-complete',p_details:{mainboard:{result:'FAIL'}}});
        const returnQcState=await env.DB.prepare('SELECT l.status,(SELECT count(*) FROM supplier_return_items i WHERE i.laptop_id=l.id AND i.qc_inspection_id=?) AS items, '+
          '(SELECT previous_laptop_status FROM supplier_return_items i WHERE i.laptop_id=l.id AND i.qc_inspection_id=?) AS previous_status, '+
          '(SELECT count(*) FROM supplier_returns r JOIN supplier_return_items i ON i.supplier_return_id=r.id WHERE i.laptop_id=l.id AND r.idempotency_key=?) AS returns '+
          'FROM laptops l WHERE l.id=?').bind(qcSessions[3].id,qcSessions[3].id,'qc-return-'+qcSessions[3].id,qcBatch.laptops[3].id).first();
        if(returnQc.error||returnQcState.status!=='supplier_return'||returnQcState.items!==1||returnQcState.previous_status!=='waiting_qc'||returnQcState.returns!==1) throw new Error('QC RETURN_CN failed: '+JSON.stringify(returnQcState));
        const qcReturnRecord=await env.DB.prepare('SELECT r.id FROM supplier_returns r JOIN supplier_return_items i ON i.supplier_return_id=r.id WHERE i.qc_inspection_id=?').bind(qcSessions[3].id).first();
        for(const [target,data] of [['APPROVED',{}],['READY_TO_SHIP',{}],['SHIPPED',{carrier:'Carrier',tracking_number:'REPLACE-TRACK'}],['SUPPLIER_RECEIVED',{}],['WAITING_REPLACEMENT',{resolution_type:'REPLACEMENT'}]]) {
          const transitioned=await client.rpc('transition_supplier_return',{p_id:qcReturnRecord.id,p_target:target,p_data:data,p_actor:'Runtime'});
          if(transitioned.error) throw new Error('Replacement flow transition failed: '+target);
        }
        const replacement=await addLaptopToPurchaseBatch(env.DB,{p_batch_id:qcBatch.batch.id,p_laptop:{name:'Replacement laptop',category:'test',purchase_price_rmb:200,shipping_rmb:5},p_actor:'Runtime',p_idempotency_key:'replacement-laptop-key'});
        await env.DB.prepare("UPDATE laptops SET source_type='SUPPLIER_REPLACEMENT' WHERE id=?").bind(replacement.id).run();
        const replacementItem=await env.DB.prepare('SELECT id FROM supplier_return_items WHERE supplier_return_id=?').bind(qcReturnRecord.id).first();
        const linkedReplacement=await client.rpc('link_supplier_replacement',{p_item_id:replacementItem.id,p_replacement_laptop_id:replacement.id,p_actor:'Runtime'});
        const replacementState=await env.DB.prepare("SELECT r.status,i.status AS item_status,i.replacement_laptop_id,(SELECT count(*) FROM supplier_return_events WHERE supplier_return_id=r.id AND event_type='REPLACEMENT_LINKED') AS events FROM supplier_returns r JOIN supplier_return_items i ON i.supplier_return_id=r.id WHERE r.id=?").bind(qcReturnRecord.id).first();
        if(linkedReplacement.error||replacementState.status!=='REPLACED'||replacementState.item_status!=='REPLACED'||replacementState.replacement_laptop_id!==replacement.id||replacementState.events!==1) throw new Error('Supplier replacement link failed: '+JSON.stringify({linkedReplacement,replacementState,replacement}));
        const reconciliationInput={p_account_id:destinationCash.data.id,p_actual:20,p_reconciled_at:'2026-10-01T12:00:00Z',p_notes:'Counted cash',p_actor:'Runtime'};
        const badReconciliation=await client.rpc('reconcile_cash_account',{...reconciliationInput,p_actor:'Reject'});
        const reconciliation=await client.rpc('reconcile_cash_account',reconciliationInput);
        const reconciliations=await env.DB.prepare('SELECT count(*) AS n FROM account_reconciliations WHERE account_id=?').bind(destinationCash.data.id).first();
        if(!badReconciliation.error||reconciliation.error||reconciliations.n!==1||reconciliation.data.recorded_balance!==25||reconciliation.data.difference!==-5) throw new Error('Reconciliation balance/rollback failed');
        const supplierCreated=await saveSupplier(env.DB,{code:'SECOND',name:'Second supplier',preferred_shipping_destination:'GUANGXI'},'Runtime');
        const supplierUpdated=await saveSupplier(env.DB,{...supplierCreated,name:'Renamed supplier',active:false},'Runtime');
        let supplierDuplicate=false;
        try {await saveSupplier(env.DB,{code:'SECOND',name:'Duplicate'},'Runtime');} catch {supplierDuplicate=true;}
        const supplierAudits=await env.DB.prepare("SELECT count(*) AS n FROM activity_logs WHERE entity_type='SUPPLIER' AND entity_id=?").bind(supplierCreated.id).first();
        if(supplierUpdated.name!=='Renamed supplier'||supplierUpdated.active!==false||!supplierDuplicate||supplierAudits.n!==2) throw new Error('Supplier D1 CRUD/audit failed');
        const paymentAccount=await client.rpc('create_cash_account',{p_data:{code:'PAY_VND',name:'Payment VND',account_type:'BANK',currency:'VND',opening_balance:0,opening_balance_at:'2026-09-01'},p_actor:'Runtime'});
        await env.DB.prepare("INSERT INTO orders(created_date,order_status,payment_status,sale_price,amount_paid,debt_amount,is_active,trade_in_credit_vnd) VALUES ('2026-10-01','new','unpaid',10,0,10,1,0)").run();
        const paymentOrder=await env.DB.prepare('SELECT max(id) AS id FROM orders').first();
        const orderPayment={p_order_id:paymentOrder.id,p_amount:4,p_payment_type:'deposit',p_payment_method:'transfer_cash',p_payment_date:'2026-10-01',p_reference_code:'PAY-1',p_note:'Deposit',p_recorded_by:'Runtime',p_account_id:paymentAccount.data.id,p_idempotency_key:'order-payment-one'};
        const invalidPaymentAccount=await client.rpc('record_order_payment_with_account',{...orderPayment,p_account_id:'missing-account',p_idempotency_key:'order-payment-invalid-account'});
        if(!invalidPaymentAccount.error||/malformed JSON/i.test(invalidPaymentAccount.error.message)||!invalidPaymentAccount.error.message.includes('Tài khoản nhận/chi')) throw new Error('Order payment validation message failed: '+JSON.stringify(invalidPaymentAccount));
        const paymentRollback=await client.rpc('record_order_payment_with_account',{...orderPayment,p_recorded_by:'Reject'});
        const paymentAfterRollback=await env.DB.prepare('SELECT amount_paid FROM orders WHERE id=?').bind(paymentOrder.id).first();
        if(!paymentRollback.error||paymentAfterRollback.amount_paid!==0) throw new Error('Order payment rollback failed');
        const firstPayment=await client.rpc('record_order_payment_with_account',orderPayment);
        const firstPaymentReplay=await client.rpc('record_order_payment_with_account',orderPayment);
        if(firstPayment.error||firstPaymentReplay.error||firstPayment.data.payment.id!==firstPaymentReplay.data.payment.id||firstPayment.data.order.amount_paid!==4||firstPayment.data.order.debt_amount!==6) throw new Error('Order deposit/replay failed: '+JSON.stringify(firstPayment));
        const finalPayment=await client.rpc('record_order_payment_with_account',{...orderPayment,p_amount:6,p_payment_type:'balance',p_idempotency_key:'order-payment-two'});
        const refundedPayment=await client.rpc('record_order_payment_with_account',{...orderPayment,p_amount:2,p_payment_type:'refund',p_idempotency_key:'order-payment-refund'});
        const paymentCounts=await env.DB.prepare("SELECT (SELECT count(*) FROM payments WHERE order_id=?) AS payments,(SELECT count(*) FROM financial_records WHERE order_id=?) AS records,(SELECT count(*) FROM account_transactions WHERE reference_type='PAYMENT') AS ledger").bind(paymentOrder.id,paymentOrder.id).first();
        if(finalPayment.error||finalPayment.data.order.payment_status!=='paid'||refundedPayment.error||refundedPayment.data.order.amount_paid!==8||refundedPayment.data.order.debt_amount!==2||paymentCounts.payments!==3||paymentCounts.records!==3||paymentCounts.ledger!==3) throw new Error('Order payment completion/refund failed');
        await env.DB.prepare("INSERT INTO orders(created_date,order_status,payment_status,sale_price,deposit_amount,cod_amount,amount_paid,debt_amount,is_active,trade_in_credit_vnd,tracking_code) VALUES ('2026-10-01','shipping','deposited',12,4,8,4,8,1,0,'COD-TRACK')").run();
        const codOrder=await env.DB.prepare('SELECT max(id) AS id FROM orders').first();
        const codInput={p_order_id:codOrder.id,p_carrier:'Carrier',p_tracking:'COD-TRACK',p_expected_settlement_at:'2026-10-03T10:00:00Z',p_notes:'COD',p_actor:'Runtime',p_idempotency_key:'cod-create-runtime'};
        const codCreated=await client.rpc('create_cod_receivable',codInput);
        const codReplay=await client.rpc('create_cod_receivable',codInput);
        const invalidCodTransition=await client.rpc('transition_cod_receivable',{p_id:codCreated.data.id,p_target:'WAITING_SETTLEMENT',p_actor:'Runtime'});
        const codDelivered=await client.rpc('transition_cod_receivable',{p_id:codCreated.data.id,p_target:'DELIVERED',p_actor:'Runtime'});
        const codWaiting=await client.rpc('transition_cod_receivable',{p_id:codCreated.data.id,p_target:'WAITING_SETTLEMENT',p_actor:'Runtime'});
        const codOrderAfterDelivery=await env.DB.prepare('SELECT amount_paid,debt_amount,payment_status FROM orders WHERE id=?').bind(codOrder.id).first();
        if(codCreated.error||codReplay.data.id!==codCreated.data.id||!invalidCodTransition.error||codDelivered.error||codWaiting.error||codOrderAfterDelivery.amount_paid!==12||codOrderAfterDelivery.debt_amount!==0||codOrderAfterDelivery.payment_status!=='cod') throw new Error('COD create/transition failed');
        const codSettlement={p_cod_id:codCreated.data.id,p_amount_vnd:3000000,p_account_id:paymentAccount.data.id,p_reference:'COD-1',p_settled_at:'2026-10-03T12:00:00Z',p_actor:'Runtime',p_idempotency_key:'cod-settlement-one'};
        const codRollback=await client.rpc('record_cod_settlement',{...codSettlement,p_actor:'Reject'});
        const codPartial=await client.rpc('record_cod_settlement',codSettlement);
        const codPartialReplay=await client.rpc('record_cod_settlement',codSettlement);
        const codDisputed=await client.rpc('transition_cod_receivable',{p_id:codCreated.data.id,p_target:'DISPUTED',p_notes:'Carrier review',p_actor:'Runtime'});
        const codFinal=await client.rpc('record_cod_settlement',{...codSettlement,p_amount_vnd:5000000,p_reference:'COD-2',p_idempotency_key:'cod-settlement-two'});
        const codState=await env.DB.prepare("SELECT c.status,c.settled_at,(SELECT count(*) FROM cod_settlements WHERE cod_receivable_id=c.id) AS settlements,(SELECT count(*) FROM account_transactions WHERE reference_type='COD_SETTLEMENT') AS ledger FROM cod_receivables c WHERE c.id=?").bind(codCreated.data.id).first();
        if(!codRollback.error||codPartial.error||codPartialReplay.data.id!==codPartial.data.id||codDisputed.error||codFinal.error||codState.status!=='SETTLED'||!codState.settled_at||codState.settlements!==2||codState.ledger!==2) throw new Error('COD settlement/replay/rollback failed: '+JSON.stringify({codPartial,codFinal,codState}));
        const financialSummary=await client.rpc('get_financial_operations_summary');
        if(financialSummary.error||!Array.isArray(financialSummary.data.accounts)||!financialSummary.data.generated_at||financialSummary.data.customer_receivable_orders<1) throw new Error('Financial operations summary failed: '+JSON.stringify(financialSummary));
        let financialRollback=false;
        try {await createFinancialRecord(env.DB,{recordType:'expense',category:'TEST',amount:1000,orderId:codOrder.id,occurredOn:'2026-10-01'},'Reject');} catch {financialRollback=true;}
        const manualFinancial=await createFinancialRecord(env.DB,{recordType:'expense',category:'TEST',amount:1000,orderId:codOrder.id,occurredOn:'2026-10-01',note:'Manual'},'Runtime');
        const manualFinancialCount=await env.DB.prepare("SELECT count(*) AS n FROM financial_records WHERE category='TEST'").first();
        if(!financialRollback||manualFinancial.category!=='TEST'||manualFinancialCount.n!==1) throw new Error('Manual financial record rollback failed');
        await env.DB.prepare("INSERT INTO laptops(name,status,is_active,source_type,created_by) VALUES ('Allocation laptop','available',1,'UNKNOWN','Runtime')").run();
        const allocationLaptop=await env.DB.prepare('SELECT max(id) AS id FROM laptops').first();
        await env.DB.prepare("INSERT INTO orders(created_date,order_status,payment_status,sale_price,amount_paid,debt_amount,is_active,trade_in_credit_vnd) VALUES ('2026-10-01','new','deposited',10,1,9,1,0),('2026-10-01','new','deposited',10,1,9,1,0)").run();
        const allocationOrders=await env.DB.prepare('SELECT id FROM orders ORDER BY id DESC LIMIT 2').all();
        const allocationTarget=allocationOrders.results[1].id, allocationOwner=allocationOrders.results[0].id;
        const allocated=await client.rpc('allocate_order_laptop',{p_order_id:allocationOwner,p_laptop_id:allocationLaptop.id,p_expected_owner:null,p_actor:'Runtime'});
        const staleTransfer=await client.rpc('allocate_order_laptop',{p_order_id:allocationTarget,p_laptop_id:allocationLaptop.id,p_expected_owner:null,p_actor:'Runtime'});
        const allocationRollback=await client.rpc('allocate_order_laptop',{p_order_id:allocationTarget,p_laptop_id:allocationLaptop.id,p_expected_owner:allocationOwner,p_actor:'Reject'});
        const transferred=await client.rpc('allocate_order_laptop',{p_order_id:allocationTarget,p_laptop_id:allocationLaptop.id,p_expected_owner:allocationOwner,p_actor:'Runtime'});
        const allocationState=await env.DB.prepare('SELECT (SELECT laptop_id FROM orders WHERE id=?) AS target_laptop,(SELECT laptop_id FROM orders WHERE id=?) AS old_laptop,(SELECT status FROM laptops WHERE id=?) AS laptop_status').bind(allocationTarget,allocationOwner,allocationLaptop.id).first();
        if(allocated.error||!staleTransfer.error||!allocationRollback.error||transferred.error||allocationState.target_laptop!==allocationLaptop.id||allocationState.old_laptop!==null||allocationState.laptop_status!=='reserved') throw new Error('Order allocation/transfer/rollback failed');
        await env.DB.prepare("INSERT INTO laptops(name,status,is_active,source_type,created_by) VALUES ('Reservation laptop','available',1,'UNKNOWN','Runtime'),('Cancel reservation laptop','available',1,'UNKNOWN','Runtime'),('Expired reservation laptop','reserved',1,'UNKNOWN','Runtime')").run();
        const reservationLaptops=await env.DB.prepare("SELECT id,name FROM laptops WHERE name LIKE '%reservation laptop' ORDER BY id").all();
        const reservationLaptop=reservationLaptops.results.find(x=>x.name==='Reservation laptop');
        const cancelLaptop=reservationLaptops.results.find(x=>x.name==='Cancel reservation laptop');
        const expiredLaptop=reservationLaptops.results.find(x=>x.name==='Expired reservation laptop');
        await env.DB.prepare("INSERT INTO orders(created_date,order_status,payment_status,sale_price,amount_paid,debt_amount,is_active,trade_in_credit_vnd) VALUES ('2026-10-01','new','unpaid',10,0,10,1,0)").run();
        const reservationOrder=await env.DB.prepare('SELECT max(id) AS id FROM orders').first();
        const reservationInput={p_laptop_id:reservationLaptop.id,p_customer_id:null,p_order_id:reservationOrder.id,p_expires_at:'2099-10-02T10:00:00Z',p_deposit_payment_id:null,p_notes:'Hold',p_user_id:'runtime-user',p_actor:'Runtime',p_idempotency_key:'reservation-create-one'};
        const reservation=await client.rpc('create_reservation',reservationInput);
        const reservationReplay=await client.rpc('create_reservation',reservationInput);
        const reservationExtended=await client.rpc('extend_reservation',{p_id:reservation.data.id,p_expires_at:'2099-10-03T10:00:00Z',p_actor:'Runtime',p_idempotency_key:'reservation-extend-one'});
        const conversionRollback=await client.rpc('convert_reservation_to_order',{p_id:reservation.data.id,p_order_id:reservationOrder.id,p_actor:'Reject',p_idempotency_key:'reservation-convert-bad'});
        const converted=await client.rpc('convert_reservation_to_order',{p_id:reservation.data.id,p_order_id:reservationOrder.id,p_actor:'Runtime',p_idempotency_key:'reservation-convert-one'});
        const reservationOrderState=await env.DB.prepare('SELECT laptop_id,laptop_locked FROM orders WHERE id=?').bind(reservationOrder.id).first();
        const cancelledReservation=await client.rpc('create_reservation',{...reservationInput,p_laptop_id:cancelLaptop.id,p_order_id:null,p_idempotency_key:'reservation-create-two'});
        const cancelled=await client.rpc('cancel_reservation',{p_id:cancelledReservation.data.id,p_actor:'Runtime',p_idempotency_key:'reservation-cancel-one'});
        await env.DB.prepare("INSERT INTO reservations(reservation_code,laptop_id,status,reserved_by,reserved_at,expires_at,notes,idempotency_key,created_by) VALUES ('RSV-OLD-001',?,'ACTIVE','runtime-user','2019-12-01T00:00:00Z','2020-01-01T00:00:00Z','','reservation-expired-one','Runtime')").bind(expiredLaptop.id).run();
        const expiredCount=await client.rpc('expire_reservations',{p_actor:'Runtime'});
        const reservationStates=await env.DB.prepare('SELECT (SELECT status FROM laptops WHERE id=?) AS cancel_laptop,(SELECT status FROM laptops WHERE id=?) AS expired_laptop').bind(cancelLaptop.id,expiredLaptop.id).first();
        if(reservation.error||reservationReplay.data.id!==reservation.data.id||reservationExtended.error||!conversionRollback.error||converted.error||converted.data.status!=='CONVERTED'||reservationOrderState.laptop_id!==reservationLaptop.id||reservationOrderState.laptop_locked!==1||cancelled.error||cancelled.data.status!=='CANCELLED'||expiredCount.data!==1||reservationStates.cancel_laptop!=='available'||reservationStates.expired_laptop!=='available') throw new Error('Reservation lifecycle/replay/rollback failed');
        await env.DB.prepare("INSERT INTO orders(created_date,order_status,payment_status,sale_price,amount_paid,debt_amount,is_active,trade_in_credit_vnd,cost_snapshotted_at,gross_profit_snapshot_vnd,net_contribution_snapshot_vnd) VALUES ('2026-10-01','done','paid',20,20,0,1,0,'2026-10-01T00:00:00Z',5000000,4500000)").run();
        const commissionOrder=await env.DB.prepare('SELECT max(id) AS id FROM orders').first();
        const commissionInput={p_order_id:commissionOrder.id,p_data:{beneficiary_type:'EMPLOYEE',beneficiary_user_id:'runtime-user',beneficiary_name:'Runtime',commission_type:'FIXED',amount_vnd:500000,notes:'Commission'},p_actor:'Runtime',p_idempotency_key:'commission-create-one'};
        const commissionRollback=await client.rpc('generate_commission',{...commissionInput,p_actor:'Reject',p_idempotency_key:'commission-create-bad'});
        const commission=await client.rpc('generate_commission',commissionInput);
        const commissionReplay=await client.rpc('generate_commission',commissionInput);
        const approvalRollback=await client.rpc('approve_commission',{p_id:commission.data.id,p_actor:'Reject'});
        const approvedCommission=await client.rpc('approve_commission',{p_id:commission.data.id,p_actor:'Runtime'});
        const paymentRollbackCommission=await client.rpc('pay_commission',{p_id:commission.data.id,p_account_id:paymentAccount.data.id,p_reference:'COM-1',p_actor:'Reject',p_idempotency_key:'commission-pay-bad'});
        const paidCommission=await client.rpc('pay_commission',{p_id:commission.data.id,p_account_id:paymentAccount.data.id,p_reference:'COM-1',p_actor:'Runtime',p_idempotency_key:'commission-pay-one'});
        const paidCommissionReplay=await client.rpc('pay_commission',{p_id:commission.data.id,p_account_id:paymentAccount.data.id,p_reference:'COM-1',p_actor:'Runtime',p_idempotency_key:'commission-pay-one'});
        const commissionCounts=await env.DB.prepare("SELECT (SELECT count(*) FROM commissions WHERE order_id=?) AS commissions,(SELECT count(*) FROM account_transactions WHERE reference_type='COMMISSION') AS ledger").bind(commissionOrder.id).first();
        if(!commissionRollback.error||commission.error||commissionReplay.data.id!==commission.data.id||!approvalRollback.error||approvedCommission.data.status!=='APPROVED'||!paymentRollbackCommission.error||paidCommission.data.status!=='PAID'||paidCommissionReplay.data.id!==paidCommission.data.id||commissionCounts.commissions!==1||commissionCounts.ledger!==1) throw new Error('Commission lifecycle/replay/rollback failed');
        await env.DB.prepare("INSERT INTO orders(created_date,order_status,payment_status,sale_price,amount_paid,debt_amount,is_active,trade_in_credit_vnd) VALUES ('2026-10-01','new','unpaid',20,0,20,1,0)").run();
        const tradeOrder=await env.DB.prepare('SELECT max(id) AS id FROM orders').first();
        const tradeInput={p_data:{brand:'Apple',model:'MacBook',serial:'TRADE-1',order_id:String(tradeOrder.id)},p_actor:'Runtime',p_idempotency_key:'trade-create-one'};
        const trade=await client.rpc('create_trade_in',tradeInput);const tradeReplay=await client.rpc('create_trade_in',tradeInput);
        const inspection=await client.rpc('start_trade_in_inspection',{p_id:trade.data.id,p_user_id:'runtime-user',p_mainboard_status:'ORIGINAL',p_findings:'Good',p_actor:'Runtime',p_idempotency_key:'trade-inspect-one'});
        const completedInspection=await client.rpc('complete_trade_in_inspection',{p_id:inspection.data.id,p_mainboard_status:'ORIGINAL',p_findings:'Good',p_checks:[{check_key:'SCREEN',result:'PASS',notes:''}],p_actor:'Runtime',p_idempotency_key:'trade-complete-one'});
        const acceptedTrade=await client.rpc('accept_trade_in',{p_id:trade.data.id,p_order_id:tradeOrder.id,p_estimated:4000000,p_agreed:3500000,p_actor:'Runtime'});
        const receivedTrade=await client.rpc('receive_trade_in',{p_id:trade.data.id,p_actor:'Runtime',p_idempotency_key:'trade-receive-one'});
        const convertedTrade=await client.rpc('convert_trade_in_to_inventory',{p_id:trade.data.id,p_data:{category:'TRADE_IN',location:'store'},p_actor:'Runtime',p_idempotency_key:'trade-convert-one'});
        const rejectedCandidate=await client.rpc('create_trade_in',{...tradeInput,p_data:{brand:'Dell',model:'XPS'},p_idempotency_key:'trade-create-two'});
        const rejectedTrade=await client.rpc('reject_trade_in',{p_id:rejectedCandidate.data.id,p_reason:'Not suitable',p_actor:'Runtime'});
        const tradeState=await env.DB.prepare("SELECT t.status,t.inventory_laptop_id,o.trade_in_credit_vnd,o.debt_amount,(SELECT count(*) FROM laptop_cost_components WHERE source_type='TRADE_IN' AND source_id=t.id) AS costs FROM trade_ins t JOIN orders o ON o.id=t.order_id WHERE t.id=?").bind(trade.data.id).first();
        if(trade.error||tradeReplay.data.id!==trade.data.id||inspection.error||completedInspection.error||acceptedTrade.error||receivedTrade.error||convertedTrade.error||rejectedTrade.data.status!=='REJECTED'||tradeState.status!=='CONVERTED_TO_INVENTORY'||tradeState.inventory_laptop_id!==convertedTrade.data.id||tradeState.trade_in_credit_vnd!==3500000||tradeState.debt_amount!==16.5||tradeState.costs!==1) throw new Error('Trade-in lifecycle failed: '+JSON.stringify({trade,inspection,completedInspection,acceptedTrade,receivedTrade,convertedTrade,tradeState}));
        await env.DB.prepare("INSERT INTO branches(name,address) VALUES ('Main','Address')").run();
        await env.DB.prepare("INSERT INTO customers(name,phone,address) VALUES ('Invoice Customer','0900000000','Address')").run();
        await env.DB.prepare("INSERT INTO laptops(name,serial,status,is_active,source_type,created_by) VALUES ('Invoice laptop','INV-SERIAL','available',1,'UNKNOWN','Runtime')").run();
        const invoiceRefs=await env.DB.prepare("SELECT (SELECT max(id) FROM branches) branch,(SELECT max(id) FROM customers) customer,(SELECT max(id) FROM laptops) laptop").first();
        const createdOrder=await client.rpc('create_order_with_inventory',{p_order:{created_date:'2026-10-01',order_type:'retail',order_status:'shipping',payment_status:'unpaid',sale_price:15,amount_paid:0,debt_amount:15,laptop_id:invoiceRefs.laptop,customer_id:invoiceRefs.customer,branch_id:invoiceRefs.branch,month_key:'10/2026'},p_recorded_by:'Runtime'});
        const updatedOrder=await client.rpc('update_order_with_inventory',{p_order:{id:createdOrder.data.order.id,note:'Updated'},p_recorded_by:'Runtime'});
        const corePayment=await client.rpc('record_order_payment',{p_order_id:createdOrder.data.order.id,p_amount:5,p_payment_type:'deposit',p_payment_method:'cash',p_payment_date:'2026-10-01',p_note:'Invoice deposit',p_recorded_by:'Runtime'});
        const invoice=await client.rpc('issue_invoice',{p_order_id:createdOrder.data.order.id,p_actor:'Runtime'});
        const invoiceReplay=await client.rpc('issue_invoice',{p_order_id:createdOrder.data.order.id,p_actor:'Runtime'});
        const dashboard=await client.rpc('get_management_dashboard');
        if(createdOrder.error||updatedOrder.data.order.note!=='Updated'||corePayment.error||corePayment.data.order.amount_paid!==5||invoice.error||invoiceReplay.data.id!==invoice.data.id||dashboard.error||!dashboard.data.available||!dashboard.data.state_summary) throw new Error('Final operations failed: '+JSON.stringify({createdOrder,updatedOrder,corePayment,invoice,dashboard}));
        return Response.json({crypto:true,session:true,logout:true,r2:true,purchase:true,qc:true,rollback:true});
      }};`,
    resolveDir: process.cwd(), sourcefile: 'cloudflare-runtime-entry.mjs',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', external: ['node:*'],
});
const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-09-30', compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'], r2Buckets: ['IMAGES'],
}));
try {
  const db = await runtime.getD1Database('DB');
  // The generated first migration separates every complete statement with a blank line.
  const schema = await readFile('db/d1/migrations/0001_schema.sql', 'utf8');
  for (const statement of schema.split(/;\s*\n\s*\n/)) {
    if (statement.trim()) await db.prepare(statement).run();
  }
  const auth = await readFile('db/d1/migrations/0002_auth_storage.sql', 'utf8');
  // Separate only before CREATE, preserving trigger BEGIN/END blocks.
  for (const statement of auth.split(/;\s*(?=(?:--[^\n]*\n\s*)*CREATE\b)/)) {
    if (statement.trim()) await db.prepare(statement).run();
  }
  const views = await readFile('db/d1/migrations/0003_views.sql', 'utf8');
  for (const statement of views.split(/;\s*\n\s*\n/)) {
    if (statement.trim()) await db.prepare(statement).run();
  }
  const response = await runtime.dispatchFetch('https://test.example');
  const result = await response.text();
  assert.equal(response.status, 200, result);
  assert.deepEqual(JSON.parse(result), { crypto: true, session: true, logout: true, r2: true, purchase: true, qc: true, rollback: true });
  console.log('PASS workerd: auth, R2, operations, payments/finance, replay and atomic rollback');
} finally { await runtime.dispose(); }
