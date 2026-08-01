/* ==========================================================================
   cdps.ts — XV_016-025 + AP_012-016,024,025: CDPS-specific audit rules
   Port từ Python src/rules/cdps_rules.py + principle_rules.py (AP_024, AP_025)
   ========================================================================== */

import { Violation, CdpsData, ReportedStatementSet, CdpsRow } from '../schemas';

const TOL = 1.0;
const REVENUE_TOL = 1_000_000;
const LARGE_FLOW = 10_000_000_000;
const ASSET_WARN = 10_000_000;

// TK lưỡng tính
const LUONG_TINH = new Set(['131', '331', '138', '338']);

// ════════════════════════════════════════
// XV_016: Cân bằng CDPS
// ════════════════════════════════════════
export function checkCdpsBalance(cdps: CdpsData): Violation | null {
  const totalDebit = cdps.rows.reduce((s, r) => s + r.postingDebit, 0);
  const totalCredit = cdps.rows.reduce((s, r) => s + r.postingCredit, 0);
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > TOL) {
    return {
      code: 'XV_016', group: 'cross_validation', severity: 'critical',
      description: `CĐPS không cân bằng: Tổng PS Nợ (${totalDebit.toLocaleString('vi-VN')}) ≠ Tổng PS Có (${totalCredit.toLocaleString('vi-VN')})`,
      expected: totalCredit, actual: totalDebit, difference: totalDebit - totalCredit,
      affectedAccounts: [], affectedPeriods: ['closing'],
      confidenceScore: 1.0,
    };
  }
  return null;
}

// ════════════════════════════════════════
// XV_017 + AP_024: TK TS du Co, TK NV du No
// ════════════════════════════════════════
export function checkAbnormalBalanceSign(cdps: CdpsData): Violation[] {
  const violations: Violation[] = [];
  for (const row of cdps.rows) {
    const isAsset = row.account.startsWith('1') || row.account.startsWith('2');
    const isLiability = row.account.startsWith('3') || row.account.startsWith('4');

    // AP_024: TK TS du Co hoac TK NV du No
    if (isAsset && row.closingCredit > ASSET_WARN && row.closingDebit < TOL) {
      violations.push({
        code: 'AP_024', group: 'principles', severity: 'medium',
        description: `TK ${row.account} (${row.label}) là tài sản nhưng có dư Có ${row.closingCredit.toLocaleString('vi-VN')}. Tài sản phải có dư Nợ.`,
        expected: 0, actual: row.closingCredit, difference: row.closingCredit,
        affectedAccounts: [row.account], affectedPeriods: ['closing'],
        confidenceScore: 0.9,
        professionalBasis: ['Nguyên tắc kế toán: TK tài sản phải dư Nợ'],
      });
    }
    if (isLiability && row.closingDebit > ASSET_WARN && row.closingCredit < TOL) {
      violations.push({
        code: 'AP_024', group: 'principles', severity: 'medium',
        description: `TK ${row.account} (${row.label}) là nợ phải trả nhưng có dư Nợ ${row.closingDebit.toLocaleString('vi-VN')}. Nợ phải trả phải có dư Có.`,
        expected: 0, actual: row.closingDebit, difference: row.closingDebit,
        affectedAccounts: [row.account], affectedPeriods: ['closing'],
        confidenceScore: 0.9,
      });
    }
  }
  return violations;
}

export function checkProfitClosing(cdps: CdpsData): Violation | null {
  const tk911 = cdps.rows.find(r => r.account === '911');
  if (!tk911) return null;
  if (Math.abs(tk911.closingDebit) > TOL || Math.abs(tk911.closingCredit) > TOL) {
    return {
      code: 'XV_018', group: 'cross_validation', severity: 'high',
      description: `TK 911 còn số dư cuối kỳ (Nợ: ${tk911.closingDebit.toLocaleString('vi-VN')}, Có: ${tk911.closingCredit.toLocaleString('vi-VN')}). Chưa kết chuyển hết lãi/lỗ.`,
      expected: 0, actual: tk911.closingDebit - tk911.closingCredit,
      difference: tk911.closingDebit - tk911.closingCredit,
      affectedAccounts: ['911'], affectedPeriods: ['closing'],
      confidenceScore: 1.0,
    };
  }
  return null;
}

