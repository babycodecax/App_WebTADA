/* ==========================================================================
   anomaly.ts — Complete ratio + anomaly rules (AN_001-117)
   Port từ Python src/rules/ratio_rules.py + anomaly_rules.py
   ========================================================================== */

import { Violation, ReportedStatementSet, IncomeStatement, FinancialRatioSet } from '../schemas';

// ─── Ngưỡng ───
const PROFIT_MARGIN_HIGH = 0.80;
const PROFIT_MARGIN_LOW = -0.50;
const REVENUE_GROWTH_THRESHOLD = 0.50;
const DEBT_TO_EQUITY_HIGH = 3.0;
const GROSS_MARGIN_NEG = 0.0;
const DEBT_TO_ASSETS_HIGH = 0.80;
const JUMP_THRESHOLD = 1.0;
const INTEREST_TO_PROFIT_HIGH = 1.0;

const PROF_BASIS_ANNUAL = ['Hướng dẫn lập B02 (TT200 Điều 113) / TT99/2025 Điều 17 - chỉ tiêu Doanh thu/LNTT'];
const PROF_BASIS_BS = ['Hướng dẫn lập B01 (TT200 Điều 112) / TT99/2025 Điều 17 - Nợ phải trả/Vốn chủ sở hữu'];

// ══════════════════════════════════════════════════════════════════
// NHÓM AN_101-110: Phân tích từ BCTC trực tiếp
// ══════════════════════════════════════════════════════════════════

/** AN_101: Tỷ suất LNST/Doanh thu bất thường */
export function checkProfitMarginAnomaly(stmt: ReportedStatementSet): Violation[] {
  const rev = stmt.incomeStatement['01']?.closing ?? stmt.incomeStatement['10']?.closing;
  const profit = stmt.incomeStatement['60']?.closing;
  if (rev == null || profit == null || rev === 0) return [];
  const ratio = profit / rev;
  if (ratio > PROFIT_MARGIN_HIGH || ratio < PROFIT_MARGIN_LOW) {
    return [{
      code: 'AN_101', group: 'anomaly', severity: 'medium',
      description: `Tỷ suất LNST/Doanh thu bất thường: ${(ratio * 100).toFixed(1)}% (LNST=${profit.toLocaleString('vi-VN')} / Doanh thu=${rev.toLocaleString('vi-VN')})`,
      expected: PROFIT_MARGIN_HIGH, actual: ratio, difference: ratio - PROFIT_MARGIN_HIGH,
      affectedAccounts: ['01', '60'], affectedPeriods: ['closing'],
      confidenceScore: 1.0, professionalBasis: PROF_BASIS_ANNUAL,
    }];
  }
  return [];
}

/** AN_102: Doanh thu tăng đột biến nhưng LNTT không tương xứng */
export function checkRevenueGrowthVsProfit(stmt: ReportedStatementSet): Violation[] {
  const rev = stmt.incomeStatement['01'];
  const lntt = stmt.incomeStatement['50'];
  if (!rev || !lntt || rev.closing == null || rev.opening == null || lntt.closing == null || lntt.opening == null || rev.opening === 0) return [];
  const growth = (rev.closing - rev.opening) / Math.abs(rev.opening);
  if (growth > REVENUE_GROWTH_THRESHOLD && lntt.closing <= lntt.opening) {
    return [{
      code: 'AN_102', group: 'anomaly', severity: 'medium',
      description: `Doanh thu tăng ${(growth * 100).toFixed(0)}% so kỳ trước nhưng LNTT không tương xứng (kỳ này ${lntt.closing.toLocaleString('vi-VN')} ≤ kỳ trước ${lntt.opening.toLocaleString('vi-VN')})`,
      expected: lntt.opening, actual: lntt.closing, difference: lntt.closing - lntt.opening,
      affectedAccounts: ['01', '50'], affectedPeriods: ['closing'],
      confidenceScore: 1.0, professionalBasis: PROF_BASIS_ANNUAL,
    }];
  }
  return [];
}

