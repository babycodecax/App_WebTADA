import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { fetchLegalDocContent } from '@/lib/legalDocIngest';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/library/legal-docs?id=...
 * Toàn văn 1 văn bản luật từ bảng landing_legal_docs (public, không cần auth).
 *
 * - Trả file_html NGUYÊN BẢN (mammoth convertToHtml — bảng biểu đầy đủ như Word).
 * - KHÔNG dùng chung với /api/library/legal-content (chunks markdown) — endpoint
 *   này đọc bảng mới landing_legal_docs (parse .docx khi admin upload / bulk import).
 *
 * Response: { title, file_html }
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
  }

  const result = await fetchLegalDocContent(getSupabase(), id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    title: result.title,
    file_html: result.file_html,
  });
}
