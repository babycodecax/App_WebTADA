/**
 * autoComplianceExtract.ts — Tự động trích xuất bản ghi quy định có cấu trúc
 * (compliance records) từ tài liệu admin upload, ngay trên production (Vercel).
 *
 * Đây là TS port của backend/knowledge_extractor.py — vì proxy Next.js
 * (Vercel) không chạy được underthesea, nhưng _call_llm_extract chỉ phụ thuộc
 * OpenRouter-compatible HTTP nên port được sang Node dùng lib/claude.getClient().
 *
 * Quy ước với Python (giữ ngang để không lệch nguồn):
 *   - chunk 1500 ký tự / lần gọi LLM (model reasoning tiêu tốn token theo input)
 *   - prompt extract giống hệt _EXTRACTION_SYSTEM_PROMPT / _build_extraction_prompt
 *   - fallback heuristic khi LLM call fail / không trả records hợp lệ
 *   - dedup theo (source_file, regulation) — khớp UNIQUE constraint Supabase
 *
 * Go API (Vercel free ~60s/maxDuration): KHÔNG quét toàn bộ 1500-char chunks
 * bằng LLM (mất nhiều phút — file docx 50KB → 33 lần gọi, mỗi lần 3-8s).
 * Trần: chỉ gọi LLM cho TỐI ĐA MAX_LLM_CHUNKS đoạn đầu (số liệu/mốc thường
 * nằm ở phần đầu tài liệu), các đoạn còn lại dùng heuristic. Đổi LLMMAX
 * nếu muốn đổi cân bằng độ chính xác vs thời gian.
 */

import { getClient } from './claude';
import { getModelList } from './modelFallback';
import { getSupabase } from './supabase';
import { invalidateComplianceCache, type ComplianceRecord as SharedComplianceRecord } from './compliance';
import { invalidateStructuredCache } from './structured';

// Tái dùng interface ComplianceRecord từ lib/compliance.ts (không nhân bản).
type ComplianceRecord = SharedComplianceRecord;

// ─── Cấu hình (khớp Python knowledge_extractor.py) ───
const EXTRACT_CHUNK_CHARS = 1500;
const EXTRACT_MAX_TOKENS = 16000;
const REQUEST_TIMEOUT_MS = 120000; // mỗi lần gọi LLM
const MAX_LLM_CHUNKS = 2; // gọi LLM cho 2 đoạn đầu, còn lại heuristic
const MAX_CHUNKS = 20; // tổng số đoạn được xử lý (tránh file 4MB → 2700 vòng lặp)
const MAX_FALLBACK_LINES = 60; // heuristic không quét quá 60 dòng/đoạn

// ─── Pattern dò số liệu (port _NUM_PATTERN) ───
const NUM_PATTERN = /\d{1,3}(?:[.,]\d+)?\s*(?:tỷ|triệu|tr|nghìn|ngàn|đồng|ngày|tháng|năm|tuần|giờ|%)(?:\s*đồng)?(?:\s*\/\w+)*/gi;

// ─── Prompt extract (copy _EXTRACTION_SYSTEM_PROMPT) ───
const EXTRACTION_SYSTEM_PROMPT =
  'Trích xuất quy định thuế/kế toán Việt Nam từ văn bản.\n' +
  'Trả về JSON array. Mỗi phần tử gồm:\n' +
  '{"topic": "chủ đề ngắn", "regulation": "mô tả quy định 1-2 câu", ' +
  '"numeric_values": [{"label": "ý nghĩa", "value": số giữ nguyên dạng văn bản, ' +
  '"unit": "tỷ đồng|triệu đồng|ngày|%|...", "operator": ""|">"|"<"|">="|"<="}], ' +
  '"conditions": "điều kiện/ngoại lệ", "legal_basis": "điều/khoản/luật", ' +
  '"effective_date": "DD/MM/YYYY"}\n' +
  'QUY TẮC:\n' +
  '1. Chỉ trích quy định có chuẩn mực (mốc, ngưỡng, thời hạn, điều kiện).\n' +
  '2. Mọi số liệu quan trọng phải nằm trong numeric_values.\n' +
  '3. KHÔNG bịa số. Trả về CHỈ JSON array, không markdown, không giải thích.\n' +
  '4. Không có quy định đáng trích → trả về [].';

function buildExtractionPrompt(fileName: string, content: string): string {
  const truncated = content.slice(0, 15000);
  return (
    `File nguồn: ${fileName}\n` +
    'Văn bản:\n' +
    `"""\n${truncated}\n"""\n` +
    '\nHãy trích xuất toàn bộ quy định quan trọng thành JSON array. ' +
    'Mỗi phần tử gồm các field: topic, regulation, numeric_values ' +
    '(mảng {label, value, unit, operator}), conditions, legal_basis, effective_date.'
  );
}

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