/** AN_103: Đòn bẩy tài chính cao */
export function checkLeverageAnomaly(stmt: ReportedStatementSet): Violation[] {
  const debt = stmt.balanceSheet['300']?.closing;
  const equity = stmt.balanceSheet['400']?.closing;
  if (debt == null || equity == null) return [];
  if (equity < 0) {
    return [{
      code: 'AN_103', group: 'anomaly', severity: 'high',
      description: `Vốn chủ sở hữu âm: ${equity.toLocaleString('vi-VN')} (Nợ phải trả=${debt.toLocaleString('vi-VN')})`,
      expected: 0, actual: equity, difference: equity,
      affectedAccounts: ['400', '300'], affectedPeriods: ['closing'],
      confidenceScore: 1.0, professionalBasis: PROF_BASIS_BS,
    }];
  }
  if (equity !== 0) {
    const de = debt / equity;
    if (de > DEBT_TO_EQUITY_HIGH) {
      return [{
        code: 'AN_103', group: 'anomaly', severity: 'medium',
        description: `Tỷ lệ Nợ/VCSH cao: ${de.toFixed(2)} (> ${DEBT_TO_EQUITY_HIGH}) - rủi ro thanh khoản`,
        expected: DEBT_TO_EQUITY_HIGH, actual: de, difference: de - DEBT_TO_EQUITY_HIGH,
        affectedAccounts: ['300', '400'], affectedPeriods: ['closing'],
        confidenceScore: 1.0, professionalBasis: PROF_BASIS_BS,
      }];
    }
  }
  return [];
}

/** AN_104: Tiền âm hoặc = 0 dù có doanh thu */
export function checkCashAnomaly(stmt: ReportedStatementSet): Violation[] {
  const cash = stmt.balanceSheet['110']?.closing;
  if (cash == null) return [];
  if (cash < 0) {
    return [{
      code: 'AN_104', group: 'anomaly', severity: 'high',
      description: `Tiền (mã 110) âm: ${cash.toLocaleString('vi-VN')} - bất thường vật chất`,
      expected: 0, actual: cash, difference: cash,
      affectedAccounts: ['110'], affectedPeriods: ['closing'],
      confidenceScore: 1.0, professionalBasis: PROF_BASIS_BS,
    }];
  }
  if (cash === 0) {
    const rev = stmt.incomeStatement['01']?.closing ?? stmt.incomeStatement['10']?.closing;
    if (rev != null && rev > 0) {
      return [{
        code: 'AN_104', group: 'anomaly', severity: 'medium',
        description: `Tiền (mã 110) = 0 dù vẫn có doanh thu (${rev.toLocaleString('vi-VN')}) - cần đối chiếu sao kê`,
        expected: null, actual: 0, difference: null,
        affectedAccounts: ['110', '01'], affectedPeriods: ['closing'],
        confidenceScore: 1.0, professionalBasis: PROF_BASIS_BS,
      }];
    }
  }
  return [];
}

/** AN_107: Lợi nhuận gộp âm */
export function checkGrossMarginNegative(stmt: ReportedStatementSet): Violation[] {
  const gp = stmt.incomeStatement['30']?.closing;
  if (gp == null) return [];
  if (gp < GROSS_MARGIN_NEG) {
    return [{
      code: 'AN_107', group: 'anomaly', severity: 'medium',
      description: `Lợi nhuận gộp (B02 mã 30) âm: ${gp.toLocaleString('vi-VN')} - biên lãi gộp âm, cần rà soát giá vốn/doanh thu`,
      expected: 0, actual: gp, difference: gp,
      affectedAccounts: ['30'], affectedPeriods: ['closing'],
      confidenceScore: 1.0, professionalBasis: PROF_BASIS_ANNUAL,
    }];
  }
  return [];
}

/** AN_108: Nợ phải trả > 80% Tổng tài sản */
export function checkDebtToAssetsHigh(stmt: ReportedStatementSet): Violation[] {
  const debt = stmt.balanceSheet['300']?.closing;
  const assets = totalReportedAssetsCalc(stmt);
  if (debt == null || assets == null || assets === 0) return [];
  const ratio = debt / assets;
  if (ratio > DEBT_TO_ASSETS_HIGH) {
    return [{
      code: 'AN_108', group: 'anomaly', severity: 'medium',
      description: `Nợ phải trả/Tổng tài sản cao: ${(ratio * 100).toFixed(0)}% (> ${(DEBT_TO_ASSETS_HIGH * 100).toFixed(0)}%) - rủi ro vốn`,
      expected: DEBT_TO_ASSETS_HIGH, actual: ratio, difference: ratio - DEBT_TO_ASSETS_HIGH,
      affectedAccounts: ['300'], affectedPeriods: ['closing'],
      confidenceScore: 1.0, professionalBasis: PROF_BASIS_BS,
    }];
  }
  return [];
}

