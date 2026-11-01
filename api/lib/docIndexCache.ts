/**
 * docIndexCache.ts — Cache danh sách {id, doc_number} từ landing_legal_docs
 * (is_active) dùng cho rewrite link pháp lý trong SSR. TTL 10 phút: upload
 * văn bản mới qua admin được thấy tối đa sau 10 phút trên server instance.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LegalIndexDoc } from './legalLinkRewrite';

const TTL_MS = 10 * 60 * 1000;

let cache: { data: LegalIndexDoc[]; at: number } | null = null;
let inflight: Promise<LegalIndexDoc[]> | null = null;

async function fetchDocIndex(sb: SupabaseClient): Promise<LegalIndexDoc[]> {
  const { data, error } = await sb
    .from('landing_legal_docs')
    .select('id,doc_number,is_active')
    .eq('is_active', true)
    .limit(200);
  if (error) {
    console.warn(`[docIndexCache] query lỗi (trả cache/empty): ${error.message}`);
    return cache ? cache.data : [];
  }
  const rows = (data || []).filter((r) => r.id && r.doc_number);
  const now = Date.now();
  cache = { data: rows, at: now };
  return rows;
}

/** Lấy index văn bản — có cache 10 phút; lỗi giữ cache cũ nếu có. */
export async function getDocIndex(sb: SupabaseClient): Promise<LegalIndexDoc[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = fetchDocIndex(sb).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Test helper — xoá cache (không dùng trong production code). */
export function resetDocIndexCache(): void {
  cache = null;
  inflight = null;
}
