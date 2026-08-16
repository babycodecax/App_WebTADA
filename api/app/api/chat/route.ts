import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import {
  getClientForModel,
  getModelList,
  getModelProvider,
  streamGemini,
  streamWithModelFallback,
  type CallModelFn,
  type StreamDelta,
} from '@/lib/modelFallback';
import { getStructuredKnowledge } from '@/lib/structured';
import { isNumericQuery, searchCompliance, formatComplianceContext } from '@/lib/compliance';
import { getKnowledgeChunksCached, refreshKnowledgeCache } from '@/lib/knowledgeCache';
import { isBlogPath, isAdminKnowledgePath } from '@/lib/blogKnowledge';
import { tokenize, expandShortQuery, countStrongMatches, hasRealMatch } from '@/lib/queryExpansion';
import { classifyAnswer } from '@/lib/answerClassifier';
import {
  sanitizeHistory,
  limitHistory,
  extractContextTerms,
  type HistoryMessage,
} from '@/lib/conversationMemory';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TOP_K = 20;

// ─── Structured knowledge (cache hot — xem lib/structured.ts) ───

function buildStructuredPrompt(structured: { key: string; value: string }[]): string {
  if (!structured.length) return '';
  const rows = structured.map(e => `- ${e.key.replace(/_/g, ' ')}: ${e.value}`).join('\n');
  return `\nBẢNG SỐ LIỆU TRA CỨU NHANH (ưu tiên dùng số này):\n${rows}\n`;
}

// ─── Search: full-text + keyword rerank ───
// Tokenize/keyword mapping/mở rộng query đã chuyển sang lib/queryExpansion.ts
// (tokenize, expandKeywords, expandShortQuery, hasRealMatch).

// Đếm term match CHẶT — dùng chung countStrongMatches từ lib/queryExpansion
// (word boundary, term 1 ký tự chỉ số) — tránh trùng logic 2 nơi.

// Phát hiện chủ đề từ query để bổ sung search (lowercase trước — tiếng Việt
// viết hoa đầu câu như "Thu nhập..." phải match được)
function _detectTopics(q: string): string[] {
  q = q.toLowerCase();
  const topics: string[] = [];
  if (/thu nhập|tiền công|tiền lương|tncn|thuế tncn|lương|người phụ thuộc/.test(q)) topics.push('thu nhập', 'tncn');
  if (/hộ.*kinh.*doanh|hkd|cndk|kinh doanh|may mặc|bán hàng|dịch vụ/.test(q)) topics.push('hộ kinh doanh');
  if (/bất động sản|nhà|đất|chuyển nhượng/.test(q)) topics.push('bất động sản');
  if (/đầu tư|chứng khoán|cổ phiếu|trái phiếu/.test(q)) topics.push('chứng khoán');
  if (/xuất nhập khẩu|xnk|hải quan/.test(q)) topics.push('xuất nhập khẩu');
  if (/bảo hiểm|bhxh|bhyt|bhtn/.test(q)) topics.push('bảo hiểm');
  if (/miễn.*thuế|mốc|ngưỡng|hạn mức/.test(q)) topics.push('miễn thuế');
  return topics;
}

/**
 * Search knowledge.
 * - Query ngắn (< 3 term) → expandShortQuery (synonym domain) để tăng recall.
 * - historyTerms từ câu hỏi trước → bổ sung term cho câu nối tiếp.
 * - Không chunk nào matchCount > 0 và không có forcedChunks → trả [] (không
 *   trả top-K ngẫu nhiên score 0 — chữa "câu hỏi không có thông tin").
 */