function totalReportedAssetsCalc(stmt: ReportedStatementSet): number | null {
  const a = stmt.balanceSheet['100']?.closing ?? 0;
  const b = stmt.balanceSheet['200']?.closing ?? 0;
  return a + b;
}

/** AN_109: Biến động bất thường kỳ này/kỳ trước (>100%) */
export function checkUnusualJump(stmt: ReportedStatementSet): Violation[] {
  const results: Violation[] = [];
  for (const [code, label] of [['01', 'Doanh thu'], ['50', 'LNTT']] as const) {
    const item = stmt.incomeStatement[code];
    if (!item || item.closing == null || item.opening == null || item.opening === 0) continue;
    const change = Math.abs(item.closing - item.opening) / Math.abs(item.opening);
    if (change > JUMP_THRESHOLD) {
      results.push({
        code: 'AN_109', group: 'anomaly', severity: 'medium',
        description: `${label} biến động bất thường: ${(change * 100).toFixed(0)}% (kỳ này ${item.closing.toLocaleString('vi-VN')} vs kỳ trước ${item.opening.toLocaleString('vi-VN')})`,
        expected: item.opening, actual: item.closing, difference: item.closing - item.opening,
        affectedAccounts: [code], affectedPeriods: ['closing', 'opening'],
        confidenceScore: 1.0, professionalBasis: PROF_BASIS_ANNUAL,
      });
    }
  }
  return results;
}

/** AN_110: Chi phí tài chính > LNTT */
export function checkInterestBurden(stmt: ReportedStatementSet): Violation[] {
  const fin = stmt.incomeStatement['22']?.closing;
  const profit = stmt.incomeStatement['50']?.closing;
  if (fin == null || profit == null) return [];
  const finAbs = Math.abs(fin);
  if (finAbs > 0 && finAbs > profit) {
    return [{
      code: 'AN_110', group: 'anomaly', severity: 'medium',
      description: `Chi phí tài chính (B02 mã 22)=${finAbs.toLocaleString('vi-VN')} > LNTT (mã 50)=${profit.toLocaleString('vi-VN')} - gánh nặng lãi vay cao`,
      expected: profit, actual: finAbs, difference: finAbs - profit,
      affectedAccounts: ['22', '50'], affectedPeriods: ['closing'],
      confidenceScore: 1.0, professionalBasis: PROF_BASIS_ANNUAL,
    }];
  }
  return [];
}

// ══════════════════════════════════════════════════════════════════
// NHÓM AN_001-007: Anomaly detection từ IncomeStatement
// ══════════════════════════════════════════════════════════════════

/** AN_001: Doanh thu biến động > threshold% */
export function checkRevenueVolatility(current: IncomeStatement, prior?: IncomeStatement | null, threshold = 0.3): Violation | null {
  if (!prior || prior.revenue === 0) return null;
  const changeRate = Math.abs(current.revenue - prior.revenue) / prior.revenue;
  if (changeRate > threshold) {
    const direction = current.revenue > prior.revenue ? 'tăng' : 'giảm';
    return {
      code: 'AN_001', group: 'anomaly', severity: 'high',
      description: `Doanh thu ${direction} ${(changeRate * 100).toFixed(1)}% so với cùng kỳ năm trước (ngưỡng ${(threshold * 100).toFixed(0)}%)`,
      expected: prior.revenue, actual: current.revenue, difference: current.revenue - prior.revenue,
      affectedAccounts: ['511'], affectedPeriods: ['closing', 'opening'],
      confidenceScore: 0.9,
      legalCitations: ['TT99/2025 Điều 9 - Thuyết minh BCTC: Giải trình biến động chỉ tiêu'],
      professionalBasis: ['VAS 01 - Thuyết minh biến động 30% trở lên'],
    };
  }
  return null;
}

