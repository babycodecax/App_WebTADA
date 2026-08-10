import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/**
 * GET /thu-vien — Thư viện Biểu mẫu & Văn bản Luật (public).
 *
 * Vấn đề (fix review 2026-08-10): rewrite trong vercel.json → static file
 * public/ KHÔNG hoạt động khi dùng Next.js (Next chiếm ưu routing, rewrite
 * tĩnh không serve được file trong public/). Route server này trả library.html
 * nguyên trạng — giống hệt mở /library.html trực tiếp.
 */
export async function GET(_req: NextRequest) {
  try {
    const filePath = path.join(PUBLIC_DIR, 'library.html');
    const html = await readFile(filePath, 'utf-8');
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}