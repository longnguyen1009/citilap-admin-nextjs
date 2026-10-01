import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { requireSession } from '@/lib/cloudflare/session.mjs';
import { createUser, listUsers, updateUser } from '@/lib/cloudflare/users.mjs';

const noStore = { 'Cache-Control': 'private, no-store' };

function failure(error) {
  const status = error.status || 500;
  if (status === 500) console.error('D1 user request failed', error);
  return Response.json({ error: status === 500 ? 'Không thể xử lý tài khoản' : error.message }, { status, headers: noStore });
}

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings();
    await requireSession(DB, request, ['ADMIN']);
    return Response.json(await listUsers(DB), { headers: noStore });
  } catch (error) { return failure(error); }
}

export async function POST(request) {
  try {
    const { DB } = getCloudflareBindings();
    await requireSession(DB, request, ['ADMIN']);
    return Response.json(await createUser(DB, await request.json()), { status: 201, headers: noStore });
  } catch (error) { return failure(error); }
}

export async function PUT(request) {
  try {
    const { DB } = getCloudflareBindings();
    const actor = await requireSession(DB, request, ['ADMIN']);
    return Response.json({ success: true, profile: await updateUser(DB, await request.json(), actor.id) }, { headers: noStore });
  } catch (error) { return failure(error); }
}
