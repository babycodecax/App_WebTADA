import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';

// ─── Update post ───
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const client = getSupabase();

    // Verify admin JWT
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Cần đăng nhập' }), { status: 401 });
    }
    const token = auth.slice(7);
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: 'Token không hợp lệ' }), { status: 401 });
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
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), { status: 500 });
  }
}

// ─── Delete post ───
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const client = getSupabase();

    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Cần đăng nhập' }), { status: 401 });
    }
    const token = auth.slice(7);
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: 'Token không hợp lệ' }), { status: 401 });
    }

    const { error } = await client.from('blog_posts').delete().eq('id', params.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), { status: 500 });
  }
}
