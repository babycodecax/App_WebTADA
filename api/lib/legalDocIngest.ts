/**
 * legalDocIngest.ts — Logic thuần (pure) cho bảng landing_legal_docs.
 *
 * Biến file .docx thành hàng thư viện: mammoth.convertToHtml giữ nguyên bảng
 * biểu (đúng như bản Word nguồn), sinh title tiếng Việt chuẩn từ cấu trúc
 * VBPL (bảng tiêu đề QUỐC HỘI/CHÍNH PHỦ + anchor loai_1/loai_1_name), upsert
 * lên Supabase.
 *
 * Không import Next.js — unit-test trực tiếp bằng node --test (mock Supabase).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Cột public trả về từ bảng landing_legal_docs (không lộ nội bộ). */
export const LEGAL_DOCS_PUBLIC_FIELDS =
  'id,title,doc_type,doc_number,file_name,file_url,created_at';

/** Giới hạn danh sách văn bản luật trả về (thư viện riêng cũng không cần hết kho). */
export const LEGAL_DOCS_MAX_ROWS = 200;

export interface LegalDocPublicRow {
  id: string;
  title: string;
  doc_type: string;
  doc_number: string;
  file_name: string;
  file_url: string;
  created_at: string;
}

export interface LegalDocContentResult {
  title: string;
  file_html: string;
  error: string | null;
}

export interface LegalDocUpsertRow {
  title: string;
  doc_type: string;
  doc_number: string;
  file_html: string;
  file_name: string;
  file_url: string;
  is_active: boolean;
}

// =========================================================================
// Nhận diện loại văn bản (doc_type) — đồng bộ CHECK constraint source_documents
// =========================================================================

/** Loại văn bản luật hợp lệ (khớp LEGAL_DOC_TYPES trong libraryData.ts). */
export const LEGAL_DOC_TYPES = ['luat', 'nd', 'tt', 'nq', 'vbhn'] as const;

type LegalDocType = (typeof LEGAL_DOC_TYPES)[number] | 'other';

/** Nhận diện doc_type từ tên file: agency trong số hiệu (vd '109_2025_QH15' → luat).
 *  Dùng includes() — tên file thường có hậu tố '_665870' (dấu gạch dưới là word
 *  char, \b trước nó luôn fail). */
export function extractDocTypeFromFileName(fileName: string): LegalDocType {
  const up = (fileName || '').replace(/\.docx$/i, '').toUpperCase();
  if (up.includes('VBHN')) return 'vbhn';
  if (up.includes('ND-CP')) return 'nd';
  if (up.includes('TT-BTC')) return 'tt';
  if (/(?:^|_)QH1[0-9](?:_|$)/.test(up)) return 'luat';
  return 'other';
}

/** Số hiệu văn bản dự phòng từ TÊN FILE khi HTML không có bảng tiêu đề
 *  (đúng convention cổng VBPL):
 *  - Có năm:   '200_2026_ND-CP_999999' → '200/2026/ND-CP'
 *              'Thong-tu-77-2026-TT-BTC' → '77/2026/TT-BTC'
 *  - Không năm (VBHN): '67_VBHN-VPQH' → '67/VBHN-VPQH' */
