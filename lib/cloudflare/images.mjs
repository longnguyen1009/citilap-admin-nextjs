export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export function imageType(bytes) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0,4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8,12)) === 'WEBP') return 'image/webp';
  return null;
}
export async function readImage(request) {
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Ảnh tối đa 5 MB'), { status: 413 });
  if (!request.body) throw Object.assign(new Error('Thiếu ảnh'), { status: 400 });
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw Object.assign(new Error('Ảnh tối đa 5 MB'), { status: 413 });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const contentType = imageType(bytes);
  if (!contentType || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== contentType) {
    throw Object.assign(new Error('Chỉ nhận ảnh PNG, JPEG hoặc WebP đúng định dạng'), { status: 415 });
  }
  return { bytes, contentType };
}
