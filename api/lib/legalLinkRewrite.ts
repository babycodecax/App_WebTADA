/**
 * legalLinkRewrite.ts — Chuyển tham chiếu số hiệu văn bản luật trong nội dung
 * bài viết thành link nội bộ trang toàn văn (/van-ban/<id>).
 *
 * Yêu cầu user 2026-11-01: "khi nhấn vào link căn cứ pháp lý ở nội dung bài
 * viết sẽ dẫn nguồn ngay chính web TADA chứ không phải tìm qua Google" —
 * trước đây số hiệu (108/2025/QH15...) là chữ trơn trong 112 bài.
 *
 * Quy tắc:
 * - Chỉ link LẦN ĐẦU mỗi số hiệu trong 1 bài (Wikipedia-style, tránh rừng link).
 * - Chuẩn hóa khớp: bỏ số 0 đầu (0108 = 108), bỏ dấu/ký tự phân cách
 *   (NĐ-CP = ND-CP), so khớp với doc_number trong landing_legal_docs.
 * - Số hiệu có thể bị ngắt dòng giữa chốt (".../N\nĐ-CP") — thử ứng viên từ
 *   dài tới ngắn, khớp đầu tiên thắng, phần thừa giữ nguyên text.
 * - KHÔNG đụng text TRONG anchor sẵn có / <pre> / <code>.
 * - Không docs → trả nguyên văn (an toàn khi bảng trống).
 */

/** Bản ghi tối thiểu cần để link: id trang + số hiệu. */
export interface LegalIndexDoc {
  id: string;
  doc_number: string;
}

/** Token số hiệu cần xét, có thể kèm tối đa 2 cụm theo sau bị ngắt giữa chốt. */
const DOC_TOKEN_RE =
  /\b\d{1,4}\/\d{4}\/[^\s<>()\[\]{}"'`]+(?:[ \n\t]+[^\s<>()\[\]{}"'`]+){0,2}/g;

/** Chuẩn hóa 1 số hiệu thành key so khớp: uppercase, hợp nhất Đ→D (NĐ-CP =
 *  ND-CP), bỏ mọi ký tự phi chữ số, bỏ số 0 đầu nhóm đầu (0108 → 108). */
export function normalizeDocKey(docNumber: string): string {
  let s = (docNumber || '').toUpperCase().replace(/Đ/g, 'D').replace(/[^A-Z0-9]/g, '');
  s = s.replace(/^0+(?=\d)/, '');
  return s;
}

const PROTECTED_RE = /(<a[\s\S]*?<\/a>)|(<pre[\s\S]*?<\/pre>)|(<code[\s\S]*?<\/code>)/gi;

/** Kết quả khớp: doc + đúng chuỗi trong nguyên văn đã khớp (giữ nguyên hiển thị). */
interface DocMatch {
  doc: LegalIndexDoc;
  matched: string;
}

interface SpanWord {
  word: string;
  end: number;
}

/** Escape giá trị để chèn vào attribute anchor (HIGH-1 fix review 2026-11-01). */
function attrEsc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Đang ở BÊN TRONG 1 tag chưa đóng? (vd attribute `alt=...>`, tag name)
 *  Nhìn quanh vị trí index: '<' gần nhất chưa được '>' đóng → skip (MEDIUM-1). */
function isInsideTag(text: string, index: number): boolean {
  const lt = text.lastIndexOf('<', index - 1);
  if (lt === -1) return false;
  const gt = text.lastIndexOf('>', index - 1);
  return lt > gt;
}

/** Tách span thành các word kèm vị trí kết thúc (giữ đúng separator gốc). */
function spanWords(span: string): SpanWord[] {
  const res: SpanWord[] = [];
  const re = /[^\n\t ]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(span)) !== null) {
    res.push({ word: m[0], end: m.index + m[0].length });
  }
  return res;
}