/** Chuẩn hoá numeric_values giống _normalize_numeric_values trong Python. */
function normalizeNumericValues(raw: unknown): { label: string; value: string | number; unit: string; operator: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; value: string | number; unit: string; operator: string }[] = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const rec = v as Record<string, unknown>;
    const label = String(rec.label ?? '').trim();
    const value = rec.value;
    const unit = String(rec.unit ?? '').trim();
    if (value === null || value === undefined || value === '') continue;
    let op = String(rec.operator ?? '').trim();
    if (!['>', '<', '>=', '<=', '='].includes(op)) op = '';
    out.push({ label, value: value as string | number, unit, operator: op });
  }
  return out;
}

function parseLlmResponse(raw: string, sourceFile: string): ComplianceRecord[] {
  if (!raw || !raw.trim()) return [];
  const cleaned = stripJsonFence(raw);
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) return [];
    try {
      data = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const records: ComplianceRecord[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const regulation = String(rec.regulation ?? '').trim();
    if (!regulation) continue;
    records.push({
      source_file: sourceFile,
      topic: String(rec.topic ?? '').trim(),
      regulation,
      numeric_values: normalizeNumericValues(rec.numeric_values),
      conditions: String(rec.conditions ?? '').trim(),
      legal_basis: String(rec.legal_basis ?? '').trim(),
      effective_date: String(rec.effective_date ?? '').trim(),
      raw_chunk: regulation,
    });
  }
  return records;
}

// ── Fallback heuristic (port extract_records_from_text + _extract_numeric_values) ──
function extractNumericFromText(text: string): { label: string; value: string | number; unit: string; operator: string }[] {
  const out: { label: string; value: string | number; unit: string; operator: string }[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  NUM_PATTERN.lastIndex = 0;
  while ((m = NUM_PATTERN.exec(text || '')) !== null) {
    const hit = m[0].trim();
    if (!hit || seen.has(hit.toLowerCase())) continue;
    seen.add(hit.toLowerCase());
    const parts = hit.match(/^([\d.,]+)\s*(.+)$/);
    if (!parts) continue;
    const before = (text.slice(0, m.index) || '').trim();
    const words = before.match(/[\wđĐ]+/g) || [];
    const label = words.length ? words.slice(-3).join(' ') : '';
    out.push({ label, value: parts[1], unit: parts[2].trim(), operator: '' });
  }
  return out;
}

function heuristicRecords(sourceFile: string, text: string): ComplianceRecord[] {
  const records: ComplianceRecord[] = [];
  const seen = new Set<string>();
  const lines = (text || '').split(/\r?\n/).slice(0, MAX_FALLBACK_LINES);
  for (const rawLine of lines) {
    const line = rawLine.replace(/^[#>\-*\d.\s]+/, '').trim();
    if (line.length < 20 || line.length > 600) continue;
    NUM_PATTERN.lastIndex = 0;
    if (!NUM_PATTERN.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      source_file: sourceFile,
      topic: '',
      regulation: line,
      numeric_values: extractNumericFromText(line),
      conditions: '',
      legal_basis: '',
      effective_date: '',
      raw_chunk: line,
    });
    if (records.length >= 30) break;
  }
  return records;
}

// ─── Upsert records + invalidate cache (dùng chung) ───
/** Xoá records cũ theo source_file + upsert records mới. Trả số ghi được. */
export async function upsertComplianceRecords(
  filePath: string,
  records: ComplianceRecord[]
): Promise<number> {
  if (!records.length) return 0;
  try {
    const { error: delErr } = await getSupabase().from('compliance_records').delete().eq('source_file', filePath);
    if (delErr) {
      console.warn(`[auto-extract] delete compliance cũ thất bại cho ${filePath}: ${delErr.message}`);
      invalidateStructuredCache();
      invalidateComplianceCache();
      return 0;
    }
    const { error } = await getSupabase().from('compliance_records').upsert(records, {
      onConflict: 'source_file,regulation',
    });
    if (error) throw new Error(error.message);
    invalidateStructuredCache();
    invalidateComplianceCache();
    console.log(`[auto-extract] ${filePath}: ${records.length} compliance records`);
    return records.length;
  } catch (e) {
    console.warn(`[auto-extract] upsert ${filePath} thất bại: ${e instanceof Error ? e.message : e}`);
    invalidateStructuredCache();
    invalidateComplianceCache();
    return 0;
  }
}

/** Extract nhanh chỉ bằng heuristic (không LLM) + upsert — dùng trong request
 * để chắc chắn có records cho tài liệu mới, trước khi LLM refine nền bổ sung. */
export async function extractHeuristicThenUpsert(filePath: string, content: string): Promise<number> {
  try {
    if (!content || !content.trim()) return 0;
    const records = heuristicRecords(filePath, content);
    if (!records.length) {
      invalidateStructuredCache();
      invalidateComplianceCache();
      return 0;
    }
    return upsertComplianceRecords(filePath, records);
  } catch (e) {
    console.warn(`[auto-extract] heuristic ${filePath} thất bại: ${e instanceof Error ? e.message : e}`);
    invalidateStructuredCache();
    invalidateComplianceCache();
    return 0;
  }
}

// Gọi LLM tối đa MAX_LLM_RETRIES lần. Model reasoning (deepseek-v4-flash) hay
// trả content rỗng (finish_reason=length) nên phải retry như Python
// _call_llm_with_retry. Trả về (raw, aborted): aborted=true khi bị huỷ — khác
// với lỗi thường để caller không fallback heuristic ghi đè dữ liệu cũ.
async function callLlmExtract(fileName: string, chunk: string, signal?: AbortSignal): Promise<{ raw: string; aborted: boolean }> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) return { raw: '', aborted: true };
    // Rate-limit nhẹ giữa các lần thử — tránh kích hoạt 429 free tier
    if (attempt > 1) await new Promise((r) => setTimeout(r, 800));
    try {
      const res = await getClient().chat.completions.create(
        {
          model: getModelList()[0], // model chính (đầu list LLM_MODEL) — không gửi cả chuỗi phân tách phẩy
          max_tokens: EXTRACT_MAX_TOKENS,
          temperature: 0.0,
          stream: false,
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: buildExtractionPrompt(fileName, chunk) },
          ],
        },
        { timeout: REQUEST_TIMEOUT_MS, signal }
      );
      const raw = res.choices?.[0]?.message?.content?.trim() || '';
      if (raw) return { raw, aborted: false }; // có content → thành công
      // content rỗng → retry (giống Python: model reasoning hay tiêu hết token)
    } catch (e) {
      if (signal?.aborted) return { raw: '', aborted: true };
      // lỗi mạng/API → thử lại
    }
  }
  return { raw: '', aborted: false };
}

