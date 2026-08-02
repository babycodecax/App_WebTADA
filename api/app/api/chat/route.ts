import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getClient } from '@/lib/claude';
import { getStructuredKnowledge } from '@/lib/structured';
import { isNumericQuery, searchCompliance, formatComplianceContext } from '@/lib/compliance';

export const runtime = 'nodejs';
export const maxDuration = 120;

const CHAT_MODEL = process.env.LLM_MODEL || process.env.CHAT_MODEL || 'deepseek-v4-flash';
const TOP_K = 20;

// ─── Structured knowledge (cache hot — xem lib/structured.ts) ───

function buildStructuredPrompt(structured: { key: string; value: string }[]): string {
  if (!structured.length) return '';
  const rows = structured.map(e => `- ${e.key.replace(/_/g, ' ')}: ${e.value}`).join('\n');
  return `\nBẢNG SỐ LIỆU TRA CỨU NHANH (ưu tiên dùng số này):\n${rows}\n`;
}

// Keyword mapping: từ thường → từ domain chuẩn (giúp search match tài liệu thuế)
const TOPIC_KEYWORDS: Record<string, string> = {
  'tncn': 'thuế thu nhập cá nhân',
  'thuế tncn': 'thuế thu nhập cá nhân',
  'thu nhập': 'thu nhập',
  'thu nhập cá nhân': 'thuế thu nhập cá nhân',
  'người phụ thuộc': 'người phụ thuộc',
  'giảm trừ': 'giảm trừ',
  'giảm trừ gia cảnh': 'giảm trừ gia cảnh',
  'thuế suất': 'thuế suất',
  'biểu thuế': 'biểu thuế lũy tiến',
  'tiền lương': 'thu nhập từ tiền lương',
  'tiền công': 'thu nhập từ tiền lương',
  'thu nhập tiền công': 'thu nhập từ tiền lương',
  'đóng thuế': 'số thuế phải nộp',
  'số thuế': 'số thuế phải nộp',
  'miễn thuế': 'miễn thuế',
  'mốc miễn': 'miễn thuế',
  'quyết toán': 'quyết toán thuế',
  'ngưỡng': 'ngưỡng doanh thu',
};

// ─── Search: full-text + keyword rerank ───
// Stopword cơ bản — loại khỏi search terms để tránh nhiễu
const STOPWORDS = new Set([
  'và', 'của', 'là', 'được', 'trong', 'với', 'cho', 'năm', 'các', 'có',
  'theo', 'tại', 'từ', 'để', 'khi', 'nào', 'bao', 'nhiêu', 'làm', 'sao',
  'thế', 'này', 'như', 'về', 'còn', 'đã', 'sẽ', 'đang', 'bị', 'không',
  'những', 'một', 'hai', 'ba', 'ngày', 'tháng', 'mấy', 'đó', 'thì',
]);

function _tokenize(text: string): string[] {
  // Giữ cả token ngắn có chứa số (VD: "2", "50") vì là giá trị thuế quan trọng
  return (text || '').toLowerCase().split(/[\s,.\-:;!?()]+/).filter(t => {
    if (t.length === 0) return false;
    if (t.length === 1 && !/\d/.test(t)) return false; // chỉ lọc "a", "b" — giữ "2", "5"
    if (STOPWORDS.has(t)) return false; // lọc stopword
    return true;
  });
}

/** Mở rộng query: thêm từ khóa domain chuẩn + tokenize query gốc */
function _expandKeywords(query: string): string[] {
  const q = query.toLowerCase().trim();
  const terms: string[] = [];

  // 1) Tokenize query gốc
  const tokens = _tokenize(q);
  for (const t of tokens) {
    if (!terms.includes(t)) terms.push(t);
  }

  // 2) Thêm token domain chuẩn từ keyword mapping
  for (const [key, val] of Object.entries(TOPIC_KEYWORDS)) {
    if (q.includes(key)) {
      const valTokens = _tokenize(val);
      for (const vt of valTokens) {
        if (!terms.includes(vt)) terms.push(vt);
      }
    }
  }

  return terms;
}

/** Đếm số term match trong chunk, dùng để boost chứ không filter */
function _countMatches(terms: string[], haystack: string): number {
  let count = 0;
  for (const t of terms) {
    if (haystack.includes(t)) count++;
  }
  return count;
}

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

