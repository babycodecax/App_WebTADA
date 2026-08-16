/**
 * queryExpansion.ts — Mở rộng từ khóa tìm kiếm cho chatbox thuế/kế toán (Vercel).
 *
 * Di chuyển từ app/api/chat/route.ts: STOPWORDS, TOPIC_KEYWORDS, _tokenize,
 * _expandKeywords (hành vi y nguyên — giữ compat với logic search cũ).
 * Thêm:
 *   - expandShortQuery(query): query 1-2 term → bổ sung synonym domain
 *     (chữa hiện tượng "câu hỏi ngắn/ít term không match chunk").
 *   - hasRealMatch(scored): phân loại chunk có match thật (matchCount > 0)
 *     hay chỉ được boost chủ đề/cheatsheet — dùng để quyết định "không có
 *     kiến thức" vs "có tài liệu".
 *
 * Module THUẦN: không import Supabase/OpenAI, không side-effect — test được
 * trực tiếp (pattern tests/modelFallback.test.ts).
 */

/** Từ nối — loại khỏi search terms để tránh nhiễu (giữ nguyên từ route.ts cũ). */
export const STOPWORDS = new Set([
  'và', 'của', 'là', 'được', 'trong', 'với', 'cho', 'năm', 'các', 'có',
  'theo', 'tại', 'từ', 'để', 'khi', 'nào', 'bao', 'nhiêu', 'làm', 'sao',
  'thế', 'này', 'như', 'về', 'còn', 'đã', 'sẽ', 'đang', 'bị', 'không',
  'những', 'một', 'hai', 'ba', 'ngày', 'tháng', 'mấy', 'đó', 'thì',
  'gì', // từ hỏi ("người phụ thuộc là gì") — không phải term chủ đề
]);

/** Keyword mapping: từ thường → từ domain chuẩn (giúp search match tài liệu thuế). */
export const TOPIC_KEYWORDS: Record<string, string> = {
  // TNCN
  'tncn': 'thuế thu nhập cá nhân',
  'thuế tncn': 'thuế thu nhập cá nhân',
  'thu nhập': 'thu nhập',
  'thu nhập cá nhân': 'thuế thu nhập cá nhân',
  // Giảm trừ gia cảnh / người phụ thuộc
  'người phụ thuộc': 'người phụ thuộc',
  'người phụ thuộc là gì': 'người phụ thuộc',
  'giảm trừ': 'giảm trừ',
  'giảm trừ gia cảnh': 'giảm trừ gia cảnh',
  'vợ chồng': 'người phụ thuộc',
  'con cái': 'người phụ thuộc',
  // Thuế suất / biểu thuế
  'thuế suất': 'biểu thuế lũy tiến',
  'biểu thuế': 'biểu thuế lũy tiến',
  'thuế lũy tiến': 'biểu thuế lũy tiến',
  // Tiền lương / tiền công
  'tiền lương': 'thu nhập từ tiền lương',
  'tiền công': 'thu nhập từ tiền lương',
  'thu nhập tiền công': 'thu nhập từ tiền lương',
  'lương': 'thu nhập từ tiền lương',
  // Số thuế phải nộp
  'đóng thuế': 'số thuế phải nộp',
  'số thuế': 'số thuế phải nộp',
  // Miễn thuế
  'miễn thuế': 'miễn thuế',
  'mốc miễn': 'miễn thuế',
  // Quyết toán / ngưỡng
  'quyết toán': 'quyết toán thuế',
  'ngưỡng': 'ngưỡng doanh thu',
  // HKD
  'hộ kinh doanh': 'hộ kinh doanh',
  'hkd': 'hộ kinh doanh',
  'kinh doanh': 'hộ kinh doanh',
  // Chậm nộp / quá hạn
  'nộp chậm': 'quá hạn',
  'chậm nộp': 'quá hạn',
  'quá hạn': 'quá hạn',
  // Hóa đơn
  'hóa đơn': 'hóa đơn',
  'hoá đơn': 'hóa đơn',
  'xuất hóa đơn': 'hóa đơn',
};

/** Tokenize text tiếng Việt cho search (hành vi y nguyên từ route.ts cũ). */
export function tokenize(text: string): string[] {
  // Giữ cả token ngắn có chứa số (VD: "2", "50") vì là giá trị thuế quan trọng
  return (text || '').toLowerCase().split(/[\s,.\-:;!?()]+/).filter(t => {
    if (t.length === 0) return false;
    if (t.length === 1 && !/\d/.test(t)) return false; // chỉ lọc "a", "b" — giữ "2", "5"
    if (STOPWORDS.has(t)) return false; // lọc stopword
    return true;
  });
}

/**
 * Mở rộng query: thêm từ khóa domain chuẩn + tokenize query gốc
 * (hành vi y nguyên từ _expandKeywords cũ — tránh trùng term).
 */
export function expandKeywords(query: string): string[] {
  const q = (query || '').toLowerCase().trim();
  const terms: string[] = [];

  // 1) Tokenize query gốc
  for (const t of tokenize(q)) {
    if (!terms.includes(t)) terms.push(t);
  }

  // 2) Thêm token domain chuẩn từ keyword mapping
  for (const [key, val] of Object.entries(TOPIC_KEYWORDS)) {
    if (q.includes(key)) {
      for (const vt of tokenize(val)) {
        if (!terms.includes(vt)) terms.push(vt);
      }
    }
  }

  return terms;
}

