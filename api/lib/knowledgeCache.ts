/**
 * knowledgeCache.ts — Cache tầng module cho knowledge_chunks dùng trong /api/chat.
 *
 * VẤN ĐỀ (fix review 2026-08-10): /api/chat tải ~1000 + 200×n chunks và like()
 * pattern mỗi câu hỏi → tốn nhiều request Supabase + thời gian phản hồi cao.
 *
 * GIẢI PHÁP: cache ở biến module với TTL ngắn (10 phút) + invalidation thủ công
 * qua invalidateKnowledgeCache() khi admin upload/ingest/delete tài liệu.
 * KHÔNG đổi logic scoring — chỉ đổi nguồn dữ liệu (cache thay vì query live).
 *
 * Lưu ý Vercel serverless: mỗi instance có cache riêng; nội dung mới nhất vẫn
 * xuất hiện ≤ 10 phút sau khi admin upload. Chấp nhận trade-off để giảm tải
 * Supabase (quantum: chat là route được gọi NHIỀU NHẤT).
 */

import { getSupabase } from './supabase';

export interface KnowledgeRow {
  id: string;
  content: string;
  title: string;
  heading: string;
  file_path: string;
  chunk_index?: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 phút

let _cache: KnowledgeRow[] | null = null;
let _updatedAt = 0;

/** Lấy toàn bộ knowledge_chunks (cache 10 phút) — chống burst query Supabase. */
export function getKnowledgeChunksCached(): { data: KnowledgeRow[]; fromCache: boolean } {
  const now = Date.now();
  if (_cache && now - _updatedAt < TTL_MS) {
    return { data: _cache, fromCache: true };
  }
  // Cache hết hạn → không chặn request; trả rỗng để caller tự query fallback
  return { data: [], fromCache: false };
}

/** Đánh dấu cache hết hạn — gọi sau upload/ingest/delete để content mới lên ngay. */
export function invalidateKnowledgeCache(): void {
  _cache = null;
  _updatedAt = 0;
}

/** Query live từ Supabase (khi cache hết hạn) + lưu lại cache. */
export async function refreshKnowledgeCache(): Promise<KnowledgeRow[]> {
  const { data, error } = await getSupabase()
    .from('knowledge_chunks')
    .select('id, content, title, heading, file_path, chunk_index')
    .limit(1000);
  if (error) return [];
  _cache = (data as KnowledgeRow[]) || [];
  _updatedAt = Date.now();
  return _cache;
}