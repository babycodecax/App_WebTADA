import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getClient } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CHAT_MODEL = process.env.LLM_MODEL || process.env.CHAT_MODEL || 'deepseek-v4-flash';
const TOP_K = 15;

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

// ─── Search: full-text + keyword rerank ───
function _tokenize(text: string): string[] {
  return (text || '').toLowerCase().split(/[\s,.\-:;!?()]+/).filter(t => t.length > 1);
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
  return boost;
}

async function searchKnowledge(query: string, topK: number = TOP_K) {
  const terms = _tokenize(query);
  if (!terms.length) return [];

  // Load all chunks from Supabase (cached in Vercel edge)
  const { data, error } = await getSupabase()
    .from('knowledge_chunks')
    .select('id, content, title, heading, file_path, chunk_index')
    .limit(2000);

  if (error || !data || !data.length) {
    console.warn('Knowledge load error:', error);
    return [];
  }

  // Filter + score
  const scored: any[] = [];
  for (const row of data) {
    const content = (row.content || '');
    const title = (row.title || '');
    const heading = (row.heading || '');
    const haystack = (content + ' ' + title + ' ' + heading).toLowerCase();

    let matchCount = 0;
    for (const t of terms) {
      if (haystack.includes(t)) matchCount++;
    }
    if (matchCount === 0) continue;

    // Base score: match density
    let score = matchCount / terms.length;

    // Cheatsheet: +5 ưu tiên tuyệt đối
    if (title.toLowerCase().includes('cheatsheet') || title.toLowerCase().includes('_cheatsheet')) {
      score += 5.0;
    }
    // Chunk có số liệu cụ thể
    const numMatches = (content.match(/\d{1,3}(?:[.,]\d+)?\s*(tỷ|triệu|tr|nghìn|%|đồng)/gi) || []).length;
    score += Math.min(numMatches * 0.2, 1.0);
    // Title/heading match
    for (const field of [title.toLowerCase(), heading.toLowerCase()]) {
      if (field && terms.some(t => field.includes(t))) score += 1.5;
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
      ctxText = contexts.map((c, i) =>
        `--- Tai lieu ${i + 1} ---\nTieu de: ${c.title || ''}\nMuc: ${c.heading || ''}\nNoi dung:\n${c.content || ''}`
      ).join('\n\n');
    }

    // 4. Structured knowledge
    const structured = await getStructuredKnowledge();
    const structuredPrompt = buildStructuredPrompt(structured);

    // 5. Build system prompt
    const system = [
      `Bạn là trợ lý thuế/kế toán Việt Nam.`,
      `Trả lời THEO 3 BƯỚC:`,
      `1. TRA SỐ LIỆU: tìm con số/mốc/tỷ lệ trong tài liệu tham khảo, ưu tiên số từ BẢNG SỐ LIỆU bên dưới.`,
      `2. TÍNH NẾU CẦN: nếu câu hỏi yêu cầu phép tính, hãy tính.`,
      `3. ĐÁP ÁN: 1-2 câu ngắn gọn.`,
      ``,
      `QUY TẮC:`,
      `- Trả lời BẰNG CON SỐ CỤ THỂ.`,
      `- KHÔNG mở đầu bằng 'Theo tài liệu/Điều luật/Nghị định/Theo quy định'.`,
      `- KHÔNG thêm [Nguồn X] / 'Nguồn tham khảo'.`,
      `- KHÔNG nói 'không có thông tin'. LUÔN trả lời dựa trên tài liệu.`,
      `- KHÔNG bịa số liệu.`,
      `- Nếu tài liệu không có số cụ thể, trả lời DỰA TRÊN KIẾN THỨC về thuế/kế toán Việt Nam.`,
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
            max_tokens: 2048,
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
          if (fullAnswer && !contexts.length) {
            // Only cache if we had results
          } else if (fullAnswer) {
            await setCachedAnswer(question, fullAnswer, sources);
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
