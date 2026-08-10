import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle, getAdminEmailFromToken } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── List posts ───
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const status = searchParams.get('status') || 'published';

  const client = getSupabase();
  let query = client.from('blog_posts').select('*');

  if (slug) {
    const { data, error } = await query.eq('slug', slug).limit(1).single();
    if (error || !data) {
      return new Response(JSON.stringify({ error: 'Bài viết không tồn tại' }), { status: 404 });
    }
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  }

  if (status === 'published') query = query.eq('status', 'published');
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
function slugify(text: string): string {
  return text.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
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
    return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), { status: 500 });
  }
}
