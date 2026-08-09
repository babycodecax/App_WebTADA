import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle } from '@/lib/adminAuth';
import { collectMatchingPaths, deleteSourceCascade, escapeLike } from '@/lib/deleteCascade';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await isAdminGoogle(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Thiếu tham số' }, { status: 400 });
  }
  const { file_path, source, title, mode = 'contains' } = body;
  const fp = file_path || source || '';
  if (!fp && !title) {
    return NextResponse.json({ error: 'Thiếu file_path hoặc title' }, { status: 400 });
  }

  // 1) Thu paths trước khi xóa (kể cả nhánh title) — để cascade đồng bộ các bảng
  let paths: string[] = [];
  let titleFallbackUsed = false; // fp không khớp file_path nhưng khớp title
  if (fp) {
    if (mode === 'exact') {
      paths = [fp];
    } else {
      paths = await collectMatchingPaths('knowledge_chunks', 'file_path', fp, mode);
      // Nếu contains không khớp knowledge_chunks nào nhưng có thể match title
      if (!paths.length) {
        paths = await collectMatchingPaths('knowledge_chunks', 'title', fp, mode);
        titleFallbackUsed = paths.length > 0;
      }
    }
  } else if (title) {
    paths = await collectMatchingPaths('knowledge_chunks', 'title', title, mode);
    titleFallbackUsed = paths.length > 0;
  }

  // 2) Xóa knowledge_chunks trước (để biết count chính xác),
  //    rồi gọi cascade xóa các bảng còn lại dùng paths.
  //    Khi fallback title bật: dùng paths (đồng bộ cascade) tránh lệch 2 phía.
  const useCollectedPaths = titleFallbackUsed && paths.length > 0;
  let count = 0;
  if (useCollectedPaths) {
    const { error, count: c } = await getSupabase()
      .from('knowledge_chunks')
      .delete({ count: 'exact' })
      .in('file_path', paths);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    count = c ?? 0;
  } else {
    let query = getSupabase().from('knowledge_chunks').delete({ count: 'exact' });
    if (fp) {
      query = mode === 'exact'
        ? query.eq('file_path', fp)
        : query.ilike('file_path', `%${escapeLike(fp)}%`);
    } else if (title) {
      query = mode === 'exact'
        ? query.eq('title', title)
        : query.ilike('title', `%${escapeLike(title)}%`);
    }
    const { error, count: c } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    count = c ?? 0;
  }

  // 3) Cascade các bảng còn lại (compliance/documents/source_documents/cache)
  //    — hard delete source_documents cho nguồn upload (không soft-delete).
  await deleteSourceCascade(paths, { softDelete: false });

  return NextResponse.json({ ok: true, deleted: count ?? 0, paths });
}