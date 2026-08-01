import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';
import { chunkByHeading, chunkPlainText, parseFrontmatter } from '@/lib/chunker';
import { ALLOWED_EXTENSIONS, extractText, sanitizeTitle } from '@/lib/parseFile';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB (Vercel body limit ~4.5MB)
const INSERT_BATCH = 50;

// ─── Rate limiting (in-memory, per IP) — pattern audit/upload ───
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 10 }; // 10 requests/giờ/IP
const _rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT.max;
}

/** Xóa toàn bộ answer_cache — đảm bảo chatbox không trả câu trả lời cũ sau upload. */
async function clearAnswerCache(): Promise<void> {
  try {
    await getSupabase()
      .from('answer_cache')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    // Cache không xóa được không chặn upload (best-effort)
  }
}

/** Xóa chunks cũ + insert chunks mới cho 1 file_path (idempotent, re-upload thay thế). */
async function replaceChunks(
  filePath: string,
  title: string,
  chunks: { text: string; heading: string }[],
): Promise<number> {
  const { error: delErr } = await getSupabase()
    .from('knowledge_chunks')
    .delete()
    .eq('file_path', filePath);
  if (delErr) throw new Error(delErr.message);

  let inserted = 0;
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const batch = chunks.slice(i, i + INSERT_BATCH).map((c, idx) => ({
      content: c.text,
      title,
      heading: c.heading,
      file_path: filePath,
      chunk_index: i + idx,
    }));
    const { error: insErr } = await getSupabase().from('knowledge_chunks').insert(batch);
    if (insErr) throw new Error(insErr.message);
    inserted += batch.length;
  }
  return inserted;
}

/** Upsert bảng documents (BM25 backend local đọc) — best-effort, lỗi không chặn upload. */
async function upsertDocument(
  filePath: string,
  title: string,
  chunks: { text: string; heading: string }[],
): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from('documents')
      .upsert(
        {
          file_path: filePath,
          title,
          content: chunks.map((c) => c.text).join('\n\n'),
          chunks,
        },
        { onConflict: 'file_path' },
      );
    if (error) {
      // Bảng documents có thể chưa tồn tại (schema chỉ có knowledge_chunks) — bỏ qua
      console.warn(`[admin-upload] upsert documents bỏ qua: ${error.message}`);
    }
  } catch (e) {
    // Best-effort: không để lỗi này chặn upload
  }
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 1 giờ.' },
      { status: 429 },
    );
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const rawTitle = (form.get('title') as string)?.trim() || '';

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Thiếu file upload' }, { status: 400 });
  }

  const name = file.name || '';
  const ext = '.' + (name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return NextResponse.json(
      { error: 'Chỉ hỗ trợ .docx, .pdf, .txt, .md' },
      { status: 400 },
    );
  }

  // Validate size trước khi đọc buffer
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa 4 MB.` },
      { status: 400 },
    );
  }

  try {
    const extracted = await extractText(file);
    if (!extracted.body.trim()) {
      return NextResponse.json({ error: 'File rỗng hoặc không đọc được nội dung' }, { status: 400 });
    }

    const title = rawTitle || extracted.title;
    const filePath = 'upload/' + sanitizeTitle(title);

    // .md → giữ heading; docx/pdf/txt → plain text (heading='')
    let chunks: { text: string; heading: string }[];
    if (extracted.isMarkdown) {
      const { body } = parseFrontmatter(extracted.body);
      chunks = chunkByHeading(body);
    } else {
      chunks = chunkPlainText(extracted.body);
    }
    if (!chunks.length) {
      return NextResponse.json({ error: 'File rỗng hoặc không đọc được nội dung' }, { status: 400 });
    }

    // Ghi knowledge_chunks (bảng chat production đọc) + xóa cache câu trả lời cũ
    const inserted = await replaceChunks(filePath, title, chunks);
    // Đồng bộ bảng documents (BM25 backend local đọc khi reindex) — best-effort
    await upsertDocument(filePath, title, chunks);
    await clearAnswerCache();

    return NextResponse.json({ ok: true, chunks: inserted, title, file_path: filePath });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi xử lý file: ${msg}` }, { status: 500 });
  }
}
