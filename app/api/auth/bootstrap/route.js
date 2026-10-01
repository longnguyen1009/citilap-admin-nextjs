import { createHash, timingSafeEqual } from 'node:crypto';
import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { assertSameOrigin } from '@/lib/cloudflare/session.mjs';
import { createFirstAdmin } from '@/lib/cloudflare/users.mjs';

const noStore = { 'Cache-Control': 'private, no-store' };
const digest = value => createHash('sha256').update(value).digest();

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const env = getCloudflareBindings();
    if (typeof env.BOOTSTRAP_TOKEN !== 'string' || env.BOOTSTRAP_TOKEN.length < 24) {
      return Response.json({ error: 'Bootstrap is not configured' }, { status: 404, headers: noStore });
    }
    const body = await request.json();
    const supplied = typeof body.token === 'string' ? body.token : '';
    if (!timingSafeEqual(digest(supplied), digest(env.BOOTSTRAP_TOKEN))) {
      return Response.json({ error: 'Bootstrap token is invalid' }, { status: 403, headers: noStore });
    }
    const user = await createFirstAdmin(env.DB, { email: body.email, name: body.name, password: body.password });
    return Response.json({ user }, { status: 201, headers: noStore });
  } catch (error) {
    const status = error.status || (String(error.message).includes('already exists') ? 409 : 400);
    return Response.json({ error: error.message || 'Không thể tạo ADMIN đầu tiên' }, { status, headers: noStore });
  }
}
