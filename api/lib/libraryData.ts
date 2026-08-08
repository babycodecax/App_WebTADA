/**
 * libraryData.ts — Logic thuần (pure) cho Thư viện Biểu mẫu & Văn bản Luật.
 *
 * Tách rời khỏi route handler để unit-test trực tiếp bằng node --test
 * (không cần môi trường Next.js, không cần .env — mock Supabase client).
 *
 * - fetchLibrary(): 3 query (landing_forms active + source_documents legal
 *   + landing_legal_docs — toàn văn HTML từ .docx)
 * - validateFormInput() / validateFormUpdate(): validate payload admin
 * - mapFormRow() / mapLegalRow(): shape trả về cho frontend
 * - generateLegalTitle(): sinh tiêu đề tiếng Việt đầy đủ từ nội dung văn bản
 *   (source_documents.title thường là tên file thô, vd 'tt-94-2026')
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchLegalDocs,
  type LegalDocPublicRow,
} from './legalDocIngest.ts';

/** Loại văn bản luật được hiển thị trên landing (khớp CHECK constraint của source_documents). */
export const LEGAL_DOC_TYPES = ['luat', 'nd', 'tt', 'nq', 'vbhn'] as const;

/** Cột lấy từ landing_forms cho public API (không lộ nội bộ sort_order/is_active). */
export const FORM_PUBLIC_FIELDS = 'id,name,description,file_name,file_url,file_type,file_size';

/** Cột lấy từ source_documents cho public API. */
export const LEGAL_FIELDS = 'id,title,doc_type,effective_date,file_path';

/** Giới hạn danh sách văn bản luật trả về (trang chủ không cần toàn bộ kho). */
export const LEGAL_MAX_ROWS = 100;

export interface FormPublicRow {
  id: string;
  name: string;
  description: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
}

export interface LegalPublicRow {
  id: string;
  title: string;
  doc_type: string;
  effective_date: string;
  file_path: string;
}

export interface LibraryResult {
  forms: FormPublicRow[];
  legal_documents: LegalPublicRow[];
  /** Văn bản luật toàn văn HTML (bảng landing_legal_docs — parse .docx bằng mammoth). */
  legal_docs: LegalDocPublicRow[];
  error: string | null;
}

export interface LegalContentRow {
  title: string;
  heading: string;
  content: string;
}

export interface LegalContentResult {
  file_path: string;
  title: string;
  content: string;
  chunk_count: number;
  error: string | null;
}

/** Giới hạn số chunks ghép lại cho 1 văn bản luật (đủ cho toàn bộ luật dài). */
export const LEGAL_CONTENT_MAX_CHUNKS = 2000;

// =========================================================================
// Sinh tiêu đề tiếng Việt cho văn bản luật
// =========================================================================

/** Từ khóa mở đầu của văn bản luật tiếng Việt (để nhận diện title đã "chuẩn"). */
const LEGAL_DOC_KEYWORDS =
  /^(luật|nghị định|thông tư|nghị quyết|văn bản hợp nhất|quyết định|chỉ thị|thông tư liên tịch|luật số|thông tư số|nghị định số)/i;

/** Pattern số hiệu văn bản, vd "94/2026/TT-BTC", "141/2026/NĐ-CP", "109/2025/QH15". */
const DOC_NUMBER_RE = /\d{1,3}\/\d{4}\/[A-Z0-9-]+/;

/** Tiền tố tên loại văn bản (dài + viết tắt) để nhận diện tiêu đề văn bản thật
 *  (vd "NĐ 141/2026 — ...", "TT 87/2026 — ...", "Luật 149/2025/QH15 — ..."),
 *  loại bỏ heading bài/điều (vd "Điều 22. Biểu thuế lũy tiến", "Tóm tắt").
 *  KHÔNG dùng \b — 'đ'/'Đ' không phải word char của JS regex, \b sau nó luôn fail. */
const DOC_TITLE_PREFIX_RE =
  /^(luật|nghị định|thông tư|nghị quyết|văn bản hợp nhất|quyết định|chỉ thị|vbhn|nd|nđ|tt|nq|qd|ct)(?=\s|$)/i;

/** Kiểm tra chuỗi có phải tiêu đề VĂN BẢN (không phải heading con bài/điều). */
function isDocTitle(headingSeg: string): boolean {
  return DOC_TITLE_PREFIX_RE.test(headingSeg) && /\d/.test(headingSeg);
}

