/* ==========================================================================
   trend.ts — AN_201+: Trend analysis rules
   Port từ Python src/rules/trend_rules.py
   ========================================================================== */

import { Violation, ReportedStatementSet } from '../schemas';

const TOL = 1.0;

/**
 * AN_201: Doanh thu giảm mạnh so với kỳ trước (>50%)
 */
export function checkRevenueDecline(stmt: ReportedStatementSet): Violation | null {
  const revenue = stmt.incomeStatement['01']?.closing ?? stmt.incomeStatement['10']?.closing;
  const prevRevenue = stmt.incomeStatement['01']?.opening ?? stmt.incomeStatement['10']?.opening;
  if (revenue == null || prevRevenue == null || prevRevenue === 0) return null;
  const change = (revenue - prevRevenue) / Math.abs(prevRevenue);
  if (change < -0.5) {
    return {
      code: 'AN_201', group: 'anomaly', severity: 'medium',
      description: `Doanh thu giảm ${(Math.abs(change) * 100).toFixed(0)}% so với kỳ trước.`,
      expected: prevRevenue, actual: revenue, difference: revenue - prevRevenue,
      affectedAccounts: ['511'], affectedPeriods: ['closing', 'opening'],
      confidenceScore: 0.6,
    };
  }
  return null;
}

/**
 * AN_202: Lợi nhuận giảm mạnh so với kỳ trước (>80%)
 */
export function checkProfitDecline(stmt: ReportedStatementSet): Violation | null {
  const profit = stmt.incomeStatement['60']?.closing;
  const prevProfit = stmt.incomeStatement['60']?.opening;
  if (profit == null || prevProfit == null || prevProfit === 0) return null;
  const change = (profit - prevProfit) / Math.abs(prevProfit);
  if (change < -0.8) {
    return {
      code: 'AN_202', group: 'anomaly', severity: 'high',
      description: `Lợi nhuận giảm ${(Math.abs(change) * 100).toFixed(0)}% so với kỳ trước. Cần giải trình.`,
      expected: prevProfit, actual: profit, difference: profit - prevProfit,
      affectedAccounts: ['911'], affectedPeriods: ['closing', 'opening'],
      confidenceScore: 0.6,
    };
  }
  return null;
}

/**
 * AN_203: Tổng tài sản tăng bất thường (>200%)
 */
export function checkAssetsSurge(stmt: ReportedStatementSet): Violation | null {
  const current = stmt.balanceSheet['270']?.closing ?? stmt.balanceSheet['280']?.closing;
  const previous = stmt.balanceSheet['270']?.opening ?? stmt.balanceSheet['280']?.opening;
  if (current == null || previous == null || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  if (change > 2.0) {
    return {
      code: 'AN_203', group: 'anomaly', severity: 'medium',
      description: `Tổng tài sản tăng ${(change * 100).toFixed(0)}% so với kỳ trước.`,
      expected: previous, actual: current, difference: current - previous,
      affectedAccounts: [], affectedPeriods: ['closing', 'opening'],
      confidenceScore: 0.5,
    };
  }
  return null;
}

export function runStatementTrend(stmt: ReportedStatementSet): Violation[] {
  const results: Violation[] = [];
  const r1 = checkRevenueDecline(stmt);
  if (r1) results.push(r1);
  const r2 = checkProfitDecline(stmt);
  if (r2) results.push(r2);
  const r3 = checkAssetsSurge(stmt);
  if (r3) results.push(r3);
  return results;
}
