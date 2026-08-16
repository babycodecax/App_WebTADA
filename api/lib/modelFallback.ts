/**
 * modelFallback.ts — Cơ chế DANH SÁCH MODEL DỰ PHÒNG cho chatbox (Vercel).
 *
 * LLM_MODEL nhận danh sách model phân tách dấu phẩy, VD:
 *   'gemini/gemma-4-31b-it,deepseek-v4-flash'
 * Model đầu = model chính; các model sau = dự phòng khi model chính lỗi
 * (network / 4xx-5xx / timeout) sau khi đã hết số lần retry hiện có.
 *
 * Provider theo prefix:
 *   - 'gemini/...'  → Gemini API (GEMINI_API_KEY, baseURL generativelanguage)
 *   - khác          → LLM_API_KEY + LLM_API_BASE_URL (mặc định Opencode/OpenRouter)
 *
 * Module thuần: không import Supabase; env đọc lazily trong từng hàm để tránh
 * env bị freeze ở build-time trên Vercel. Khi list chỉ có 1 model → hành vi
 * giữ nguyên như cũ (3 lần retry, backoff 1s/2s).
 */

import OpenAI from 'openai';

export const DEFAULT_MODEL = 'deepseek-v4-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_LLM_BASE_URL = 'https://opencode.ai/zen/go/v1';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/** Kiểu delta token model trả về trong stream — chuẩn hóa cho mọi provider. */
export type StreamDelta = { content?: string | null };

/** Tham số gọi model — provider tự quyết định cách dùng (gemini: systemInstruction/contents). */
export interface ChatRequest {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}

/** callModel: mở stream cho 1 model cụ thể; trả về async iterable các delta. */
export type CallModelFn = (model: string) => Promise<AsyncIterable<StreamDelta>>;

/**
 * Gọi Gemini API qua REST (endpoint gốc /v1beta — KHÔNG có OpenAI-compatible).
 * Model trong LLM_MODEL có prefix 'gemini/' → tên thật là phần sau prefix.
 * SSE stream: candidates[0].content.parts[].text → { content }.
 */
export async function* streamGemini(
  rawModel: string,
  req: ChatRequest
): AsyncGenerator<StreamDelta> {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  const model = rawModel.replace(/^gemini\//, ''); // bỏ prefix trước khi gửi
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: { maxOutputTokens: req.maxTokens, temperature: req.temperature },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  // Parse SSE: mỗi sự kiện "data: {...}" chứa 1 chunk
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Gemini: response body empty');
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const parts = json?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const p of parts) {
              if (p?.text) yield { content: p.text };
            }
          }
        } catch {
          // chunk không phải JSON — bỏ qua
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Tách chuỗi LLM_MODEL thành danh sách model: trim, bỏ phần tử rỗng,
 * dedupe giữ thứ tự. Rỗng/undefined → [DEFAULT_MODEL].
 */
export function parseModelList(raw?: string | null): string[] {
  const models: string[] = [];
  for (const part of (raw || '').split(',')) {
    const m = part.trim();
    if (!m) continue;
    if (!models.includes(m)) models.push(m);
  }
  return models.length ? models : [DEFAULT_MODEL];
}

/** Danh sách model hiện dùng: LLM_MODEL → CHAT_MODEL → default (khớp fallback cũ). */
export function getModelList(): string[] {
  return parseModelList(process.env.LLM_MODEL || process.env.CHAT_MODEL || DEFAULT_MODEL);
}

/** Xác định provider cho model: prefix 'gemini/' → 'gemini', còn lại → 'llm'. */
export function getModelProvider(model: string): 'gemini' | 'llm' {
  return model.startsWith('gemini/') ? 'gemini' : 'llm';
}

/**
 * Dựng OpenAI client cho model không-phải-Gemini. Model có prefix 'gemini/'
 * KHÔNG dùng OpenAI client — đi qua streamGemini() (REST gốc của Gemini).
 * Thiếu key → throw rõ ràng.
 */
export function getClientForModel(model: string): OpenAI {
  if (getModelProvider(model) === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
    // Base URL Gemini chỉ dùng cho streamGemini() — không tạo OpenAI client ở đây
    return new OpenAI({ apiKey, baseURL: `${GEMINI_API_BASE}/openai/`, timeout: 60000, maxRetries: 5 });
  }
  const apiKey = process.env.LLM_API_KEY || '';
  if (!apiKey) throw new Error('Missing LLM_API_KEY');
  const baseURL = (process.env.LLM_API_BASE_URL || DEFAULT_LLM_BASE_URL).replace(/\/+$/, '');
  return new OpenAI({ apiKey, baseURL, timeout: 60000, maxRetries: 5 });
}

/** Chuẩn hóa lý do lỗi cho log fallback. */
export function describeError(e: unknown): string {
  if (e instanceof Error) {
    const msg = e.message || 'unknown error';
    const httpStatus = (e as Error & { status?: number }).status;
    if (typeof httpStatus === 'number' && httpStatus >= 400) return `HTTP ${httpStatus}`;
    if (/fetch failed|network|timeout|timed out|socket|ECONN|EAI_AGAIN/i.test(msg)) {
      return 'network/timeout';
    }
    return msg;
  }
  return String(e);
}

/**
 * Stream qua danh sách model với fallback:
 * - vòng ngoài: lặp từng model; vòng trong: retry MAX_RETRIES lần (backoff cũ).
 * - attempt có ít nhất 1 token → coi là thành công, dừng model đó (không chuyển).
 * - model fail cả MAX_RETRIES lần → log `[model-fallback] ...` rồi sang model kế.
 * - hết list vẫn fail → throw lỗi cuối.
 * - delayFn tùy biến (mặc định 1s/2s như cũ) — tách để test không cần chờ.
 */
export async function* streamWithModelFallback(
  models: string[],
  callModel: CallModelFn,
  onChunk?: (delta: StreamDelta) => void,
  delayFn: (attempt: number) => number = (attempt) => RETRY_BASE_DELAY_MS * attempt
): AsyncGenerator<string> {
  const list = models.length ? models : [DEFAULT_MODEL];
  let lastErr: unknown;

  for (let mi = 0; mi < list.length; mi++) {
    const model = list[mi];
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let gotToken = false;
      try {
        const stream = await callModel(model);
        for await (const delta of stream) {
          const content = delta.content;
          if (content) {
            gotToken = true;
            if (onChunk) onChunk(delta);
            yield content;
          }
        }
        if (gotToken) return; // đã có câu trả lời → dừng cả luồng
        lastErr = new Error(`Model '${model}' trả về stream rỗng`);
      } catch (e) {
        // Đã có token giữa stream rồi mới lỗi → coi như thành công (giữ ngữ
        // nghĩa `if (fullAnswer) break` hiện tại: token không thể thu hồi,
        // không chuyển model khác để tránh trả lời lặp/khác nhau).
        if (gotToken) return;
        lastErr = e;
        // Log per-attempt (giữ mức debug của log cũ "LLM stream attempt N failed")
        console.warn(`[model-fallback] model '${model}' attempt ${attempt}/${MAX_RETRIES} fail: ${describeError(e)}`);
      }
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, delayFn(attempt)));
        continue;
      }
      // Hết retry mà chưa có token → chuyển model kế (nếu có)
      const nextModel = list[mi + 1];
      if (nextModel) {
        console.error(
          `[model-fallback] model '${model}' fail (${describeError(lastErr)}) sau ${MAX_RETRIES} lần — chuyển sang model '${nextModel}'`
        );
      }
      break;
    }
  }
  throw lastErr;
}
