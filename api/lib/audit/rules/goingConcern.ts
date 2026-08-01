/* ==========================================================================
   goingConcern.ts — KLT_001-002: Going concern rules
   Port từ Python src/rules/going_concern_rules.py
   ========================================================================== */

import { Violation, ReportedStatementSet } from '../schemas';

/**
 * KLT_001: Lợi nhuận sau thuế âm liên tiếp (dấu hiệu DNKLT)
 */
export function checkGoingConcernProfit(stmt: ReportedStatementSet): Violation | null {
  const profit = stmt.incomeStatement['60']?.closing;
  if (profit != null && profit < 0) {
    return {
      code: 'KLT_001', group: 'going_concern', severity: 'high',
      description: `Lợi nhuận sau thuế âm (${profit.toLocaleString('vi-VN')}). Cảnh báo khả năng hoạt động liên tục.`,
      expected: null, actual: profit, difference: null,
      affectedAccounts: ['911'], affectedPeriods: ['closing'],
      confidenceScore: 0.7,
    };
  }
  return null;
}

/**
 * KLT_002: VCSH âm
 */
export function checkGoingConcernNegativeEquity(stmt: ReportedStatementSet): Violation | null {
  const equity = stmt.balanceSheet['400']?.closing ?? stmt.balanceSheet['410']?.closing;
  if (equity != null && equity < 0) {
    return {
      code: 'KLT_002', group: 'going_concern', severity: 'critical',
      description: `Vốn chủ sở hữu âm (${equity.toLocaleString('vi-VN')}). Doanh nghiệp mất khả năng thanh toán, nghi ngờ hoạt động liên tục.`,
      expected: null, actual: equity, difference: null,
      affectedAccounts: [], affectedPeriods: ['closing'],
      confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * KLT_003: Nợ phải trả > Tổng tài sản (Điều 24 TT99 - không đáp ứng giả định HĐLT)
 * Tài sản không đủ trang trải nợ phải trả -> doanh nghiệp mất khả năng thanh toán.
 */
export function checkGoingConcernDebtExceedsAssets(stmt: ReportedStatementSet): Violation | null {
  const totalAssets = stmt.balanceSheet['270']?.closing ?? stmt.balanceSheet['280']?.closing;
  const totalLiab = stmt.balanceSheet['300']?.closing ?? stmt.balanceSheet['310']?.closing;
  if (totalAssets == null || totalLiab == null || totalAssets <= 0) return null;
  if (totalLiab > totalAssets) {
    return {
      code: 'KLT_003', group: 'going_concern', severity: 'critical',
      description: `Nợ phải trả (${totalLiab.toLocaleString('vi-VN')}) > Tổng tài sản (${totalAssets.toLocaleString('vi-VN')}). Doanh nghiệp không đáp ứng giả định hoạt động liên tục (Điều 24 TT99/2025).`,
      expected: totalAssets, actual: totalLiab, difference: totalLiab - totalAssets,
      affectedAccounts: [], affectedPeriods: ['closing'],
      confidenceScore: 1.0,
      legalCitations: ['TT99/2025 Điều 24 - Không đáp ứng giả định hoạt động liên tục'],
    };
  }
  return null;
}

export function runGoingConcernRules(stmt: ReportedStatementSet): Violation[] {
  const results: Violation[] = [];
  const r1 = checkGoingConcernProfit(stmt);
  if (r1) results.push(r1);
  const r2 = checkGoingConcernNegativeEquity(stmt);
  if (r2) results.push(r2);
  const r3 = checkGoingConcernDebtExceedsAssets(stmt);
  if (r3) results.push(r3);
  return results;
}