async function searchKnowledge(query: string, topK: number = TOP_K, historyTerms: string[] = []) {
  // Bước 1: mở rộng query — query ngắn dùng synonym domain, query thường như cũ
  const qLow = query.toLowerCase();
  const terms = expandShortQuery(query);
  // Bước 2: bổ sung term từ câu hỏi trước (câu nối tiếp: "còn hộ kinh doanh
  // thì sao") — chỉ thêm term CHƯA có, không làm nhiễu query gốc
  for (const t of historyTerms || []) {
    if (!terms.includes(t)) terms.push(t);
  }
  const topics = _detectTopics(query);
  // Thêm term chủ đề vào search để ưu tiên chunk đúng chủ đề
  for (const t of topics) {
    const tTokens = tokenize(t);
    for (const tt of tTokens) {
      if (!terms.includes(tt)) terms.push(tt);
    }
  }
  if (/tiền công|tiền lương/.test(qLow) && !terms.some(t => /thu nhập/.test(t))) {
    terms.push('thu nhập');
  }
  if (!terms.length) return [];

  // Load chunks: nếu có topic "thu nhập" hoặc "TNCN", thêm thẳng file từ Supabase
  // Dùng 2 like() riêng + Promise.all thay vì .or() vì .or() không parse được value có space ("thu nhập")
  let forcedChunks: any[] = [];
  if (topics.some(t => t === 'thu nhập' || t === 'tncn')) {
    try {
      const [r1, r2] = await Promise.all([
        getSupabase()
          .from('knowledge_chunks')
          .select('id, content, title, heading, file_path, chunk_index')
          .like('title', '%thu nhập%')
          .limit(3),
        getSupabase()
          .from('knowledge_chunks')
          .select('id, content, title, heading, file_path, chunk_index')
          .like('title', '%TNCN%')
          .limit(3),
      ]);
      forcedChunks = [...(r1.data || []), ...(r2.data || [])];
    } catch (_) {}
  }
  // Mở rộng: nếu có topic HKD, force thêm HKD chunks
  if (topics.some(t => t === 'hộ kinh doanh')) {
    try {
      const { data: hkdRows } = await getSupabase()
        .from('knowledge_chunks')
        .select('id, content, title, heading, file_path, chunk_index')
        .like('file_path', '%hkd%')
        .limit(2);
      if (hkdRows) forcedChunks = [...forcedChunks, ...hkdRows];
    } catch (_) {}
  }
  // Force chunks theo NỘI DUNG khi topic "miễn thuế": 3 ý chính (giảm trừ /
  // 01 tỷ / 50.000) luôn vào top kể cả khi BM25-match yếu — vì file
  // tt-89-2026-dieu-42.md (bản hợp nhất nhiều điều, chứa Điều 65 miễn thuế/
  // giảm thuế) có title không chứa "thu nhập"/"TNCN" nên nhánh force title ở
  // trên không bắt được.
  // Dùng pattern có kèm đơn vị ('%15,5 triệu%') thay '%15,5%' để tránh LIKE trúng
  // số cùng dạng ở ngữ cảnh khác (mức phạt, mẫu biểu…).
  if (topics.includes('miễn thuế')) {
    try {
      const [r1, r2, r3] = await Promise.all([
        getSupabase()
          .from('knowledge_chunks')
          .select('id, content, title, heading, file_path, chunk_index')
          .like('content', '%15,5 triệu%')
          .limit(2),
        getSupabase()
          .from('knowledge_chunks')
          .select('id, content, title, heading, file_path, chunk_index')
          .like('content', '%01 tỷ%')
          .limit(2),
        getSupabase()
          .from('knowledge_chunks')
          .select('id, content, title, heading, file_path, chunk_index')
          .like('content', '%50.000%')
          .limit(2),
      ]);
      forcedChunks = [...forcedChunks, ...(r1.data || []), ...(r2.data || []), ...(r3.data || [])];
    } catch (_) {}
  }

  // Force chunks theo NỘI DUNG khi query R&D/KH&CN: chunk chứa "200% thực tế"
  // (nq-198 idx=1) luôn vào top — vì chunk viết "KH&CN" không match từ
  // "nghiên cứu" nên BM25 match yếu, dễ bị bỏ sót.
  if (/r&d|nghiên cứu|kh&cn/.test(qLow)) {
    try {
      const { data: rdRows } = await getSupabase()
        .from('knowledge_chunks')
        .select('id, content, title, heading, file_path, chunk_index')
        .like('content', '%200% thực tế%')
        .limit(2);
      if (rdRows) forcedChunks = [...forcedChunks, ...rdRows];
    } catch (_) {}
  }
  // Force chunks GloBE/chống xói mòn cơ sở thuế: chunk bổ sung nói về thuế
  // tối thiểu toàn cầu thường không match từ khóa truy vấn dài do BM25 yếu.
  if (/xói mòn cơ sở thuế|globe|tối thiểu toàn cầu|pillar two/.test(qLow)) {
    try {
      const { data: globeRows } = await getSupabase()
        .from('knowledge_chunks')
        .select('id, content, title, heading, file_path, chunk_index')
        .like('content', '%xói mòn%')
        .limit(2);
      if (globeRows) forcedChunks = [...forcedChunks, ...globeRows];
    } catch (_) {}
  }

  // Load chunks: page 1 (Supabase giới hạn 1000/request) + riêng các chunk upload/
  // để tài liệu admin upload mới luôn được xét — dù nằm ngoài 1000 chunks đầu.
  // + 6 file trọng yếu (luật/cheatsheet) — dùng like() riêng lẻ (không .or() vì
  //   .or() không parse value có space) — đảm bảo chunk "50.000 đồng" của
  //   tt-89-2026-dieu-42.md luôn được xét dù nằm ngoài 1000 chunks đầu.
  //   Lưu ý: tt-89-2026-dieu-42.md là bản hợp nhất NHIỀU điều (42→70+) — trong
  //   đó Điều 65 "Các trường hợp miễn thuế, giảm thuế" chứa mốc miễn nộp
  //   50.000 đồng (đã xác minh DB: chunk idx=30 chứa '50.000'). Pattern '%tt-89%'
  //   chung match toàn bộ ~400+ chunk của mọi điều, không cần thiết.
  const VITAL_PATTERNS = [
    '%luat-109%', '%nd-68%', '%nd-141%', '%tt-89-2026-dieu-42%', '%cheatsheet%',
    '%luat-thue-tncn%', '%nq-198%', '%luat-67%', '%tt-20-2026%',
    '%luat-48%', '%luat-66%', '%nd-320%', '%tt-32%', '%luat-108%', '%nd-252%',
    '%nd-253%', '%luat-09%', '%nd-360%', '%luat-41%', '%tt-90%',
    '%bo-sung-kien-thuc-2026%',
  ];
  const VITAL_LIMIT = 200; // mỗi file chunk nhỏ, 200 đủ

  // Cache tầng module (fix review 2026-08-10): lần đầu mỗi instance query live,
  // các câu hỏi sau trong TTL dùng cache — giảm ~20+ request Supabase/câu hỏi.
  // Chunks upload/ mới nhất vẫn được query NỔI (xuyên cache) để admin upload
  // hiện ngay, không cần đợi TTL 10 phút.
  const cached = getKnowledgeChunksCached();
  // Chunks admin (upload/ + blog/) query NỔI (xuyên cache) để admin upload/blog
  // mới hiện ngay, không cần đợi TTL 10 phút. Blog nằm ngoài 1000 row đầu của
  // cache nên phải query riêng — đúng pattern upload/ sẵn có.
  let adminRows: any[] = [];
  try {
    const [upRes, blogRes] = await Promise.all([
      getSupabase()
        .from('knowledge_chunks')
        .select('id, content, title, heading, file_path, chunk_index')
        .like('file_path', 'upload/%')
        .limit(1000),
      getSupabase()
        .from('knowledge_chunks')
        .select('id, content, title, heading, file_path, chunk_index')
        .like('file_path', 'blog/%')
        .limit(1000),
    ]);
    adminRows = [...(upRes.data || []), ...(blogRes.data || [])];
  } catch { /* admin query lỗi — bỏ qua */ }

  const seenIds = new Set<string>();
  const data: any[] = [];
  if (cached.data.length) {
    // Fix MEDIUM (warm path): adminRows (live, mới nhất) đứng TRƯỚC cache cũ —
    // khi blog/upload bị sửa giữ nguyên id, bản live mới thắng bản cache stale
    // (trước đây cache đẩy trước nên trả nội dung cũ tới 10 phút).
    for (const row of adminRows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      data.push(row);
    }
    for (const row of cached.data) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      data.push(row);
    }
  } else {
    // Cache lạnh → query live (giữ nguyên query cũ + thêm blog/; tái dùng
    // adminRows đã query ở trên — không query upload/blog lại lần 2)
    const queries = [
      getSupabase()
        .from('knowledge_chunks')
        .select('id, content, title, heading, file_path, chunk_index')
        .limit(1000),
      ...VITAL_PATTERNS.map(p =>
        getSupabase()
          .from('knowledge_chunks')
          .select('id, content, title, heading, file_path, chunk_index')
          .like('file_path', p)
          .limit(VITAL_LIMIT)
      ),
    ];
    const results = await Promise.all(queries);
    const errors = results.map(r => r.error).filter(Boolean);
    if (errors.length) console.warn('Knowledge load error:', errors[0]);
    for (const res of results) {
      for (const row of res.data || []) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);
        data.push(row);
      }
    }
    for (const row of adminRows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      data.push(row);
    }
    // Lưu cache (best-effort) cho các câu hỏi sau
    void refreshKnowledgeCache();
  }

  if (!data.length) {
    return [];
  }

  // Score ALL chunks — boost riêng cho mỗi topic
  const scored: any[] = [];
  for (const row of data) {
    const content = (row.content || '');
    const title = (row.title || '');
    const heading = (row.heading || '');
    const haystack = (content + ' ' + title + ' ' + heading).toLowerCase();

    const matchCount = countStrongMatches(terms, haystack);
    let score = matchCount > 0 ? 1.0 + Math.log2(matchCount + 1) : 0;

    // Cheatsheet boost +1 (trước +8/+3 — cheatsheet match nhiều term phổ biến
    // nên tự nhiên đã cao; boost lớn khiến nó chiếm hết slots, chunk chuyên đề
    // (vàng, kho bạc, mệnh giá...) không lên top → LLM trả sai/thiếu. Chỉ giữ
    // +1 để cheatsheet vẫn nhỉnh hơn khi không có chunk chuyên đề match.)
    const isCheatsheet = title.toLowerCase().includes('cheatsheet') || title.toLowerCase().includes('_cheatsheet');
    if (isCheatsheet) {
      score += 1.0;
    }
    // Tài liệu admin upload + bài blog: boost RẤT CAO để tài liệu bổ sung (nội
    // bộ, mới nhất) luôn thắng file luật cũ khi cùng chủ đề — vì upload/blog là
    // nguồn chính xác nhất cho các quy định bổ sung (LLM từng đọc luat-109 cũ
    // rồi bỏ qua upload). Blog ngang hàng upload (đều là kiến thức admin).
    // Fix HIGH: chỉ boost khi matchCount > 0 — chunk admin KHÔNG liên quan câu
    // hỏi không được đặt trên vault match thật (tránh blog tích lũy làm nhiễu).
    if ((row.file_path || '').startsWith('upload/') || isBlogPath(row.file_path || '')) {
      if (matchCount > 0) {
        score += 8.0;
        score += Math.min(matchCount * 0.5, 2.0); // match càng nhiều càng ưu tiên
      }
    }
    // Số liệu cụ thể
    const numMatches = (content.match(/\d{1,3}(?:[.,]\d+)?\s*(tỷ|triệu|tr|nghìn|%|đồng)/gi) || []).length;
    score += Math.min(numMatches * 0.3, 1.5);
    // Title/heading match
    for (const field of [title.toLowerCase(), heading.toLowerCase()]) {
      if (field && terms.some(t => field.includes(t))) score += 1.5;
    }

    // Topic boost per topic (tối đa +15, chia đều)
    for (const topic of topics) {
      if (haystack.includes(topic)) {
        score += 3.0;
        if (title.includes(topic) || heading.includes(topic)) score += 2.0;
      }
    }

    // Boost keyword cụ thể: query dạng miễn thuế → chunk chứa các ý mốc
    // (miễn thuế / giảm trừ / quyết toán / 50.000) được cộng thêm — tránh
    // chunk "thu nhập khác 20 triệu/lần" lấn át 3 ý chính của câu hỏi mốc.
    if (/miễn thuế/.test(qLow) && /miễn thuế|giảm trừ|quyết toán|50\.000/.test(haystack)) {
      score += 2.0;
    }
    // Boost R&D / nghiên cứu: query chứa "R&D"/"nghiên cứu"/"chi phí được trừ"
    // → chunk nq-198 (KH&CN 200%) hoặc có "nghiên cứu"/"kh&cn"/"200%" được
    // cộng thêm — ưu tiên mạnh để không bị cheatsheet (10% quỹ R&D) lấn át.
    if (/r&d|nghiên cứu|kh&cn/.test(qLow)) {
      if (/200%|kh&cn|nghiên cứu/.test(haystack)) score += 3.0;
    }
    // Boost GloBE / chống xói mòn cơ sở thuế: chunk bổ sung có từ khóa này
    // được cộng lớn để vào uploadBudget trước — file bổ sung là nguồn chính xác.
    if (/xói mòn|globe|tối thiểu toàn cầu|pillar two/.test(qLow)) {
      if (/xói mòn|globe|tối thiểu toàn cầu/.test(haystack)) score += 10.0;
    }

    // Fix HIGH: gắn matchCount vào row — trước đây c.matchCount luôn undefined
    // (không bao giờ được gán) nên adminMatched luôn rỗng: khi admin pool > 30
    // chunks, mọi kiến thức upload/blog bị vứt sạch → "trả lời không có thông
    // tin" dù tài liệu bổ sung tồn tại.
    scored.push({ ...row, score, matchCount });
  }

  scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  // Fix HIGH: không có chunk nào match thật → trả [] (KHÔNG trả top-K chunk
  // ngẫu nhiên score 0). Chunk chỉ boost chủ đề/cheatsheet không tính là match.
  // forcedChunks vẫn được xét (chúng là nền tảng trả lời mốc/ngưỡng đã force).
  // hasRealMatch(scored, terms, query): query ngắn 2-3 terms không số → cần
  // BI-GRAM khớp trong cùng 1 chunk ("nuôi cá cảnh" cần "cá cảnh" nguyên cụm —
  // "cá nhân"/"gia cảnh" trong chunk TNCN không tạo bi-gram, chặn lạc đề);
  // query dài ≥4 terms → threshold matchCount 1; có số → threshold 2.
  if (!hasRealMatch(scored, terms, query) && !forcedChunks.length) {
    return [];
  }
  // Merge forcedChunks vào top TRƯỚC (chunk forced = nền tảng trả lời mốc/ngưỡng,
  // phải có mặt kể cả khi admin pool đông) — fix HIGH: trước đây adminOnly tràn
  // top khiến vòng merge forced break sớm, câu hỏi mốc mất chunk chuẩn.
  const top: any[] = [];
  for (const fc of forcedChunks) {
    if (top.length >= topK + 6) break;
    if (!top.some(t => t.id === fc.id)) {
      top.push({ ...fc, score: 5.0 }); // điểm thấp — vẫn có mặt nhưng xếp cuối
    }
  }
  // Chunks admin (upload/ + blog/): giữ TẤT CẢ nếu ít (≤ ADMIN_BUDGET) để chunk
  // đúng chủ đề (gôn, nước sạch) không bị cắt; nếu nhiều (blog tích lũy) chỉ giữ
  // admin có match — tránh blog không liên quan lấp đầy context mọi câu hỏi.
  const adminBudget = 30;
  const adminOnly = scored.filter(c => isAdminKnowledgePath(c.file_path || ''));
  const adminMatched = adminOnly.filter(c => (c.matchCount || 0) > 0);
  const adminKept = adminOnly.length <= adminBudget ? adminOnly : adminMatched.slice(0, adminBudget);
  // Non-admin: topK slots vault (round-robin bên dưới), ưu tiên chunk có match.
  const nonAdmin = scored.filter(c => !isAdminKnowledgePath(c.file_path || '')).slice(0, topK);
  for (const row of [...adminKept, ...nonAdmin]) {
    if (top.length >= topK + 6) break;
    if (!top.some(t => t.id === row.id)) top.push(row);
  }
  return top;
}

