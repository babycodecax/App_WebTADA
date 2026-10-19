import { NextRequest, NextResponse } from 'next/server';

/**
 * middleware.ts — redirect 308 www → non-www cho MỌI route (kể cả static/api).
 * next.config redirects `has: host` không có hiệu lực với alias www trên Vercel;
 * middleware chạy trước router nên bảo đảm áp dụng.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const url = new URL(req.url);
  if (host.startsWith('www.')) {
    url.hostname = 'ketoanthuetada.com';
    return NextResponse.redirect(url.toString(), 308);
  }
  // /library là URL phi-canonical của /thu-vien — 301 để sitemap/ng búsqued link cũ về 1 địa chỉ
  if (url.pathname === '/library') {
    return NextResponse.redirect(new URL('/thu-vien', url.origin).toString(), 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Bỏ _next internals; giữ mọi trang + api + static đã rewrite
    '/((?!_next/static|_next/image).*)',
  ],
};