/** Tìm doc khớp trong span: thử ứng viên từ DÀI tới NGẮN (cắt cụm đuôi + dấu câu). */
function matchCandidate(
  span: string,
  byKey: Record<string, LegalIndexDoc>
): DocMatch | null {
  const words = spanWords(span);
  for (let n = words.length; n >= 1; n--) {
    // raw = đúng nguyên văn từ đầu span tới hết word thứ n
    const raw = span.slice(0, words[n - 1].end);
    // bỏ dấu câu kết câu ở đuôi (số hiệu "…/NĐ-CP." vẫn ăn)
    const candidate = raw.replace(/[.,;:)''\]]+$/, '');
    if (!candidate) continue;
    const doc = byKey[normalizeDocKey(candidate)];
    if (doc) return { doc, matched: candidate };
  }
  return null;
}

/**
 * Đổi token số hiệu khớp DB thành anchor — chạy trên HTML ĐÃ render
 * (server SSR / client renderMarkdown), chỉ đụng text ngoài anchor/pre/code.
 */
export function rewriteLegalLinks(html: string, docs: LegalIndexDoc[]): string {
  if (!html || !docs || !docs.length) return html || '';

  // Map key → doc; key trùng nhau thì doc đầu thắng
  const byKey: Record<string, LegalIndexDoc> = {};
  for (const d of docs) {
    const k = normalizeDocKey(d.doc_number || '');
    if (k && !byKey[k]) byKey[k] = d;
  }
  if (!Object.keys(byKey).length) return html;

  // Tách segment: phần "bảo vệ" giữ nguyên, text thường được xử lý.
  // firstMention dùng chung cả bài — đề cập trong anchor/pre/code cũng tính.
  const segments = splitProtected(html);

  const out: string[] = [];
  const firstMention: Record<string, boolean> = {};
  for (const seg of segments) {
    if (seg.protected) {
      markFirstMention(seg.text, byKey, firstMention);
      out.push(seg.text);
    } else {
      out.push(linkTokensInText(seg.text, byKey, firstMention));
    }
  }
  return out.join('');
}

interface Segment {
  text: string;
  protected: boolean;
}

function splitProtected(html: string): Segment[] {
  const res: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  PROTECTED_RE.lastIndex = 0;
  while ((m = PROTECTED_RE.exec(html)) !== null) {
    if (m.index > last) res.push({ text: html.slice(last, m.index), protected: false });
    res.push({ text: m[0], protected: true });
    last = m.index + m[0].length;
  }
  if (last < html.length) res.push({ text: html.slice(last), protected: false });
  return res;
}

/** Đánh dấu đề cập đã có trong segment bảo vệ — tránh link trùng ở sau. */
function markFirstMention(
  text: string,
  byKey: Record<string, LegalIndexDoc>,
  firstMention: Record<string, boolean>
): void {
  if (!text) return;
  let m: RegExpExecArray | null;
  DOC_TOKEN_RE.lastIndex = 0;
  while ((m = DOC_TOKEN_RE.exec(text)) !== null) {
    if (isInsideTag(text, m.index)) continue;
    const found = matchCandidate(m[0], byKey);
    if (found) firstMention[normalizeDocKey(found.doc.doc_number)] = true;
  }
}

function linkTokensInText(
  text: string,
  byKey: Record<string, LegalIndexDoc>,
  firstMention: Record<string, boolean>
): string {
  let result = '';
  let last = 0;
  let m: RegExpExecArray | null;
  DOC_TOKEN_RE.lastIndex = 0;
  while ((m = DOC_TOKEN_RE.exec(text)) !== null) {
    if (isInsideTag(text, m.index)) continue;
    const span = m[0];
    const found = matchCandidate(span, byKey);
    if (!found || firstMention[normalizeDocKey(found.doc.doc_number)]) continue;
    firstMention[normalizeDocKey(found.doc.doc_number)] = true;
    result +=
      text.slice(last, m.index) +
      '<a href="/van-ban/' +
      attrEsc(found.doc.id) +
      '" title="Toàn văn số ' +
      attrEsc(found.doc.doc_number) +
      ' trên TADA">' +
      found.matched +
      '</a>' +
      span.slice(found.matched.length); // phần thừa ("sửa đổi", "."...) giữ nguyên text
    last = m.index + span.length;
  }
  result += text.slice(last);
  return result;
}