/** Hàm tiện: cắt bỏ tiền tố không mong muốn, trim, giới hạn độ dài hiển thị. */
function cleanTitle(raw: string, maxLen = 200): string {
  let t = raw
    .replace(/^[#>\s]+/, '')          // bỏ heading markdown / blockquote
    .replace(/\s+/g, ' ')             // nén khoảng trắng
    .replace(/\s+[|»]\s*$/, '')       // bỏ đuôi bảng/đường dẫn
    .trim();
  if (t.length > maxLen) t = t.slice(0, maxLen).trim() + '…';
  return t;
}

/**
 * Kiểm tra chuỗi có phải "tên file thô" không (vd 'tt-94-2026', 'nd-253-2026-tncn').
 * Title hợp lệ phải chứa từ khóa loại văn bản hoặc có dấu tiếng Việt / số hiệu văn bản.
 * Dấu tiếng Việt được phát hiện qua Unicode NFD (tách combining marks) — chống
 * thiếu ký tự khi viết tay danh sách nguyên âm.
 */
export function isRawFilenameTitle(title: string): boolean {
  const t = (title || '').trim();
  if (!t) return true;
  // Có số hiệu văn bản (94/2026/TT-BTC...) → title thật
  if (DOC_NUMBER_RE.test(t)) return false;
  // Có từ khóa loại văn bản → title thật
  if (LEGAL_DOC_KEYWORDS.test(t)) return false;
  // Có ký tự tiếng Việt (dấu hoặc đ) → title thật
  const nfd = t.normalize('NFD');
  if (nfd !== t || /đ/i.test(t)) return false;
  // Không khớp gì → nghi là tên file thô
  return true;
}

/** Trích tiêu đề từ frontmatter (title: / source:) của 1 chunk content (chunk 0 thường chứa frontmatter gốc). */
export function extractTitleFromFrontmatter(content: string): { title: string; source: string } {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!m) return { title: '', source: '' };
  const fm = m[1];
  const tMatch = /^title:\s*(.+)$/m.exec(fm);
  const sMatch = /^source:\s*(.+)$/m.exec(fm);
  return {
    title: tMatch ? tMatch[1].trim().replace(/^["']|["']$/g, '') : '',
    source: sMatch ? sMatch[1].trim().replace(/^["']|["']$/g, '') : '',
  };
}

/**
 * Trích tiêu đề văn bản từ heading chuỗi dạng "NĐ 141/2026 — Sửa đổi thuế hộ KD... > Tóm tắt":
 * phần trước dấu " > " đầu tiên là tiêu đề văn bản, phần sau là heading con.
 */
export function extractDocTitleFromHeading(heading: string): string {
  const h = (heading || '').trim();
  if (!h) return '';
  const firstSeg = h.split(' > ')[0].trim();
  return cleanTitle(firstSeg);
}

/**
 * generateLegalTitle — sinh tiêu đề tiếng Việt đầy đủ cho văn bản luật.
 *
 * Ưu tiên (từ tốt → fallback):
 *   1. source_documents.title nếu đã "chuẩn" (không phải tên file thô)
 *   2. frontmatter `source:` có loại văn bản + số hiệu (vd "Thông tư 94/2026/TT-BTC")
 *   3. frontmatter `title:`
 *   4. heading chunk đầu tiên có tiêu đề (vd "NĐ 141/2026 — Sửa đổi thuế hộ KD...")
 *   5. fallback: file_path (basename) như hiện tại
 *
 * @param storedTitle  title lưu trong source_documents (thường thô)
 * @param chunks       chunks của văn bản (chunk[0] thường chứa frontmatter; heading chứa tiêu đề)
 * @param filePath     file_path fallback
 */
export function generateLegalTitle(
  storedTitle: string,
  chunks: { content?: string; heading?: string; title?: string }[],
  filePath: string
): string {
  const fp = (filePath || '').trim();
  const fallback = fp.split('/').pop() || fp || 'Văn bản luật';

  // 1. Title đã chuẩn trong DB
  if (!isRawFilenameTitle(storedTitle)) return storedTitle.trim();

  // 2-4. Từ chunks (frontmatter source/title + heading)
  const first = chunks?.[0] || {};
  const fm = extractTitleFromFrontmatter(typeof first.content === 'string' ? first.content : '');

  // 2. source: tên chính thức (vd "Thông tư 94/2026/TT-BTC") — chỉ dùng khi có
  //    từ khóa loại văn bản + số hiệu (loại "109/2025/QH15 (Quốc hội)" trần).
  if (
    fm.source &&
    fm.source.length >= 5 &&
    LEGAL_DOC_KEYWORDS.test(fm.source) &&
    DOC_NUMBER_RE.test(fm.source)
  ) {
    const s = cleanTitle(fm.source);
    if (s && !isRawFilenameTitle(s)) return s;
  }

  // 3. frontmatter title (vd "Luật Thuế TNCN 2025", "TT 94/2026 — Điều 1...")
  if (fm.title && fm.title.length >= 8 && !isRawFilenameTitle(fm.title)) return cleanTitle(fm.title);

  // 4. Heading đầu tiên có tiêu đề văn bản (phần trước " > ") — bắt buộc khớp
  //    tiền tố loại văn bản (vd "NĐ 141/2026 — ...", "TT 87/2026 — ...") để loại
  //    heading con ("Tóm tắt", "Điều 22. Biểu thuế lũy tiến"...).
  for (const c of chunks || []) {
    if (!c.heading) continue;
    const docTitle = extractDocTitleFromHeading(c.heading);
    if (docTitle.length >= 8 && isDocTitle(docTitle) && !isRawFilenameTitle(docTitle)) {
      return docTitle;
    }
  }

  // 4b. chunk.title (tiêu đề gắn khi ingest, vd "TT 94/2026 — Điều 1. Phạm vi điều chỉnh",
  //     "Luật Thuế TNCN") — dùng nếu khớp loại văn bản (có số hiệu hoặc từ khóa luật).
  for (const c of chunks || []) {
    const ct = cleanTitle(typeof c.title === 'string' ? c.title : '', 120);
    if (!ct || ct.length < 8 || isRawFilenameTitle(ct)) continue;
    const seg = ct.split(/[—–-]/)[0].trim();
    if (isDocTitle(seg) || LEGAL_DOC_KEYWORDS.test(ct)) return ct;
  }

  // 5. Fallback
  return fallback;
}

export function mapFormRow(row: Record<string, unknown>): FormPublicRow {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    description: String(row.description || ''),
    file_name: String(row.file_name || ''),
    file_url: String(row.file_url || ''),
    file_type: String(row.file_type || ''),
    file_size: typeof row.file_size === 'number' && Number.isFinite(row.file_size) ? row.file_size : 0,
  };
}

export function mapLegalRow(row: Record<string, unknown>): LegalPublicRow {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    doc_type: String(row.doc_type || ''),
    effective_date: String(row.effective_date || ''),
    file_path: String(row.file_path || ''),
  };
}

/**
 * Lấy vài chunk đầu (0..5) của từng văn bản để sinh tiêu đề tiếng Việt.
 * Chunk 0 thường chứa frontmatter gốc (source: Thông tư 94/2026/TT-BTC...),
 * heading chứa tiêu đề văn bản. Trả về map file_path → chunks (đã sort).
 */
async function fetchFirstChunksByPath(
  sb: SupabaseClient,
  filePaths: string[]
): Promise<Map<string, { content: string; heading: string }[]>> {
  const map = new Map<string, { content: string; heading: string }[]>();
  if (!filePaths.length) return map;

  const { data, error } = await sb
    .from('knowledge_chunks')
    .select('file_path, content, heading, chunk_index')
    .in('file_path', filePaths)
    .lt('chunk_index', 6)
    .order('chunk_index', { ascending: true });
  if (error) return map;

  for (const row of (data || []) as Record<string, unknown>[]) {
    const fp = String(row.file_path || '');
    if (!fp) continue;
    const list = map.get(fp) || [];
    list.push({ content: String(row.content || ''), heading: String(row.heading || '') });
    map.set(fp, list);
  }
  return map;
}

/** Chạy song song 2 query, map shape, gộp lỗi đầu tiên (nếu có). */
export async function fetchLibrary(sb: SupabaseClient): Promise<LibraryResult> {
  const formsQuery = sb
    .from('landing_forms')
    .select(FORM_PUBLIC_FIELDS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  const legalQuery = sb
    .from('source_documents')
    .select(LEGAL_FIELDS)
    .eq('source_origin', 'vault')
    .eq('status', 'ready')
    .in('doc_type', [...LEGAL_DOC_TYPES])
    .order('updated_at', { ascending: false })
    .limit(LEGAL_MAX_ROWS);

  // Lấy title chuẩn tiếng Việt từ bảng documents (được ingest từ frontmatter),
  // key theo basename file_path — source_documents.title thường là tên file thô.
  const docTitlesQuery = sb
    .from('documents')
    .select('file_path,title')
    .limit(2000);

  const [formsRes, legalRes, docTitlesRes, legalDocsRes] = await Promise.all([
    formsQuery,
    legalQuery,
    docTitlesQuery,
    fetchLegalDocs(sb),
  ]);
  if (formsRes.error) return { forms: [], legal_documents: [], legal_docs: [], error: formsRes.error.message };
  if (legalRes.error) return { forms: [], legal_documents: [], legal_docs: [], error: legalRes.error.message };

  // Map basename(file_path) → title chuẩn tiếng Việt (documents dùng path tuyệt đối)
  const docTitleByBasename = new Map<string, string>();
  for (const d of (docTitlesRes.data || []) as Record<string, unknown>[]) {
    const p = String(d.file_path || '').replace(/\\/g, '/');
    const base = p.split('/').pop() || '';
    const t = String(d.title || '').trim();
    if (base && t) docTitleByBasename.set(base, t);
  }

  const rawLegal = (legalRes.data || []) as Record<string, unknown>[];
  const filePaths = rawLegal.map((r) => String(r.file_path || ''));
  // Sinh tiêu đề tiếng Việt từ nội dung (1 query bổ sung, best-effort)
  const firstChunks = await fetchFirstChunksByPath(sb, filePaths);

  const legal_documents = rawLegal.map((r) => {
    const row = mapLegalRow(r);
    const chunks = firstChunks.get(row.file_path) || [];
    // Ưu tiên title chuẩn từ documents table (basename khớp)
    const base = row.file_path.split('/').pop() || '';
    const docTitle = docTitleByBasename.get(base) || '';
    if (docTitle && !isRawFilenameTitle(docTitle)) {
      return { ...row, title: cleanTitle(docTitle) };
    }
    return { ...row, title: generateLegalTitle(row.title, chunks, row.file_path) };
  });

  return {
    forms: ((formsRes.data || []) as Record<string, unknown>[]).map(mapFormRow),
    legal_documents,
    legal_docs: legalDocsRes,
    error: null,
  };
}

/**
 * fetchLegalContent — nội dung toàn văn 1 văn bản luật cho public viewer.
 *
 * Ghép các chunks (knowledge_chunks) theo chunk_index thành 1 khối markdown:
 *   - chunks có heading → tiêu đề phụ `## heading` (điều/khoản giữ cấu trúc);
 *   - content giữ nguyên bảng markdown (| cột |) — không biến đổi gì.
 * Tiêu đề: ưu tiên title đã chuẩn trong source_documents → sinh từ frontmatter/
 * heading trong chunks (generateLegalTitle) → fallback file_path.
 * Không cần auth (public), không đọc file gốc — Vercel không có vault/.
 *
 * @returns LegalContentResult — error null khi thành công (content có thể rỗng).
 */
export async function fetchLegalContent(
  sb: SupabaseClient,
  filePath: string
): Promise<LegalContentResult> {
  const fp = filePath.trim();
  if (!fp) {
    return { file_path: fp, title: '', content: '', chunk_count: 0, error: 'Thiếu file_path' };
  }

  try {
    // Đọc title đã lưu trong source_documents (thường thô nhưng có thể đã chuẩn)
    const storedTitle = await fetchStoredTitle(sb, fp);

    let { data: chunks, error } = await sb
      .from('knowledge_chunks')
      .select('content, heading, title, chunk_index')
      .eq('file_path', fp)
      .order('chunk_index', { ascending: true })
      .limit(LEGAL_CONTENT_MAX_CHUNKS);

    if (error) return { file_path: fp, title: '', content: '', chunk_count: 0, error: error.message };

    // File điều (vd tt-94-2026-dieu-1.md) thường không có chunks riêng —
    // chunks nằm ở file tổng (vd tt-94-2026.md). Fallback: bỏ hậu tố '-dieu-N'.
    let list = (chunks || []) as LegalContentRow[];
    if (!list.length) {
      const baseFp = fp.replace(/-dieu-\d+\.md$/i, '.md');
      if (baseFp !== fp) {
        const { data: baseChunks, error: baseErr } = await sb
          .from('knowledge_chunks')
          .select('content, heading, title, chunk_index')
          .eq('file_path', baseFp)
          .order('chunk_index', { ascending: true })
          .limit(LEGAL_CONTENT_MAX_CHUNKS);
        if (!baseErr) list = (baseChunks || []) as LegalContentRow[];
      }
    }

    const title = generateLegalTitle(storedTitle, list, fp);

    let body = '';
    for (const c of list) {
      const block = c.heading ? `## ${c.heading}\n\n${c.content}` : c.content;
      body += block.trim() + '\n\n';
    }
    // Bỏ frontmatter (--- title:... ---) ở đầu nếu có — không hiển thị cho người dùng.
    // Nội dung có thể dùng \r\n (CRLF) — khớp cả 2.
    body = body.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\s*/m, '');

    return { file_path: fp, title, content: body.trim(), chunk_count: list.length, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return { file_path: fp, title: '', content: '', chunk_count: 0, error: `Lỗi lấy nội dung: ${msg}` };
  }
}

/** Đọc title lưu trong source_documents theo file_path (best-effort, rỗng nếu lỗi/không có). */
async function fetchStoredTitle(sb: SupabaseClient, filePath: string): Promise<string> {
  try {
    const { data, error } = await sb
      .from('source_documents')
      .select('title')
      .eq('file_path', filePath)
      .limit(1)
      .maybeSingle();
    if (error) return '';
    const title = (data as { title?: string } | null)?.title;
    return typeof title === 'string' ? title : '';
  } catch {
    return '';
  }
}

// =========================================================================
// Validate payload admin — fail fast, thông báo tiếng Việt
// =========================================================================

export interface FormInput {
  name: string;
  description: string;
  file_name: string;
  file_path: string;
  file_url: string;
  file_type: string;
  file_size: number;
  sort_order: number;
  is_active: boolean;
}

export type ValidateResult<T> = { ok: true; data: T } | { ok: false; error: string };

const NAME_MAX = 300;
const DESC_MAX = 2000;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** POST /api/admin/forms — bắt buộc name + file_url; các trường khác có mặc định. */
export function validateFormInput(body: unknown): ValidateResult<FormInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Thiếu dữ liệu biểu mẫu' };
  }
  const b = body as Record<string, unknown>;

  const name = str(b.name);
  if (!name) return { ok: false, error: 'Thiếu tên biểu mẫu (name)' };
  if (name.length > NAME_MAX) return { ok: false, error: `Tên biểu mẫu quá dài (tối đa ${NAME_MAX} ký tự)` };

  const description = str(b.description);
  if (description.length > DESC_MAX) return { ok: false, error: `Mô tả quá dài (tối đa ${DESC_MAX} ký tự)` };

  const fileUrl = str(b.file_url);
  if (!fileUrl) return { ok: false, error: 'Thiếu file_url — hãy tải file lên Storage trước' };

  const fileSize = typeof b.file_size === 'number' && Number.isFinite(b.file_size) && b.file_size > 0
    ? Math.floor(b.file_size)
    : 0;
  const sortOrder = typeof b.sort_order === 'number' && Number.isFinite(b.sort_order)
    ? Math.floor(b.sort_order)
    : 0;

  return {
    ok: true,
    data: {
      name,
      description,
      file_name: str(b.file_name),
      file_path: str(b.file_path),
      file_url: fileUrl,
      file_type: str(b.file_type),
      file_size: fileSize,
      sort_order: sortOrder,
      is_active: b.is_active !== false,
    },
  };
}

/** PUT /api/admin/forms — bắt buộc id; các trường còn lại tùy chọn (patch từng phần). */
export function validateFormUpdate(body: unknown): ValidateResult<{ id: string; patch: Record<string, unknown> }> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Thiếu dữ liệu cập nhật' };
  }
  const b = body as Record<string, unknown>;

  const id = str(b.id);
  if (!id) return { ok: false, error: 'Thiếu id biểu mẫu' };

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = str(b.name);
    if (!name) return { ok: false, error: 'Tên biểu mẫu không được rỗng' };
    if (name.length > NAME_MAX) return { ok: false, error: `Tên biểu mẫu quá dài (tối đa ${NAME_MAX} ký tự)` };
    patch.name = name;
  }
  if (b.description !== undefined) {
    const description = str(b.description);
    if (description.length > DESC_MAX) return { ok: false, error: `Mô tả quá dài (tối đa ${DESC_MAX} ký tự)` };
    patch.description = description;
  }
  if (b.sort_order !== undefined) {
    if (typeof b.sort_order !== 'number' || !Number.isFinite(b.sort_order)) {
      return { ok: false, error: 'sort_order phải là số' };
    }
    patch.sort_order = Math.floor(b.sort_order);
  }
  if (b.is_active !== undefined) {
    if (typeof b.is_active !== 'boolean') return { ok: false, error: 'is_active phải là boolean' };
    patch.is_active = b.is_active;
  }
  if (b.file_url !== undefined) patch.file_url = str(b.file_url);
  if (b.file_name !== undefined) patch.file_name = str(b.file_name);
  if (b.file_type !== undefined) patch.file_type = str(b.file_type);
  if (b.file_size !== undefined) {
    if (typeof b.file_size !== 'number' || !Number.isFinite(b.file_size)) {
      return { ok: false, error: 'file_size phải là số' };
    }
    patch.file_size = Math.floor(b.file_size);
  }

  return { ok: true, data: { id, patch } };
}
