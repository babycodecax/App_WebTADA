import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';
import { deleteSourceCascade } from '@/lib/deleteCascade';
import { deleteLegalDoc } from '@/lib/legalDocIngest';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SOURCE_FIELDS = 'file_path,title,doc_type,effective_date,status,source_origin,updated_at,storage_path';

/**
 * GET /api/admin/sources — danh sách toàn bộ nguồn từ source_documents
 * (cả vault lẫn upload), kèm số compliance_records đã extract.
 *
 * Bộ lọc: ?origin=vault|upload, ?status=, ?q=<từ khoá title/file_path>
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const origin = url.searchParams.get('origin') || '';
    const status = url.searchParams.get('status') || '';
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    let query = getSupabase().from('source_documents').select(SOURCE_FIELDS).order('updated_at', { ascending: false });
    if (origin === 'vault' || origin === 'upload') query = query.eq('source_origin', origin);
    if (status) query = query.eq('status', status);

    const { data: rows, error } = await query.limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Filter theo q (title/file_path chứa từ khoá)
    let filtered = (rows || []) as Record<string, string>[];
    if (q) {
      filtered = filtered.filter(
        (r) => (r.title || '').toLowerCase().includes(q) || (r.file_path || '').toLowerCase().includes(q)
      );
    }
    // Ẩn nguồn tóm tắt (không phải văn bản toàn văn) — giữ nguyên chunks trong DB
    // để chatbox vẫn dùng được kiến thức. Thêm file_path vào set nếu cần ẩn thêm.
    const HIDDEN_SOURCES = new Set(['luat-thue-tncn-2025.md']);
    filtered = filtered.filter((r) => !HIDDEN_SOURCES.has(r.file_path));

    // Count compliance_records theo source_file (1 query)
    const filePaths = filtered.map((r) => r.file_path);
    const counts: Record<string, number> = {};
    if (filePaths.length) {
      const { data: compRows } = await getSupabase()
        .from('compliance_records')
        .select('source_file,id')
        .in('source_file', filePaths);
      for (const c of compRows || []) {
        counts[c.source_file as string] = (counts[c.source_file as string] || 0) + 1;
      }
    }

    const sources = filtered.map((r) => ({ ...r, compliance_count: counts[r.file_path] || 0 }));
    return NextResponse.json({ sources, total: sources.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lấy danh sách nguồn: ${msg}` }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/sources?file_path=...&mode=exact
 * Xóa nguồn (vault → soft-delete status='deleted'; upload → hard-delete).
 * Dọn toàn bộ kiến thức liên quan trong Supabase.
 */
export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const url = new URL(req.url);
  const filePath = (url.searchParams.get('file_path') || '').trim();
  const mode = url.searchParams.get('mode') || 'exact';
  if (!filePath) {
    return NextResponse.json({ error: 'Thiếu file_path' }, { status: 400 });
  }

  try {
    // Xác định loại nguồn (vault → soft-delete, upload → hard-delete)
    const { data: src } = await getSupabase()
      .from('source_documents')
      .select('source_origin,status')
      .eq('file_path', filePath)
      .limit(1);
    const origin = src?.[0]?.source_origin || 'vault';
    const softDelete = origin !== 'upload'; // vault soft-delete, upload hard-delete

    // paths: exact → [filePath]; contains → collect từ source_documents
    let paths = [filePath];
    if (mode !== 'exact') {
      const { data: matched } = await getSupabase()
        .from('source_documents')
        .select('file_path')
        .ilike('file_path', `%${filePath}%`);
      paths = (matched || []).map((r: { file_path: string }) => r.file_path);
      if (!paths.length) paths = [filePath];
    }

    const result = await deleteSourceCascade(paths, { softDelete });
    // Đồng bộ Thư viện: nếu nguồn xóa có file .docx gốc trong landing_legal_docs
    // thì xóa luôn (best-effort — lỗi không chặn xóa nguồn chính).
    for (const p of paths) {
      const fileName = p.split('/').pop() || '';
      if (fileName.toLowerCase().endsWith('.docx')) await deleteLegalDoc(getSupabase(), fileName);
    }
    return NextResponse.json({ ok: true, ...result, status: softDelete ? 'deleted' : 'removed' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi xóa nguồn: ${msg}` }, { status: 500 });
  }
}