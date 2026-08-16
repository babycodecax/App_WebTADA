import OpenAI from 'openai';
import {
  getClientForModel,
  getModelList,
  getModelProvider,
  streamGemini,
  streamWithModelFallback,
  type StreamDelta,
} from './modelFallback';

/**
 * getClient() — client cho MODEL CHÍNH (model đầu của danh sách LLM_MODEL).
 * Provider theo prefix: 'gemini/...' → Gemini API; khác → LLM_API_KEY + baseURL.
 */
export function getClient(): OpenAI {
  return getClientForModel(getModelList()[0]);
}

export const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-004';

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] } }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini embed ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      return data.embedding.values as number[];
    } catch (e) {
      lastErr = e;
      if (attempt >= 6) break;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

/**
 * streamChat — stream câu trả lời qua danh sách model (LLM_MODEL phân tách
 * dấu phẩy). Model đầu fail hết retry → tự chuyển model dự phòng + log.
 * List 1 model → hành vi giữ nguyên như cũ (3 retry, backoff 1s/2s).
 */
export async function* streamChat(
  system: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): AsyncGenerator<string> {
  const messages = [
    { role: 'system' as const, content: system },
    ...history,
    { role: 'user' as const, content: userMessage },
  ];

  const models = getModelList();
  const userMessageText = userMessage;
  yield* streamWithModelFallback(models, async (model) => {
    if (getModelProvider(model) === 'gemini') {
      return streamGemini(model, {
        system,
        user: userMessageText,
        maxTokens: 1024,
        temperature: 0.0,
      });
    }
    const stream = await getClientForModel(model).chat.completions.create({
      model,
      max_tokens: 1024,
      messages,
      stream: true,
    });
    return stream as AsyncIterable<StreamDelta>;
  });
}
