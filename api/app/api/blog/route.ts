import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle, getAdminEmailFromToken } from '@/lib/adminAuth';
import { ingestBlogKnowledge } from '@/lib/blogKnowledge';
import { invalidateKnowledgeCache } from '@/lib/knowledgeCache';
import { clearAnswerCache } from '@/lib/deleteCascade';

/** Đồng bộ bài blog → knowledge_chunks (best-effort — lỗi không chặn response). */
async function syncBlogKnowledge(params: { id: string; title: string; content: string; status: string }): Promise<void> {
  try {
    if (params.status === 'published' && (params.content || '').trim()) {
      const res = await ingestBlogKnowledge(getSupabase(), {
        id: params.id,
        title: params.title,
        content: params.content,
      });
      if (!res.ok) console.warn(`[blog] ingest kiến thức bài ${params.id} bỏ qua: ${res.error}`);
    }
    invalidateKnowledgeCache();
    await clearAnswerCache();
  } catch (e) {
    console.warn(`[blog] đồng bộ kiến thức bài ${params.id} lỗi: ${e instanceof Error ? e.message : e}`);
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── List posts ───
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const limitRaw = parseInt(searchParams.get('limit') || '10', 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;

  // Chống lộ bài nháp: chỉ admin Google mới được hỏi trạng thái khác published
  const admin = await isAdminGoogle(req);
  const rawStatus = searchParams.get('status') || 'published';
  const status = admin && (rawStatus === 'draft' || rawStatus === 'all') ? rawStatus : 'published';

  const client = getSupabase();

  // ?count=1 → tong so bai (cho dai so lieu hero, nhe, khong gioi han 50)
  if (searchParams.get('count') === '1') {
    let q = client.from('blog_posts').select('id', { count: 'exact', head: true });
    if (status !== 'all') q = q.eq('status', status);
    const { count, error: cErr } = await q;
    if (cErr) {
      return new Response(JSON.stringify({ error: cErr.message }), { status: 500 });
    }
    return new Response(JSON.stringify({ total: count ?? 0 }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    });
  }

  let query = client.from('blog_posts').select('*');

  if (slug) {
    const { data, error } = await query.eq('slug', slug).limit(1).single();
    if (error || !data || (data.status !== 'published' && !admin)) {
      return new Response(JSON.stringify({ error: 'Bài viết không tồn tại' }), { status: 404 });
    }
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  }

  if (status !== 'all') query = query.eq('status', status);
  query = query.order('published_at', { ascending: false }).limit(Math.min(limit, 50));

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify(data || []), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
  });
}

// ─── Slug helpers ───
// Giữ dấu tiếng Việt trong slug (SEO tốt hơn, URL đọc được)
function slugify(text: string): string {
  return text
    .normalize('NFD')                           // tách dấu: ệ → e + ̣ + ̂
    .replace(/[̀-ͯ]/g, '')            // xóa dấu diacritics
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')     // đ → d
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')              // chỉ giữ a-z, 0-9, space, -
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Create post ───
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.title || !body.content) {
      return new Response(JSON.stringify({ error: 'Thiếu title hoặc content' }), { status: 400 });
    }

    // Verify admin — CHỈ tài khoản trong ADMIN_EMAILS mới được tạo bài
    if (!(await isAdminGoogle(req))) {
      return new Response(JSON.stringify({ error: 'Tài khoản của bạn không có quyền sử dụng chức năng này' }), { status: 403 });
    }

    const client = getSupabase();
    const email = await getAdminEmailFromToken(req);
    const slug = body.slug || slugify(body.title);

    // Check slug duplicate
    const { data: existing } = await client.from('blog_posts').select('id').eq('slug', slug).limit(1);
    if (existing?.length) {
      return new Response(JSON.stringify({ error: `Slug '${slug}' đã tồn tại` }), { status: 409 });
    }

    const row = {
      title: body.title,
      slug,
      summary: body.summary || '',
      content: body.content,
      status: body.status || 'published',
      published_at: body.status === 'published' ? new Date().toISOString() : null,
      author_email: email,
    };

    const { data, error } = await client.from('blog_posts').insert(row).select().single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    if (data?.id) {
      // Đồng bộ kiến thức (best-effort — lỗi ingest không chặn 201 cho admin)
      await syncBlogKnowledge({ id: data.id, title: data.title, content: data.content, status: data.status });
    }
    return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), { status: 500 });
  }
}
