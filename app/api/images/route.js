import { getCloudflareBindings } from '@/lib/cloudflare/bindings';
import { requireSession } from '@/lib/cloudflare/session.mjs';
import { readImage } from '@/lib/cloudflare/images.mjs';

export async function POST(request) {
  try {
    const { DB, IMAGES_BUCKET } = getCloudflareBindings();
    const user = await requireSession(DB, request, ['ADMIN', 'SALES', 'TECH', 'TECHNICAL']);
    const { bytes, contentType } = await readImage(request);
    const id = crypto.randomUUID();
    const objectKey = `images/${id}`;
    await IMAGES_BUCKET.put(objectKey, bytes, { httpMetadata: { contentType } });
    try {
      await DB.prepare('INSERT INTO image_objects(id,object_key,content_type,byte_size,uploaded_by) VALUES (?,?,?,?,?)')
        .bind(id, objectKey, contentType, bytes.length, user.id).run();
    } catch (error) {
      await IMAGES_BUCKET.delete(objectKey);
      throw error;
    }
    return Response.json({ id, url: `/api/images/${id}`, contentType, size: bytes.length }, {
      status: 201, headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (!error.status) console.error('R2 upload failed', error);
    return Response.json({ error: error.status ? error.message : 'Không thể lưu ảnh' }, { status: error.status || 500 });
  }
}
