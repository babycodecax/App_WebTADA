/**
 * backfill-blog-knowledge.mjs — Nạp TOÀN BỘ bài blog đã tồn tại vào knowledge_chunks.
 *
 * Chạy 1 lần sau khi deploy tính năng "blog thành nguồn kiến thức chatbox":
 * các bài blog published có trước tính năng sẽ được ingest (file_path = blog/<id>),
 * đúng logic syncBlogKnowledge của route (status published + content không rỗng).
 *
 * Cách chạy:
 *   cd api
 *   node scripts/backfill-blog-knowledge.mjs
 *
 * Cần biến môi trường: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (nạp từ .env bằng dotenv; nếu chưa có dotenv thì export trước khi chạy)
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { parseFrontmatter, chunkByHeading, chunkPlainText } from '../lib/chunker.ts';
import { blogFilePath } from '../lib/blogKnowledge.ts';

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (nạp từ .env)');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const INSERT_BATCH = 50;
const MAX_BLOG_CHUNKS = 500;

function chunkBlogContent(content) {
  const raw = (content || '').trim();
  if (!raw) return [];
  const fm = parseFrontmatter(raw);
  const body = fm.body.trim();
  const hasHeading = /^(#{1,6})\s+/.test(body);
  return hasHeading ? chunkByHeading(body) : chunkPlainText(body);
}

async function ingestOne(blog) {
  const chunks = chunkBlogContent(blog.content);
  if (!chunks.length) return { id: blog.id, title: blog.title, chunks: 0, note: 'rỗng — bỏ qua' };
  const filePath = blogFilePath(blog.id);
  const limited = chunks.slice(0, MAX_BLOG_CHUNKS);
  try {
    for (let i = 0; i < limited.length; i += INSERT_BATCH) {
      const batch = limited.slice(i, i + INSERT_BATCH).map((c, idx) => ({
        content: c.text,
        title: blog.title,
        heading: c.heading,
        file_path: filePath,
        chunk_index: i + idx,
      }));
      const { error: insErr } = await sb
        .from('knowledge_chunks')
        .upsert(batch, { onConflict: 'file_path,chunk_index' });
      if (insErr && (insErr.code === '42P10' || (insErr.message || '').includes('ON CONFLICT'))) {
        await sb.from('knowledge_chunks').delete().eq('file_path', filePath);
        const { error: retryErr } = await sb.from('knowledge_chunks').insert(batch);
        if (retryErr) throw retryErr;
      } else if (insErr) {
        throw insErr;
      }
    }
    const limit = Math.min(chunks.length, MAX_BLOG_CHUNKS);
    await sb.from('knowledge_chunks').delete().eq('file_path', filePath).gte('chunk_index', limit);
    return { id: blog.id, title: blog.title, chunks: limited.length };
  } catch (e) {
    return { id: blog.id, title: blog.title, chunks: 0, error: e.message };
  }
}

// Lấy toàn bộ bài published (phân trang 500)
const all = [];
let from = 0;
for (;;) {
  const { data, error } = await sb
    .from('blog_posts')
    .select('id, title, content')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(from, from + 499);
  if (error) {
    console.error('Lỗi đọc blog_posts:', error.message);
    process.exit(1);
  }
  all.push(...(data || []));
  if (!data || data.length < 500) break;
  from += 500;
}

console.log(`Tổng bài blog published: ${all.length}`);
let ok = 0, fail = 0;
for (const blog of all) {
  const res = await ingestOne(blog);
  if (res.error) { fail++; console.warn(`[FAIL] ${res.title} (${res.id}): ${res.error}`); }
  else { ok++; console.log(`[OK] ${res.title} — ${res.chunks} chunks${res.note ? ' (' + res.note + ')' : ''}`); }
}
console.log(`\nHoàn tất: ${ok} OK, ${fail} fail.`);
