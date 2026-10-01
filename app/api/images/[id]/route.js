import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { requireSession } from '@/lib/cloudflare/session.mjs';

const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
const noStore = { 'Cache-Control': 'private, no-store' };
function failure(error) {
  if (!error.status) console.error('R2 image request failed', error);
  return Response.json({ error: error.status ? error.message : 'Không thể xử lý ảnh' }, { status: error.status || 500, headers: noStore });
}
export async function GET(request, context) {
  try {
    const { DB, IMAGES_BUCKET } = getCloudflareBindings();
    await requireSession(DB, request);
    const { id } = await context.params;
    if (!validId(id)) return new Response(null, { status: 404, headers: noStore });
    const row = await DB.prepare('SELECT object_key,content_type FROM image_objects WHERE id=?').bind(id).first();
    const object = row && await IMAGES_BUCKET.get(row.object_key);
    if (!object) return new Response(null, { status: 404, headers: noStore });
    return new Response(object.body, { headers: {
      ...noStore, 'Content-Type': row.content_type, 'Content-Length': String(object.size),
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
    } });
  } catch (error) { return failure(error); }
}
export async function DELETE(request, context) {
  try {
    const { DB, IMAGES_BUCKET } = getCloudflareBindings();
    await requireSession(DB, request, ['ADMIN']);
    const { id } = await context.params;
    if (!validId(id)) return new Response(null, { status: 404, headers: noStore });
    const row = await DB.prepare('SELECT object_key FROM image_objects WHERE id=?').bind(id).first();
    if (row) {
      await IMAGES_BUCKET.delete(row.object_key);
      await DB.prepare('DELETE FROM image_objects WHERE id=?').bind(id).run();
    }
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) { return failure(error); }
}
