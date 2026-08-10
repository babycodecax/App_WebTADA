import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle } from '@/lib/adminAuth';

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

    const { data, error } = await client.from('blog_posts')
      .update({
        title: body.title,
        slug: body.slug,
        summary: body.summary || '',
        content: body.content,
        status: body.status || 'published',
        published_at: body.status === 'published' ? new Date().toISOString() : null,
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
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
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    // Không lộ chi tiết lỗi nội bộ ra client (fix review 2026-08-10)
    return new Response(JSON.stringify({ error: 'Lỗi máy chủ, vui lòng thử lại' }), { status: 500 });
  }
}
