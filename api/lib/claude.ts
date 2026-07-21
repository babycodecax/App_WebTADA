import OpenAI from 'openai';

let _client: OpenAI | null = null;

export function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');

  if (!_client) {
    _client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: 60000,
      maxRetries: 5,
      defaultHeaders: {
        'HTTP-Referer': 'https://tada.vn',
        'X-Title': 'TADA AI Chatbox',
      },
    });
  }
  return _client;
}

// Model co the doi qua env. Chat: OpenRouter. Embedding: Gemini free (768 dim).
export const CHAT_MODEL = process.env.CHAT_MODEL || 'anthropic/claude-3.5-sonnet';
export const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-004';

// Embedding dung Google Gemini (mien phi tai aistudio.google.com/apikey).
// Tra ve vector 768 chieu (text-embedding-004).
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
        }),
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