/** AN_002: LNST biến động > threshold% */
export function checkProfitVolatility(current: IncomeStatement, prior?: IncomeStatement | null, threshold = 0.5): Violation | null {
  if (!prior || prior.profitAfterTax === 0) return null;
  const changeRate = Math.abs(current.profitAfterTax - prior.profitAfterTax) / Math.abs(prior.profitAfterTax);
  if (changeRate > threshold) {
    const direction = current.profitAfterTax > prior.profitAfterTax ? 'tăng' : 'giảm';
    return {
      code: 'AN_002', group: 'anomaly', severity: 'medium',
      description: `Lợi nhuận sau thuế ${direction} ${(changeRate * 100).toFixed(1)}% so với cùng kỳ năm trước`,
      expected: prior.profitAfterTax, actual: current.profitAfterTax, difference: current.profitAfterTax - prior.profitAfterTax,
      affectedAccounts: ['911'], affectedPeriods: ['closing', 'opening'],
      confidenceScore: 0.85,
    };
  }
  return null;
}

/** AN_003/004: Tỷ lệ chi phí / Doanh thu > threshold */
export function checkCostRatioAbnormal(pl: IncomeStatement, costType: string, threshold: number): Violation | null {
  const costMap: Record<string, number> = {
    selling: pl.sellingExpenses,
    admin: pl.adminExpenses,
    financial: pl.financialExpenses,
    cogs: pl.costOfGoodsSold,
  };
  if (pl.revenue === 0) return null;
  const cost = costMap[costType] ?? 0;
  const ratio = cost / pl.revenue;
  if (ratio > threshold) {
    const labels: Record<string, string> = {
      selling: 'Chi phí bán hàng', admin: 'Chi phí quản lý',
      financial: 'Chi phí tài chính', cogs: 'Giá vốn hàng bán',
    };
    const codeMap: Record<string, string> = {
      selling: 'AN_003', admin: 'AN_004', financial: 'AN_004', cogs: 'AN_003',
    };
    return {
      code: (codeMap[costType] || 'AN_004') as any,
      group: 'anomaly',
      severity: ratio < threshold * 1.5 ? 'medium' : ('high' as any),
      description: `${labels[costType] || costType}/Doanh thu = ${(ratio * 100).toFixed(1)}% (> ngưỡng ${(threshold * 100).toFixed(0)}%)`,
      expected: pl.revenue * threshold, actual: cost, difference: cost - pl.revenue * threshold,
      affectedAccounts: [costType === 'selling' ? '641' : '642'], affectedPeriods: ['closing'],
      confidenceScore: 0.8,
    };
  }
  return null;
}

/** AN_005: Biên lợi nhuận gộp biến động > threshold */
export function checkGrossMarginAbnormal(current: IncomeStatement, prior?: IncomeStatement | null, threshold = 0.15): Violation | null {
  if (!prior || prior.revenue === 0) return null;
  const currentMargin = current.revenue ? (current.revenue - current.costOfGoodsSold) / current.revenue : 0;
  const priorMargin = prior.revenue ? (prior.revenue - prior.costOfGoodsSold) / prior.revenue : 0;
  if (Math.abs(currentMargin - priorMargin) > threshold) {
    const direction = currentMargin > priorMargin ? 'tăng' : 'giảm';
    return {
      code: 'AN_005', group: 'anomaly', severity: 'medium',
      description: `Biên lợi nhuận gộp ${direction} ${(Math.abs(currentMargin - priorMargin) * 100).toFixed(1)}% (ngưỡng ${(threshold * 100).toFixed(0)}%)`,
      expected: priorMargin, actual: currentMargin, difference: currentMargin - priorMargin,
      affectedAccounts: ['511', '632'], affectedPeriods: ['closing'],
      confidenceScore: 0.85,
    };
  }
  return null;
}

