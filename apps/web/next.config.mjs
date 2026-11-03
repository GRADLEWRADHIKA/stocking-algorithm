/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: { externalDir: true },
  poweredByHeader: false,
};
export default nextConfig;
