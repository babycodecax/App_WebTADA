import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';
import { chunkByHeading, chunkPlainText, parseFrontmatter } from '@/lib/chunker';
import { ALLOWED_EXTENSIONS, extractText, sanitizeTitle } from '@/lib/parseFile';
import { invalidateStructuredCache } from '@/lib/structured';
import { invalidateComplianceCache } from '@/lib/compliance';
import { autoExtractComplianceBounded, extractHeuristicThenUpsert } from '@/lib/autoComplianceExtract';
import { waitUntil } from '@vercel/functions';

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

/** Lỗi 42P10: DB chưa có UNIQUE constraint (file_path, chunk_index) — xảy ra
 *  khi bảng chưa chạy migration 2026-08-01. PostgREST không ảo hoá constraint
 *  nên upsert onConflict fail hoàn toàn → fallback delete-cũ-trước + insert thuần. */
function isMissingConstraint(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P10' || (err.message || '').includes('ON CONFLICT');
}

/** Thay thế chunks cho 1 file_path — insert trước rồi delete (M4): nếu insert
 *  fail (mạng, Supabase) thì dữ liệu cũ vẫn còn, không mất file khỏi tri thức.
 *  Dùng batch upsert theo (file_path, chunk_index) để re-upload không tạo trùng.
 *  Nếu DB chưa có UNIQUE constraint (C1) → fallback: xóa hết chunks cũ của
 *  file rồi insert thuần — upload không gãy trên DB chưa migrate. */
async function replaceChunks(
  filePath: string,
  title: string,
  chunks: { text: string; heading: string }[],
): Promise<number> {
  let inserted = 0;
  let plainInsert = false; // fallback khi DB thiếu constraint
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const batch = chunks.slice(i, i + INSERT_BATCH).map((c, idx) => ({
      content: c.text,
      title,
      heading: c.heading,
      file_path: filePath,
      chunk_index: i + idx,
    }));
    if (plainInsert) {
      const { error } = await getSupabase().from('knowledge_chunks').insert(batch);
      if (error) throw new Error(error.message);
    } else {
      const { error: insErr } = await getSupabase()
        .from('knowledge_chunks')
        .upsert(batch, { onConflict: 'file_path,chunk_index' });
      if (isMissingConstraint(insErr)) {
        console.warn(
          '[admin-upload] DB thiếu UNIQUE(file_path,chunk_index) — fallback delete+insert (chạy migration 2026-08-01)',
        );
        const { error: delErr } = await getSupabase()
          .from('knowledge_chunks')
          .delete()
          .eq('file_path', filePath);
        if (delErr) throw new Error(delErr.message);
        const { error: retryErr } = await getSupabase().from('knowledge_chunks').insert(batch);
        if (retryErr) throw new Error(retryErr.message);
        plainInsert = true;
      } else if (insErr) {
        throw new Error(insErr.message);
      }
    }
    inserted += batch.length;
  }

  // Insert xong mới xóa phần dư (trường hợp chunks mới ít hơn chunks cũ)
  const { error: delErr } = await getSupabase()
    .from('knowledge_chunks')
    .delete()
    .eq('file_path', filePath)
    .gte('chunk_index', chunks.length);
  if (delErr) throw new Error(delErr.message);

  return inserted;
}

/** Upsert bảng source_documents (kho nguồn — đồng bộ với backend Python).
 *  Best-effort, lỗi không chặn upload. */
async function upsertSourceDocument(filePath: string, title: string): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from('source_documents')
      .upsert(
        {
          file_path: filePath,
          title,
          doc_type: 'other',
          effective_date: '',
          status: 'ready',
          source_origin: 'upload',
        },
        { onConflict: 'file_path' },
      );
    if (error) {
      // Bảng source_documents có thể chưa có (migration 003 chưa chạy) — bỏ qua
      console.warn(`[admin-upload] upsert source_documents bỏ qua: ${error.message}`);
    }
  } catch (e) {
    // Best-effort: không để lỗi này chặn upload
  }
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
    // body gốc (đã strip frontmatter nếu .md) — dùng chung cho chunk + auto-extract
    const body = extracted.isMarkdown ? parseFrontmatter(extracted.body).body : extracted.body;
    let chunks: { text: string; heading: string }[];
    if (extracted.isMarkdown) {
      chunks = chunkByHeading(body);
    } else {
      chunks = chunkPlainText(body);
    }
    if (!chunks.length) {
      return NextResponse.json({ error: 'File rỗng hoặc không đọc được nội dung' }, { status: 400 });
    }

    // Ghi knowledge_chunks (bảng chat production đọc) + xóa cache câu trả lời cũ
    const inserted = await replaceChunks(filePath, title, chunks);
    // Đồng bộ bảng documents (BM25 backend local đọc khi reindex) — best-effort
    await upsertDocument(filePath, title, chunks);
    // Đồng bộ kho nguồn source_documents (migration 003) — best-effort
    await upsertSourceDocument(filePath, title);
    await clearAnswerCache();
    // Số liệu structured (moc_mien_thue_tncn_2026...) + compliance records có
    // thể đổi theo tài liệu mới → invalidate cả 2 cache
    invalidateStructuredCache();
    invalidateComplianceCache();
    // TỰ ĐỘNG EXTRACT COMPLIANCE — 2 tầng:
    //  1) Heuristic NGAY trong request (không LLM, <1s): chắc chắn có records
    //     cho tài liệu mới — kể cả nếu Vercel kill mọi thứ sau khi trả response.
    //     (waitUntil đôi khi không được giữ trong route handler App Router.)
    //  2) LLM refine chạy NỀN qua waitUntil: call LLM cho chunks đầu để ghi
    //     records chất lượng hơn (retry, abort, best-effort) — best-effort,
    //     nếu nền bị kill thì vẫn còn records heuristic ở tầng 1.
    await extractHeuristicThenUpsert(filePath, body);
    waitUntil(
      (async () => {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 55000); // dưới maxDuration 60s
        try {
          await autoExtractComplianceBounded(filePath, body, { signal: ac.signal });
        } catch {
          // Extract lỗi không được chặn upload (best-effort)
        } finally {
          clearTimeout(t);
        }
      })()
    );

    return NextResponse.json({ ok: true, chunks: inserted, title, file_path: filePath });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi xử lý file: ${msg}` }, { status: 500 });
  }
}
