import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getDocIndex } from '@/lib/docIndexCache';

export const runtime = 'nodejs';

/**
 * GET /api/library/doc-index — danh sách {id, doc_number} văn bản active
 * phục vụ client rewrite link pháp lý (js/blog.js). Cache server 10 phút.
 */
export async function GET() {
  try {
    const docs = await getDocIndex(getSupabase());
    return NextResponse.json(
      { ok: true, docs },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  } catch (e) {
    console.error('[doc-index] lỗi:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Lỗi truy vấn', docs: [] }, { status: 500 });
  }
}
