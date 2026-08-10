import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
// force-dynamic — trả blog.html tĩnh nhưng không prerender (blog.js render nội
// dung theo slug từ path trên client; file html KHÔNG chứa nội dung bài cụ thể)
export const dynamic = 'force-dynamic';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/**
 * GET /blog/:slug — blog detail URL clean path (SEO).
 *
 * Vấn đề trước (fix review 2026-08-10): Next.js App Router chiếm 404 page —
 * rewrite /blog/:slug → blog.html trong vercel.json/next.config.js KHÔNG hoạt
 * động (Next rewrites chỉ áp dụng route handler, không phải static file trong
 * public/). Geese: tạo dynamic route server trả đúng file blog.html — giống
 * hệt browser mở /blog (blog.js đọc slug từ pathname rồi fetch bài tương ứng).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const filePath = path.join(PUBLIC_DIR, 'blog.html');
    const html = await readFile(filePath, 'utf-8');

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}