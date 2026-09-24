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

let requests=0;
try {
 await page.goto(origin+'/login',{waitUntil:'networkidle'});
 await page.locator('input[type=email]').fill(env.ADMIN_EMAIL);
 await page.locator('input[type=password]').fill(env.ADMIN_PASSWORD);
 await page.locator('button[type=submit]').click();
 await page.waitForURL(u=>u.pathname!=='/login');
 await page.goto(origin+'/trade-ins',{waitUntil:'networkidle'});
 await page.locator('.route-loading-overlay').waitFor({state:'detached'});
 await page.route('**/api/sales-operations',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  requests++;
  await new Promise(resolve=>setTimeout(resolve,700));
  await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Simulated save failure'})});
 });
 await page.getByRole('button',{name:'T\u1ea1o m\u1edbi',exact:true}).click();
 await page.locator('[name=brand]').fill('QA');
 await page.locator('[name=model]').fill('Feedback check');
 await page.locator('.salesops-dialog').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
 await page.locator('.salesops-dialog footer button').last().waitFor();
 if(!await page.locator('.salesops-dialog footer button').last().isDisabled())throw Error('Submit not locked');
 await page.locator('.salesops-dialog [role=alert]').waitFor();
 if(requests!==1)throw Error('Duplicate requests: '+requests);
 if(!await page.locator('[name=model]').inputValue())throw Error('Draft lost');
 if(!await page.locator('.salesops-dialog footer button').last().isEnabled())throw Error('Retry locked');
 console.log('PASS: duplicate submit blocked, loading visible, inline API error, draft retained, retry enabled (5 checks; POST mocked, no DB writes).');
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+'/warranty',{waitUntil:'networkidle'});
 await page.locator('.route-loading-overlay').waitFor({state:'detached'});
 await page.getByRole('button',{name:/ti\u1ebfp nh\u1eadn b\u1ea3o h\u00e0nh/i}).click();
 const clipped=await page.locator('.warranty-form-grid').evaluate(el=>[...el.querySelectorAll('input,select,textarea')].filter(x=>{const r=x.getBoundingClientRect();return r.left<0||r.right>innerWidth;}).length);
 if(clipped)throw Error('Warranty clipped controls: '+clipped);
 console.log('PASS: warranty mobile controls fit viewport.');
}finally{await browser.close();}