export function docNumberFromFileName(fileName: string): string {
  const base = (fileName || '').replace(/\.docx$/i, '').replace(/[_-]\d{4,10}$/, '');
  // Ưu tiên dạng đầy đủ số/năm/cơ quan (tách bằng _ hoặc -)
  let m = /(\d{1,4})[_\-](\d{4})[_\-]([A-ZÀ-ỸĐ0-9][A-ZÀ-ỸĐ0-9\-]*)$/.exec(base);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`.toUpperCase();
  // Không có năm (VBHN): số + cơ quan
  m = /(\d{1,4})[_\-]([A-ZÀ-ỸĐ0-9][A-ZÀ-ỸĐ0-9\-]*)$/.exec(base);
  if (m) return `${m[1]}/${m[2]}`.toUpperCase();
  return '';
}

/** Label tiếng Việt đầy đủ theo loại văn bản (để ghép title). */
function docTypeLabel(docType: LegalDocType): string {
  switch (docType) {
    case 'luat': return 'Luật';
    case 'nd': return 'Nghị định';
    case 'tt': return 'Thông tư';
    case 'nq': return 'Nghị quyết';
    case 'vbhn': return 'VBHN';
    default: return 'Văn bản';
  }
}

/** Viết tắt tiếng Việt phổ biến giữ NGUYÊN CHỮ HOA khi chuyển tên văn bản
 *  sang dạng câu (vd BHXH, TNCN, GTGT...) — không lowercase như từ thường. */
const KNOWN_ABBR = new Set([
  'BHXH', 'BHYT', 'BHTN', 'TNCN', 'TNDN', 'GTGT', 'BCTC', 'HĐND', 'UBND',
  'HKD', 'KCN', 'TNHH', 'TTĐB', 'NSNN', 'CCCD', 'SĐT', 'MST', 'NQ', 'CCHN',
]);

/** Chuyển chuỗi viết hoa của VBPL sang DẠNG CÂU (vd 'THUẾ THU NHẬP CÁ NHÂN'
 *  → 'Thuế thu nhập cá nhân'): giữ nguyên token chứa số/dấu gạch (số hiệu,
 *  NĐ-CP...) và viết tắt quen thuộc; viết hoa chữ cái đầu chuỗi. */
function sentenceCaseVietnamese(raw: string): string {
  const tokens = raw.split(' ');
  let first = true;
  const out = tokens.map((tok) => {
    if (!tok) return tok;
    // Token chứa số hoặc dấu gạch (số hiệu, NĐ-CP, TT-BTC...) — giữ nguyên
    if (/[0-9-]/.test(tok)) return tok;
    const upper = tok.replace(/[.,;:]/g, '').toUpperCase();
    if (KNOWN_ABBR.has(upper)) return tok;
    const lower = tok.toLowerCase();
    if (first) {
      first = false;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    return lower;
  });
  return out.join(' ');
}

// =========================================================================
// Trích thông tin từ HTML (mammoth.convertToHtml)
// =========================================================================

/** Số hiệu văn bản từ bảng tiêu đề, vd "Luật số: 109/2025/QH15" → "109/2025/QH15".
 *  Charset có Đ (NĐ-CP) + dấu tiếng Việt trong mã VBPL. */
const HEADER_DOC_NUMBER_RE = /(?:Luật|Nghị định|Thông tư|Nghị quyết|Số)\s*số?\s*:\s*(\d{1,4}\/[0-9]{4}\/[A-ZÀ-ỸĐ0-9-]+)/i;

/** Số hiệu dạng "Số: 141/2026/NĐ-CP" (VBHN: "Số: 67/VBHN-VPQH" — không có năm). */
const HEADER_NUMBER_RE = /(?:Số|số)\s*:\s*(\d{1,4}(?:\/[0-9]{4})?\/[A-ZÀ-ỸĐ0-9-]+)/i;

/** Anchor loại văn bản của VBPL: <a id="loai_1"></a><strong>LUẬT</strong> */
const LOAI_ANCHOR_RE = /<a\s+id="loai_1"\s*><\/a>\s*(?:<[^>]+>)*([A-ZÀ-ỸĂÂĐÊÔƠƯ\s]{3,40})/i;

/** Anchor tên văn bản: <a id="loai_1_name"></a>...TÊN VĂN BẢN... (có thể strong/trần). */
const NAME_ANCHOR_RE = /<a\s+id="loai_1_name"\s*><\/a>\s*(?:<[^>]+>)*([^<]+)/i;

/** File manual (không qua cổng VBPL) không có anchor — loại văn bản là 1
 *  <strong> đứng riêng, vd <p><strong>THÔNG TƯ</strong></p>. Ưu tiên keyword
 *  dài/đặc trưng trước (LUẬT dễ khớp nhầm trong "Căn cứ Luật..."). */
const STANDALONE_TYPE_RE =
  /<strong>\s*(VĂN BẢN HỢP NHẤT|BỘ LUẬT|NGHỊ ĐỊNH|NGHỊ QUYẾT|THÔNG TƯ|LUẬT)\s*<\/strong>/i;

/** Nội dung văn bản không thể là tên (dòng "Căn cứ ..." mở đầu). */
const NOT_NAME_RE = /^căn\s+cứ/i;

/** Bỏ thẻ HTML + thực thể + nén khoảng trắng → text thuần. */
function stripHtml(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rút gọn tên văn bản: giữ tối đa ~180 ký tự, cắt đứt từ hợp lệ, thêm '…'. */
function shortenTitle(s: string, maxLen = 180): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  let cut = t.slice(0, maxLen);
  const sp = cut.lastIndexOf(' ');
  if (sp > maxLen * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[,\s]+$/, '') + '…';
}

/**
 * extractLegalTitleFromHtml — sinh title tiếng Việt chuẩn từ HTML của 1 file .docx.
 *
 * Cấu trúc VBPL (mammoth giữ nguyên):
 *   1. Bảng tiêu đề: "Luật số: 109/2025/QH15" | "Số: 141/2026/NĐ-CP"
 *   2. <a id="loai_1"></a> → loại văn bản (LUẬT / NGHỊ ĐỊNH / THÔNG TƯ...)
 *   3. <a id="loai_1_name"></a> → tên văn bản
 *
 * Title kết quả: "{Loại} {Tên} {số hiệu}" (vd "Luật Thuế thu nhập cá nhân 109/2025/QH15").
 * Fallback nếu thiếu anchor: theo tên file + số hiệu lấy từ bảng tiêu đề.
 *
 * @returns { title, doc_type, doc_number } — doc_type fallback theo tên file.
 */
export function extractLegalTitleFromHtml(
  html: string,
  fileName: string
): { title: string; doc_type: LegalDocType; doc_number: string } {
  const h = html || '';

  // 1. Số hiệu — ưu tiên dạng đầy đủ (Luật số: 109/2025/QH15), fallback "Số: ..."
  //    → cuối cùng fallback từ tên file (HTML không có bảng tiêu đề).
  let docNumber = '';
  let m = HEADER_DOC_NUMBER_RE.exec(stripHtml(h));
  if (!m) m = HEADER_NUMBER_RE.exec(stripHtml(h));
  if (m) docNumber = m[1].toUpperCase();
  else docNumber = docNumberFromFileName(fileName);

  // 2. Loại văn bản:
  //    - Tên file VBHN có 'VBHN' → giữ 'vbhn' (anchor loai_1 trong file VBHN
  //      là 'LUẬT' gốc — sai loại thực tế, ưu tiên tên file).
  //    - Ngược lại: ưu tiên anchor loai_1 (đúng thực tế văn bản, vd NQ 198/
  //      2025/QH15 là NGHỊ QUYẾT chứ không phải Luật), fallback <strong> đứng
  //      riêng (file manual), cuối cùng theo tên file.
  let docType: LegalDocType = extractDocTypeFromFileName(fileName);
  // VBHN: anchor loai_1 là 'LUẬT' gốc (sai loại thực tế) — tuyệt đối không ghi đè
  const rawType = docType === 'vbhn' ? '' : (() => {
    const a = LOAI_ANCHOR_RE.exec(h);
    if (a) return a[1].trim().toUpperCase();
    const s = STANDALONE_TYPE_RE.exec(h);
    if (s) return s[1].toUpperCase();
    return '';
  })();
  if (rawType === 'LUẬT' || rawType === 'BỘ LUẬT') docType = 'luat';
  else if (rawType === 'NGHỊ ĐỊNH') docType = 'nd';
  else if (rawType === 'THÔNG TƯ') docType = 'tt';
  else if (rawType === 'NGHỊ QUYẾT') docType = 'nq';
  else if (rawType === 'VĂN BẢN HỢP NHẤT') docType = 'vbhn';

  // 3. Tên văn bản — anchor loai_1_name, bỏ dòng "Căn cứ..." mở đầu.
  //    File manual không có anchor → khối <strong> ngay sau <strong> loại văn
  //    bản (vd <strong>THÔNG TƯ</strong></p><p><strong>Quy định một số điều...
  //    của Luật Quản lý thuế...</strong>).
  let name = '';
  const nameMatch = NAME_ANCHOR_RE.exec(h);
  if (nameMatch) {
    const candidate = stripHtml(nameMatch[1]);
    if (candidate && !NOT_NAME_RE.test(candidate)) name = candidate;
  }
  if (!name) {
    const m = STANDALONE_TYPE_RE.exec(h);
    if (m) {
      const after = h.slice(m.index + m[0].length);
      const nextStrong = /<\/p>\s*<p[^>]*>\s*<strong>\s*([^<]{5,})<\/strong>/i.exec(after);
      if (nextStrong) {
        const candidate = stripHtml(nextStrong[1]);
        if (candidate && !NOT_NAME_RE.test(candidate)) name = candidate;
      }
    }
  }
  // VBHN: tên rút gọn chỉ là "DOANH NGHIỆP"/"THUẾ..." — không cần sentence-case
  // (sẽ ghép "Luật Doanh nghiệp 67/VBHN-VPQH"). Các loại khác: chuẩn dạng câu.
  if (name && docType !== 'vbhn') {
    name = sentenceCaseVietnamese(name);
  }

  // 4. Ghép title
  //    BỘ LUẬT (vd Bộ luật Dân sự): doc_type = luat nhưng label giữ 'Bộ luật'.
  const label = docTypeLabel(docType);
  const isBoLuat = /<a\s+id="loai_1"\s*><\/a>\s*(?:<[^>]+>)*BỘ LUẬT/i.test(h);
  const titleLabel = isBoLuat ? 'Bộ luật' : label;
  let title: string;
  if (name) {
    // Rút gọn TÊN trước (số hiệu luôn giữ nguyên ở cuối — không bị cắt)
    const namePart = shortenTitle(name, 140);
    // VBHN: tên là "DOANH NGHIỆP" (rút gọn) — giữ "Luật Doanh nghiệp 67/VBHN-VPQH"
    const base = docType === 'vbhn'
      ? `Luật ${sentenceCaseVietnamese(namePart)}`
      : `${titleLabel} ${namePart}`;
    title = docNumber ? `${base} ${docNumber}` : base;
  } else {
    // Fallback: tên file (bỏ số cuối của cổng VBPL, vd '_665870')
    const baseName = fileName
      .replace(/\.docx$/i, '')
      .replace(/[_-]\d{4,10}$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    // Tên file chứa sẵn số hiệu (vd '141_2026_ND-CP') — không ghép lại số trùng
    const hasDocNumber = /\d{1,4}\/\d{4}\/[A-ZÀ-ỸĐ0-9-]+/i.test(baseName);
    title = docNumber && !hasDocNumber
      ? `${titleLabel} ${baseName} ${docNumber}`
      : `${titleLabel} ${baseName}`;
  }

  return { title: shortenTitle(title), doc_type: docType, doc_number: docNumber };
}

// =========================================================================
// Ghép payload upsert
// =========================================================================

export interface LegalDocInput {
  html: string;
  title: string;
  doc_type: LegalDocType;
  doc_number: string;
  fileName: string;
  fileUrl: string;
}

/** Ghép row upsert hoàn chỉnh cho bảng landing_legal_docs. */
export function buildLegalDocRow(input: LegalDocInput): LegalDocUpsertRow {
  return {
    title: (input.title || '').trim(),
    doc_type: input.doc_type,
    doc_number: (input.doc_number || '').trim(),
    file_html: input.html || '',
    file_name: (input.fileName || '').trim(),
    file_url: (input.fileUrl || '').trim(),
    is_active: true,
  };
}

/** Map row DB → shape public cho frontend (luôn trả đủ cột, không null). */
export function mapLegalDocRow(row: Record<string, unknown>): LegalDocPublicRow {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    doc_type: String(row.doc_type || 'other'),
    doc_number: String(row.doc_number || ''),
    file_name: String(row.file_name || ''),
    file_url: String(row.file_url || ''),
    created_at: String(row.created_at || ''),
  };
}

// =========================================================================
// Supabase access
// =========================================================================

/** fetchLegalDocs — danh sách văn bản luật (bảng landing_legal_docs, is_active). */
export async function fetchLegalDocs(sb: SupabaseClient): Promise<LegalDocPublicRow[]> {
  try {
    const { data, error } = await sb
      .from('landing_legal_docs')
      .select(LEGAL_DOCS_PUBLIC_FIELDS)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(LEGAL_DOCS_MAX_ROWS);
    if (error) {
      console.error(`[legalDocIngest] Lỗi query landing_legal_docs: ${error.message}`);
      return [];
    }
    return ((data || []) as Record<string, unknown>[]).map(mapLegalDocRow);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    console.error(`[legalDocIngest] fetchLegalDocs lỗi: ${msg}`);
    return [];
  }
}

/** fetchLegalDocContent — toàn văn 1 văn bản (file_html giữ bảng biểu) theo id. */
export async function fetchLegalDocContent(
  sb: SupabaseClient,
  id: string
): Promise<LegalDocContentResult> {
  const cleanId = (id || '').trim();
  if (!cleanId) return { title: '', file_html: '', error: 'Thiếu id' };

  try {
    const { data, error } = await sb
      .from('landing_legal_docs')
      .select('title,file_html')
      .eq('id', cleanId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (error) return { title: '', file_html: '', error: error.message };
    if (!data) return { title: '', file_html: '', error: 'Không tìm thấy văn bản' };

    const row = data as { title?: string; file_html?: string };
    return {
      title: String(row.title || ''),
      file_html: String(row.file_html || ''),
      error: null,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return { title: '', file_html: '', error: `Lỗi lấy nội dung: ${msg}` };
  }
}

/** Upsert 1 văn bản vào landing_legal_docs (best-effort — lỗi không throw). */
export async function upsertLegalDoc(
  sb: SupabaseClient,
  row: LegalDocUpsertRow
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await sb
      .from('landing_legal_docs')
      .upsert(row, { onConflict: 'file_name' });
    if (error) {
      console.warn(`[legalDocIngest] upsert landing_legal_docs bỏ qua: ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    console.warn(`[legalDocIngest] upsert landing_legal_docs lỗi: ${msg}`);
    return { ok: false, error: msg };
  }
}

/** Xóa 1 văn bản khỏi landing_legal_docs (best-effort, dùng khi admin xóa nguồn). */
export async function deleteLegalDoc(
  sb: SupabaseClient,
  fileName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await sb
      .from('landing_legal_docs')
      .delete()
      .eq('file_name', (fileName || '').trim());
    if (error) {
      console.warn(`[legalDocIngest] xóa landing_legal_docs bỏ qua: ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    console.warn(`[legalDocIngest] xóa landing_legal_docs lỗi: ${msg}`);
    return { ok: false, error: msg };
  }
}