/** AN_006/007: LNST chuyển từ dương sang âm hoặc ngược lại */
export function checkNegativeProfitWarning(current: IncomeStatement, prior?: IncomeStatement | null): Violation[] {
  if (!prior) return [];
  if (current.profitAfterTax < 0 && prior.profitAfterTax >= 0) {
    return [{
      code: 'AN_006' as any, group: 'anomaly', severity: 'high',
      description: `Lợi nhuận chuyển từ dương (${prior.profitAfterTax.toLocaleString('vi-VN')}) sang âm (${current.profitAfterTax.toLocaleString('vi-VN')})`,
      expected: prior.profitAfterTax, actual: current.profitAfterTax, difference: current.profitAfterTax - prior.profitAfterTax,
      affectedAccounts: ['911'], affectedPeriods: ['closing', 'opening'],
      confidenceScore: 0.9,
    }];
  }
  if (current.profitAfterTax >= 0 && prior.profitAfterTax < 0) {
    return [{
      code: 'AN_007' as any, group: 'anomaly', severity: 'medium',
      description: `Lợi nhuận chuyển từ âm (${prior.profitAfterTax.toLocaleString('vi-VN')}) sang dương (${current.profitAfterTax.toLocaleString('vi-VN')}) - cần kiểm tra`,
      expected: prior.profitAfterTax, actual: current.profitAfterTax, difference: current.profitAfterTax - prior.profitAfterTax,
      affectedAccounts: ['911'], affectedPeriods: ['closing', 'opening'],
      confidenceScore: 0.8,
    }];
  }
  return [];
}

// ══════════════════════════════════════════════════════════════════
// NHÓM AN_111-117: Từ FinancialRatioSet
// ══════════════════════════════════════════════════════════════════

const CURRENT_RATIO_LOW = 1.0;
const QUICK_RATIO_LOW = 0.5;
const INTEREST_COVERAGE_LOW = 1.0;
const RECEIVABLE_TURNOVER_LOW = 0.5;
const INVENTORY_TURNOVER_LOW = 0.5;

function flagRatio(code: string, severity: 'low' | 'medium' | 'high', desc: string, expected: number | null, actual: number | null, accounts: string[]): Violation {
  return {
    code: code as any, group: 'anomaly', severity,
    description: desc,
    expected, actual,
    difference: (actual != null && expected != null) ? actual - expected : null,
    affectedAccounts: accounts, affectedPeriods: [],
    confidenceScore: 1.0, professionalBasis: PROF_BASIS_BS,
  };
}

/** AN_111: Current Ratio < 1.0 */
export function checkCurrentRatioLow(ratios: FinancialRatioSet): Violation[] {
  const r = ratios.ratios['A1'];
  if (r == null) return [];
  if (r < CURRENT_RATIO_LOW) {
    return [flagRatio('AN_111', 'medium',
      `Tỷ số thanh toán hiện hành thấp (${r.toFixed(2)} < ${CURRENT_RATIO_LOW}) - rủi ro mất thanh toán ngắn hạn`,
      CURRENT_RATIO_LOW, r, ['A1'])];
  }
  return [];
}

/** AN_112: Quick Ratio < 0.5 */
export function checkQuickRatioLow(ratios: FinancialRatioSet): Violation[] {
  const r = ratios.ratios['A2'];
  if (r == null) return [];
  if (r < QUICK_RATIO_LOW) {
    return [flagRatio('AN_112', 'medium',
      `Chỉ số thanh toán nhanh thấp (${r.toFixed(2)} < ${QUICK_RATIO_LOW})`, QUICK_RATIO_LOW, r, ['A2'])];
  }
  return [];
}

/** AN_113: Interest Coverage < 1.0 */
export function checkInterestCoverageLow(ratios: FinancialRatioSet): Violation[] {
  const r = ratios.ratios['F3'];
  if (r == null) return [];
  if (r < INTEREST_COVERAGE_LOW) {
    return [flagRatio('AN_113', 'high',
      `Khả năng thanh toán lãi vay thấp (${r.toFixed(2)} < ${INTEREST_COVERAGE_LOW}) - rủi ro vỡ nợ lãi`,
      INTEREST_COVERAGE_LOW, r, ['F3'])];
  }
  return [];
}

