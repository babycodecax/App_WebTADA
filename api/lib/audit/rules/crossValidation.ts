/* ==========================================================================
   crossValidation.ts — XV_001-020: Cross-validation rules
   Port từ Python src/rules/cross_validation_rules.py
   ========================================================================== */

import {
  Violation, BalanceSheet, LedgerData,
  ReportedStatementSet,
  CdpsData,
} from '../schemas';

const TOL = 1.0;
const REVENUE_TOL = 1_000_000;

// ─── XV_001-007: BCTC (theo TK) vs Sổ cái ───

/**
 * XV_001: Tổng TS theo B01 = Tổng dư Nợ TK loại 1+2 (trừ 214, 229)
 */
export function checkAssetsVsLedger(bs: BalanceSheet, ld: LedgerData): Violation | null {
  const totalBs = Object.values(bs.assetsClosing).reduce((a, b) => a + b, 0);
  const ledgerAssets = ['1', '2'].flatMap(prefix =>
    Object.entries(ld.closingDebit)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v)
  ).reduce((a, b) => a + b, 0);
  const diff = Math.abs(totalBs - ledgerAssets);
  if (diff > TOL) {
    return {
      code: 'XV_001', group: 'cross_validation', severity: 'high',
      description: `Tổng Tài sản B01 không khớp Sổ cái: B01=${totalBs.toLocaleString('vi-VN')}, CĐPS=${ledgerAssets.toLocaleString('vi-VN')}`,
      expected: ledgerAssets, actual: totalBs, difference: totalBs - ledgerAssets,
      affectedAccounts: [], affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * XV_002: Tiền mặt B01 = Số dư TK 111+112+113
 */
export function checkCashVsLedger(bs: BalanceSheet, ld: LedgerData): Violation | null {
  const bsCash = (bs.assetsClosing['111'] ?? 0) + (bs.assetsClosing['112'] ?? 0) + (bs.assetsClosing['113'] ?? 0);
  const ledgerCash = (ld.closingDebit['111'] ?? 0) + (ld.closingDebit['112'] ?? 0) + (ld.closingDebit['113'] ?? 0);
  const diff = Math.abs(bsCash - ledgerCash);
  if (diff > TOL) {
    return {
      code: 'XV_002', group: 'cross_validation', severity: 'high',
      description: `Tiền mặt B01 không khớp Sổ cái: B01=${bsCash.toLocaleString('vi-VN')}, CĐPS=${ledgerCash.toLocaleString('vi-VN')}`,
      expected: ledgerCash, actual: bsCash, difference: bsCash - ledgerCash,
      affectedAccounts: ['111', '112', '113'], affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * XV_003: Phải thu khách hàng = Dư Nợ TK 131
 */
export function checkReceivablesVsLedger(bs: BalanceSheet, ld: LedgerData): Violation | null {
  const bsVal = bs.assetsClosing['131'] ?? 0;
  const ledgerVal = ld.closingDebit['131'] ?? 0;
  const diff = Math.abs(bsVal - ledgerVal);
  if (diff > TOL) {
    return {
      code: 'XV_003', group: 'cross_validation', severity: 'medium',
      description: `Phải thu khách hàng không khớp Sổ cái: B01=${bsVal.toLocaleString('vi-VN')}, CĐPS=${ledgerVal.toLocaleString('vi-VN')}`,
      expected: ledgerVal, actual: bsVal, difference: bsVal - ledgerVal,
      affectedAccounts: ['131'], affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * XV_004: Phải trả người bán = Dư Có TK 331
 */
export function checkPayablesVsLedger(bs: BalanceSheet, ld: LedgerData): Violation | null {
  const bsVal = bs.liabilitiesClosing['331'] ?? 0;
  const ledgerVal = ld.closingCredit['331'] ?? 0;
  const diff = Math.abs(bsVal - ledgerVal);
  if (diff > TOL) {
    return {
      code: 'XV_004', group: 'cross_validation', severity: 'medium',
      description: `Phải trả người bán không khớp Sổ cái: B01=${bsVal.toLocaleString('vi-VN')}, CĐPS=${ledgerVal.toLocaleString('vi-VN')}`,
      expected: ledgerVal, actual: bsVal, difference: bsVal - ledgerVal,
      affectedAccounts: ['331'], affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * XV_005: Vốn góp = Dư Có TK 411
 */
export function checkEquityVsLedger(bs: BalanceSheet, ld: LedgerData): Violation | null {
  const bsVal = bs.equityClosing['411'] ?? 0;
  const ledgerVal = ld.closingCredit['411'] ?? 0;
  const diff = Math.abs(bsVal - ledgerVal);
  if (diff > TOL) {
    return {
      code: 'XV_005', group: 'cross_validation', severity: 'medium',
      description: `Vốn góp không khớp Sổ cái: B01=${bsVal.toLocaleString('vi-VN')}, CĐPS=${ledgerVal.toLocaleString('vi-VN')}`,
      expected: ledgerVal, actual: bsVal, difference: bsVal - ledgerVal,
      affectedAccounts: ['411'], affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * XV_006: Doanh thu B02 = Phát sinh Có TK 511
 */
export function checkRevenueVsLedger(pl: { revenue: number }, ld: LedgerData): Violation | null {
  const ledgerVal = (ld.postings['511']?.co ?? 0) - (ld.postings['511']?.no ?? 0);
  const diff = Math.abs(pl.revenue - ledgerVal);
  if (diff > TOL) {
    return {
      code: 'XV_006', group: 'cross_validation', severity: 'high',
      description: `Doanh thu B02 không khớp Sổ cái: B02=${pl.revenue.toLocaleString('vi-VN')}, CĐPS=${ledgerVal.toLocaleString('vi-VN')}`,
      expected: ledgerVal, actual: pl.revenue, difference: pl.revenue - ledgerVal,
      affectedAccounts: ['511'], affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * XV_007: LNST B02 = Số dư TK 911
 */
export function checkProfitVsLedger(pl: { profitAfterTax: number }, ld: LedgerData): Violation | null {
  const ledgerVal = ld.closingCredit['911'] ?? 0;
  const diff = Math.abs(pl.profitAfterTax - ledgerVal);
  if (diff > TOL) {
    return {
      code: 'XV_007', group: 'cross_validation', severity: 'high',
      description: `LNST B02 không khớp Sổ cái: B02=${pl.profitAfterTax.toLocaleString('vi-VN')}, CĐPS=${ledgerVal.toLocaleString('vi-VN')}`,
      expected: ledgerVal, actual: pl.profitAfterTax, difference: pl.profitAfterTax - ledgerVal,
      affectedAccounts: ['911'], affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

export function runAllCrossValidationRules(bs: BalanceSheet, ld: LedgerData, pl?: { revenue: number; profitAfterTax: number }): Violation[] {
  const results: Violation[] = [];
  const r1 = checkAssetsVsLedger(bs, ld);
  if (r1) results.push(r1);
  const r2 = checkCashVsLedger(bs, ld);
  if (r2) results.push(r2);
  const r3 = checkReceivablesVsLedger(bs, ld);
  if (r3) results.push(r3);
  const r4 = checkPayablesVsLedger(bs, ld);
  if (r4) results.push(r4);
  const r5 = checkEquityVsLedger(bs, ld);
  if (r5) results.push(r5);
  if (pl) {
    const r6 = checkRevenueVsLedger(pl, ld);
    if (r6) results.push(r6);
    const r7 = checkProfitVsLedger(pl, ld);
    if (r7) results.push(r7);
  }
  return results;
}

// ─── XV_008-020: Cross-validation trên BCTC đã lập ───

/**
 * Lấy giá trị từ ReportedStatementSet
 */
function getVal(stmt: ReportedStatementSet, code: string): number | null {
  return stmt.balanceSheet[code]?.closing ?? stmt.incomeStatement[code]?.closing ?? stmt.cashflow[code]?.closing ?? null;
}

/**
 * XV_008: Tiền cuối kỳ LCTT (B03 mã 60) = Tiền CĐKT (B01 mã 110)
 */
export function checkCashCfVsBs(stmt: ReportedStatementSet): Violation | null {
  const cfCash = getVal(stmt, '60');
  const bsCash = getVal(stmt, '110');
  if (cfCash == null || bsCash == null) return null;
  const diff = Math.abs(cfCash - bsCash);
  if (diff > TOL) {
    return {
      code: 'XV_008', group: 'statement_cross_validation', severity: 'critical',
      description: `Tiền cuối kỳ LCTT (${cfCash.toLocaleString('vi-VN')}) ≠ Tiền CĐKT (${bsCash.toLocaleString('vi-VN')})`,
      expected: bsCash, actual: cfCash, difference: cfCash - bsCash,
      affectedAccounts: ['111', '112', '113'], affectedPeriods: ['closing'],
      confidenceScore: 1.0,
      legalCitations: ['TT_200_2014 Điều 114'],
    };
  }
  return null;
}

/**
 * XV_009: LNST B02 (mã 60) = LNST trên B01 (mã 420)
 */
export function checkProfitPlVsBs(stmt: ReportedStatementSet): Violation | null {
  const plProfit = getVal(stmt, '60');
  const bsProfit = getVal(stmt, '420');
  if (plProfit == null || bsProfit == null) return null;
  const diff = Math.abs(plProfit - bsProfit);
  if (diff > TOL) {
    return {
      code: 'XV_009', group: 'statement_cross_validation', severity: 'high',
      description: `LNST B02 (${plProfit.toLocaleString('vi-VN')}) ≠ LNST trên B01 (${bsProfit.toLocaleString('vi-VN')})`,
      expected: bsProfit, actual: plProfit, difference: plProfit - bsProfit,
      affectedAccounts: ['911'], affectedPeriods: ['closing'],
      confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * XV_010: Tiền đầu kỳ LCTT (mã 50) = Tiền CĐKT đầu kỳ
 */
export function checkOpeningCashVsBs(stmt: ReportedStatementSet): Violation | null {
  const cfOpen = stmt.cashflow['50']?.closing;
  const bsOpen = stmt.balanceSheet['110']?.opening;
  if (cfOpen == null || bsOpen == null) return null;
  const diff = Math.abs(cfOpen - bsOpen);
  if (diff > TOL) {
    return {
      code: 'XV_010', group: 'statement_cross_validation', severity: 'high',
      description: `Tiền đầu kỳ LCTT (${cfOpen.toLocaleString('vi-VN')}) ≠ Tiền CĐKT đầu kỳ (${bsOpen.toLocaleString('vi-VN')})`,
      expected: bsOpen, actual: cfOpen, difference: cfOpen - bsOpen,
      affectedAccounts: ['111', '112', '113'], affectedPeriods: ['opening'],
      confidenceScore: 1.0,
      legalCitations: ['TT_200_2014 Điều 114'],
    };
  }
  return null;
}

/**
 * XV_011-012: Cân bằng CĐKT trên reported statements
 */
export function checkB01BalanceOnReported(stmt: ReportedStatementSet): Violation[] {
  const results: Violation[] = [];
  const totalAssets = stmt.balanceSheet['270']?.closing ?? stmt.balanceSheet['280']?.closing ?? null;
  const totalLiabEq = stmt.balanceSheet['300']?.closing ?? stmt.balanceSheet['310']?.closing ?? null;
  if (totalAssets != null && totalLiabEq != null) {
    const diff = Math.abs(totalAssets - totalLiabEq);
    if (diff > TOL) {
      results.push({
        code: 'XV_012', group: 'statement_cross_validation', severity: 'critical',
        description: `B01 không cân bằng (theo mã số): Tổng TS=${totalAssets.toLocaleString('vi-VN')} ≠ Tổng NV=${totalLiabEq.toLocaleString('vi-VN')}`,
        expected: totalLiabEq, actual: totalAssets, difference: totalAssets - totalLiabEq,
        affectedAccounts: [], affectedPeriods: ['closing'], confidenceScore: 1.0,
        legalCitations: ['TT_200_2014 Điều 112'],
      });
    }
  }
  return results;
}

/**
 * XV_015: Doanh thu CĐPS (TK 511) vs B02 mã 01 (cho reported_statements)
 */
export function checkRevenueLedgerVsPl(ld: LedgerData, stmt: ReportedStatementSet): Violation | null {
  const revPl = stmt.incomeStatement['01']?.closing ?? stmt.incomeStatement['10']?.closing;
  if (revPl == null) return null;
  const revCdps = (ld.postings['511']?.co ?? 0) - (ld.postings['511']?.no ?? 0);
  const diff = Math.abs(revPl - revCdps);
  if (diff > TOL) {
    return {
      code: 'XV_015', group: 'statement_cross_validation', severity: 'high',
      description: `Doanh thu B02 (${revPl.toLocaleString('vi-VN')}) ≠ TK 511 CĐPS (${revCdps.toLocaleString('vi-VN')})`,
      expected: revCdps, actual: revPl, difference: revPl - revCdps,
      affectedAccounts: ['511'], affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

/**
 * Run statement cross-validation (XV_008-025)
 */
export function runStatementCrossValidation(
  stmt: ReportedStatementSet,
  notesCash?: number,
  notesCashOpen?: number,
  cdps?: CdpsData,
): Violation[] {
  const results: Violation[] = [];
  const r1 = checkCashCfVsBs(stmt);
  if (r1) results.push(r1);
  const r2 = checkProfitPlVsBs(stmt);
  if (r2) results.push(r2);
  const r3 = checkOpeningCashVsBs(stmt);
  if (r3) results.push(r3);
  results.push(...checkB01BalanceOnReported(stmt));
  if (cdps && cdps.rows.length > 0) {
    results.push(...checkCogsCdpsVsPl(stmt, cdps));
    results.push(...checkInventoryCdpsVsBs(stmt, cdps));
    results.push(...checkCfMissingCashInHand(stmt, cdps));
  }
  return results;
}

/**
 * XV_017: Gia von CDPS (TK 632) vs B02 ma 11 (Gia von hang ban)
 */
export function checkCogsCdpsVsPl(stmt: ReportedStatementSet, cdps?: CdpsData): Violation[] {
  if (!cdps || !cdps.rows.length) return [];
  const tk632 = cdps.rows.find(r => r.account === '632');
  if (!tk632) return [];
  // B02 ma 11 (GVHB) - format quan tri hoac chuan
  const b02Cogs = stmt.incomeStatement['11']?.closing ?? stmt.incomeStatement['AA']?.closing;
  if (b02Cogs == null) return [];
  const diff = Math.abs(tk632.postingDebit - b02Cogs);
  if (diff > REVENUE_TOL) {
    return [{
      code: 'XV_017', group: 'statement_cross_validation', severity: 'high',
      description: `Giá vốn CĐPS (TK 632 PS Nợ=${tk632.postingDebit.toLocaleString('vi-VN')}) không khớp B02 mã 11 (${b02Cogs.toLocaleString('vi-VN')}). Chênh lệch: ${diff.toLocaleString('vi-VN')}`,
      expected: b02Cogs, actual: tk632.postingDebit, difference: tk632.postingDebit - b02Cogs,
      affectedAccounts: ['632', '11'], affectedPeriods: ['closing'],
      confidenceScore: 0.95,
      professionalBasis: ['TT99/2025 Phu luc IV - B02 ma 11 / Che do ke toan TK 632'],
    }];
  }
  return [];
}

/**
 * XV_020: HTK CDPS (TK 152-157) vs B01 ma 140 (Hang ton kho)
 */
export function checkInventoryCdpsVsBs(stmt: ReportedStatementSet, cdps?: CdpsData): Violation[] {
  if (!cdps || !cdps.rows.length) return [];
  const invAccounts = ['152', '153', '154', '155', '156', '157'];
  const totalClosingDebit = cdps.rows
    .filter(r => invAccounts.includes(r.account))
    .reduce((s, r) => s + r.closingDebit, 0);
  if (totalClosingDebit < TOL) return [];
  const b01Inv = stmt.balanceSheet['140']?.closing;
  if (b01Inv == null) return [];
  const diff = Math.abs(totalClosingDebit - b01Inv);
  if (diff > REVENUE_TOL) {
    return [{
      code: 'XV_020', group: 'statement_cross_validation', severity: 'high',
      description: `HTK CĐPS (TK 152-157 dư Nợ CK=${totalClosingDebit.toLocaleString('vi-VN')}) không khớp B01 mã 140 (${b01Inv.toLocaleString('vi-VN')}) — chênh lệch ${diff.toLocaleString('vi-VN')}`,
      expected: b01Inv, actual: totalClosingDebit, difference: totalClosingDebit - b01Inv,
      affectedAccounts: ['152', '153', '154', '155', '156', '157'], affectedPeriods: ['closing'],
      confidenceScore: 0.95,
      professionalBasis: ['TT99/2025 Phu luc IV - B01 ma 140 / Che do ke toan TK 15x'],
    }];
  }
  return [];
}

/**
 * XV_021: BCLCTT (B03) chi ghi nhan TK112, bo sot TK111
 */
export function checkCfMissingCashInHand(stmt: ReportedStatementSet, cdps?: CdpsData): Violation[] {
  if (!cdps || !cdps.rows.length) return [];
  const tk111 = cdps.rows.find(r => r.account === '111');
  const tk112 = cdps.rows.find(r => r.account === '112');
  if (!tk111 || !tk112) return [];
  // B03 ma 70 = tien cuoi ky (Python dung 70, TS co the dung 60)
  const cfCashClose = stmt.cashflow['70']?.closing ?? stmt.cashflow['60']?.closing;
  if (cfCashClose == null || cfCashClose === 0) return [];
  const tk112Close = tk112.closingDebit;
  const tk111Close = tk111.closingDebit;
  const cdpsCashTotal = tk111Close + tk112Close;
  const cdpsBankOnly = tk112Close;
  // B03 ~ TK112 (bank only) nhung != TK111+TK112 -> bo sot TK111
  if (Math.abs(cfCashClose - cdpsBankOnly) < REVENUE_TOL && Math.abs(cfCashClose - cdpsCashTotal) > REVENUE_TOL && tk111Close > REVENUE_TOL) {
    return [{
      code: 'XV_021', group: 'statement_cross_validation', severity: 'critical',
      description: `BCLCTT (B03 mã 70) = ${cfCashClose.toLocaleString('vi-VN')} chỉ ghi nhận TK112 (${tk112Close.toLocaleString('vi-VN')}), bỏ sót tiền mặt tại quỹ (TK111 = ${tk111Close.toLocaleString('vi-VN')}).`,
      expected: tk111Close + tk112Close, actual: cfCashClose, difference: cfCashClose - (tk111Close + tk112Close),
      affectedAccounts: ['111', '112'], affectedPeriods: ['closing'],
      confidenceScore: 0.95,
      professionalBasis: ['TT_200_2014 Dieu 114 - LCTT phai ghi nhan toan bo tien'],
    }];
  }
  return [];
}
