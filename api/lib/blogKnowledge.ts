/**
 * blogKnowledge.ts — Đồng bộ bài blog (bảng blog_posts) → knowledge_chunks.
 *
 * Khi admin POST/PUT/DELETE bài qua /api/blog, route gọi các hàm ở đây để
 * nội dung bài trở thành nguồn kiến thức cho chatbox — TỰ ĐỘNG, không cần
 * bấm nút. Truy vết bằng file_path = 'blog/{id}' (đúng pattern upload/ của
 * admin ingest, không cần đổi schema DB).
 *
 * - Ingest: chunk (chunker.ts) + upsert theo (file_path, chunk_index) batching
 *   50, fallback 42P10 delete+insert (copy mẫu idempotent từ admin ingest),
 *   xóa chunk dư khi bài ngắn lại.
 * - Remove: xóa toàn bộ chunk của blog_id (xóa bài không tồn tại = no-op).
 * - Không chạy compliance extract cho blog (tiết kiệm LLM call, ngoài scope).
 * - Không import Next.js — unit-test trực tiếp bằng node --test (mock Supabase).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseFrontmatter, chunkByHeading, chunkPlainText, type Chunk } from './chunker';

const INSERT_BATCH = 50;

/** Max chunk của 1 bài blog (chống upload rác 1 bài quá lớn làm tràn DB). */
const MAX_BLOG_CHUNKS = 500;

/** file_path truy vết kiến thức của bài blog theo blog_id. */
export function blogFilePath(blogId: string): string {
  return `blog/${(blogId || '').trim()}`;
}

/** Chunk nào thuộc nguồn blog (prefix blog/) — dùng cho chat route + test. */
export function isBlogPath(filePath: string): boolean {
  return (filePath || '').startsWith('blog/');
}

/** Nguồn admin ưu tiên (blog + upload) — pool đa dạng hóa chung của chat. */
export function isAdminKnowledgePath(filePath: string): boolean {
  return isBlogPath(filePath) || (filePath || '').startsWith('upload/');
}

export interface BlogKnowledgeInput {
  id: string;
  title: string;
  content: string;
}

export interface BlogKnowledgeResult {
  ok: boolean;
  chunks?: number;
  error?: string;
}

/**
 * chunkBlogContent — cắt nội dung bài blog thành chunks kiến thức.
 * Markdown có heading → chunkByHeading (giữ heading path); plain text →
 * chunkPlainText. Bỏ frontmatter YAML. Content rỗng → [].
 */
export function chunkBlogContent(content: string): Chunk[] {
  const raw = (content || '').trim();
  if (!raw) return [];
  const fm = parseFrontmatter(raw);
  // Trim body trước khi test heading: sau '---' đóng frontmatter, body thường
  // bắt đầu bằng '\n' → regex ^(#{1,6}) không khớp nếu không trim (sẽ rơi
  // vào nhánh plain text chứa cả frontmatter).
  const body = fm.body.trim();
  const hasHeading = /^(#{1,6})\s+/.test(body);
  return hasHeading ? chunkByHeading(body) : chunkPlainText(body);
}

/**
 * ingestBlogKnowledge — upsert idempotent chunks của bài blog.
 *
 * Idempotent (chạy lại không trùng lặp): upsert theo UNIQUE(file_path,
 * chunk_index) → đè chunk cũ; nếu DB chưa có constraint (42P10) → fallback
 * delete+insert (đúng mẫu admin ingest). Sau khi upsert, xóa chunk dư
 * (chunk_index >= N) khi bài ngắn lại. Best-effort: lỗi → {ok:false}, không
 * throw — API blog vẫn trả thành công cho admin.
 */
export async function ingestBlogKnowledge(
  sb: SupabaseClient,
  input: BlogKnowledgeInput
): Promise<BlogKnowledgeResult> {
  const blogId = (input.id || '').trim();
  const title = (input.title || '').trim();
  if (!blogId || !title) return { ok: false, error: 'Thiếu id hoặc title' };

  const chunks = chunkBlogContent(input.content);
  if (!chunks.length) return { ok: true, chunks: 0 };

  const filePath = blogFilePath(blogId);
  const limited = chunks.slice(0, MAX_BLOG_CHUNKS);

  try {
    let inserted = 0;
    let plainInsert = false;
    for (let i = 0; i < limited.length; i += INSERT_BATCH) {
      const batch = limited.slice(i, i + INSERT_BATCH).map((c, idx) => ({
        content: c.text,
        title,
        heading: c.heading,
        file_path: filePath,
        chunk_index: i + idx,
      }));
      if (plainInsert) {
        const { error: insErr } = await sb.from('knowledge_chunks').insert(batch);
        if (insErr) return { ok: false, error: insErr.message };
        inserted += batch.length;
        continue;
      }
      const { error: insErr } = await sb
        .from('knowledge_chunks')
        .upsert(batch, { onConflict: 'file_path,chunk_index' });
      if (insErr && (insErr.code === '42P10' || (insErr.message || '').includes('ON CONFLICT'))) {
        const { error: delErr } = await sb.from('knowledge_chunks').delete().eq('file_path', filePath);
        if (delErr) return { ok: false, error: delErr.message };
        const { error: retryErr } = await sb.from('knowledge_chunks').insert(batch);
        if (retryErr) return { ok: false, error: retryErr.message };
        plainInsert = true;
      } else if (insErr) {
        return { ok: false, error: insErr.message };
      }
      inserted += batch.length;
    }

    // Xóa chunk dư khi bài ngắn lại (nếu bài bị cắt bởi MAX_BLOG_CHUNKS thì
    // số dư là 0 — không xóa nhầm).
    const limit = Math.min(chunks.length, MAX_BLOG_CHUNKS);
    const { error: delErr } = await sb
      .from('knowledge_chunks')
      .delete()
      .eq('file_path', filePath)
      .gte('chunk_index', limit);
    if (delErr) return { ok: false, error: delErr.message };

    return { ok: true, chunks: inserted };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return { ok: false, error: msg };
  }
}

/**
 * removeBlogKnowledge — xóa toàn bộ kiến thức của bài blog theo blog_id.
 * Xóa bài không tồn tại = no-op tự nhiên (delete không khớp row nào).
 * Best-effort: lỗi → {ok:false}, không throw.
 */
export async function removeBlogKnowledge(
  sb: SupabaseClient,
  blogId: string
): Promise<BlogKnowledgeResult> {
  const cleanId = (blogId || '').trim();
  if (!cleanId) return { ok: true };
  try {
    const { error } = await sb
      .from('knowledge_chunks')
      .delete()
      .eq('file_path', blogFilePath(cleanId));
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return { ok: false, error: msg };
  }
}