/** Slice content ưu tiên vùng keyword quan trọng (dùng cho câu hỏi dạng mốc):
 *  nếu keyword nằm ngoài maxLen đầu thì lấy cửa sổ quanh keyword để số liệu
 *  không bị cắt mất (chunk tt-89 hợp nhất nhiều điều rất dài). */
const MOC_KEYWORDS = ['giảm trừ', '01 tỷ', '50.000', '20 triệu', 'miễn nộp', '200%', 'khấu trừ', '10%', '5%'];
function _sliceForMoc(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  const low = content.toLowerCase();
  let bestIdx = -1;
  // Keyword nằm ở nửa sau của đoạn đầu → đặt lại cửa sổ quanh keyword để số
  // liệu quanh nó không bị cắt mất (M10). Điều kiện maxLen/2 thay vì maxLen:
  // keyword sát cuối cửa sổ đầu cũng khiến số liệu sau keyword bị cắt cụt.
  for (const kw of MOC_KEYWORDS) {
    const i = low.indexOf(kw);
    if (i >= maxLen / 2 && (bestIdx === -1 || i < bestIdx)) bestIdx = i;
  }
  if (bestIdx === -1) return content.slice(0, maxLen);
  const start = Math.max(0, bestIdx - maxLen / 2);
  return content.slice(start, start + maxLen);
}

