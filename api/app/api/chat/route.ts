import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getClient } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 120;

const CHAT_MODEL = process.env.LLM_MODEL || process.env.CHAT_MODEL || 'deepseek-v4-flash';
const TOP_K = 20;

// ─── Structured knowledge (cache hot) ───
let _structuredCache: { key: string; value: string }[] | null = null;

async function getStructuredKnowledge() {
  if (_structuredCache) return _structuredCache;
  const { data } = await getSupabase()
    .from('knowledge_structured')
    .select('key, value');
  _structuredCache = data || [];
  return _structuredCache;
}

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

function _keywordBoost(query: string, chunk: { content: string; title: string; heading: string }): number {
  const q = query.toLowerCase();
  const text = (chunk.content || '').toLowerCase();
  const title = (chunk.title || '').toLowerCase();
  const heading = (chunk.heading || '').toLowerCase();

  let boost = 0;
  for (const field of [title, heading]) {
    if (field && q.split(/\s+/).some(w => field.includes(w))) boost += 1.5;
  }
  const numMatches = (text.match(/\d{1,3}(?:[.,]\d+)?\s*(tỷ|triệu|tr|nghìn|%|đồng)/gi) || []).length;
  boost += Math.min(numMatches * 0.3, 1.0);
  if (title.toLowerCase().includes('cheatsheet')) boost += 3.0;

  // Keyword mapping boost: nếu query có chứa từ domain chuẩn
  for (const [key] of Object.entries(TOPIC_KEYWORDS)) {
    if (q.includes(key) && (title.includes(key) || heading.includes(key) || text.includes(key))) {
      boost += 1.0;
    }
  }

  return boost;
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

// Phát hiện chủ đề từ query để bổ sung search
function _detectTopics(q: string): string[] {
  const topics: string[] = [];
  if (/hộ.*kinh.*doanh|hkd|cndk|kinh doanh|may mặc|bán hàng|dịch vụ/.test(q)) topics.push('hộ kinh doanh');
  if (/bất động sản|nhà|đất|chuyển nhượng/.test(q)) topics.push('bất động sản');
  if (/đầu tư|chứng khoán|cổ phiếu|trái phiếu/.test(q)) topics.push('đầu tư chứng khoán');
  if (/xuất nhập khẩu|xnk|hải quan/.test(q)) topics.push('xuất nhập khẩu');
  if (/bảo hiểm|bhxh|bhyt|bhtn/.test(q)) topics.push('bảo hiểm');
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
  if (!terms.length) return [];
  console.log('[search] terms:', JSON.stringify(terms), 'topics:', JSON.stringify(topics));

  // Load all chunks from Supabase (cached in Vercel edge)
  const { data, error } = await getSupabase()
    .from('knowledge_chunks')
    .select('id, content, title, heading, file_path, chunk_index')
    .limit(2000);

  if (error || !data || !data.length) {
    console.warn('Knowledge load error:', error);
    return [];
  }

  // Score ALL chunks — KHÔNG filter, dùng boost-based scoring
  const scored: any[] = [];
  const topicBoost = topics.length > 0 ? topics.join(' ') : '';
  for (const row of data) {
    const content = (row.content || '');
    const title = (row.title || '');
    const heading = (row.heading || '');
    const haystack = (content + ' ' + title + ' ' + heading).toLowerCase();

    const matchCount = _countMatches(terms, haystack);
    // Base: match count (log-scale)
    let score = matchCount > 0 ? 1.0 + Math.log2(matchCount + 1) : 0;

    // Cheatsheet: +8 ưu tiên tuyệt đối
    if (title.toLowerCase().includes('cheatsheet') || title.toLowerCase().includes('_cheatsheet')) {
      score += 8.0;
    }
    // Chunk có số liệu cụ thể 50tr, 2 người...
    const numMatches = (content.match(/\d{1,3}(?:[.,]\d+)?\s*(tỷ|triệu|tr|nghìn|%|đồng)/gi) || []).length;
    score += Math.min(numMatches * 0.3, 1.5);
    // Title/heading match
    for (const field of [title.toLowerCase(), heading.toLowerCase()]) {
      if (field && terms.some(t => field.includes(t))) score += 1.5;
    }
    // Topic boost: nếu chunk có chứa từ khóa topic, +5 để ưu tiên
    if (topicBoost && haystack.includes(topicBoost)) {
      score += 5.0;
      // Thêm bonus nếu title/heading có topic
      if (title.includes(topicBoost) || heading.includes(topicBoost)) {
        score += 3.0;
      }
    }
    // Topic keyword boost
    for (const [key] of Object.entries(TOPIC_KEYWORDS)) {
      if (terms.some(t => key.includes(t)) && haystack.includes(key)) {
        score += 1.0;
      }
    }

    scored.push({ ...row, score });
  }

  scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  const top = scored.slice(0, topK);
  return top;
}

function rerank(query: string, terms: string[], chunks: any[], topK: number) {
  const scored = chunks.map(c => ({
    ...c,
    score: _keywordBoost(query, c),
  }));
  scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  return scored.slice(0, topK);
}

// ─── Answer cache ───
import crypto from 'crypto';

function hashQuestion(q: string): string {
  return crypto.createHash('sha256').update(q.toLowerCase().trim()).digest('hex').slice(0, 16);
}

async function getCachedAnswer(question: string): Promise<string | null> {
  const hash = hashQuestion(question);
  const { data } = await getSupabase()
    .from('answer_cache')
    .select('answer')
    .eq('question_hash', hash)
    .single();
  return data?.answer || null;
}

async function setCachedAnswer(question: string, answer: string, sources: any[]) {
  const hash = hashQuestion(question);
  try {
    await getSupabase()
      .from('answer_cache')
      .upsert({
        question_hash: hash,
        question: question,
        answer,
        sources_json: JSON.stringify(sources),
      }, { onConflict: 'question_hash' });
  } catch (e) {
    // Cache write failure = not critical
  }
}

// ─── Main chat handler ───
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.question || typeof body.question !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing question' }), { status: 400 });
    }
    const question = body.question.trim();

    // 1. Check cache
    const cached = await getCachedAnswer(question);
    if (cached) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', data: [] })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', data: cached })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }

    // 2. Search knowledge
    const contexts = await searchKnowledge(question, TOP_K);
    let sources: any[] = [];

    // 3. Build context + sources
    let ctxText = '';
    if (contexts.length === 0) {
      ctxText = 'KHÔNG có tài liệu tham khảo nào được tìm thấy.';
    } else {
      sources = contexts.map(c => ({
        title: c.title || '',
        heading: c.heading || '',
        file_path: c.file_path || '',
        score: c.score || 0,
      }));
      // Đa dạng hóa nguồn: tối đa 1 chunk/file, ưu tiên nhiều chủ đề khác nhau
      // Nhưng vẫn ưu tiên giữ ít nhất 1 file TNCN và 1 file HKD nếu có
      const seenFiles = new Set<string>();
      const diverseSources: typeof contexts = [];
      // forcedTopics: các file_path pattern cần giữ
      const forcedPatterns: {pattern: RegExp, label: string}[] = [];
      if (/thu nhập|tiền công|tiền lương|tncn|lương/.test(question)) {
        forcedPatterns.push({pattern: /tncn|luat-109|nd-253/, label: 'tncn'});
      }
      if (/hkd|hộ kinh doanh|kinh doanh|may mặc/.test(question)) {
        forcedPatterns.push({pattern: /nd-68-2026|tt-50-2026/, label: 'hkd'});
      }
      // Luôn giữ cheatsheet nếu có
      forcedPatterns.push({pattern: /cheatsheet/, label: 'cheatsheet'});

      for (const c of contexts) {
        const fp = c.file_path || '';
        if (seenFiles.has(fp)) continue;
        seenFiles.add(fp);
        diverseSources.push(c);
        if (diverseSources.length >= 6) break;
      }
      // Force-add các chunk cần thiết nếu chưa có
      for (const {pattern, label} of forcedPatterns) {
        if (diverseSources.some(s => pattern.test(s.file_path || ''))) continue;
        const forced = contexts.find(c => pattern.test(c.file_path || '') && !diverseSources.includes(c));
        if (forced) {
          if (diverseSources.length >= 8) diverseSources.pop(); // thay thế chunk cuối
          diverseSources.push(forced);
        }
      }
      // Giới hạn content mỗi chunk để tránh prompt quá dài
      ctxText = diverseSources.map((c, i) =>
        `--- Tai lieu ${i + 1} ---\nTieu de: ${c.title || ''}\nMuc: ${c.heading || ''}\nNoi dung:\n${(c.content || '').slice(0, 1000)}`
      ).join('\n\n');
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
      `- Trích NGUYÊN VĂN số liệu, tên mẫu biểu trong tài liệu. KHÔNG sửa, KHÔNG suy luận.`,
      `- Nếu câu hỏi yêu cầu tính toán → dùng đúng số trong tài liệu để tính.`,
      `- Nếu tài liệu không có câu trả lời → báo 'Xin lỗi, tôi không tìm thấy thông tin phù hợp.'`,
      `- KHÔNG tự ý sửa số, KHÔNG thêm số không có trong tài liệu.`,
      ``,
      `ĐỊNH DẠNG TRẢ LỜI (bắt buộc):`,
      `- Trả lời 1-2 câu, tối đa 50 từ. Giải thích nhẹ nhưng đúng trọng tâm.`,
      `- KHÔNG mở đầu bằng 'Theo...', 'Tài liệu...', 'Điều...', 'Bước...'.`,
      `- KHÔNG thêm [Nguồn], <think>, markdown.`,
      `- Nếu hỏi số → đưa số kèm giải thích ngắn (VD: '15% — áp dụng cho doanh nghiệp trên 1 tỷ').`,
      `- CUỐI câu trả lời, thêm 1 dòng: ghi tên văn bản luật đã dùng (VD: '(Căn cứ Luật số 67/2025/QH15)'). KHÔNG ghi điều cụ thể, KHÔNG ghi [Nguồn].`,
      structuredPrompt,
    ].filter(Boolean).join('\n');

    const user = `Tai lieu tham khao:\n${ctxText}\n\nCau hoi: ${question}`;

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
        } catch (e: any) {
          console.error('LLM stream error:', e);
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', data: e.message || 'LLM error' })}\n\n`
          ));
        } finally {
          // Cache the answer
          if (fullAnswer) {
            await setCachedAnswer(question, fullAnswer, sources);
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