// ════════════════════════════════════════
// AP_012: Doanh thu CDPS (TK 511) vs B02
// ════════════════════════════════════════
export function checkAp012RevenueCDPSvsPL(cdps: CdpsData, reportedStatements: ReportedStatementSet): Violation[] {
  if (!cdps.rows.length) return [];
  const tk511 = cdps.rows.find(r => r.account === '511');
  if (!tk511) return [];
  // B02: ma 01 (format chuan)
  const plRev = reportedStatements.incomeStatement['01']?.closing
    ?? reportedStatements.incomeStatement['10']?.closing;
  if (plRev == null) return [];
  const cdpsRev = tk511.postingCredit;
  const diff = Math.abs(cdpsRev - plRev);
  if (diff > REVENUE_TOL) {
    return [{
      code: 'AP_012', group: 'principles', severity: 'high',
      description: `Doanh thu trên CĐPS (TK 511, PS Có = ${cdpsRev.toLocaleString('vi-VN')}) không khớp B02 (mã 01 = ${plRev.toLocaleString('vi-VN')}). Chênh lệch: ${diff.toLocaleString('vi-VN')}.`,
      expected: null, actual: null, difference: diff,
      affectedAccounts: ['511'], affectedPeriods: ['period'],
      confidenceScore: 1.0,
    }];
  }
  return [];
}

// ════════════════════════════════════════
// AP_015: LNTT CDPS vs B02
// ════════════════════════════════════════
export function checkAp015ProfitCDPSvsPL(cdps: CdpsData, reportedStatements: ReportedStatementSet): Violation[] {
  if (!cdps.rows.length) return [];
  const tk911 = cdps.rows.find(r => r.account === '911');
  if (!tk911) return [];
  const plProfit = reportedStatements.incomeStatement['50']?.closing;
  if (plProfit == null) return [];
  const cdpsProfit = tk911.postingCredit - tk911.postingDebit;
  const diff = Math.abs(cdpsProfit - plProfit);
  if (diff > REVENUE_TOL) {
    return [{
      code: 'AP_015', group: 'principles', severity: 'high',
      description: `Chênh lệch PS Có - PS Nợ TK 911 trên CĐPS = ${cdpsProfit.toLocaleString('vi-VN')} không khớp LNTT trên B02 (mã 50 = ${plProfit.toLocaleString('vi-VN')}). Chênh lệch: ${diff.toLocaleString('vi-VN')}.`,
      expected: null, actual: null, difference: diff,
      affectedAccounts: ['911'], affectedPeriods: ['period'],
      confidenceScore: 1.0,
    }];
  }
  return [];
}