/** AN_114: Receivable Turnover < 0.5 */
export function checkReceivableTurnoverLow(ratios: FinancialRatioSet): Violation[] {
  const r = ratios.ratios['A7'];
  if (r == null) return [];
  if (r < RECEIVABLE_TURNOVER_LOW) {
    return [flagRatio('AN_114', 'low',
      `Vòng quay các khoản phải thu thấp (${r.toFixed(2)}/năm < ${RECEIVABLE_TURNOVER_LOW}) - công nợ tồn đọng`,
      RECEIVABLE_TURNOVER_LOW, r, ['A7'])];
  }
  return [];
}

/** AN_115: Inventory Turnover < 0.5 */
export function checkInventoryTurnoverLow(ratios: FinancialRatioSet): Violation[] {
  const r = ratios.ratios['A9'];
  if (r == null) return [];
  if (r < INVENTORY_TURNOVER_LOW) {
    return [flagRatio('AN_115', 'low',
      `Vòng quay hàng tồn kho thấp (${r.toFixed(2)}/năm < ${INVENTORY_TURNOVER_LOW})`,
      INVENTORY_TURNOVER_LOW, r, ['A9'])];
  }
  return [];
}

/** AN_116: ROE < 0 */
export function checkROEFromRatioSet(ratios: FinancialRatioSet): Violation[] {
  const r = ratios.ratios['C3'];
  if (r == null) return [];
  if (r < 0) {
    return [flagRatio('AN_116', 'medium',
      `ROE âm (${(r * 100).toFixed(1)}%) - doanh nghiệp bù lỗ vốn cổ đông`, 0, r, ['C3'])];
  }
  return [];
}

/** AN_117: OCF âm */
export function checkOCFNegative(ratios: FinancialRatioSet): Violation[] {
  const r = ratios.ratios['A4'];
  if (r == null) return [];
  if (r < 0) {
    return [flagRatio('AN_117', 'medium',
      `Dòng tiền từ hoạt động (OCF) âm: ${r.toLocaleString('vi-VN')} - cần đối chiếu`, 0, r, ['A4'])];
  }
  return [];
}

// ══════════════════════════════════════════════════════════════════
// Orchestrators
// ══════════════════════════════════════════════════════════════════

/** Chạy AN_101-110 trên ReportedStatementSet */
export function runStatementRatioAnalysis(stmt: ReportedStatementSet): Violation[] {
  return [
    ...checkProfitMarginAnomaly(stmt),
    ...checkRevenueGrowthVsProfit(stmt),
    ...checkLeverageAnomaly(stmt),
    ...checkCashAnomaly(stmt),
    ...checkGrossMarginNegative(stmt),
    ...checkDebtToAssetsHigh(stmt),
    ...checkUnusualJump(stmt),
    ...checkInterestBurden(stmt),
  ];
}

/** Chạy AN_111-117 trên FinancialRatioSet */
export function evaluateRatiosFromSet(ratios: FinancialRatioSet): Violation[] {
  return [
    ...checkCurrentRatioLow(ratios),
    ...checkQuickRatioLow(ratios),
    ...checkInterestCoverageLow(ratios),
    ...checkReceivableTurnoverLow(ratios),
    ...checkInventoryTurnoverLow(ratios),
    ...checkROEFromRatioSet(ratios),
    ...checkOCFNegative(ratios),
  ];
}

/** Chạy AN_001-007 trên IncomeStatement */
export function runAllAnomalyRules(
  current: IncomeStatement,
  prior?: IncomeStatement | null,
  thresholds?: Record<string, number>,
): Violation[] {
  const t = thresholds || {};
  const results: Violation[] = [];
  const r1 = checkRevenueVolatility(current, prior, t.revenue ?? 0.3);
  if (r1) results.push(r1);
  const r2 = checkProfitVolatility(current, prior, t.profit ?? 0.5);
  if (r2) results.push(r2);
  const r3 = checkCostRatioAbnormal(current, 'selling', t.selling ?? 0.2);
  if (r3) results.push(r3);
  const r4 = checkCostRatioAbnormal(current, 'admin', t.admin ?? 0.2);
  if (r4) results.push(r4);
  const r5 = checkCostRatioAbnormal(current, 'financial', t.financial ?? 0.1);
  if (r5) results.push(r5);
  const r6 = checkGrossMarginAbnormal(current, prior, t.grossMargin ?? 0.15);
  if (r6) results.push(r6);
  results.push(...checkNegativeProfitWarning(current, prior));
  return results;
}
