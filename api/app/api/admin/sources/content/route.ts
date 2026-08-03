import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/admin/sources/content?file_path=...
 * Trả về nội dung nguồn ghép từ knowledge_chunks (không cần file gốc — Vercel
 * không có vault/). Dùng cho "Xem trực tuyến" + "Tải về" trong admin.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const url = new URL(req.url);
  const filePath = (url.searchParams.get('file_path') || '').trim();
  if (!filePath) {
    return NextResponse.json({ error: 'Thiếu file_path' }, { status: 400 });
  }

  try {
    const { data: chunks, error } = await getSupabase()
      .from('knowledge_chunks')
      .select('content, heading, title, chunk_index')
      .eq('file_path', filePath)
      .order('chunk_index', { ascending: true })
      .limit(2000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const list = (chunks || []) as { title: string; heading: string; content: string }[];
    const title = list[0]?.title || filePath;

    // Ghép lại: heading (nếu có) + content, ngăn cách bằng dòng trống
    let body = '';
    for (const c of list) {
      const block = c.heading ? `## ${c.heading}\n\n${c.content}` : c.content;
      body += block.trim() + '\n\n';
    }

    return NextResponse.json({ file_path: filePath, title, content: body.trim(), chunk_count: list.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lấy nội dung: ${msg}` }, { status: 500 });
  }
}