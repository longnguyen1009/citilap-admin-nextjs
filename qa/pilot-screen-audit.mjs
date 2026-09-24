import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const { chromium } = createRequire(path.join(os.tmpdir(), 'citilap-browser-qa', 'package.json'))('playwright');
const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));
const origin=process.env.APP_URL || 'http://localhost:3000';
const output='test-results/screen-audit';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const results=[];
let errors=[];
page.on('pageerror',e=>errors.push(e.message));
const routes=['/','/inventory','/orders','/customers','/payments','/invoices','/warranty','/accessories','/qc','/repairs','/suppliers','/purchases','/supplier-payments','/shipments','/receiving','/supplier-returns','/costs','/reservations','/trade-ins','/commissions','/finance','/finance/accounts','/finance/cod','/finance/receivables','/finance/payables','/finance/transactions','/settings'];
const createButtons={ '/inventory':/thêm máy mới/i,'/orders':/tạo đơn hàng mới/i,'/customers':/thêm mới/i,'/payments':/ghi nhận thanh toán/i,'/warranty':/tiếp nhận bảo hành/i,'/accessories':/thêm phụ kiện/i,'/repairs':/tạo phiếu sửa/i,'/suppliers':/thêm nhà cung cấp/i,'/purchases':/tạo lô mua/i,'/shipments':/tạo shipment/i,'/supplier-returns':/tạo phiếu trả/i,'/reservations':/^tạo mới$/i,'/trade-ins':/^tạo mới$/i,'/commissions':/^tạo mới$/i,'/finance/accounts':/^tạo tài khoản$/i,'/finance/cod':/tạo COD từ đơn hàng/i };
async function measure(){return page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialogs:[...document.querySelectorAll('[role="dialog"],.modal-backdrop.active > *')].map(el=>{const r=el.getBoundingClientRect();return {className:el.className,left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};})}));}
try {
 await page.goto(`${origin}/login`,{waitUntil:'networkidle'});
 await page.locator('input[type=email]').fill(env.ADMIN_EMAIL);
 await page.locator('input[type=password]').fill(env.ADMIN_PASSWORD);
 await page.getByRole('button',{name:/đăng nhập/i}).click();
 await page.waitForURL(u=>u.pathname!=='/login');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:900});
  for(const route of routes){
   errors=[];
   const name=(route==='/'?'dashboard':route.slice(1).replaceAll('/','-'));
   try{
    await page.goto(`${origin}${route}`,{waitUntil:'networkidle',timeout:60000});
    await page.locator('.route-loading-overlay').waitFor({state:'detached',timeout:60000});
    const screen=await measure();
    await page.screenshot({path:`${output}/${name}-${width}.png`});
    const button=createButtons[route] && page.locator('.main-content').getByRole('button',{name:createButtons[route]}).first();
    let form=null;
    if(button && await button.isVisible()){
     await button.click();
     await page.waitForTimeout(200);
     form=await measure();
     await page.screenshot({path:`${output}/${name}-form-${width}.png`});
    }
    results.push({route,width,screen,form,errors:[...errors]});
    console.log(JSON.stringify(results.at(-1)));
   }catch(e){results.push({route,width,failure:e.message,errors:[...errors]});console.log(`FAILED ${route} ${width}: ${e.message}`);}
  }
 }
}finally{await writeFile(`${output}/report.json`,JSON.stringify(results,null,2));await browser.close();}
const failures=results.filter(r=>r.failure||r.errors.length||r.screen?.scrollWidth>r.width+1||r.form?.dialogs.some(d=>d.left<0||d.right>r.width+1||d.top<0));
console.log(JSON.stringify({screens:results.length,findings:failures},null,2));
