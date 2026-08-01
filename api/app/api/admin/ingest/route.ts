import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';
import { chunkByHeading, chunkPlainText, parseFrontmatter } from '@/lib/chunker';
import { sanitizeTitle } from '@/lib/parseFile';
import { invalidateStructuredCache } from '@/lib/structured';

export const runtime = 'nodejs';
export const maxDuration = 60;

const INSERT_BATCH = 50;

/** Xóa toàn bộ answer_cache — đảm bảo chatbox không trả câu trả lời cũ sau ingest. */
async function clearAnswerCache(): Promise<void> {
  try {
    await getSupabase()
      .from('answer_cache')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    // Cache không xóa được không chặn ingest (best-effort)
  }
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.content) {
    return NextResponse.json({ error: 'Thiếu title hoặc content' }, { status: 400 });
  }

  const title = (body.title as string)?.trim() || '';
  if (!title) {
    return NextResponse.json({ error: 'Thiếu title hoặc content' }, { status: 400 });
  }

  // source giữ nguyên nếu truyền (backward compat) → chuẩn hóa về prefix upload/
  const source = (body.source as string)?.trim() || '';
  const filePath = source ? `upload/${sanitizeTitle(source)}` : `upload/${sanitizeTitle(title)}`;

  try {
    const content = String(body.content);
    // Markdown → giữ heading; plain text → heading=''
    const fm = parseFrontmatter(content);
    const hasHeading = /^(#{1,6})\s+/.test(fm.body);
    const chunks = hasHeading ? chunkByHeading(fm.body) : chunkPlainText(content);
    if (!chunks.length) {
      return NextResponse.json({ error: 'File rỗng hoặc không đọc được nội dung' }, { status: 400 });
    }

    // Idempotent: insert (upsert theo file_path+chunk_index) trước rồi xóa phần
    // dư (M4) — nếu insert fail thì dữ liệu cũ vẫn còn nguyên.
    // Nếu DB chưa có UNIQUE(file_path,chunk_index) (42P10) → fallback delete+insert
    // để ingest không gãy trên DB chưa chạy migration 2026-08-01.
    let inserted = 0;
    let plainInsert = false;
    for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
      const batch = chunks.slice(i, i + INSERT_BATCH).map((c, idx) => ({
        content: c.text,
        title,
        heading: c.heading,
        file_path: filePath,
        chunk_index: i + idx,
      }));
      if (plainInsert) {
        const { error: insErr } = await getSupabase().from('knowledge_chunks').insert(batch);
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
        inserted += batch.length;
        continue;
      }
      const { error: insErr } = await getSupabase()
        .from('knowledge_chunks')
        .upsert(batch, { onConflict: 'file_path,chunk_index' });
      if (insErr && (insErr.code === '42P10' || (insErr.message || '').includes('ON CONFLICT'))) {
        const { error: delErr } = await getSupabase()
          .from('knowledge_chunks')
          .delete()
          .eq('file_path', filePath);
        if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
        const { error: retryErr } = await getSupabase().from('knowledge_chunks').insert(batch);
        if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
        plainInsert = true;
      } else if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      inserted += batch.length;
    }

    const { error: delErr } = await getSupabase()
      .from('knowledge_chunks')
      .delete()
      .eq('file_path', filePath)
      .gte('chunk_index', chunks.length);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    // Xóa cache câu trả lời cũ để chatbox thấy dữ liệu mới ngay
    await clearAnswerCache();
    invalidateStructuredCache();

    return NextResponse.json({ ok: true, chunks: inserted, file_path: filePath });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi xử lý ingest: ${msg}` }, { status: 500 });
  }
}
