/* ==========================================================================
   consistency.ts — AN_105 (sign), AN_106 (imputation)
   Port từ Python src/rules/consistency_rules.py (latest)
   ========================================================================== */

import { Violation, ReportedStatementSet } from '../schemas';

const TOL = 1.0;
const SHORT_TERM_ASSET_CODES = ['110', '120', '130', '140', '150'];

function isNegative(val: number | null): boolean {
  return val != null && val < -TOL;
}

function isBlank(val: number | null): boolean {
  return val == null || Math.abs(val) < TOL;
}

/**
 * AN_105: Tài sản ngắn hạn mang số âm
 */
export function checkNegativeCurrentAssets(stmt: ReportedStatementSet): Violation[] {
  const violations: Violation[] = [];
  const bs = stmt.balanceSheet;
  const totalAssetsCode = bs['270'] ? '270' : bs['280'] ? '280' : null;
  if (!totalAssetsCode) return violations;
  const totalAssets = bs[totalAssetsCode]?.closing;
  if (totalAssets == null || totalAssets <= TOL) return violations;

  for (const code of SHORT_TERM_ASSET_CODES) {
    const item = bs[code];
    if (!item) continue;
    const val = item.closing;
    if (isNegative(val)) {
      violations.push({
        code: 'AN_105', group: 'statement_consistency', severity: 'high',
        description: `Tài sản ngắn hạn (mã ${code}) mang số ÂM = ${val?.toLocaleString('vi-VN')} trong khi Tổng TS > 0. Nghi ngờ dư lệch hoặc nhập sai dấu.`,
        expected: 0, actual: val, difference: val,
        affectedAccounts: [code], affectedPeriods: ['closing'],
        confidenceScore: 1.0,
      });
    }
  }
  return violations;
}

/**
 * AN_106: Parent có công thức, một phần con lá có mặt nhưng không khớp tổng.
 * Chỉ báo khi có ít nhất 1 thành phần lá hiện diện nhưng không phải tất cả.
 * Nếu tất cả đều có mặt → SF_001 đã xử lý. Nếu không có lá nào → BCTC phân cấp (bỏ qua).
 */
export function checkImputedTotals(stmt: ReportedStatementSet): Violation[] {
  const violations: Violation[] = [];

  for (const store of [stmt.balanceSheet, stmt.incomeStatement, stmt.cashflow]) {
    for (const parent of Object.values(store)) {
      const comps = parent.formulaComponents;
      if (!comps || comps.length === 0) continue;
      if (parent.closing == null || isBlank(parent.closing)) continue;

      // Bỏ qua nếu bất kỳ thành phần là dòng tổng (có công thức riêng)
      const anySubTotal = comps.some(([code]) => {
        const child = store[code];
        return child && child.formulaComponents.length > 0;
      });
      if (anySubTotal) continue;

      // Thành phần lá có mặt trong store và có giá trị thực
      const present: Array<[string, number]> = comps.filter(([code]) => {
        const child = store[code];
        return child != null && !isBlank(child.closing);
      });

      // Không có chi tiết nào → BCTC phân cấp → bỏ qua
      if (present.length === 0) continue;
      // Tất cả chi tiết đều có mặt → SF_001 xử lý → bỏ qua trùng
      if (present.length === comps.length) continue;

      // Một phần có mặt → tính tổng kỳ vọng
      let expected = 0;
      for (const [code, sign] of present) {
        const child = store[code];
        if (child?.closing != null) expected += sign * child.closing;
      }

      if (Math.abs(parent.closing - expected) > TOL) {
        violations.push({
          code: 'AN_106', group: 'statement_consistency', severity: 'medium',
          description: `Chỉ tiêu ${parent.code} (${parent.label}) có tổng =${parent.closing.toLocaleString('vi-VN')} nhưng các chi tiết lá có mặt ${present.map(([c]) => c).join(',')} chỉ cộng được ${expected.toLocaleString('vi-VN')}. Nghi ngờ tổng gõ tay không khớp chi tiết.`,
          expected, actual: parent.closing, difference: parent.closing - expected,
          affectedAccounts: [parent.code, ...present.map(([c]) => c)],
          affectedPeriods: ['closing'],
          confidenceScore: 0.8,
        });
      }
    }
  }

  return violations;
}

export function runStatementConsistency(stmt: ReportedStatementSet): Violation[] {
  return [
    ...checkNegativeCurrentAssets(stmt),
    ...checkImputedTotals(stmt),
  ];
}