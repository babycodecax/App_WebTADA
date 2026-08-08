import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { fetchLibrary } from '@/lib/libraryData';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/library — Thư viện Biểu mẫu & Văn bản Luật (public, không cần auth).
 *
 * Response: { "forms": [...], "legal_documents": [...] }
 *   - forms:          biểu mẫu admin thêm thủ công (bảng landing_forms, is_active=true)
 *   - legal_documents: văn bản luật đọc từ kho nguồn source_documents hiện có
 *                      (source_origin='vault', status='ready', doc_type ∈
 *                      luat/nd/tt/nq/vbhn) — KHÔNG tạo bảng mới cho luật.
 *
 * Không cache dài — mỗi lần mở trang chủ là lấy dữ liệu mới nhất.
 */
export async function GET(_req: NextRequest) {
  try {
    const result = await fetchLibrary(getSupabase());
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json(
      { forms: result.forms, legal_documents: result.legal_documents },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lấy thư viện: ${msg}` }, { status: 500 });
  }
}
