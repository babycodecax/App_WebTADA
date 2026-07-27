/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
      { source: '/blog', destination: '/blog.html' },
      { source: '/admin', destination: '/admin.html' },
    ];
  },
};

module.exports = nextConfig;
