/**
 * answerClassifier.ts — Phân loại "KHÔNG CÓ KIẾN THỨC" vs "GỌI LLM" cho chatbox.
 *
 * Fix MEDIUM (review): nhánh no-knowledge trước đây chỉ nhìn `contexts.length
 * === 0` — nhưng khi câu hỏi có số liệu (isNumericQuery) mà searchCompliance
 * tìm được records (complianceContext != '') thì VẪN CÓ dữ liệu structured để
 * trả lời; return sớm khiến khách nhận "chưa có đủ thông tin" dù có dữ liệu.
 *
 * Module THUẦN: không import Supabase/OpenAI, không side-effect — test trực
 * tiếp 4 tổ hợp (context rỗng / LLM fail / cả hai / bình thường).
 */

export type AnswerPath = 'no-knowledge' | 'call-llm';

/**
 * Quyết định đường trả lời:
 * - `no-knowledge`: KHÔNG có context (knowledge chunks) VÀ không có dữ liệu
 *   compliance structured → trả lời trung thực "chưa có đủ thông tin",
 *   KHÔNG gọi LLM (tiết kiệm chi phí + không trả lời chung chung).
 * - `call-llm`: có context HOẶC có compliance records → gọi LLM với dữ liệu
 *   sẵn có. Nếu LLM thật sự fail ở nhánh này → mới là lỗi hệ thống ("quá tải").
 */
export function classifyAnswer(hasContexts: boolean, hasCompliance: boolean): AnswerPath {
  if (!hasContexts && !hasCompliance) return 'no-knowledge';
  return 'call-llm';
}