// port: _extract_chunks — gọi LLM từng đoạn + fallback + dedup theo regulation.
async function extractChunksBounded(
  sourceFile: string,
  content: string,
  signal?: AbortSignal
): Promise<ComplianceRecord[]> {
  const chunks: string[] = [];
  for (let i = 0; i < content.length && chunks.length < MAX_CHUNKS; i += EXTRACT_CHUNK_CHARS) {
    chunks.push(content.slice(i, i + EXTRACT_CHUNK_CHARS));
  }
  if (!chunks.length) return [];

  const records: ComplianceRecord[] = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    if (signal?.aborted) break; // huỷ giữa chừng → không tiếp tục
    const chunk = chunks[idx];
    let chunkRecords: ComplianceRecord[] = [];
    // Chỉ LLM cho các chunk đầu (bounded). Với chunk còn lại dùng heuristic —
    // đủ bắt số liệu/mốc quan trọng, không mất nhiều thời gian.
    if (idx < MAX_LLM_CHUNKS) {
      const { raw, aborted } = await callLlmExtract(sourceFile, chunk, signal);
      if (aborted) break; // huỷ → dừng, không fallback heuristic
      if (!raw) {
        chunkRecords = heuristicRecords(sourceFile, chunk);
      } else {
        chunkRecords = parseLlmResponse(raw, sourceFile);
        if (!chunkRecords.length) chunkRecords = heuristicRecords(sourceFile, chunk);
      }
    } else {
      chunkRecords = heuristicRecords(sourceFile, chunk);
    }
    records.push(...chunkRecords);
  }

  // Dedup theo regulation (giống Python)
  const seen = new Set<string>();
  const deduped: ComplianceRecord[] = [];
  for (const r of records) {
    const key = (r.regulation || '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

// ─── Entry point cho route admin upload/ingest ───
/**
 * Tự extract compliance records từ tài liệu upload, upsert lên Supabase,
 * invalidate cache structured + compliance. Best-effort: mọi lỗi đều nuốt,
 * không fail luồng upload. Dùng signal để route huỷ giữa chừng nếu cần.
 */
export async function autoExtractComplianceBounded(
  filePath: string,
  content: string,
  opts: { signal?: AbortSignal } = {}
): Promise<number> {
  try {
    if (!content || !content.trim()) return 0;
    const records = await extractChunksBounded(filePath, content, opts.signal);
    // Bị huỷ (timeout) → KHÔNG ghi đè records cũ bằng kết quả heuristic dở
    if (opts.signal?.aborted) return 0;
    return upsertComplianceRecords(filePath, records);
  } catch (e) {
    // Best-effort: không để extract lỗi chặn upload
    console.warn(`[auto-extract] ${filePath} thất bại: ${e instanceof Error ? e.message : e}`);
    invalidateStructuredCache();
    invalidateComplianceCache();
    return 0;
  }
}