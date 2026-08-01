/* ==========================================================================
   cache.ts — In-memory cache cho audit results (dùng cho /result/[id] + /history)
   ========================================================================== */

export interface CachedResult {
  success: boolean;
  audit_id: string;
  company_name: string;
  period: string;
  total_violations: number;
  by_severity: Record<string, number>;
  violations: any[];
  html_report: string | null;
  word_report?: string | null;
  word_format?: string;
  file_name?: string;
  ran_at: number;
  error?: string;
}

const _results = new Map<string, CachedResult>();
const RESULTS_TTL = 3600 * 1000; // 1 giờ

function cleanupOldResults() {
  const now = Date.now();
  for (const [id, data] of _results) {
    if (now - data.ran_at * 1000 > RESULTS_TTL) {
      _results.delete(id);
    }
  }
}

export function setCachedResult(data: CachedResult): void {
  _results.set(data.audit_id, data);
  cleanupOldResults();
}

export function getCachedResult(auditId: string): CachedResult | undefined {
  return _results.get(auditId);
}

export function listCachedResults(): Array<{
  audit_id: string;
  success: boolean;
  company_name: string;
  total_violations: number;
  by_severity: Record<string, number>;
  ran_at: number;
}> {
  cleanupOldResults();
  const now = Date.now();
  return Array.from(_results.values())
    .filter(r => now - r.ran_at * 1000 < RESULTS_TTL)
    .sort((a, b) => b.ran_at - a.ran_at)
    .map(r => ({
      audit_id: r.audit_id,
      success: r.success,
      company_name: r.company_name,
      total_violations: r.total_violations,
      by_severity: r.by_severity,
      ran_at: r.ran_at,
    }));
}
