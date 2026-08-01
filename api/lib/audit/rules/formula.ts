/* ==========================================================================
   formula.ts — Formula Checks (BS_001, PL_001, PL_002, CF_001, CF_002)
   Port từ Python src/rules/formula_rules.py
   ========================================================================== */

import { Violation, BalanceSheet, IncomeStatement, CashflowStatement } from '../schemas';

export function checkBalanceSheetBalance(bs: BalanceSheet): Violation | null {
  const totalAssets = Object.values(bs.assetsClosing).reduce((a, b) => a + b, 0);
  const totalLiabEq =
    Object.values(bs.liabilitiesClosing).reduce((a, b) => a + b, 0) +
    Object.values(bs.equityClosing).reduce((a, b) => a + b, 0);
  const diff = totalAssets - totalLiabEq;
  if (Math.abs(diff) > 0.01) {
    return {
      code: 'BS_001', group: 'formula', severity: 'critical',
      description: `Bảng CĐKT không cân bằng: Tổng Tài sản (${totalAssets.toLocaleString('vi-VN')}) ≠ Tổng Nợ+VCSH (${totalLiabEq.toLocaleString('vi-VN')})`,
      expected: totalLiabEq, actual: totalAssets, difference: diff,
      affectedAccounts: [
        ...Object.keys(bs.assetsClosing),
        ...Object.keys(bs.liabilitiesClosing),
        ...Object.keys(bs.equityClosing),
      ],
      affectedPeriods: ['closing'],
      confidenceScore: 1.0,
      legalCitations: ['TT99/2025 Điều 5 - Bảng cân đối kế toán'],
      professionalBasis: ['TT99 Phụ lục IV - Mẫu BCTC B01'],
    };
  }
  return null;
}

export function checkProfitFormula(pl: IncomeStatement): Violation | null {
  const expected = pl.revenue - pl.costOfGoodsSold - pl.sellingExpenses - pl.adminExpenses - pl.financialExpenses - pl.citExpense;
  const diff = pl.profitAfterTax - expected;
  if (Math.abs(diff) > 0.01) {
    return {
      code: 'PL_001', group: 'formula', severity: 'high',
      description: `Lợi nhuận sau thuế không đúng công thức: kỳ vọng ${expected.toLocaleString('vi-VN')}, thực tế ${pl.profitAfterTax.toLocaleString('vi-VN')}`,
      expected, actual: pl.profitAfterTax, difference: diff,
      affectedAccounts: ['511', '632', '641', '642', '635', '821', '911'],
      affectedPeriods: ['closing'],
      confidenceScore: 1.0,
      legalCitations: ['TT99/2025 Điều 6 - Báo cáo KQKD'],
      professionalBasis: ['TT99 Phụ lục IV - Mẫu BCTC B02'],
    };
  }
  return null;
}

export function checkCostVsRevenue(pl: IncomeStatement): Violation | null {
  const gross = pl.revenue - pl.costOfGoodsSold;
  if (gross < 0 && pl.revenue > 0) {
    return {
      code: 'PL_002', group: 'formula', severity: 'high',
      description: `Lợi nhuận gộp âm (${gross.toLocaleString('vi-VN')}) trong khi doanh thu dương. Kiểm tra giá vốn.`,
      expected: 0, actual: gross, difference: gross,
      affectedAccounts: ['511', '632'],
      affectedPeriods: ['closing'],
      confidenceScore: 1.0,
    };
  }
  return null;
}

export function checkCashflowFormula(cf: CashflowStatement): Violation | null {
  const expectedClose = cf.cashOpening + cf.netCashFromOperating + cf.netCashFromInvesting + cf.netCashFromFinancing;
  const diff = Math.abs(cf.cashClosing - expectedClose);
  if (diff > 0.01) {
    return {
      code: 'CF_001', group: 'cashflow', severity: 'critical',
      description: `Tiền cuối kỳ LCTT không khớp công thức: ${cf.cashOpening.toLocaleString('vi-VN')} + dòng tiền = ${expectedClose.toLocaleString('vi-VN')}, thực tế ${cf.cashClosing.toLocaleString('vi-VN')}`,
      expected: expectedClose, actual: cf.cashClosing, difference: cf.cashClosing - expectedClose,
      affectedAccounts: ['111', '112', '113'],
      affectedPeriods: ['closing'],
      confidenceScore: 1.0,
      legalCitations: ['TT_200_2014 Điều 114 - Hướng dẫn lập B03'],
      professionalBasis: ['TT99 Phụ lục IV - Mẫu BCTC B03'],
    };
  }
  return null;
}

export function checkOpeningClosingCash(cf: CashflowStatement): Violation | null {
  if (cf.cashClosing !== undefined && cf.cashOpening !== undefined) {
    return {
      code: 'CF_002', group: 'cashflow', severity: 'medium',
      description: `Tiền đầu kỳ không thể kiểm tra đối chiếu với CĐKT (cần B01 kỳ trước)`,
      expected: null, actual: null, difference: null,
      affectedAccounts: ['111', '112', '113'],
      affectedPeriods: ['opening'],
      confidenceScore: 0.5,
    };
  }
  return null;
}

export function runAllFormulaRules(
  bs: BalanceSheet, pl: IncomeStatement, cf: CashflowStatement,
): Violation[] {
  const results: Violation[] = [];
  const r1 = checkBalanceSheetBalance(bs);
  if (r1) results.push(r1);
  const r2 = checkProfitFormula(pl);
  if (r2) results.push(r2);
  const r3 = checkCostVsRevenue(pl);
  if (r3) results.push(r3);
  const r4 = checkCashflowFormula(cf);
  if (r4) results.push(r4);
  return results;
}
