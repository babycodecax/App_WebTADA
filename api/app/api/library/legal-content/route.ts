import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { fetchLegalContent } from '@/lib/libraryData';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/library/legal-content?file_path=...
 * Nội dung toàn văn 1 văn bản luật cho public viewer (Thư viện trên trang chủ).
 *
 * - KHÔNG cần auth — bất kỳ ai cũng xem được văn bản luật (vault/legal là tri thức công khai).
 * - Dữ liệu ghép từ knowledge_chunks (không đọc file gốc — Vercel không có vault/).
 * - Giống hệt /api/admin/sources/content nhưng bỏ check admin.
 *
 * Response: { file_path, title, content, chunk_count } — content là markdown
 * (giữ nguyên bảng | cột |, heading, danh sách) để frontend render bằng marked.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const filePath = (url.searchParams.get('file_path') || '').trim();
  if (!filePath) {
    return NextResponse.json({ error: 'Thiếu file_path' }, { status: 400 });
  }

  const result = await fetchLegalContent(getSupabase(), filePath);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    file_path: result.file_path,
    title: result.title,
    content: result.content,
    chunk_count: result.chunk_count,
  });
}