async function searchKnowledge(query: string, topK: number = TOP_K) {
  const terms = _tokenize(query);
  const topics = _detectTopics(query);
  // Thêm term chủ đề vào search để ưu tiên chunk đúng chủ đề
  for (const t of topics) {
    const tTokens = _tokenize(t);
    for (const tt of tTokens) {
      if (!terms.includes(tt)) terms.push(tt);
    }
  }
  const qLow = query.toLowerCase();
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
  ];
  const VITAL_LIMIT = 200; // mỗi file chunk nhỏ, 200 đủ

  const queries = [
    getSupabase()
      .from('knowledge_chunks')
      .select('id, content, title, heading, file_path, chunk_index')
      .limit(1000),
    getSupabase()
      .from('knowledge_chunks')
      .select('id, content, title, heading, file_path, chunk_index')
      .like('file_path', 'upload/%')
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

  // Gộp data + dedup theo id (chunks file trọng yếu có thể trùng với page1)
  const seenIds = new Set<string>();
  const data: any[] = [];
  for (const res of results) {
    for (const row of res.data || []) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      data.push(row);
    }
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

    const matchCount = _countMatches(terms, haystack);
    let score = matchCount > 0 ? 1.0 + Math.log2(matchCount + 1) : 0;

    // Cheatsheet boost +1 (trước +8/+3 — cheatsheet match nhiều term phổ biến
    // nên tự nhiên đã cao; boost lớn khiến nó chiếm hết slots, chunk chuyên đề
    // (vàng, kho bạc, mệnh giá...) không lên top → LLM trả sai/thiếu. Chỉ giữ
    // +1 để cheatsheet vẫn nhỉnh hơn khi không có chunk chuyên đề match.)
    const isCheatsheet = title.toLowerCase().includes('cheatsheet') || title.toLowerCase().includes('_cheatsheet');
    if (isCheatsheet) {
      score += 1.0;
    }
    // Tài liệu admin upload: boost RẤT CAO để tài liệu bổ sung (nội bộ, mới nhất)
    // luôn thắng file luật cũ khi cùng chủ đề — vì upload là nguồn chính xác nhất
    // cho các quy định bổ sung (LLM từng đọc luat-109 cũ rồi bỏ qua upload).
    if ((row.file_path || '').startsWith('upload/')) {
      score += 8.0;
      if (matchCount > 0) score += Math.min(matchCount * 0.5, 2.0); // match càng nhiều càng ưu tiên
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

    scored.push({ ...row, score });
  }

  scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  // Luôn giữ TẤT CẢ upload chunks (file bổ sung kiến thức) trong top —
  // không cắt ở topK — vì chunk đúng chủ đề (VD: gôn, nước sạch) có thể có
  // score thấp do ngắn/ít term nhưng vẫn là nguồn chính xác nhất.
  const uploadOnly = scored.filter(c => (c.file_path || '').startsWith('upload/'));
  const top = [...uploadOnly, ...scored.filter(c => !(c.file_path || '').startsWith('upload/')).slice(0, topK)];
  // Merge forcedChunks vào cuối nếu chưa có trong top
  // topK + 6 vì có thể có tới 6 chunks force theo nội dung (giảm trừ / 01 tỷ / 50.000)
  for (const fc of forcedChunks) {
    if (top.length >= topK + 6) break;
    if (!top.some(t => t.id === fc.id)) {
      fc.score = 5.0; // gán điểm thấp để xếp cuối nhưng vẫn có
      top.push(fc);
    }
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
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.question || typeof body.question !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing question' }), { status: 400 });
    }
    // Chuẩn hóa query về lowercase NGAY (H1): tiếng Việt viết hoa đầu câu
    // ("Miễn thuế TNCN 2026?") phải match được mọi regex chế độ mốc/chủ đề.
    const question = body.question.trim().toLowerCase();

    // Câu hỏi dạng mốc/ngưỡng → trả lời dạng danh sách đầy đủ (dùng cho cả
    // prompt lẫn đa dạng hóa nguồn bên dưới). KHÔNG dùng 'trần' — false-positive
    // với tên người ("Trần Văn A").
    const isMocQuery = /mốc|ngưỡng|miễn thuế|hạn mức|danh sách/.test(question);

    // 1. Search knowledge (không dùng cache câu trả lời — luôn tính toán mới
    //    để căn cứ tài liệu mới nhất, tránh trả câu trả lời cũ)
    const contexts = await searchKnowledge(question, TOP_K);
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
      const uploadChunks = contexts.filter(c => (c.file_path || '').startsWith('upload/'));
      const uploadBudget = Math.min(uploadChunks.length, UPLOAD_MAX, UPLOAD_CAP);
      for (let i = 0; i < uploadBudget; i++) {
        diverseSources.push(uploadChunks[i]);
      }
      // Round-robin các file KHÔNG upload: luôn dành tối đa 6 slots kể cả khi
      // có nhiều upload chunks (fix MEDIUM: trước đây vòng lặp chặn theo
      // diverseSources.length < 6 → upload ≥ 6 chunks khiến luật/nd/tt điểm cao
      // không bao giờ vào context dù câu hỏi chạm upload chỉ tương đối).
      let vaultSlots = 0;
      for (let round = 0; round < maxChunksPerFile && vaultSlots < 6; round++) {
        for (const chunks of byFile.values()) {
          if (vaultSlots >= 6) break; // chỉ 6 sources ngoài upload
          const chunk = chunks[round]; // chunk thứ `round` của file (nếu có)
          if (chunk && !(chunk.file_path || '').startsWith('upload/') && !diverseSources.includes(chunk)) {
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

    // 6. Stream LLM
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send sources first
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'sources', data: sources.map(s => ({ title: s.title, heading: s.heading, file_path: s.file_path, score: s.score })) })}\n\n`
        ));

        let fullAnswer = '';
        try {
          // Retry khi LLM lỗi/từ chối — tránh fallback "quá tải" sai lệch
          let lastErr: any = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const chatStream = await getClient().chat.completions.create({
                model: CHAT_MODEL,
                max_tokens: 4096,
                temperature: 0.0,
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: user },
                ],
                stream: true,
              });

              for await (const chunk of chatStream) {
                const delta = chunk.choices[0]?.delta?.content;
                if (delta) {
                  fullAnswer += delta;
                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'token', data: delta })}\n\n`
                  ));
                }
              }
              if (fullAnswer) break; // có câu trả lời → thoát retry
            } catch (e: any) {
              lastErr = e;
              console.warn(`LLM stream attempt ${attempt} failed:`, e?.message);
              if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * attempt));
            }
          }
          if (!fullAnswer && lastErr) {
            console.error('LLM stream error (all attempts):', lastErr);
          }
        } catch (e: any) {
          console.error('LLM stream error:', e);
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', data: e.message || 'LLM error' })}\n\n`
          ));
        } finally {
          if (fullAnswer) {
            // không cache — mỗi lần hỏi tính toán mới, dùng tài liệu mới nhất
          } else if (contexts.length > 0) {
            // Có sources nhưng LLM ko trả lời → gửi fallback
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
