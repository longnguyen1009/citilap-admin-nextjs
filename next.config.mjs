import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

if (process.env.CLOUDFLARE_LOCAL === 'true') {
  await initOpenNextCloudflareForDev();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
};

export default nextConfig;
