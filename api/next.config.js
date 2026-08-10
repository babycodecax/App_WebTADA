/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // CHỈ giữ rewrite /static → public (ảnh/font/static assets).
  // KHÔNG đặt rewrite cho /thu-vien, /blog/:slug ở đây: Next.js rewrites
  // không serve được static file trong public/ và khi có rewrites, Vercel
  // ƯU TIÊN next.config rewrites và bỏ qua vercel.json rewrites → các
  // clean-URL đó bị 404. Chúng đã có route server riêng:
  //   - /blog/:slug  → app/blog/[slug]/route.ts (trả blog.html)
  //   - /thu-vien    → app/thu-vien/route.ts (trả library.html)
  async rewrites() {
    return [
      // Ảnh/font trong HTML dùng 'static/img/...' → map vào public/img/...
      { source: '/static/:path*', destination: '/:path*' },
    ];
  },
};

module.exports = nextConfig;