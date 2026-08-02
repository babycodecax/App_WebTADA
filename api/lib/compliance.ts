import { getSupabase } from './supabase';

// ─── Compliance records (cấu trúc Hyper-Extract) cho chat production ───
// Backend Python có compliance_search_engine.py (BM25 + underthesea). Proxy
// Next.js (Vercel) không chạy được underthesea nên dùng BM25-lite trên từ
// khoá (tokenize + tần suất) — cùng ý tưởng: khi câu hỏi có số liệu/mốc,
// chèn bản ghi compliance lên đầu context để LLM đọc số liệu trích sẵn thay
// vì tự suy luận (lỗi: deepseek-v4-flash không so sánh được 91 > 90 ngày,
// 6tr > 5tr).
//
// Cache tầng module giống lib/structured.ts — invalidate qua
// invalidateComplianceCache() khi có upload/ingest (xem
// app/api/admin/upload/route.ts và app/api/admin/ingest/route.ts).
// KHÔNG dùng vector embedding — chỉ BM25-lite + từ khoá (ràng buộc dự án).

export interface ComplianceRecord {
  id?: string;
  source_file?: string;
  topic?: string;
  regulation?: string;
  numeric_values?: { label?: string; value?: number | string; unit?: string; operator?: string }[];
  conditions?: string;
  legal_basis?: string;
  effective_date?: string;
  raw_chunk?: string;
}

let _complianceCache: ComplianceRecord[] | null = null;

export async function getComplianceRecords(force: boolean = false): Promise<ComplianceRecord[]> {
  if (_complianceCache && !force) return _complianceCache;
  const { data } = await getSupabase()
    .from('compliance_records')
    .select('id, source_file, topic, regulation, numeric_values, conditions, legal_basis, effective_date, raw_chunk')
    .limit(20000);
  _complianceCache = (data as ComplianceRecord[]) || [];
  return _complianceCache;
}

export function invalidateComplianceCache(): void {
  _complianceCache = null;
}

// ─── Nhận diện câu hỏi có số liệu/mốc ───
const NUMERIC_VALUE_RE = /\d{1,3}(?:[.,]\d+)?\s*(?:tỷ|triệu|tr|nghìn|ngàn|đồng|ngày|tháng|năm|tuần|giờ|%)/i;

function hasNumericValue(text: string): boolean {
  return NUMERIC_VALUE_RE.test(text || '');
}

export function isNumericQuery(question: string): boolean {
  const q = (question || '').toLowerCase().trim();
  if (!q) return false;
  if (hasNumericValue(q)) return true;
  if (/%|phần trăm/.test(q)) return true;
  if (/bao nhiêu|mấy\s*(ngày|tháng|năm|tiền|triệu|tỷ|%)/.test(q)) return true;
  return /(sáu|bảy|tám|chín|một|hai|ba|bốn|năm|mười)\s*(triệu|tỷ|nghìn|ngàn|ngày|tháng|năm|%|tr)/.test(q);
}

// ─── Tokenize tiếng Việt đơn giản (không cần underthesea) ───
function tokenize(text: string): string[] {
  const tokens = (text || '').toLowerCase().split(/[\s,.\-:;!?()"“”'’]+/);
  const out: string[] = [];
  for (const t of tokens) {
    if (t && t.length >= 2) out.push(t);
  }
  return out;
}

// ─── BM25-lite: tần suất term + boost topic/regulation ───
function scoreRecord(rec: ComplianceRecord, terms: string[]): number {
  const hay = [
    rec.topic || '',
    rec.regulation || '',
    rec.raw_chunk || '',
    rec.legal_basis || '',
    ...(rec.numeric_values || []).map(n => `${n.value || ''} ${n.unit || ''}`),
  ].join(' ').toLowerCase();

  let score = 0;
  for (const term of terms) {
    // Mỗi lần xuất hiện cộng điểm — khớp nhiều term = chủ đề đúng
    const hits = hay.split(term).length - 1;
    score += hits * 2;
  }
  // Boost chủ đề: term nằm trong topic/regulation quan trọng hơn raw_chunk
  const head = `${rec.topic || ''} ${rec.regulation || ''}`.toLowerCase();
  for (const term of terms) {
    if (head.includes(term)) score += 3;
  }
  return score;
}

const COMPLIANCE_TOP_K = 6;

/** Tìm top-k compliance records khớp câu hỏi (BM25-lite). */
export async function searchCompliance(query: string, topK: number = COMPLIANCE_TOP_K): Promise<ComplianceRecord[]> {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const records = await getComplianceRecords();
  const scored: { rec: ComplianceRecord; score: number }[] = [];
  for (const rec of records) {
    const s = scoreRecord(rec, terms);
    if (s > 0) scored.push({ rec, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  // Dedup theo (source_file + regulation) như backend Python
  const seen = new Set<string>();
  const out: ComplianceRecord[] = [];
  for (const { rec } of scored) {
    const key = `${rec.source_file || ''}|${(rec.regulation || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rec);
    if (out.length >= topK) break;
  }
  return out;
}

const MAX_CONTEXT_CHARS = 1800;

/** Format records thành context đặc biệt ưu tiên số liệu (giống Python). */
export function formatComplianceContext(records: ComplianceRecord[]): string {
  const lines: string[] = [];
  for (const rec of records) {
    lines.push('[DỮ LIỆU CÓ CẤU TRÚC - ƯU TIÊN]');
    lines.push(`Chủ đề: ${rec.topic || ''}`);
    lines.push(`Quy định: ${rec.regulation || ''}`);
    const numParts: string[] = [];
    for (const v of rec.numeric_values || []) {
      let part = `${v.label || ''} = ${v.value ?? ''} ${v.unit || ''}`.trim();
      if (v.operator) part += ` (điều kiện ${v.operator})`;
      numParts.push(part);
    }
    if (numParts.length) lines.push(`Số liệu: ${numParts.join('; ')}`);
    if (rec.conditions) lines.push(`Điều kiện: ${rec.conditions}`);
    if (rec.legal_basis) lines.push(`Căn cứ: ${rec.legal_basis}`);
    if (rec.effective_date) lines.push(`Hiệu lực: ${rec.effective_date}`);
    lines.push('');
  }
  const out = lines.join('\n').trim();
  return out.length > MAX_CONTEXT_CHARS * COMPLIANCE_TOP_K ? out.slice(0, MAX_CONTEXT_CHARS * COMPLIANCE_TOP_K) : out;
}
