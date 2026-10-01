import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { findSession, signIn, signOut } from '@/lib/cloudflare/session.mjs';

const headers = { 'Cache-Control': 'private, no-store' };
function failure(error) {
  const status = error.status || 500;
  if (status === 500) console.error('Session request failed', error);
  return Response.json({ error: status === 500 ? 'Không thể xử lý phiên đăng nhập' : error.message }, { status, headers });
}
export async function GET(request) {
  try { return Response.json({ user: await findSession(getCloudflareBindings().DB, request) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required' }, { status: 415, headers });
    const body = await request.text();
    if (body.length > 4096) return Response.json({ error: 'Request too large' }, { status: 413, headers });
    let credentials;
    try { credentials = JSON.parse(body); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers }); }
    const result = await signIn(getCloudflareBindings().DB, request, credentials);
    return Response.json({ user: result.user }, { headers: { ...headers, 'Set-Cookie': result.cookie } });
  } catch (error) { return failure(error); }
}
export async function DELETE(request) {
  try {
    const cookie = await signOut(getCloudflareBindings().DB, request);
    return Response.json({ ok: true }, { headers: { ...headers, 'Set-Cookie': cookie } });
  } catch (error) { return failure(error); }
}
