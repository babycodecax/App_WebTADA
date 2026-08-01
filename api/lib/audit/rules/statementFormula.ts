/* ==========================================================================
   statementFormula.ts — SF_001: Check công thức nhúng trên BCTC đã lập
   Port từ Python src/rules/statement_formula_rules.py
   ========================================================================== */

import { Violation, ReportedStatementSet, getBS, getPL, getCF } from '../schemas';

const TOL = 1.0;

export function checkReportedFormulas(stmt: ReportedStatementSet): Violation[] {
  const violations: Violation[] = [];
  const stores: Array<[string, Record<string, any>]> = [
    ['balance_sheet', stmt.balanceSheet],
    ['income_statement', stmt.incomeStatement],
    ['cashflow', stmt.cashflow],
  ];

  for (const [type, store] of stores) {
    for (const item of Object.values(store)) {
      if (!item.formulaComponents || item.formulaComponents.length === 0) continue;

      let computed: number | null = null;
      let hasValue = false;

      for (const [compCode, sign] of item.formulaComponents) {
        let compItem = stmt.balanceSheet[compCode];
        if (!compItem) compItem = stmt.incomeStatement[compCode];
        if (!compItem) compItem = stmt.cashflow[compCode];
        if (!compItem) continue;

        const val = compItem.closing;
        if (val != null) {
          computed = (computed ?? 0) + sign * val;
          hasValue = true;
        }
      }

      if (!hasValue) continue;
      const actual = item.closing;
      if (actual == null) continue;
      const diff = Math.abs(actual - (computed ?? 0));

      if (diff > TOL) {
        violations.push({
          code: 'SF_001',
          group: 'statement_formula',
          severity: 'high',
          description: `${getSectionLabel(type)} mã ${item.code}: Tổng không khớp công thức. Kỳ vọng ${(computed ?? 0).toLocaleString('vi-VN')} (${item.formula}), thực tế ${actual.toLocaleString('vi-VN')}`,
          expected: computed ?? 0,
          actual,
          difference: actual - (computed ?? 0),
          affectedAccounts: item.formulaComponents.map((fc: [string, number]) => fc[0]),
          affectedPeriods: ['closing'],
          confidenceScore: 1.0,
          legalCitations: ['TT99/2025 Điều 17 - Hệ thống BCTC'],
          professionalBasis: ['TT99 Phụ lục IV - Mẫu BCTC'],
        });
      }
    }
  }

  return violations;
}

function getSectionLabel(type: string): string {
  switch (type) {
    case 'balance_sheet': return 'B01';
    case 'income_statement': return 'B02';
    case 'cashflow': return 'B03';
    default: return type;
  }
}
