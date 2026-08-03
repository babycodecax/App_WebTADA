import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';
import { invalidateComplianceCache } from '@/lib/compliance';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Escape ký tự wildcard của LIKE/ILIKE để tránh match sai khi xóa theo contains.
// PostgREST map: `%` → LIKE %, `_` → LIKE _ (không-thể-một-ký-tự).
function escapeLike(s: string): string {
  const bs = String.fromCharCode(92);
  return s.replace(/[%_]/g, (m) => bs + m);
}

/** Xóa toàn bộ answer_cache sau khi xóa chunks (đồng bộ cache chatbox). */
async function clearAnswerCache(): Promise<void> {
  try {
    await getSupabase()
      .from('answer_cache')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    // Cache không xóa được không chặn delete (best-effort)
  }
}

/** Xóa compliance_records theo danh sách source_file đã xác định (best-effort). */
async function deleteComplianceByPaths(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await getSupabase().from('compliance_records').delete().in('source_file', paths);
    invalidateComplianceCache();
  } catch (e) {
    // Không chặn delete vì lỗi xóa compliance (best-effort)
    console.warn(`[admin-delete] xóa compliance_records thất bại: ${e instanceof Error ? e.message : e}`);
  }
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Thiếu tham số' }, { status: 400 });
  }
  const { file_path, source, title, mode = 'contains' } = body;
  if (!file_path && !source && !title) {
    return NextResponse.json({ error: 'Thiếu file_path hoặc title' }, { status: 400 });
  }

  // Khi delete theo title (không có file_path/source), phải capture các
  // file_path khớp TRƯỚC khi xóa chunks — vì sau khi xóa thì không còn
  // chunks nào để truy vấn file_path (fix: select trước delete, tôn trọng mode).
  const titleMatchedPaths: string[] = [];
  if (!file_path && !source && title) {
    try {
      let q = getSupabase().from('knowledge_chunks').select('file_path');
      q = mode === 'exact'
        ? q.eq('title', title)
        : q.ilike('title', `%${escapeLike(title)}%`);
      const { data } = await q.limit(1000);
      titleMatchedPaths.push(...new Set((data || []).map((r: { file_path: string }) => r.file_path)));
    } catch {
      // Nếu truy vấn paths thất bại, vẫn tiếp tục xóa chunks (title vẫn được xóa)
    }
  }

  // Xóa trên knowledge_chunks (bảng chat production đọc)
  let query = getSupabase().from('knowledge_chunks').delete({ count: 'exact' });
  if (file_path || source) {
    const fp = file_path || source;
    query = mode === 'exact'
      ? query.eq('file_path', fp)
      : query.ilike('file_path', `%${escapeLike(fp)}%`);
  } else if (title) {
    query = mode === 'exact'
      ? query.eq('title', title)
      : query.ilike('title', `%${escapeLike(title)}%`);
  }

  const { error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Đồng bộ xóa compliance_records — tài liệu đã bị xóa thì records số liệu
  // cũ không được để chatbox trích nữa (best-effort).
  if (file_path || source) {
    const fp = file_path || source;
    // Dùng chính pattern đã xóa chunks (khớp mode) để xóa compliance
    if (mode === 'exact') {
      await deleteComplianceByPaths([fp]);
    } else {
      const { data: matched } = await getSupabase()
        .from('compliance_records')
        .select('source_file')
        .ilike('source_file', `%${escapeLike(fp)}%`)
        .limit(500);
      await deleteComplianceByPaths((matched || []).map((r: { source_file: string }) => r.source_file));
    }
  } else if (titleMatchedPaths.length) {
    await deleteComplianceByPaths(titleMatchedPaths);
  }

  await clearAnswerCache();

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}