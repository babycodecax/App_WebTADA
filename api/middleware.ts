import { NextRequest, NextResponse } from 'next/server';

/**
 * middleware.ts — redirect 308 www → non-www cho MỌI route (kể cả static/api).
 * next.config redirects `has: host` không có hiệu lực với alias www trên Vercel;
 * middleware chạy trước router nên bảo đảm áp dụng.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  if (host.startsWith('www.')) {
    const url = new URL(req.url);
    url.hostname = 'ketoanthuetada.com';
    return NextResponse.redirect(url.toString(), 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Bỏ _next internals; giữ mọi trang + api + static đã rewrite
    '/((?!_next/static|_next/image).*)',
  ],
};
