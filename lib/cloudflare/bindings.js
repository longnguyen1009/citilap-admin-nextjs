import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export function getCloudflareBindings() {
  // Bindings belong to the current request; never cache them globally.
  const { env } = getCloudflareContext();
  if (!env.DB || !env.IMAGES_BUCKET) throw new Error('Cloudflare DB/R2 bindings are not configured');
  return env;
}
