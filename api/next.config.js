/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/static/:path*', destination: '/:path*' },
      { source: '/thu-vien', destination: '/library.html' },
    ];
  },
};

module.exports = nextConfig;
