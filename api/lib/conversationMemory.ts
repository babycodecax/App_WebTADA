/**
 * conversationMemory.ts — Bộ nhớ hội thoại chatbox (Vercel api/).
 *
 * Frontend gửi lịch sử (history) kèm mỗi request; route dùng để:
 *   1. Bổ sung term cho search (câu nối tiếp: "còn hộ kinh doanh thì sao"
 *      hiểu ngữ cảnh từ câu hỏi trước về TNCN).
 *   2. Gửi cho LLM như messages user/assistant để trả lời theo ngữ cảnh.
 *
 * An toàn: chỉ nhận {role: 'user'|'assistant', content: string}; giới hạn
 * MAX_TURNS lượt (2*MAX_TURNS message cuối), mỗi content cắt ≤ MAX_CHARS ký tự.
 * Mọi giới hạn là hằng số export — test được trực tiếp.
 *
 * Module THUẦN: không import Supabase/OpenAI, không side-effect.
 */

/** Số lượt (turn) gần nhất được giữ — 1 lượt = 1 user + 1 assistant. */
export const MAX_TURNS = 6;

/** Độ dài tối đa mỗi nội dung message sau khi cắt. */
export const MAX_CHARS = 500;

/** Số câu hỏi user gần nhất dùng để trích term bổ sung search. */
export const CONTEXT_QUESTIONS = 3;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// queryExpansion.ts không import conversationMemory → không vòng lặp import
import { expandKeywords, tokenize } from './queryExpansion';

/**
 * Lọc history từ input không tin cậy (body request): chỉ giữ phần tử
 * {role: 'user'|'assistant', content: string không rỗng}. Các phần tử rác
 * (không phải object, role lạ, content không phải string/rỗng) bị loại.
 * Input không phải mảng → [] (request cũ không gửi history vẫn chạy).
 */
export function sanitizeHistory(input: unknown): HistoryMessage[] {
  if (!Array.isArray(input)) return [];
  const out: HistoryMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string' || !content.trim()) continue;
    out.push({ role, content });
  }
  return out;
}

/**
 * Giới hạn lịch sử: giữ tối đa MAX_TURNS lượt = 2*MAX_TURNS message cuối,
 * mỗi content cắt còn MAX_CHARS ký tự. Không đổi thứ tự.
 */
export function limitHistory(messages: HistoryMessage[]): HistoryMessage[] {
  const kept = messages.slice(-(MAX_TURNS * 2));
  return kept.map(m => ({
    role: m.role,
    content: m.content.length > MAX_CHARS ? m.content.slice(0, MAX_CHARS) : m.content,
  }));
}

/**
 * Trích term bổ sung cho search từ lịch sử: tokenize CONTEXT_QUESTIONS câu
 * hỏi user gần nhất (trước câu hiện tại), bỏ term đã có trong câu hiện tại
 * (tránh lặp) và stopword. Dùng cho câu nối tiếp ngắn — nếu term trùng hết
 * với câu hiện tại → trả [] (không nhiễu search).
 */
export function extractContextTerms(
  messages: HistoryMessage[],
  currentQuestion: string
): string[] {
  if (!Array.isArray(messages) || !messages.length) return [];

  // Token hóa câu hỏi hiện tại để loại term trùng (không cần mở rộng —
  // mở rộng đã làm ở searchKnowledge cho chính câu hiện tại)
  const currentTerms = new Set(tokenize(currentQuestion || ''));

  // Lấy CONTEXT_QUESTIONS câu hỏi user gần nhất (lọc từ cuối mảng)
  const userQuestions: string[] = [];
  for (let i = messages.length - 1; i >= 0 && userQuestions.length < CONTEXT_QUESTIONS; i--) {
    if (messages[i].role === 'user') userQuestions.push(messages[i].content);
  }
  if (!userQuestions.length) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  // Mở rộng cả synonym domain cho term câu hỏi trước (VD "thuế suất" của câu
  // trước → "biểu thuế lũy tiến") — tăng recall cho câu nối tiếp
  for (const q of userQuestions) {
    for (const t of expandKeywords(q)) {
      if (currentTerms.has(t) || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