// ════════════════════════════════════════
// AP_016: So du bat thuong tren CDPS
// ════════════════════════════════════════
export function checkAp016AbnormalBalances(cdps: CdpsData): Violation[] {
  const violations: Violation[] = [];
  for (const row of cdps.rows) {
    // Bo qua dong tong hop (cap 1)
    if (row.account.length <= 3 && (row.account === '111' || row.account === '112')) continue;

    // Kiem tra am
    if (row.closingDebit < 0) {
      violations.push({
        code: 'AP_016', group: 'principles', severity: 'medium',
        description: `TK ${row.account} (${row.label}) có Dư Nợ cuối kỳ âm (${row.closingDebit.toLocaleString('vi-VN')}). Tài khoản không được có số dư âm.`,
        expected: 0, actual: row.closingDebit, difference: row.closingDebit,
        affectedAccounts: [row.account], affectedPeriods: ['closing'],
        confidenceScore: 1.0,
      });
    } else if (row.closingCredit < 0) {
      violations.push({
        code: 'AP_016', group: 'principles', severity: 'medium',
        description: `TK ${row.account} (${row.label}) có Dư Có cuối kỳ âm (${row.closingCredit.toLocaleString('vi-VN')}). Tài khoản không được có số dư âm.`,
        expected: 0, actual: row.closingCredit, difference: row.closingCredit,
        affectedAccounts: [row.account], affectedPeriods: ['closing'],
        confidenceScore: 1.0,
      });
    }

    // Kiem tra song song (ca No va Co > 0) - tru TK luong tinh
    const isLuongTinh = [...LUONG_TINH].some(lt => row.account.startsWith(lt));
    if (!isLuongTinh && row.closingDebit > 0 && row.closingCredit > 0) {
      violations.push({
        code: 'AP_016', group: 'principles', severity: 'medium',
        description: `TK ${row.account} (${row.label}) co ca Du No (${row.closingDebit.toLocaleString('vi-VN')}) va Du Co (${row.closingCredit.toLocaleString('vi-VN')}). Chi duoc phep co mot loai du.`,
        expected: 0, actual: row.closingDebit > row.closingCredit ? row.closingDebit : row.closingCredit,
        difference: row.closingDebit - row.closingCredit,
        affectedAccounts: [row.account], affectedPeriods: ['closing'],
        confidenceScore: 0.8,
      });
    }
  }
  return violations;
}

// ════════════════════════════════════════
// AP_025: TK sai ban chat tren CDPS
// ════════════════════════════════════════
export function checkAp025WrongNatureAccounts(cdps: CdpsData): Violation[] {
  const violations: Violation[] = [];
  for (const row of cdps.rows) {
    // TK dau 1 (phai thu) ma chi co du Co -> thuc chat la no phai tra
    if (row.account.startsWith('1') && row.closingCredit > ASSET_WARN && row.closingDebit < TOL) {
      violations.push({
        code: 'AP_025', group: 'principles', severity: 'high',
        description: `TK ${row.account} (${row.label}) là tài khoản phải thu đầu 1 nhưng chỉ có dư Có ${row.closingCredit.toLocaleString('vi-VN')} (không có dư Nợ) — thực chất là nợ phải trả.`,
        expected: 0, actual: row.closingCredit, difference: row.closingCredit,
        affectedAccounts: [row.account], affectedPeriods: ['closing'],
        confidenceScore: 0.9,
      });
    }
    // TK dau 3 (no phai tra) ma chi co du No -> thuc chat la phai thu
    if (row.account.startsWith('3') && row.closingDebit > ASSET_WARN && row.closingCredit < TOL) {
      violations.push({
        code: 'AP_025', group: 'principles', severity: 'high',
        description: `TK ${row.account} (${row.label}) là tài khoản nợ phải trả nhưng có dư Nợ cuối kỳ ${row.closingDebit.toLocaleString('vi-VN')} — thực chất là phải thu.`,
        expected: 0, actual: row.closingDebit, difference: row.closingDebit,
        affectedAccounts: [row.account], affectedPeriods: ['closing'],
        confidenceScore: 0.9,
      });
    }
  }
  return violations;
}

// ════════════════════════════════════════
// Orchestrator
// ════════════════════════════════════════
export function runCdpsAuditRules(
  cdps: CdpsData,
  reportedStatements?: ReportedStatementSet,
): Violation[] {
  const results: Violation[] = [];
  const r1 = checkCdpsBalance(cdps);
  if (r1) results.push(r1);
  results.push(...checkAbnormalBalanceSign(cdps));
  const r3 = checkProfitClosing(cdps);
  if (r3) results.push(r3);
  results.push(...checkAp016AbnormalBalances(cdps));
  results.push(...checkAp025WrongNatureAccounts(cdps));

  if (reportedStatements) {
    results.push(...checkAp012RevenueCDPSvsPL(cdps, reportedStatements));
    results.push(...checkAp015ProfitCDPSvsPL(cdps, reportedStatements));
  }

  return results;
}
