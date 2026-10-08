// Disposable browser harness: real page, route handlers and SQLite-backed service.
// Authentication alone is substituted; no account, password or remote DB is used.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const sql = new DatabaseSync(':memory:');
for (const file of readdirSync('db/d1/migrations').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`db/d1/migrations/${file}`, 'utf8'));
sql.exec(`PRAGMA foreign_keys=ON;
  INSERT INTO customers(id,name,phone,address) VALUES(99001,'Khách kiểm thử','0901234567','Địa chỉ kiểm thử');
  INSERT INTO laptops(id,name,serial,category,status,import_price_vnd,retail_price_vnd) VALUES
    (99001,'Lenovo LOQ 15 - máy đã bán','QA-OLD','loq','available',10,15),
    (99002,'Lenovo Legion 5 - máy nâng cấp','QA-NEW','legion_5_25_26','available',20,25);
  INSERT INTO orders(id,laptop_id,customer_id,customer_info,customer_address,sale_price,amount_paid,debt_amount,order_status,payment_status)
    VALUES(99001,99001,99001,'Khách kiểm thử - 0901234567','Địa chỉ kiểm thử',15,15,0,'done','paid');
  INSERT INTO cash_accounts(id,code,name,account_type,currency,opening_balance_at,created_by)
    VALUES('qa-cash','QA-CASH','Quỹ tiền kiểm thử','CASH','VND','2020-01-01','QA');`);
globalThis.tradeInPreviewDB = {
  prepare(query) {
    const statement = args => ({ query, args,
      first: async () => sql.prepare(query).get(...args),
      all: async () => ({ results: sql.prepare(query).all(...args) }),
    });
    return { ...statement([]), bind: (...args) => statement(args) };
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try { const results = statements.map(({ query, args }) => ({ results: sql.prepare(query).all(...args) })); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const temp = mkdtempSync(join(tmpdir(), 'citilap-trade-preview-'));
const apiBundle = await build({ entryPoints: ['app/api/trade-ins/route.js'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'test-session', setup(build) {
    build.onResolve({ filter: /^(next\/server|@\/lib\/cloudflare\/route-helpers.mjs)$/ }, args => ({ path: args.path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'next/server'
      ? 'export const NextResponse=Response;'
      : 'export async function routeContext(request){return {DB:globalThis.tradeInPreviewDB,profile:{role:request.headers.get("x-test-role")||"ADMIN",name:"Browser QA"}};}' }));
  } }],
});
const apiPath = join(temp, 'route.mjs'); writeFileSync(apiPath, apiBundle.outputFiles[0].text);
const route = await import(pathToFileURL(apiPath));
const ui = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {Toaster} from 'react-hot-toast';import TradeIns from './components/pages/TradeIns.jsx';createRoot(document.getElementById('root')).render(<><TradeIns/><Toaster/></>);`, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'test-provider', setup(build) {
    build.onResolve({ filter: /^(next\/navigation|@\/context\/AuthContext|@\/lib\/apiFetchers)$/ }, args => ({ path: args.path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'next/navigation'
      ? 'export const useSearchParams=()=>new URLSearchParams(window.location.search);'
      : args.path.includes('AuthContext') ? 'export const useAuth=()=>({user:{role:new URLSearchParams(window.location.search).get("role")||"ADMIN",name:"Browser QA"}});'
        : 'export async function getAuthHeaders(){return {"x-test-role":new URLSearchParams(window.location.search).get("role")||"ADMIN"};}' }));
  } }],
});
const cssDir = '.next/static/chunks';
const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/trade-ins')) {
      const parts = []; for await (const part of req) parts.push(part);
      const request = new Request(`http://127.0.0.1:3187${req.url}`, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Buffer.concat(parts).toString() } : {}) });
      const result = await route[req.method](request);
      res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
    } else if (req.url === '/preview.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(ui.outputFiles[0].text); }
    else if (req.url === '/preview.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(readdirSync(cssDir).filter(f => f.endsWith('.css')).map(f => readFileSync(join(cssDir, f), 'utf8')).join('\n')); }
    else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA · Thu cũ đổi mới</title><link rel="stylesheet" href="/preview.css"><body class="taste-workspace"><div role="note" style="padding:8px;background:#fff3c4">KIỂM THỬ CỤC BỘ · Dữ liệu giả lập, không tác động kho hoặc tiền thật</div><div id="root"></div><script src="/preview.js"></script></body></html>'); }
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
server.listen(3187, '127.0.0.1', () => console.log('Browser fixture: http://127.0.0.1:3187 (in-memory data; actual TradeIns component and route)'));
const close = () => {
  server.close(); sql.close();
  const target = resolve(temp);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('citilap-trade-preview-')) throw new Error('Unexpected preview cleanup directory');
  rmSync(target, { recursive: true, force: true }); process.exit(0);
};
process.on('SIGINT', close); process.on('SIGTERM', close);
