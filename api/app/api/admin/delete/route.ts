import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';
import { invalidateComplianceCache } from '@/lib/compliance';
import { invalidateStructuredCache } from '@/lib/structured';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Escape ký tự wildcard của LIKE/ILIKE để tránh match sai khi xóa theo contains.
// PostgREST map: `%` → LIKE %, `_` → LIKE _ (không-thể-một-ký-tự).
function escapeLike(s: string): string {
  const bs = String.fromCharCode(92);
  return s.replace(/[%_]/g, (m) => bs + m);
}

/** Xóa toàn bộ answer_cache (đồng bộ cache chatbox). */
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

/** Xóa 1 bảng theo cột = trong danh sách paths. Best-effort (không throw). */
async function deleteByPaths(table: 'documents' | 'source_documents', paths: string[], label: string): Promise<void> {
  if (!paths.length) return;
  try {
    await getSupabase().from(table).delete().in('file_path', paths);
  } catch (e) {
    console.warn(`[admin-delete] xóa ${label} thất bại: ${e instanceof Error ? e.message : e}`);
  }
}

/** Xóa compliance_records theo source_file đã xác định (best-effort). */
async function deleteComplianceByPaths(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await getSupabase().from('compliance_records').delete().in('source_file', paths);
    invalidateComplianceCache();
  } catch (e) {
    console.warn(`[admin-delete] xóa compliance_records thất bại: ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * Thu thập các file_path khớp trên knowledge_chunks theo (cột, pattern, mode).
 * Dùng TRƯỚC khi xóa chunks để cascade dọn các bảng khác vẫn biết paths.
 */
async function collectMatchingPaths(table: 'knowledge_chunks', column: 'file_path' | 'title', value: string, mode: string): Promise<string[]> {
  try {
    let q = getSupabase().from(table).select('file_path');
    q = mode === 'exact'
      ? q.eq(column, value)
      : q.ilike(column, `%${escapeLike(value)}%`);
    const { data } = await q.limit(1000);
    return [...new Set((data || []).map((r: { file_path: string }) => r.file_path))];
  } catch (e) {
    console.warn(`[admin-delete] thu paths thất bại (${column}=${value}): ${e instanceof Error ? e.message : e}`);
    return [];
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
  const fp = file_path || source || '';
  if (!fp && !title) {
    return NextResponse.json({ error: 'Thiếu file_path hoặc title' }, { status: 400 });
  }

  // 1) Thu paths trước khi xóa (kể cả nhánh title) — để cascade đồng bộ các bảng
  let paths: string[] = [];
  let titleFallbackUsed = false; // fp không khớp file_path nhưng khớp title
  if (fp) {
    if (mode === 'exact') {
      paths = [fp];
    } else {
      paths = await collectMatchingPaths('knowledge_chunks', 'file_path', fp, mode);
      // Nếu contains không khớp knowledge_chunks nào nhưng có thể match title
      if (!paths.length) {
        paths = await collectMatchingPaths('knowledge_chunks', 'title', fp, mode);
        titleFallbackUsed = paths.length > 0;
      }
    }
  } else if (title) {
    paths = await collectMatchingPaths('knowledge_chunks', 'title', title, mode);
    titleFallbackUsed = paths.length > 0;
  }

  // 2) Xóa knowledge_chunks (bảng chat production đọc)
  // - Khi fallback title đã bật (fp không khớp file_path, khớp title): xóa
  //   theo paths vừa collect (đồng bộ với cascade) — tránh lệch 2 phía.
  // - Nếu không có title fallback: dùng pattern thường (eq/ilike theo cột).
  const useCollectedPaths = titleFallbackUsed && paths.length > 0;
  let query;
  if (useCollectedPaths) {
    query = getSupabase()
      .from('knowledge_chunks')
      .delete({ count: 'exact' })
      .in('file_path', paths);
  } else {
    query = getSupabase().from('knowledge_chunks').delete({ count: 'exact' });
    if (fp) {
      query = mode === 'exact'
        ? query.eq('file_path', fp)
        : query.ilike('file_path', `%${escapeLike(fp)}%`);
    } else if (title) {
      query = mode === 'exact'
        ? query.eq('title', title)
        : query.ilike('title', `%${escapeLike(title)}%`);
    }
  }
  const { error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 3) Cascade đồng bộ các bảng liên quan (best-effort — lỗi 1 bảng không chặn)
  await deleteComplianceByPaths(paths);
  await deleteByPaths('documents', paths, 'documents');
  await deleteByPaths('source_documents', paths, 'source_documents');
  invalidateStructuredCache(); // records số liệu có thể đổi theo tài liệu đã xóa

  await clearAnswerCache();

  return NextResponse.json({ ok: true, deleted: count ?? 0, paths });
}