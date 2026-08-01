import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Escape ky tu dac biet cua LIKE de tranh match sai khi xoa theo contains.
function escLike(s: string): string {
  const bs = String.fromCharCode(92);
  return s.replace(/[%_*~]/g, (m) => bs + m);
}

/** Xóa toàn bộ answer_cache sau khi xóa chunks (đồng bộ cache chatbox). */
async function clearAnswerCache(): Promise<void> {
  try {
    await getSupabase()
      .from('answer_cache')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    // Cache không xóa được không chặn delete (best-effort)
  }
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Thiếu tham số' }, { status: 400 });
  }
  const { file_path, source, title, mode = 'contains' } = body;
  if (!file_path && !source && !title) {
    return NextResponse.json({ error: 'Thiếu file_path hoặc title' }, { status: 400 });
  }

  // Xóa trên knowledge_chunks (bảng chat production đọc)
  let query = getSupabase().from('knowledge_chunks').delete({ count: 'exact' });
  if (file_path || source) {
    const fp = file_path || source;
    query = mode === 'exact'
      ? query.eq('file_path', fp)
      : query.ilike('file_path', `*${escLike(fp)}*`);
  } else if (title) {
    query = mode === 'exact'
      ? query.eq('title', title)
      : query.ilike('title', `*${escLike(title)}*`);
  }

  const { error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await clearAnswerCache();

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
