/* ==========================================================================
   ketchuyen.ts — Kết chuyển rules (AP_017-024)
   Port từ Python src/rules/ketchuyen_rules.py
   ========================================================================== */

import { Violation, CdpsData, ReportedStatementSet } from '../schemas';

const TOL = 1.0;

/**
 * KC_001: Kiểm tra kết chuyển doanh thu (TK 511 → 911)
 */
export function checkRevenueClosing(cdps: CdpsData): Violation | null {
  const tk511 = cdps.rows.find(r => r.account === '511');
  if (!tk511) return null;
  if (Math.abs(tk511.closingDebit) > TOL || Math.abs(tk511.closingCredit) > TOL) {
    return {
      code: 'KC_001', group: 'principles', severity: 'high',
      description: `TK 511 (Doanh thu) còn số dư cuối kỳ. Chưa kết chuyển sang TK 911.`,
      expected: 0, actual: tk511.closingDebit - tk511.closingCredit,
      difference: tk511.closingDebit - tk511.closingCredit,
      affectedAccounts: ['511', '911'], affectedPeriods: ['closing'],
      confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * KC_002: Kiểm tra kết chuyển chi phí (TK 632, 641, 642 → 911)
 */
export function checkCostClosing(cdps: CdpsData): Violation[] {
  const violations: Violation[] = [];
  for (const tk of ['632', '641', '642', '635']) {
    const row = cdps.rows.find(r => r.account === tk);
    if (!row) continue;
    if (Math.abs(row.closingDebit) > TOL || Math.abs(row.closingCredit) > TOL) {
      violations.push({
        code: 'KC_002', group: 'principles', severity: 'high',
        description: `TK ${tk} còn số dư cuối kỳ. Chưa kết chuyển sang TK 911.`,
        expected: 0, actual: row.closingDebit - row.closingCredit,
        difference: row.closingDebit - row.closingCredit,
        affectedAccounts: [tk, '911'], affectedPeriods: ['closing'],
        confidenceScore: 1.0,
      });
    }
  }
  return violations;
}

export function runAllKetchuyenRules(
  cdps?: CdpsData | null,
): Violation[] {
  const results: Violation[] = [];
  if (!cdps) return results;
  const r1 = checkRevenueClosing(cdps);
  if (r1) results.push(r1);
  results.push(...checkCostClosing(cdps));
  return results;
}
