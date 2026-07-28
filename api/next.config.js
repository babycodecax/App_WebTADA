/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/static/:path*', destination: '/:path*' },
    ];
  },
};

module.exports = nextConfig;
