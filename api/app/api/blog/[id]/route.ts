import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle } from '@/lib/adminAuth';
import { ingestBlogKnowledge, removeBlogKnowledge } from '@/lib/blogKnowledge';
import { invalidateKnowledgeCache } from '@/lib/knowledgeCache';
import { clearAnswerCache } from '@/lib/deleteCascade';

/** Đồng bộ kiến thức sau khi sửa/xóa bài (best-effort — lỗi không chặn response). */
async function syncBlogKnowledge(params: { id: string; title?: string; content?: string; status?: string }): Promise<void> {
  try {
    const isPublished = params.status === 'published' && !!(params.content || '').trim();
    if (isPublished) {
      const res = await ingestBlogKnowledge(getSupabase(), {
        id: params.id,
        title: params.title || '',
        content: params.content || '',
      });
      if (!res.ok) console.warn(`[blog] ingest kiến thức bài ${params.id} bỏ qua: ${res.error}`);
    } else {
      const res = await removeBlogKnowledge(getSupabase(), params.id);
      if (!res.ok) console.warn(`[blog] gỡ kiến thức bài ${params.id} bỏ qua: ${res.error}`);
    }
    invalidateKnowledgeCache();
    await clearAnswerCache();
  } catch (e) {
    console.warn(`[blog] đồng bộ kiến thức bài ${params.id} lỗi: ${e instanceof Error ? e.message : e}`);
  }
}

export const runtime = 'nodejs';

// ─── Update post ───
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const client = getSupabase();

    // Verify admin — CHỈ tài khoản trong ADMIN_EMAILS mới được sửa bài
    if (!(await isAdminGoogle(req))) {
      return new Response(JSON.stringify({ error: 'Tài khoản của bạn không có quyền sử dụng chức năng này' }), { status: 403 });
    }

    // Đọc bản ghi hiện tại: giữ published_at cũ (cache X-Vercel + thứ tự sitemap
    // liên quan ngày publish), check slug trùng với bài KHÁC trước khi update
    const { data: cur, error: curErr } = await client.from('blog_posts')
      .select('slug, status, published_at').eq('id', params.id).limit(1).maybeSingle();
    if (curErr || !cur) {
      return new Response(JSON.stringify({ error: 'Bài viết không tồn tại' }), { status: 404 });
    }
    const newSlug = body.slug || cur.slug;
    if (newSlug !== cur.slug) {
      const { data: dup } = await client.from('blog_posts').select('id').eq('slug', newSlug).neq('id', params.id).limit(1);
      if (dup && dup.length) {
        return new Response(JSON.stringify({ error: `Slug '${newSlug}' đã tồn tại` }), { status: 409 });
      }
    }
    const status = body.status || cur.status || 'published';
    const { data, error } = await client.from('blog_posts')
      .update({
        title: body.title,
        slug: newSlug,
        summary: body.summary || '',
        content: body.content,
        status,
        published_at: status === 'published' ? (cur.published_at || new Date().toISOString()) : null,
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (data?.id) {
      // Đồng bộ kiến thức (best-effort — lỗi ingest không chặn 200 cho admin)
      await syncBlogKnowledge({ id: data.id, title: data.title, content: data.content, status: data.status });
    }
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    // Không lộ chi tiết lỗi nội bộ ra client (fix review 2026-08-10)
    return new Response(JSON.stringify({ error: 'Lỗi máy chủ, vui lòng thử lại' }), { status: 500 });
  }
}

// ─── Delete post ───
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const client = getSupabase();

    // Verify admin — CHỈ tài khoản trong ADMIN_EMAILS mới được xóa bài
    if (!(await isAdminGoogle(req))) {
      return new Response(JSON.stringify({ error: 'Tài khoản của bạn không có quyền sử dụng chức năng này' }), { status: 403 });
    }

    const { error } = await client.from('blog_posts').delete().eq('id', params.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    // Gỡ kiến thức của bài đã xóa (best-effort — lỗi không chặn response)
    await syncBlogKnowledge({ id: params.id });
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    // Không lộ chi tiết lỗi nội bộ ra client (fix review 2026-08-10)
    return new Response(JSON.stringify({ error: 'Lỗi máy chủ, vui lòng thử lại' }), { status: 500 });
  }
}
