import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const dtoUrl = moduleUrl(await readFile('lib/responseVisibility.js','utf8'));
const auth = await import(moduleUrl((await readFile('lib/apiAuth.js','utf8')).replace(/^import .*supabaseAdmin.*;\r?\n/m,'').replace("'./responseVisibility'", JSON.stringify(dtoUrl))));
const audit = await import(moduleUrl(await readFile('lib/auditVisibility.js','utf8')));
const NextResponse = { json: (body, options) => Response.json(body,options) };
async function route(file, dependencies) {
  const source = (await readFile(file,'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/export async function/g,'async function');
  return new Function(...Object.keys(dependencies), `${source}\nreturn { GET: typeof GET === 'function' ? GET : null, POST: typeof POST === 'function' ? POST : null };`)(...Object.values(dependencies));
}
function query(result) {
  const target = { then: (resolve,reject) => Promise.resolve(result).then(resolve,reject) };
  for (const method of ['select','eq','in','not','neq','order','gt','is','maybeSingle','single']) target[method] = () => target;
  return target;
}
const request = payload => new Request('http://local/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
let passed=0;
for (const role of ['ADMIN','SALES','TECH','TECHNICAL','STAFF']) {
  let saves=0;
  const profile={role,name:'QA'};
  const handler=await route('app/api/inventory/route.js',{
    ...auth,NextResponse,requireUser:async()=>({ok:true,profile}),
    getSupabaseAdminClient:()=>({from:()=>query({data:null,error:null})}),
    saveLaptopToCloud:async()=>{saves++;},
  });
  for (const payload of [{},{id:0},{id:-1},{id:'abc'},{id:999}]) {
    const response=await handler.POST(request(payload));
    assert.equal(response.status,payload.id===999?404:400); passed++;
  }
  const createResponse = await handler.POST(new Request('http://local/api/inventory?mode=create', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:'QA laptop' })
  }));
  assert.equal(createResponse.status, role === 'ADMIN' ? 400 : 403);
  passed++;
  assert.equal(saves,0);
  const financial={id:1,purchasePriceRmb:5000,importPriceVnd:20,costSnapshotVnd:20000000,profitVnd:10,serial:'QA'};
  const allocation=await route('app/api/order-allocation/route.js',{
    ...auth,NextResponse,
    requireUser:async(_request,allowed)=>allowed.includes(role)?{ok:true,profile}:{ok:false,response:Response.json({error:'Forbidden'},{status:403})},
    getSupabaseAdminClient:()=>({rpc:async()=>({data:{order_id:1,laptop_id:1},error:null}),from:table=>query({data:table==='orders'?[financial]:[financial],error:null})}),
  });
  const response=await allocation.POST(request({orderId:1,laptopId:1,expectedOwner:null}));
  if (['ADMIN','SALES'].includes(role)) {
    assert.equal(response.status,200);
    const result=await response.json();
    if(role==='SALES') {
      for(const rows of [result.orders,result.laptops]) for(const row of rows) for(const key of ['purchasePriceRmb','importPriceVnd','costSnapshotVnd','profitVnd']) assert.equal(Object.hasOwn(row,key),false);
    } else assert.equal(result.laptops[0].purchasePriceRmb,5000);
  } else assert.equal(response.status,403);
  passed++;
  const logs=await route('app/api/activity-logs/route.js',{
    ...auth,...audit,NextResponse,requireUser:async()=>({ok:true,profile}),
    getSupabaseAdminClient:()=>({from:()=>query({data:[{changes:{purchase_price_rmb:{old:1,new:2},serial:{old:'A',new:'B'}}}],error:null})}),
  });
  const logResponse=await logs.GET(new Request('http://local/api/activity-logs?entityType=LAPTOP&entityId=1'));
  assert.equal(logResponse.status,200);
  const [log]=await logResponse.json();
  assert.equal(Object.hasOwn(log.changes,'purchase_price_rmb'),role==='ADMIN'); passed++;
}
for (const [role, payload, expected] of [
  ['SALES', { laptopId: 1, type: 'NHẬP KHO' }, 403],
  ['TECH', { laptopId: 1, type: 'SỰ KIỆN GIẢ' }, 400],
  ['TECH', { laptopId: 1, warrantyCaseId: 8, orderId: 2, type: 'BẢO HÀNH: checking' }, 400],
]) {
  let saves = 0;
  const handler = await route('app/api/stock-movements/route.js', {
    ...auth, NextResponse,
    requireUser: async () => ({ ok:true, profile:{ role, name:'QA' } }),
    getSupabaseAdminClient: () => ({ from:() => query({ data:{ laptop_id:9, order_id:2 }, error:null }) }),
    saveStockMovementToCloud: async () => { saves++; return { id:1 }; },
    fetchStockMovementsFromCloud: async () => [],
    logActivity: async () => {}, pickAuditFields: value => value,
  });
  const response = await handler.POST(request(payload));
  assert.equal(response.status, expected);
  assert.equal(saves, 0);
  passed++;
}
console.log(`PASS route regression ${passed}/${passed}: five roles, missing/invalid/unknown ID, no writes, allocation and audit redaction (DB mocked)`);