// ─── Main chat handler ───

/** Câu trả lời trung thực khi KHÔNG tìm thấy kiến thức (không gọi LLM). */
const NO_KNOWLEDGE_ANSWER =
  'Tôi chưa có đủ thông tin để trả lời câu hỏi này. Bạn có thể hỏi rõ hơn về lĩnh vực thuế, kế toán, BHXH hoặc thủ tục doanh nghiệp (VD: "thuế suất TNCN 2026 là bao nhiêu?") để tôi tra cứu được chính xác hơn.';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.question || typeof body.question !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing question' }), { status: 400 });
    }
    // Chuẩn hóa query về lowercase NGAY (H1): tiếng Việt viết hoa đầu câu
    // ("Miễn thuế TNCN 2026?") phải match được mọi regex chế độ mốc/chủ đề.
    const question = body.question.trim().toLowerCase();

    // 0. Conversation history (optional — request cũ không gửi vẫn chạy):
    //    sanitize → giới hạn lượt → trích term từ câu hỏi trước cho search.
    const history = limitHistory(sanitizeHistory(body.history));
    const historyTerms = extractContextTerms(history, question);

    // Câu hỏi dạng mốc/ngưỡng → trả lời dạng danh sách đầy đủ (dùng cho cả
    // prompt lẫn đa dạng hóa nguồn bên dưới). KHÔNG dùng 'trần' — false-positive
    // với tên người ("Trần Văn A").
    const isMocQuery = /mốc|ngưỡng|miễn thuế|hạn mức|danh sách/.test(question);

    // 1. Search knowledge (không dùng cache câu trả lời — luôn tính toán mới
    //    để căn cứ tài liệu mới nhất, tránh trả câu trả lời cũ)
    const contexts = await searchKnowledge(question, TOP_K, historyTerms);
    let sources: any[] = [];

    // 1b. Compliance records (số liệu/mốc có cấu trúc) — khi câu hỏi có số
    //     liệu: ưu tiên chèn bản ghi extract lên đầu context để LLM đọc số
    //     liệu trích sẵn thay vì tự suy luận (fix HIGH: proxy Next.js trước
    //     đây không có compliance — hệ thống chỉ chạy khi gọi thẳng Python).
    let complianceContext = '';
    if (isNumericQuery(question)) {
      try {
        const records = await searchCompliance(question);
        if (records.length) complianceContext = formatComplianceContext(records);
      } catch (e) {
        console.warn('Compliance search failed (skip):', e);
      }
    }

    // 3. Build context + sources
    let ctxText = '';
    if (contexts.length === 0) {
      ctxText = 'KHÔNG có tài liệu tham khảo nào được tìm thấy.';
    } else {
      // Câu hỏi dạng mốc/ngưỡng → cần đủ số liệu: cho phép 2 chunk/file
      // (contexts đã sort theo score giảm dần nên 2 chunk đầu mỗi file là tốt nhất)
      const maxChunksPerFile = isMocQuery ? 2 : 1;
      const maxLen = isMocQuery ? 1200 : 800; // chunk dạng mốc cần đủ số liệu
      // Đa dạng hóa nguồn: tối đa 6 sources, giới hạn số chunk/file.
      // Nhóm chunks theo file (mỗi nhóm giữ thứ tự score giảm dần), sau đó
      // round-robin: round r lấy chunk thứ r của mỗi file (nếu có). Mỗi file
      // chỉ đóng góp 1 chunk/round nên không bao giờ chọn trùng chunk — fix
      // HIGH: thuật toán pass-based cũ khiến chunk đầu mỗi file bị đẩy 2 lần
      // (used === pass lại đúng khi pass 1 duyệt từ đầu), chunk 2 không chọn được.
      const byFile = new Map<string, typeof contexts>();
      for (const c of contexts) {
        const fp = c.file_path || '';
        const arr = byFile.get(fp);
        if (arr) arr.push(c);
        else byFile.set(fp, [c]);
      }
      // Khi query dạng mốc miễn thuế: ưu tiên bắt buộc các file chứa 3 ý chính
      // (giảm trừ 15,5tr / ngưỡng 01 tỷ / miễn nộp 50.000) vào đầu — dù score
      // thấp hơn cheatsheet — để LLM không trả thiếu ý.
      // Tương tự khi query R&D: ưu tiên nq-198 (chi R&D được trừ 200%) —
      // chunk viết "KH&CN" không match "nghiên cứu" nên BM25 yếu, cần đẩy lên.
      let PRIORITY_FILES: string[] = [];
      if (isMocQuery && /miễn thuế|mốc/.test(question)) {
        PRIORITY_FILES = ['%nd-141%', '%nd-68%', '%tt-89-2026-dieu-42%', '%luat-109%', '%luat-thue-tncn%'];
      } else if (/r&d|nghiên cứu|kh&cn/.test(question)) {
        PRIORITY_FILES = ['%nq-198%', '%luat-67%', '%tt-20-2026%'];
      }
      if (PRIORITY_FILES.length) {
        const byFileArr = Array.from(byFile.entries());
        byFileArr.sort((a, b) => {
          const pa = PRIORITY_FILES.findIndex(p => a[0].includes(p.slice(1, -1)));
          const pb = PRIORITY_FILES.findIndex(p => b[0].includes(p.slice(1, -1)));
          const rankA = pa === -1 ? 99 : pa;
          const rankB = pb === -1 ? 99 : pb;
          if (rankA !== rankB) return rankA - rankB;
          return (b[1][0]?.score || 0) - (a[1][0]?.score || 0);
        });
        byFile.clear();
        for (const [fp, chunks] of byFileArr) byFile.set(fp, chunks);
      }
      const diverseSources: typeof contexts = [];
      // Ưu tiên: nếu có chunk upload/ match → đưa chunks upload vào TRƯỚC
      // (file bổ sung là nguồn chính xác nhất, LLM cần đọc trước các luật cũ
      // để không bị luat-109 "2%" hay "0,1%" lấn át).
      // KHÔNG giới hạn 6 — vì upload file có thể 40-50 chunks, chunk đúng chủ đề
      // (VD: rượu 65%) có thể nằm ngoài top 6 nhưng vẫn cần đưa vào context.
      // NHƯNG giới hạn theo TỶ LỆ (fix MEDIUM): all-upload-first với 40-60 chunks
      // đẩy toàn bộ kết quả vault (luật/nd/tt) ra khỏi context khi câu hỏi chỉ
      // chạm upload 1 cách tương đối. Tối đa 30 upload chunks HOẶC 50% sức chứa.
      const UPLOAD_MAX = 30;
      const UPLOAD_CAP = Math.floor(60 / 2); // 50% của 60 slots
      // Pool admin ưu tiên = upload/ + blog/ (blog ngang hàng upload — kiến
      // thức admin mới nhất). Blog KHÔNG chiếm 6 slots vault bên dưới.
      const adminChunks = contexts.filter(c => isAdminKnowledgePath(c.file_path || ''));
      const adminBudget = Math.min(adminChunks.length, UPLOAD_MAX, UPLOAD_CAP);
      for (let i = 0; i < adminBudget; i++) {
        diverseSources.push(adminChunks[i]);
      }
      // Round-robin các file KHÔNG admin (vault): luôn dành tối đa 6 slots kể cả
      // khi có nhiều upload/blog chunks (fix MEDIUM: trước đây vòng lặp chặn
      // theo diverseSources.length < 6 → upload ≥ 6 chunks khiến luật/nd/tt
      // điểm cao không bao giờ vào context dù câu hỏi chạm upload chỉ tương đối).
      let vaultSlots = 0;
      for (let round = 0; round < maxChunksPerFile && vaultSlots < 6; round++) {
        for (const chunks of byFile.values()) {
          if (vaultSlots >= 6) break; // chỉ 6 sources ngoài admin
          const chunk = chunks[round]; // chunk thứ `round` của file (nếu có)
          if (chunk && !isAdminKnowledgePath(chunk.file_path || '') && !diverseSources.includes(chunk)) {
            diverseSources.push(chunk);
            vaultSlots++;
          }
        }
      }
      // Force thêm 1 chunk TNCN từ data gốc nếu query có liên quan
      if (/thu nhập|tiền công|tncn|người phụ thuộc|npt/.test(question)) {
        const tncn = contexts.find(c => /luat-109|nd-253|luat-thue-tncn|_cheatsheet/.test(c.file_path || ''));
        if (tncn && !diverseSources.includes(tncn)) diverseSources.push(tncn);
      }
      // Nếu còn còn < 6 sources và query có HKD, thêm nd-68
      if (diverseSources.length < 6 && /hkd|hộ kinh doanh|kinh doanh|may mặc/.test(question)) {
        const hkd = contexts.find(c => /nd-68-2026/.test(c.file_path || ''));
        if (hkd && !diverseSources.includes(hkd)) diverseSources.push(hkd);
      }
      // Giới hạn content mỗi chunk theo chế độ query (800 thường / 1200 dạng mốc).
      // Dạng mốc + query R&D: slice quanh keyword quan trọng (200%, khấu trừ...)
      // để số liệu nằm cuối chunk (nq-198 200% ở vị trí ~1310) không bị cắt mất.
      const sliceContent = (isMocQuery || /r&d|nghiên cứu|kh&cn/.test(question)) ? _sliceForMoc : (s: string, n: number) => s.slice(0, n);
      ctxText = diverseSources.map((c, i) =>
        `--- Tai lieu ${i + 1} ---\nTieu de: ${c.title || ''}\nMuc: ${c.heading || ''}\nNoi dung:\n${sliceContent(c.content || '', maxLen)}`
      ).join('\n\n');
      // sources gửi frontend = chính diverseSources (tối đa 6), không phải
      // toàn bộ contexts (20-24 chunks) — tránh hiển thị quá nhiều nguồn.
      sources = diverseSources.map(c => ({
        title: c.title || '',
        heading: c.heading || '',
        file_path: c.file_path || '',
        score: c.score || 0,
      }));
    }

    // 4. Structured knowledge
    const structured = await getStructuredKnowledge();
    const structuredPrompt = buildStructuredPrompt(structured);

    // 5. Build system prompt
    const system = [
      `Bạn là trợ lý thuế/kế toán Việt Nam.`,
      `Nhiệm vụ: trả lời CHÍNH XÁC dựa trên Tai lieu tham khao bên dưới.`,
      ``,
      `QUY TẮC:`,
      `- Trả lời dựa trên Tai lieu tham khao — trích số liệu, tên mẫu biểu CHÍNH XÁC từ tài liệu.`,
      `- Nếu câu hỏi yêu cầu tính toán → dùng đúng số trong tài liệu để tính.`,
      `- Nếu câu hỏi là TÌNH HUỐNG (có số liệu cụ thể) → SO SÁNH số trong câu hỏi với ngưỡng trong tài liệu rồi KẾT LUẬN (VD: chậm 91 ngày > quy định 90 ngày → trốn thuế; chi 6 triệu > ngưỡng 5 triệu → không được trừ; thu nhập 150 triệu → tra bảng thuế lũy tiến). BẮT BUỘC phải đưa ra câu trả lời cụ thể, không được nói 'không tìm thấy' khi có tài liệu chứa quy định liên quan.`,
      `- QUY TẮC CỨNG SỐ HỌC: nếu câu hỏi có con số (N ngày, N triệu, N tỷ) và tài liệu có ngưỡng (M ngày, M triệu, M tỷ) cùng đơn vị → áp dụng ngay ngưỡng đó cho tình huống, kể cả khi con số khác nhau. Ví dụ: tài liệu nói 'quá 90 ngày → trốn thuế', câu hỏi nói 'chậm 91 ngày' → kết luận '91 > 90 nên trốn thuế'. KHÔNG được từ chối vì số không giống hệt.`,
      `- CHỈ báo 'Xin lỗi, tôi không tìm thấy thông tin phù hợp.' khi tài liệu KHÔNG có bất kỳ quy định nào liên quan đến chủ đề câu hỏi.`,
      `- KHÔNG tự ý bịa số liệu — mọi số đưa ra phải có trong tài liệu hoặc tính từ số trong tài liệu.`,
      ``,
      `ĐỊNH DẠNG TRẢ LỜI (bắt buộc):`,
      `- Trả lời 1-2 câu, tối đa 50 từ. Giải thích nhẹ nhưng đúng trọng tâm.`,
      `- KHÔNG mở đầu bằng 'Theo...', 'Tài liệu...', 'Điều...', 'Bước...'.`,
      `- KHÔNG thêm [Nguồn], <think>, markdown.`,
      `- Nếu hỏi số → đưa số kèm giải thích ngắn (VD: '15% — áp dụng cho doanh nghiệp trên 1 tỷ').`,
      `- CUỐI câu trả lời, thêm 1 dòng: ghi tên văn bản luật đã dùng (VD: '(Căn cứ Luật số 67/2025/QH15)'). KHÔNG ghi điều cụ thể, KHÔNG ghi [Nguồn].`,
      `- Nếu có LICH SU HOI THOAI trong câu hỏi: câu hỏi có thể là câu NỐI TIẾP (VD: 'còn hộ kinh doanh thì sao', 'thuế suất bao nhiêu') — dùng lịch sử để hiểu chủ đề/ngữ cảnh đang nói, KHÔNG trả lời chung chung.`,
      ...(isMocQuery
        ? [
            ``,
            `QUY TẮC RIÊNG — CÂU HỎI DẠNG MỐC/NGƯỠNG (thay thế giới hạn 50 từ):`,
            `- Trả lời DẠNG DANH SÁCH ĐẦY ĐỦ mọi mốc tìm thấy trong tài liệu.`,
            `- Mỗi mốc 1 dòng: số liệu + đối tượng áp dụng + tên văn bản/điều.`,
            `- KHÔNG giới hạn 50 từ, KHÔNG bỏ sót ý.`,
            `- Số liệu lấy từ Tai lieu tham khao — nếu có trong BẢNG SỐ LIỆU bên dưới thì ưu tiên dùng số đó, không tự thêm số ngoài tài liệu.`,
            `- CHỈ liệt kê mốc CÓ trong tài liệu tham khảo.`,
          ]
        : []),
      structuredPrompt,
      ...(complianceContext
        ? [
            ``,
            `ƯU TIÊN TUYỆT ĐỐI: các khối [DỮ LIỆU CÓ CẤU TRÚC - ƯU TIÊN] chứa số liệu trích sẵn từ văn bản luật. Khi câu hỏi yêu cầu so sánh số (vd 6 triệu có vượt 5 triệu không, 91 ngày có lớn hơn 90 ngày không): so sánh trực tiếp giá trị SỐ trong các khối đó, trích nguyên văn số liệu + đơn vị + điều kiện (>, <, <=, >=). Chỉ khi dữ liệu có cấu trúc KHÔNG đủ trả lời mới dùng phần Tai lieu tham khao phía dưới.`,
          ]
        : []),
    ].filter(Boolean).join('\n');

    // Câu hỏi có số liệu/mốc → chèn compliance records lên đầu context
    const user = complianceContext
      ? `${complianceContext}\n\nTai lieu tham khao:\n${ctxText}\n\nCau hoi: ${question}`
      : `Tai lieu tham khao:\n${ctxText}\n\nCau hoi: ${question}`;

    // Gemini (REST gốc) không nhận history dạng messages — gấp lịch sử vào
    // chuỗi user (giữ nguyên ChatRequest/streamGemini không đổi)
    const historyBlock = history.length
      ? `\n\nLICH SU HOI THOAI (de hieu cau hoi noi tiep):\n${history.map((h: HistoryMessage) => `${h.role === 'user' ? 'Nguoi dung' : 'Tro ly'}: ${h.content}`).join('\n')}\n`
      : '';
    const userWithHistory = historyBlock + user;

    // 6. Stream LLM
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send sources first
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'sources', data: sources.map(s => ({ title: s.title, heading: s.heading, file_path: s.file_path, score: s.score })) })}\n\n`
        ));

        let fullAnswer = '';
        let sentError = false; // tránh gửi 2 tin (error + quá tải) khi tất cả model fail

        // PHÂN LOẠI "KHÔNG CÓ KIẾN THỨC" vs "LỖI HỆ THỐNG":
        // Không tìm thấy tài liệu liên quan VÀ không có compliance records →
        // trả lời trung thực, KHÔNG gọi LLM (tiết kiệm chi phí + không trả lời
        // chung chung). Fix MEDIUM: contexts rỗng nhưng CÓ complianceContext
        // (searchCompliance tìm được records cho câu hỏi có số liệu) vẫn phải
        // gọi LLM — có dữ liệu structured để trả lời, không nhận "chưa có đủ
        // thông tin". Tin "quá tải" CHỈ dành cho LLM thật sự fail khi có dữ liệu.
        if (classifyAnswer(contexts.length > 0, complianceContext !== '') === 'no-knowledge') {
          const allowLlmFallback = process.env.ALLOW_LLM_FALLBACK === 'true';
          if (allowLlmFallback) {
            // Phương án 2 (tùy chọn): LLM trả lời THAM KHẢO kèm cảnh báo rõ ràng
            // — không để khách bị bỏ rơi, nhưng không giả vờ có tài liệu chính thức.
            const fallbackSystem = [
              `Bạn là trợ lý thuế/kế toán Việt Nam. KHÔNG có tài liệu tham khảo nào được tìm thấy cho câu hỏi này.`,
              `Nếu bạn BIẾT câu trả lời chung (kiến thức phổ thông, không bịa số liệu cụ thể) thì trả lời NGẮN GỌN (1-3 câu) kèm dòng cảnh báo: '⚠️ Đây là thông tin tham khảo chung, TADA chưa có tài liệu chính thức về vấn đề này — vui lòng kiểm tra với chuyên gia hoặc liên hệ TADA để được tư vấn.'`,
              `Nếu KHÔNG chắc chắn → chỉ trả lời: 'Tôi chưa có đủ thông tin để trả lời câu hỏi này. Bạn có thể hỏi rõ hơn về lĩnh vực thuế, kế toán, BHXH hoặc thủ tục doanh nghiệp để tôi tra cứu được chính xác hơn.'`,
              `KHÔNG bịa số liệu, KHÔNG bịa tên văn bản luật, KHÔNG trả lời dài dòng.`,
            ].join('\n');
            try {
              const models = getModelList();
              const callModel: CallModelFn = async (model) => {
                if (getModelProvider(model) === 'gemini') {
                  return streamGemini(model, {
                    system: fallbackSystem,
                    user: userWithHistory,
                    maxTokens: 1024,
                    temperature: 0.0,
                  });
                }
                const chatStream = await getClientForModel(model).chat.completions.create({
                  model,
                  max_tokens: 1024,
                  temperature: 0.0,
                  messages: [
                    { role: 'system', content: fallbackSystem },
                    { role: 'user', content: userWithHistory },
                  ],
                  stream: true,
                });
                return chatStream as AsyncIterable<StreamDelta>;
              };
              let gotToken = false;
              for await (const _delta of streamWithModelFallback(models, callModel, (chunk) => {
                const d = chunk.content || '';
                if (!d) return;
                gotToken = true;
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: 'token', data: d })}\n\n`
                ));
              })) { /* delta xử lý trong onChunk */ }
              if (!gotToken) {
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: 'token', data: NO_KNOWLEDGE_ANSWER })}\n\n`
                ));
              }
            } catch (e) {
              console.warn('LLM fallback (no knowledge) fail — gửi NO_KNOWLEDGE:', e);
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'token', data: NO_KNOWLEDGE_ANSWER })}\n\n`
              ));
            }
          } else {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'token', data: NO_KNOWLEDGE_ANSWER })}\n\n`
            ));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
          return;
        }

        try {
          // Fallback danh sách model: model đầu fail hết retry → tự chuyển model
          // dự phòng (lib/modelFallback.ts). List 1 model → hành vi như cũ
          // (3 retry, backoff). onChunk: cộng fullAnswer + đẩy SSE token.
          const models = getModelList(); // đọc lazily trong handler (tránh env freeze build-time)
          const callModel: CallModelFn = async (model) => {
            if (getModelProvider(model) === 'gemini') {
              // Gemini API: REST gốc (streamGenerateContent) — không có OpenAI-compatible
              return streamGemini(model, {
                system,
                user: userWithHistory,
                maxTokens: 4096,
                temperature: 0.0,
              });
            }
            // OpenAI-compatible: gửi history (role user/assistant) như messages
            // thật để LLM hiểu ngữ cảnh câu nối tiếp
            const historyMessages = history.map((h: HistoryMessage) => ({ role: h.role, content: h.content }));
            const chatStream = await getClientForModel(model).chat.completions.create({
              model,
              max_tokens: 4096,
              temperature: 0.0,
              messages: [
                { role: 'system', content: system },
                ...historyMessages,
                { role: 'user', content: user },
              ],
              stream: true,
            });
            return chatStream as AsyncIterable<StreamDelta>;
          };
          for await (const _delta of streamWithModelFallback(models, callModel, (chunk) => {
            const d = chunk.content || '';
            if (!d) return;
            fullAnswer += d;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'token', data: d })}\n\n`
            ));
          })) {
            // delta đã được xử lý trong onChunk — không làm gì thêm
          }
        } catch (e: any) {
          // Tất cả model fail → gửi 1 tin thân thiện (không lộ lỗi kỹ thuật raw,
          // không gửi thêm event error để client khỏi render 2 bubble bot)
          sentError = true;
          console.error('LLM stream error:', e);
        } finally {
          if (fullAnswer) {
            // không cache — mỗi lần hỏi tính toán mới, dùng tài liệu mới nhất
          } else if (sentError) {
            // LLM THẬT SỰ fail VÀ đã có context (nhánh no-knowledge đã return
            // sớm ở trên) → đây là lỗi hệ thống, gửi fallback "quá tải"
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'token', data: 'Hệ thống AI đang quá tải, xin vui lòng thử lại câu hỏi ngắn hơn hoặc hỏi lại sau.' })}\n\n`
            ));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (e: any) {
    console.error('Chat error:', e);
    const errMsg = e?.message || 'Internal error';
    // Safe: avoid returning HTML error pages
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