/**
 * Mở rộng query NGẮN (1-2 term): khi tokenize cho ra ít term, search BM25
 * không match chunk nào → trước đây trả top-K ngẫu nhiên score 0 hoặc rỗng.
 * Bổ sung synonym domain (VD "thuế suất" → "biểu thuế lũy tiến") để tăng recall.
 * Query >= 3 term → giữ nguyên (chỉ expandKeywords) — tránh làm nhiễu.
 *
 * Lưu ý: expandKeywords(query) đã chèn đủ mọi synonym domain từ TOPIC_KEYWORDS
 * (gồm cả mapping cho query ngắn) — không cần lặp lại mapping ở đây.
 */
export function expandShortQuery(query: string): string[] {
  return expandKeywords(query);
}

/**
 * Đếm số term khớp CHẶT (word boundary) trong văn bản.
 *
 * Khác substring match ("cá" match trong "cá nhân", "cảnh" match trong
 * "gia cảnh"): khớp chặt chỉ tính term xuất hiện như từ độc lập — term >= 2
 * ký tự phải đứng giữa 2 ranh giới từ (ký tự khác chữ/số/dấu gạch dưới);
 * term 1 ký tự chỉ tính khi là số ("2", "5" — giá trị thuế quan trọng).
 *
 * Dùng để phân biệt "match THẬT" (chunk cùng chủ đề) với "match tình cờ"
 * (substring) — chữa false-positive: "nuôi cá cảnh" không còn match "cá nhân"
 * hay "gia cảnh" → không gọi LLM lạc đề với context TNCN.
 */
export function countStrongMatches(terms: string[], text: string): number {
  if (!terms || !terms.length || !text) return 0;
  const hay = ` ${(text || '').toLowerCase()} `;
  let count = 0;
  for (const t of terms) {
    if (!t) continue;
    if (t.length === 1) {
      // Term 1 ký tự: chỉ giữ số (hành vi cũ cho "2", "5") — substring thường
      if (/\d/.test(t) && hay.includes(t)) count++;
      continue;
    }
    // Term >= 2 ký tự: phải đứng giữa 2 ranh giới từ
    if (new RegExp(`[^\\p{L}\\p{N}_]${t}[^\\p{L}\\p{N}_]`, 'u').test(hay)) count++;
  }
  return count;
}

/**
 * Bi-gram (cụm 2 âm tiết liền) từ query gốc — trước mở rộng từ khóa.
 * Tiếng Việt viết rời từng âm tiết nên word-boundary theo space không phân
 * biệt được "cảnh" của "cá CẢNH" (nuôi cá) với "cảnh" của "gia CẢNH" (giảm
 * trừ). Bi-gram "cá cảnh" phản ánh nghĩa thật của cụm từ.
 */
export function queryBigrams(query: string): string[] {
  const toks = tokenize(query || '');
  const out: string[] = [];
  for (let i = 0; i + 1 < toks.length; i++) {
    out.push(`${toks[i]} ${toks[i + 1]}`);
  }
  return out;
}

/** Bi-gram có xuất hiện trong văn bản không (cụm 2 từ liền nhau)? */
export function hasBigramInText(bigrams: string[], text: string): boolean {
  if (!bigrams || !bigrams.length || !text) return false;
  const hay = ` ${(text || '').toLowerCase()} `;
  return bigrams.some(b => hay.includes(` ${b} `));
}

/**
 * Có chunk nào match THẬT không (matchCount > 0)?
 * Chunk chỉ được boost chủ đề/cheatsheet (score > 0 nhưng matchCount = 0)
 * KHÔNG được tính là "có kiến thức" — tránh trả lời chung chung khi thực ra
 * không tìm thấy tài liệu liên quan.
 *
 * Chống false-positive (fix HIGH): query NGẮN 2-3 terms KHÔNG có số → phải có
 * BI-GRAM khớp trong cùng 1 chunk ("nuôi cá cảnh" cần "cá cảnh" xuất hiện
 * nguyên cụm — "cá nhân"/"gia cảnh" trong chunk TNCN không tạo bi-gram đó).
 * Query dài (>= 4 terms) hoặc có số → threshold matchCount (1 hoặc 2) — đã
 * đủ term đặc trưng; số (91 ngày, 50.000) không tách bi-gram ý nghĩa.
 */
export function hasRealMatch(
  scored: Array<{ matchCount?: number; title?: string; heading?: string; content?: string }>,
  terms: string[] = [],
  query: string = ''
): boolean {
  if (!scored || !scored.length) return false;
  const threshold = terms.length >= 4 ? 1 : 2;

  if (terms.length >= 2 && terms.length <= 3 && !/\d/.test(query || '')) {
    const bigrams = queryBigrams(query || '');
    if (bigrams.length) {
      return scored.some(c =>
        hasBigramInText(bigrams, `${c.title || ''} ${c.heading || ''} ${c.content || ''}`)
      );
    }
  }
  return scored.some(c => (c.matchCount || 0) >= threshold);
}
