import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle } from '@/lib/adminAuth';
import { deleteSourceCascade } from '@/lib/deleteCascade';
import { deleteLegalDoc, LEGAL_DOCS_PUBLIC_FIELDS } from '@/lib/legalDocIngest';
import { invalidateKnowledgeCache } from '@/lib/knowledgeCache';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/admin/sources — danh sách nguồn tri thức.
 *
 * NGUỒN DỮ LIỆU: bảng landing_legal_docs (các văn bản .docx đã parse toàn văn
 * giữ bảng biểu như Thư viện /library) — theo yêu cầu: admin quản lý đúng
 * "nguồn .docx của thư viện", không còn liệt kê note .md tóm tắt.
 * (Kiến thức chatbox .md cũ vẫn giữ nguyên trong chunks — KHÔNG đụng tới.)
 *
 * Bộ lọc: ?origin=vault|upload (chỉ phân nhóm hiển thị), ?status=, ?q=<từ khoá title>
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminGoogle(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const origin = url.searchParams.get('origin') || '';
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    let query = getSupabase()
      .from('landing_legal_docs')
      .select(LEGAL_DOCS_PUBLIC_FIELDS)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (origin === 'upload') {
      // Chưa có khái niệm upload trong thư viện — trả rỗng cho lọc "Upload"
      return NextResponse.json({ sources: [], total: 0 });
    }

    const { data: rows, error } = await query.limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Filter theo q (title chứa từ khoá)
    let filtered = (rows || []) as Record<string, unknown>[];
    if (q) {
      filtered = filtered.filter(
        (r) => (String(r.title || '')).toLowerCase().includes(q) ||
               (String(r.doc_number || '')).toLowerCase().includes(q)
      );
    }

    // Map sang shape frontend admin-sources đang dùng:
    // { id, title, doc_type, effective_date, status, source_origin, file_path,
    //   storage_path, file_name, compliance_count }
    const sources = filtered.map((r) => {
      const fileName = String(r.file_name || '');
      return {
        id: String(r.id || ''),
        title: String(r.title || fileName),
        doc_type: String(r.doc_type || 'other'),
        effective_date: '',
        status: 'ready',
        source_origin: 'vault',
        file_path: fileName,
        storage_path: fileName ? 'vault/' + fileName : '',
        file_name: fileName,
        compliance_count: 0,
        created_at: String(r.created_at || ''),
      };
    });
    return NextResponse.json({ sources, total: sources.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lấy danh sách nguồn: ${msg}` }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/sources?file_path=... (file_path = file_name .docx thư viện)
 * Xóa nguồn + ĐỒNG BỘ 2 CHIỀU:
 *   - Xóa row landing_legal_docs (thư viện public /library mất văn bản ngay).
 *   - Xóa chunks chatbox liên quan (file_path khớp basename — nếu văn bản từng
 *     được upload .docx vào chatbox) — kiến thức chatbox tự đồng bộ theo.
 *   - KHÔNG đụng note .md cũ (kiến thức chatbox hiện tại giữ nguyên).
 *   - KHÔNG xóa file .docx gốc trong Storage (siêu liệu gốc, giữ an toàn).
 */
export async function DELETE(req: NextRequest) {
  if (!(await isAdminGoogle(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const url = new URL(req.url);
  const filePath = (url.searchParams.get('file_path') || '').trim();
  const mode = url.searchParams.get('mode') || 'exact';
  if (!filePath) {
    return NextResponse.json({ error: 'Thiếu file_path' }, { status: 400 });
  }

  try {
    const sb = getSupabase();
    // file_path = file_name của thư viện (vd '109_2025_QH15_665870.docx')
    const fileName = filePath.split('/').pop() || filePath;

    // 1. Xóa khỏi landing_legal_docs (thư viện public)
    await deleteLegalDoc(sb, fileName);

    // 2. Xóa chunks chatbox liên quan (file_path chứa basename — vd upload .docx,
    //    hoặc chunk kèm .docx) — best-effort, an toàn (no-op nếu không có)
    if (mode !== 'exact') {
      // mode contains → xóa mọi chunks có file_path chứa fileName
      const { error: likeErr } = await sb
        .from('knowledge_chunks')
        .delete()
        .ilike('file_path', `%${fileName}%`);
      if (likeErr) console.warn(`[sources] xóa chunks (contains) bỏ qua: ${likeErr.message}`);
    } else {
      const stem = fileName.replace(/\.docx$/i, '');
      const { error: delErr } = await sb
        .from('knowledge_chunks')
        .delete()
        .or(`file_path.eq.${fileName},file_path.ilike.%${stem}%`);
      if (delErr) console.warn(`[sources] xóa chunks bỏ qua: ${delErr.message}`);
    }

    // 3. Không đụng .md vault (chatbox giữ nguyên) — không xóa file storage gốc.
    // Vừa xóa chunks → knowledge cache phải hết hạn để chat không trích nguồn đã xóa
    invalidateKnowledgeCache();

    return NextResponse.json({ ok: true, status: 'removed' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi xóa nguồn: ${msg}` }, { status: 500 });
  }
}