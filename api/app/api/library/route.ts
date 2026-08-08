import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { fetchLibrary } from '@/lib/libraryData';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * force-dynamic — chống static prerender (như /api/services): nếu để GET tĩnh,
 * admin vừa upload biểu mẫu/văn bản luật sẽ KHÔNG xuất hiện tới khi deploy lại.
 */
export const dynamic = 'force-dynamic';

/**
 * GET /api/library — Thư viện Biểu mẫu & Văn bản Luật (public, không cần auth).
 *
 * Response: { "forms": [...], "legal_documents": [...], "legal_docs": [...] }
 *   - forms:           biểu mẫu admin thêm thủ công (bảng landing_forms, is_active=true)
 *   - legal_documents: văn bản luật đọc từ kho nguồn source_documents hiện có
 *                      (source_origin='vault', status='ready', doc_type ∈
 *                      luat/nd/tt/nq/vbhn). title được sinh tiếng Việt đầy đủ
 *                      từ nội dung (frontmatter source/heading) — không còn tên file thô.
 *   - legal_docs:      văn bản luật toàn văn HTML (bảng landing_legal_docs —
 *                      parse .docx bằng mammoth, giữ bảng biểu). Trang /thu-vien
 *                      hiển thị tab "Văn bản luật" từ danh sách này trước.
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
      {
        forms: result.forms,
        legal_documents: result.legal_documents,
        legal_docs: result.legal_docs,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lấy thư viện: ${msg}` }, { status: 500 });
  }
}
