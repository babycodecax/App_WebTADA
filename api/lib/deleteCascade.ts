/**
 * deleteCascade.ts — Cascade xóa kiến thức của tài liệu/nguồn khỏi toàn bộ bảng.
 *
 * Dùng chung cho:
 *   - /api/admin/delete (xóa tài liệu upload — hard delete như cũ)
 *   - /api/admin/sources (xóa nguồn — vault soft-delete, upload hard-delete)
 *
 * Dọn đồng bộ 5 nguồn để chatbox không còn trích từ tài liệu đã xóa:
 *   knowledge_chunks + compliance_records + documents + source_documents
 *   + answer_cache (toàn bộ) + invalidate structured/compliance cache.
 *
 * softDelete=true: giữ row source_documents (status='deleted') — chống re-ingest
 * khi chạy lại ingest-vault.js; file .md local không bị đụng.
 */

import { getSupabase } from './supabase';
import { invalidateComplianceCache } from './compliance';
import { invalidateStructuredCache } from './structured';

/** Escape ký tự wildcard của LIKE/ILIKE. */
export function escapeLike(s: string): string {
  const bs = String.fromCharCode(92);
  return s.replace(/[%_]/g, (m) => bs + m);
}

/** Xóa toàn bộ answer_cache (đồng bộ cache chatbox). */
export async function clearAnswerCache(): Promise<void> {
  try {
    await getSupabase()
      .from('answer_cache')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
  } catch {
    // Cache không xóa được không chặn delete (best-effort)
  }
}

/**
 * Thu thập các file_path khớp trên knowledge_chunks theo (cột, value, mode).
 * Dùng TRƯỚC khi xóa chunks để cascade dọn các bảng khác vẫn biết paths.
 */
export async function collectMatchingPaths(
  table: 'knowledge_chunks',
  column: 'file_path' | 'title',
  value: string,
  mode: string
): Promise<string[]> {
  try {
    let q = getSupabase().from(table).select('file_path');
    q = mode === 'exact' ? q.eq(column, value) : q.ilike(column, `%${escapeLike(value)}%`);
    const { data } = await q.limit(1000);
    return [...new Set((data || []).map((r: { file_path: string }) => r.file_path))];
  } catch (e) {
    console.warn(`[cascade] thu paths thất bại (${column}=${value}): ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

/** Xóa 1 bảng theo cột file_path trong danh sách paths. Best-effort (không throw). */
async function deleteByPaths(table: 'documents' | 'source_documents', paths: string[], label: string): Promise<void> {
  if (!paths.length) return;
  try {
    await getSupabase().from(table).delete().in('file_path', paths);
  } catch (e) {
    console.warn(`[cascade] xóa ${label} thất bại: ${e instanceof Error ? e.message : e}`);
  }
}

/** Xóa compliance_records theo source_file đã xác định (best-effort). */
async function deleteComplianceByPaths(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await getSupabase().from('compliance_records').delete().in('source_file', paths);
    invalidateComplianceCache();
  } catch (e) {
    console.warn(`[cascade] xóa compliance_records thất bại: ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * Cascade xóa kiến thức của 1 loạt file_path (dọn 5 bảng + invalidate cache).
 *
 * @param paths       danh sách file_path cần xóa (chunks sẽ được xóa theo paths)
 * @param opts.softDelete  true → giữ row source_documents status='deleted'
 *                         false → xóa hẳn row source_documents
 * @returns {chunks, sources} — số chunks đã xóa, số source đã đánh dấu/xóa
 */
export async function deleteSourceCascade(
  paths: string[],
  opts: { softDelete?: boolean } = {}
): Promise<{ chunks: number; sources: number }> {
  const pathsList = paths.filter(Boolean);
  const soft = !!opts.softDelete;

  // 1) Xóa knowledge_chunks theo paths (không xóa cả bảng — an toàn)
  let chunks = 0;
  if (pathsList.length) {
    const { error, count } = await getSupabase()
      .from('knowledge_chunks')
      .delete({ count: 'exact' })
      .in('file_path', pathsList);
    if (error) {
      console.warn(`[cascade] xóa knowledge_chunks thất bại: ${error.message}`);
    } else {
      chunks = count ?? 0;
    }
  }

  // 2) Cascade đồng bộ các bảng liên quan (best-effort — lỗi 1 bảng không chặn)
  await deleteComplianceByPaths(pathsList);
  await deleteByPaths('documents', pathsList, 'documents');

  // 3) source_documents: soft-delete (giữ row, status='deleted') hoặc xóa hẳn
  let sources = 0;
  if (pathsList.length) {
    try {
      if (soft) {
        const { error, data } = await getSupabase()
          .from('source_documents')
          .update({ status: 'deleted' })
          .in('file_path', pathsList)
          .select('file_path');
        if (error) {
          console.warn(`[cascade] soft-delete source_documents thất bại: ${error.message}`);
        } else {
          sources = (data || []).length;
        }
      } else {
        const { error, count } = await getSupabase()
          .from('source_documents')
          .delete({ count: 'exact' })
          .in('file_path', pathsList);
        if (error) {
          console.warn(`[cascade] xóa source_documents thất bại: ${error.message}`);
        } else {
          sources = count ?? 0;
        }
      }
    } catch (e) {
      console.warn(`[cascade] source_documents thất bại: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 4) Cache + dữ liệu số liệu
  invalidateStructuredCache();
  await clearAnswerCache();

  return { chunks, sources };
}