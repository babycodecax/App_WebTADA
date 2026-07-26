import OpenAI from 'openai';

// Load .env.local for production
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') }); } catch (e) {}

export function getClient(): OpenAI {
  const model = process.env.LLM_MODEL || 'deepseek-v4-flash';
  let apiKey: string;
  let baseURL: string;

  if (model.startsWith('gemini/')) {
    // Gemini models qua Gemini API
    apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  } else {
    // Opencode Go / provider khác
    apiKey = process.env.LLM_API_KEY || '';
    if (!apiKey) throw new Error('Missing LLM_API_KEY');
    baseURL = (process.env.LLM_API_BASE_URL || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, '');
  }

  return new OpenAI({
    apiKey,
    baseURL,
    timeout: 60000,
    maxRetries: 5,
  });
}

export const CHAT_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash';
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

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const stream = await getClient().chat.completions.create({
        model: CHAT_MODEL,
        max_tokens: 1024,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
      return;
    } catch (e) {
      lastErr = e;
      if (attempt >= 3) break;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}
