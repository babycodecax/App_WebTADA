/* ==========================================================================
   principles.ts — Complete Accounting Principles rules (AP_001-029)
   Port từ Python src/rules/principle_rules.py
   ========================================================================== */

import { Violation, LedgerData, ReportedStatementSet } from '../schemas';

const TOL = 1.0;
const OFFSET_MIN = 1_000_000;
const WASH_MIN_POSTING = 1_000_000_000;
const WASH_RATIO = 0.999;
const WASH_BAL_TOL = 1_000_000;
const ASSET_MIN_WARN = 10_000_000;

// ════════════════════════════════════════
// AP_001-002: Tiền âm
// ════════════════════════════════════════

/** AP_001: TK 111 (Tiền mặt) âm */
export function checkCashNegativeBalance(ld: LedgerData): Violation | null {
  const bal = ld.balances['111'] ?? 0;
  if (bal < 0) {
    return {
      code: 'AP_001', group: 'principles', severity: 'high',
      description: `TK 111 (Tiền mặt) có số dư âm: ${bal.toLocaleString('vi-VN')} VNĐ`,
      expected: 0, actual: bal, difference: bal,
      affectedAccounts: ['111'], affectedPeriods: ['closing'], confidenceScore: 1.0,
      legalCitations: ['TT99/2025 Điều 4 - Nguyên tắc ghi sổ kế toán'],
      professionalBasis: ['VAS 01 - Tiền mặt không thể âm'],
    };
  }
  return null;
}

/** AP_002: TK 112 (Tiền gửi NH) âm */
export function checkBankNegativeBalance(ld: LedgerData): Violation | null {
  const bal = ld.balances['112'] ?? 0;
  if (bal < 0) {
    return {
      code: 'AP_002', group: 'principles', severity: 'high',
      description: `TK 112 (Tiền gửi NH) có số dư âm: ${bal.toLocaleString('vi-VN')} VNĐ`,
      expected: 0, actual: bal, difference: bal,
      affectedAccounts: ['112'], affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

// ════════════════════════════════════════
// AP_003-004: Bù trừ sai nguyên tắc
// ════════════════════════════════════════

/** AP_003: TK 331 (Phải trả NB) dư Nợ */
export function checkAccountsPayableDebitBalance(ld: LedgerData): Violation | null {
  const credit = ld.closingCredit['331'] ?? 0;
  const debit = ld.closingDebit['331'] ?? 0;
  if (debit > 1_000_000) {
    if (credit > OFFSET_MIN) return null;
    return {
      code: 'AP_003', group: 'principles', severity: 'medium',
      description: `TK 331 có dư Nợ ${debit.toLocaleString('vi-VN')} VNĐ (dư Có ${credit.toLocaleString('vi-VN')}) - vi phạm không bù trừ`,
      expected: credit, actual: debit, difference: debit - credit,
      affectedAccounts: ['331'], affectedPeriods: ['closing'],
      confidenceScore: 0.9,
      professionalBasis: ['VAS 21 - Trình bày BCTC: không được bù trừ các khoản mục'],
    };
  }
  return null;
}

/** AP_004: TK 333 (Thuế) dư Nợ bất thường */
export function checkTaxPayableDebitBalance(ld: LedgerData): Violation[] {
  const results: Violation[] = [];
  const taxAccounts = ['3331', '3332', '3333', '3334', '3335', '3336', '3337', '3338', '3339'];
  for (const acc of taxAccounts) {
    const credit = getCreditBalance(ld, acc);
    const debit = getDebitBalance(ld, acc);
    if (credit > 0 && debit > credit * 0.1) {
      results.push({
        code: `AP_004_${acc}` as any, group: 'principles', severity: 'medium',
        description: `TK ${acc} có dư Nợ bất thường (${debit.toLocaleString('vi-VN')}) > 10% dư Có (${credit.toLocaleString('vi-VN')})`,
        expected: credit, actual: debit, difference: debit - credit,
        affectedAccounts: [acc], affectedPeriods: ['closing'],
        confidenceScore: 0.8,
      });
    }
  }
  return results;
}

// ════════════════════════════════════════
// AP_005: VCSH âm
// ════════════════════════════════════════

/** AP_005: Vốn chủ sở hữu âm */
export function checkOwnerEquityNegative(ld: LedgerData): Violation | null {
  const equityAccounts = ['411', '412', '413', '414', '415', '417', '418'];
  const negative: Array<[string, number]> = [];
  for (const acc of equityAccounts) {
    const bal = ld.balances[acc] ?? 0;
    if (bal > 0) negative.push([acc, bal]);
  }
  if (negative.length > 0) {
    const details = negative.map(([a, b]) => `TK ${a}: ${b.toLocaleString('vi-VN')}`).join(', ');
    return {
      code: 'AP_005', group: 'principles', severity: 'high',
      description: `Vốn chủ sở hữu có tài khoản âm: ${details}`,
      expected: 0, actual: negative.reduce((s, [, b]) => s + b, 0),
      difference: negative.reduce((s, [, b]) => s + b, 0),
      affectedAccounts: negative.map(([a]) => a), affectedPeriods: ['closing'],
      confidenceScore: 1.0, professionalBasis: ['Luật Doanh nghiệp 2020 - Vốn góp không được âm'],
    };
  }
  return null;
}

// ════════════════════════════════════════
// AP_006-008: Khấu hao, HTK, CP trả trước
// ════════════════════════════════════════

/** AP_006: Khấu hao không nhất quán */
export function checkDepreciationConsistency(ld: LedgerData): Violation | null {
  const opening = ld.openingBalances['214'] ?? 0;
  const closing = ld.balances['214'] ?? 0;
  const posting = ld.postings['214'];
  if (!posting) return null;
  const expectedClosing = opening + posting.no - posting.co;
  if (Math.abs(closing - expectedClosing) > 0.01) {
    return {
      code: 'AP_006', group: 'principles', severity: 'medium',
      description: `TK 214 (KH TSCĐ) không nhất quán: đầu kỳ + trích (${expectedClosing.toLocaleString('vi-VN')}) ≠ cuối kỳ (${closing.toLocaleString('vi-VN')})`,
      expected: expectedClosing, actual: closing, difference: closing - expectedClosing,
      affectedAccounts: ['214'], affectedPeriods: ['closing'], confidenceScore: 0.9,
    };
  }
  return null;
}

/** AP_007: HTK âm */
export function checkInventoryValuation(ld: LedgerData): Violation | null {
  const invAccounts = ['152', '153', '154', '155', '156', '157'];
  const negative: Array<[string, number]> = [];
  for (const acc of invAccounts) {
    const bal = ld.balances[acc] ?? 0;
    if (bal < 0) negative.push([acc, bal]);
  }
  if (negative.length > 0) {
    const details = negative.map(([a, b]) => `TK ${a}: ${b.toLocaleString('vi-VN')}`).join(', ');
    return {
      code: 'AP_007', group: 'principles', severity: 'high',
      description: `Hàng tồn kho có tài khoản âm: ${details}`,
      expected: 0, actual: negative.reduce((s, [, b]) => s + b, 0),
      difference: negative.reduce((s, [, b]) => s + b, 0),
      affectedAccounts: negative.map(([a]) => a), affectedPeriods: ['closing'], confidenceScore: 1.0,
    };
  }
  return null;
}

/** AP_008: Chi phí trả trước biến động bất thường */
export function checkPrepaidExpensesConsistency(ld: LedgerData): Violation | null {
  const opening = ld.openingBalances['242'] ?? 0;
  const closing = ld.balances['242'] ?? 0;
  const posting = ld.postings['242'];
  const closeDebit = ld.closingDebit['242'] ?? 0;
  const closeCredit = ld.closingCredit['242'] ?? 0;
  const openDebit = ld.openingDebit['242'] ?? 0;
  const openCredit = ld.openingCredit['242'] ?? 0;

  // Kiem tra consistency tu postings
  if (posting) {
    const expected = opening + posting.no - posting.co;
    if (Math.abs(closing - expected) > 0.01) {
      return {
        code: 'AP_008', group: 'principles', severity: 'medium',
        description: `TK 242 (CP trả trước) biến động bất thường: dư đầu ${opening.toLocaleString('vi-VN')} → PS Nợ ${posting.no.toLocaleString('vi-VN')} / Có ${posting.co.toLocaleString('vi-VN')} → dư cuối ${closing.toLocaleString('vi-VN')}`,
        expected, actual: closing, difference: closing - expected,
        affectedAccounts: ['242'], affectedPeriods: ['closing'], confidenceScore: 0.9,
      };
    }
  }

  // Check biến động lớn trên TK 242 (du No > 1ty, có PS Co > 0)
  if (closeDebit > 1_000_000_000 && posting && posting.co > 1_000_000) {
    return {
      code: 'AP_008', group: 'principles', severity: 'medium',
      description: `TK 242 (CP trả trước) có số dư Nợ lớn ${closeDebit.toLocaleString('vi-VN')} và phát sinh Có ${posting.co.toLocaleString('vi-VN')}. Kiểm tra phân bổ.`,
      expected: openDebit, actual: closeDebit, difference: closeDebit - openDebit,
      affectedAccounts: ['242'], affectedPeriods: ['closing'], confidenceScore: 0.7,
    };
  }

  return null;
}

// ════════════════════════════════════════
// AP_009-011: Bù trừ, khấu hao 0, quay vòng
// ════════════════════════════════════════

const OFFSET_ACCOUNTS = ['131', '133', '136', '138', '141', '142', '144', '331', '334', '335', '336', '337', '338'];

/** AP_009: Phát hiện bù trừ dư Nợ - dư Có */
export function checkOffsetBalances(ld: LedgerData): Violation[] {
  const results: Violation[] = [];
  for (const acc of OFFSET_ACCOUNTS) {
    const debit = ld.closingDebit[acc] ?? 0;
    const credit = ld.closingCredit[acc] ?? 0;
    if (debit > OFFSET_MIN && credit > OFFSET_MIN) {
      results.push({
        code: 'AP_009', group: 'principles', severity: 'high',
        description: `TK ${acc} có cả dư Nợ (${debit.toLocaleString('vi-VN')}) và dư Có (${credit.toLocaleString('vi-VN')}) - vi phạm không bù trừ (VAS 21)`,
        expected: Math.max(debit, credit), actual: Math.abs(debit - credit),
        difference: debit - credit, affectedAccounts: [acc], affectedPeriods: ['closing'],
        confidenceScore: 0.9,
        professionalBasis: ['VAS 21 - Trình bày BCTC: nghiêm cấm bù trừ các khoản mục'],
      });
    }
  }
  return results;
}

/** AP_010: Khấu hao không phát sinh */
export function checkDepreciationPostingZero(ld: LedgerData): Violation[] {
  const results: Violation[] = [];
  for (const [acc, posting] of Object.entries(ld.postings)) {
    if (!acc.startsWith('214') && !acc.startsWith('224') && !acc.startsWith('229')) continue;
    const creditBal = ld.closingCredit[acc] ?? 0;
    const creditTurnover = posting.co ?? 0;
    if (creditBal > OFFSET_MIN && creditTurnover === 0) {
      results.push({
        code: 'AP_010', group: 'principles', severity: 'medium',
        description: `TK ${acc} có dư Có lũy kế ${creditBal.toLocaleString('vi-VN')} VNĐ nhưng phát sinh khấu hao trong kỳ = 0`,
        expected: 0, actual: creditBal, difference: creditBal,
        affectedAccounts: [acc], affectedPeriods: ['closing'],
        confidenceScore: 0.85,
        professionalBasis: ['TT45/2021/TT-BTC - Trích khấu hao TSCĐ hàng tháng', 'VAS 03 - TSCĐ hữu hình'],
      });
    }
  }
  return results;
}

/** AP_011: Phát hiện quay vòng bất thường */
export function checkWashPostings(ld: LedgerData): Violation[] {
  const washPrefixes = ['138', '141', '244', '334', '336', '337', '338', '352', '353', '356', '357', '358'];
  const matched: string[] = [];
  for (const [acc, posting] of Object.entries(ld.postings)) {
    if (!washPrefixes.some(p => acc.startsWith(p))) continue;
    const no = posting.no ?? 0;
    const co = posting.co ?? 0;
    const bal = ld.balances[acc] ?? 0;
    if (no >= WASH_MIN_POSTING && co >= no * WASH_RATIO && Math.abs(bal) <= WASH_BAL_TOL) {
      matched.push(acc);
    }
  }
  if (matched.length === 0) return [];
  // Dedupe: ưu tiên mã cấp 4
  const level4 = matched.filter(a => a.length === 4);
  const reportAccounts = level4.length > 0 ? level4 : matched.filter(
    a => !matched.some(b => b !== a && b.startsWith(a))
  );
  return reportAccounts.map(acc => {
    const no = ld.postings[acc]?.no ?? 0;
    return {
      code: 'AP_011', group: 'principles', severity: 'medium',
      description: `TK ${acc} có phát sinh Nợ (${no.toLocaleString('vi-VN')}) ≈ Có, không để lại số dư cuối kỳ - quay vòng bất thường`,
      expected: 0, actual: no, difference: no,
      affectedAccounts: [acc], affectedPeriods: ['closing'],
      confidenceScore: 0.6,
      professionalBasis: ['VAS 21 - Trình bày BCTC: phân loại đúng khoản mục'],
    };
  });
}

// ════════════════════════════════════════
// AP_025-027: Nợ vay - rủi ro tài chính
// ════════════════════════════════════════

const DEBT_EQUITY_HIGH = 3.0;

/** AP_025: Nợ vay / VCSH > 3 */
export function checkLoanDebtRatio(ld: LedgerData): Violation | null {
  const debtAccounts = ['341', '343', '344', '315', '331'];
  const equity = Math.abs(ld.balances['411'] ?? 0);
  const totalDebt = debtAccounts.reduce((s, a) => s + Math.abs(ld.balances[a] ?? 0), 0);
  if (equity <= 0 || totalDebt <= 0) return null;
  const ratio = totalDebt / equity;
  if (ratio > DEBT_EQUITY_HIGH) {
    return {
      code: 'AP_025', group: 'principles', severity: 'medium',
      description: `Nợ vay/VCSH = ${ratio.toFixed(1)} (> 3): Nợ vay ${totalDebt.toLocaleString('vi-VN')} / VCSH ${equity.toLocaleString('vi-VN')} — rủi ro đòn bẩy tài chính cao`,
      expected: DEBT_EQUITY_HIGH, actual: ratio, difference: ratio - DEBT_EQUITY_HIGH,
      affectedAccounts: [...debtAccounts, '411'], affectedPeriods: ['closing'],
      confidenceScore: 0.8,
      professionalBasis: ['VAS 01 - Nguyên tắc hoạt động liên tục', 'TT200 Điều 112'],
    };
  }
  return null;
}

/** AP_026: Tỷ suất tự tài trợ < 20% */
export function checkSelfFundingRatio(ld: LedgerData): Violation | null {
  const equity = Math.abs(ld.balances['411'] ?? 0);
  const assetAccounts = Object.keys(ld.postings).filter(a => (a.startsWith('1') || a.startsWith('2')) && (ld.balances[a] ?? 0) > 0);
  const totalAssets = assetAccounts.reduce((s, a) => s + Math.abs(ld.balances[a] ?? 0), 0);
  if (totalAssets <= 0 || equity <= 0) return null;
  const ratio = equity / totalAssets;
  if (ratio < 0.20) {
    return {
      code: 'AP_026', group: 'principles', severity: 'medium',
      description: `Tỷ suất tự tài trợ = ${(ratio * 100).toFixed(1)}% (< 20%): VCSH ${equity.toLocaleString('vi-VN')} / Tổng TS ${totalAssets.toLocaleString('vi-VN')} — phụ thuộc vốn vay`,
      expected: 0.20, actual: ratio, difference: ratio - 0.20,
      affectedAccounts: ['411'], affectedPeriods: ['closing'],
      confidenceScore: 0.7,
      professionalBasis: ['VAS 01 - Nguyên tắc hoạt động liên tục'],
    };
  }
  return null;
}

// ════════════════════════════════════════
// AP_017-019: VAT, tài sản dư Có, CCDC
// ════════════════════════════════════════

/** AP_017: VAT bị hạch toán sai vào chi phí */
export function checkVATMisclassifiedAsExpense(reportedStatements?: ReportedStatementSet | null): Violation | null {
  if (!reportedStatements) return null;
  const pl = reportedStatements.incomeStatement;
  const lnttItem = pl['50'] || pl['C'];
  const lnstItem = pl['60'] || pl['D'];
  const lntt = lnttItem?.closing;
  const lnst = lnstItem?.closing;
  let hasRisk = false;
  if (lntt != null && lnst != null && lntt > 0 && lnst < 0) hasRisk = true;
  if (!hasRisk) {
    for (const item of Object.values(pl)) {
      if (item.closing == null || item.closing === 0) { if (item.opening == null || item.opening === 0) continue; }
      const label = (item.label || '').toLowerCase();
      const rawCode = (item.rawCode || '').toLowerCase();
      const itemCode = (item.code || '').toLowerCase();
      if (label.includes('thue') && (label.includes('gtgt') || label.includes('gia tri gia tang'))) {
        if (Math.abs(item.closing ?? item.opening ?? 0) > 100_000_000) { hasRisk = true; break; }
      }
      if (itemCode === 'a1301' || rawCode === 'a1301' || itemCode === '41') {
        if (Math.abs(item.closing ?? item.opening ?? 0) > 100_000_000) { hasRisk = true; break; }
      }
    }
  }
  if (!hasRisk) return null;
  return {
    code: 'AP_017' as any, group: 'principles', severity: 'high',
    description: 'Phát hiện Thuế GTGT bị hạch toán là chi phí trên BCKQHĐKD. Cần hạch toán: Nợ 8211 / Có 3334.',
    expected: 0, actual: 0, difference: 0,
    affectedAccounts: ['3334', '8211', '511'], affectedPeriods: ['closing'],
    confidenceScore: 0.85,
    professionalBasis: ['TT99/2025 Điều 5 - Nguyên tắc ghi nhận chi phí / VAS 17 - Thuế TNDN'],
  };
}

/** AP_018: Tài sản dư Có */
export function checkAssetAccountCreditBalance(ld: LedgerData): Violation[] {
  const results: Violation[] = [];
  const skip = new Set(['111', '112', '113', '214', '224', '229']);
  for (const [acc, credit] of Object.entries(ld.closingCredit)) {
    if (skip.has(acc)) continue;
    const stripped = acc.replace(/^0+/, '');
    if (!stripped || !['1', '2'].includes(stripped[0])) continue;
    if (credit > ASSET_MIN_WARN) {
      results.push({
        code: 'AP_018', group: 'principles', severity: 'medium',
        description: `TK ${acc} (tài sản) có dư Có ${credit.toLocaleString('vi-VN')} VNĐ - cần tái phân loại sang nợ phải trả`,
        expected: 0, actual: credit, difference: credit,
        affectedAccounts: [acc], affectedPeriods: ['closing'],
        confidenceScore: 0.9,
        professionalBasis: ['VAS 21 - Trình bày BCTC: không được bù trừ, TK tài sản không được dư Có'],
      });
    }
  }
  return results;
}

/** AP_019: CCDC > 30tr cần tái phân loại */
export function checkCCDCOverThreshold(ld: LedgerData): Violation[] {
  const results: Violation[] = [];
  for (const acc of ['153', '242']) {
    const bal = Math.abs(ld.balances[acc] ?? 0);
    if (bal < 30_000_000) continue;
    const grossVal = Math.max(bal, ld.closingDebit[acc] ?? 0, Math.abs(ld.closingCredit[acc] ?? 0));
    if (grossVal < 30_000_000) continue;
    const desc = acc === '153'
      ? `TK ${acc} (CCDC) có dư ${bal.toLocaleString('vi-VN')} VNĐ (>= 30tr) - có thể cần ghi nhận là TSCĐ (TK 211)`
      : `TK ${acc} (Chi phí trả trước) có dư ${bal.toLocaleString('vi-VN')} VNĐ (>= 30tr) - có thể cần tái phân loại sang TSCĐ`;
    const journal = acc === '153'
      ? 'Nợ 211/Có 153; Nợ 642,623,627/Có 214'
      : 'Nợ 211/Có 242; Nợ 242/Có 111,112; Nợ 642,623,627/Có 242';
    results.push({
      code: 'AP_019', group: 'principles', severity: 'medium',
      description: desc, expected: 0, actual: grossVal, difference: grossVal,
      affectedAccounts: [acc], affectedPeriods: ['closing'],
      proposedJournalEntry: journal, confidenceScore: 0.6,
      professionalBasis: ['TT45/2013/TT-BTC - Tài sản cố định: nguyên giá >= 30 triệu'],
    });
  }
  return results;
}

/** AP_028: Nợ tập trung bất thường */
export function checkConcentratedLiability(ld: LedgerData): Violation | null {
  const liabAccounts: Record<string, string> = {
    '331': 'Phải trả NB', '333': 'Thuế NSNN', '334': 'Phải trả NLĐ',
    '335': 'CP phải trả', '336': 'Phải trả nội bộ', '337': 'Phải trả dài hạn khác',
    '338': 'Phải trả khác', '341': 'Vay và nợ thuê TC',
  };
  const balances: Record<string, number> = {};
  let total = 0;
  for (const acc of Object.keys(liabAccounts)) {
    const bal = Math.abs(ld.balances[acc] ?? 0);
    if (bal > 0) { balances[acc] = bal; total += bal; }
  }
  if (total < 1_000_000_000) return null;
  for (const [acc, name] of Object.entries(liabAccounts)) {
    const bal = balances[acc] ?? 0;
    if (bal === 0) continue;
    const ratio = bal / total * 100;
    if (ratio > 60) {
      return {
        code: 'AP_028', group: 'principles', severity: 'medium',
        description: `TK ${acc} (${name}) chiếm ${ratio.toFixed(1)}% tổng nợ phải trả (${bal.toLocaleString('vi-VN')}đ / ${total.toLocaleString('vi-VN')}đ) — nợ tập trung bất thường`,
        expected: total * 0.6, actual: bal, difference: bal - total * 0.6,
        affectedAccounts: [acc], affectedPeriods: ['closing'],
        confidenceScore: 0.85,
        professionalBasis: ['VAS 01 - Trình bày BCTC: thuyết minh chi tiết nợ phải trả'],
      };
    }
  }
  return null;
}

/** AP_029: Chi phí lãi vay không tách bạch */
export function checkInterestExpenseDisclosure(reportedStatements?: ReportedStatementSet | null): Violation | null {
  if (!reportedStatements) return null;
  // Format chuẩn: mã 22 (CP tài chính), mã 23 (CP lãi vay)
  const finExp = reportedStatements.incomeStatement['22']?.closing
    ?? reportedStatements.incomeStatement['A12']?.closing;
  const intExp = reportedStatements.incomeStatement['23']?.closing
    ?? reportedStatements.incomeStatement['A1201']?.closing;
  if (finExp == null || Math.abs(finExp) <= 1000) return null;
  if (intExp != null && Math.abs(intExp) > 1000) return null;
  return {
    code: 'AP_029', group: 'principles', severity: 'medium',
    description: `Chi phí tài chính (mã 22) = ${Math.abs(finExp).toLocaleString('vi-VN')}đ > 0 nhưng chi phí lãi vay (mã 23) thiếu hoặc bằng 0 — cần tách bạch chi phí lãi vay theo Điều 113 TT200`,
    expected: 0, actual: Math.abs(finExp), difference: Math.abs(finExp),
    affectedAccounts: ['22', '23'], affectedPeriods: ['closing'],
    confidenceScore: 0.85,
    legalCitations: ['TT200 Điều 113 - Hướng dẫn lập B02 (tách bạch CP lãi vay)'],
    professionalBasis: ['TT200 Điều 113 / TT99/2025 Phụ lục IV - Mã 22/23'],
  };
}

// ════════════════════════════════════════
// Helpers
// ════════════════════════════════════════

function getCreditBalance(ld: LedgerData, account: string): number {
  return ld.closingCredit[account] ?? 0;
}
function getDebitBalance(ld: LedgerData, account: string): number {
  return ld.closingDebit[account] ?? 0;
}

/**
 * AP_030: Phân loại sai Tài sản ngắn hạn / Dài hạn (Điều 112 TT200 / Điều 20 TT99)
 * Chỉ cảnh báo khi:
 * 1. TK dài hạn (211, 213, 241...) bị trình bày trong phần TSNH của B01 (mã 100-150)
 * 2. TSNH > TSDH bất thường so với cơ cấu (nghi ngờ phân loại sai)
 */
export function checkAssetClassification(ld: LedgerData): Violation[] {
  const results: Violation[] = [];

  // TK dài hạn và mã B01 tương ứng nếu bị trình bày sai
  // Nếu TK 211 (TSCĐ) có số dư nhưng B01 mã 220 (TSCĐ) = 0 -> nghi ngờ thiếu
  const longTermAccounts: Array<[string, string, string]> = [
    ['211', '220', 'TSCĐ hữu hình'],
    ['213', '220', 'TSCĐ vô hình'],
    ['217', '230', 'Bất động sản đầu tư'],
    ['241', '240', 'XDCB dở dang'],
  ];

  for (const [acc, bsCode, label] of longTermAccounts) {
    const ledgerBal = Math.abs(ld.balances[acc] ?? 0);
    if (ledgerBal < 100_000_000) continue; // bỏ qua số nhỏ

    // Nếu TK dài hạn có số dư > 100tr nhưng B01 không có chỉ tiêu tương ứng
    // (hoặc bằng 0) -> nghi ngờ trình bày thiếu / sai phân loại
    const bsHasItem = ld.closingDebit[acc] !== undefined || ld.closingCredit[acc] !== undefined;
    if (bsHasItem && ledgerBal > 100_000_000) {
      results.push({
        code: 'AP_030', group: 'principles', severity: 'medium',
        description: `TK ${acc} (${label}) có số dư ${ledgerBal.toLocaleString('vi-VN')}đ — kiểm tra được trình bày đúng trong TSDH (mã ${bsCode}) của B01 (Điều 112 TT200 / Điều 20 TT99).`,
        expected: 0, actual: ledgerBal, difference: ledgerBal,
        affectedAccounts: [acc], affectedPeriods: ['closing'],
        confidenceScore: 0.7,
        legalCitations: ['TT200 Điều 112 - Phân loại TSNH/TSDH', 'TT99/2025 Điều 20'],
      });
    }
  }
  return results;
}

/**
 * AP_031: Kiểm tra đơn vị tiền tệ (Điều 4 TT99/2025)
 * BCTC phải lập bằng Đồng Việt Nam (VND). Chỉ cảnh báo khi phát hiện
 * dấu hiệu rõ ràng như "Đơn vị tính: USD" hoặc "BCTC bằng USD" ở tiêu đề
 * (tránh false-positive với tên chỉ tiêu như "bán ngoại tệ", "lãi tỷ giá").
 */
export function checkCurrencyUnit(reportedStatements?: ReportedStatementSet | null): Violation | null {
  if (!reportedStatements) return null;
  // Chỉ check label là tiêu đề chứa đơn vị tiền tệ rõ ràng
  const foreignCurrencyHeaders = ['đơn vị tính: usd', 'đơn vị: usd', 'bằng usd', 'tính theo usd', 'đvt: usd', 'đơn vị: nghìn usd', 'đơn vị: triệu usd', 'đơn vị tính: eur', 'bảng cân đối (usd)'];
  for (const store of [reportedStatements.balanceSheet, reportedStatements.incomeStatement, reportedStatements.cashflow]) {
    for (const item of Object.values(store)) {
      const label = (item.label || '').toLowerCase();
      for (const cur of foreignCurrencyHeaders) {
        if (label.includes(cur)) {
          return {
            code: 'AP_031', group: 'principles', severity: 'high',
            description: `BCTC có thể lập bằng đơn vị tiền tệ ngoại tệ (phát hiện "${cur}" trong "${item.label}"). Theo Điều 4 TT99/2025, BCTC phải lập bằng Đồng Việt Nam (VND) hoặc trình bày rõ phương pháp chuyển đổi.`,
            expected: null, actual: null, difference: null,
            affectedAccounts: [item.code], affectedPeriods: [],
            confidenceScore: 0.7,
            legalCitations: ['TT99/2025 Điều 4 - Đơn vị tiền tệ trong kế toán'],
          };
        }
      }
    }
  }
  return null;
}

/** Chạy tất cả principles rules */
export function runAllPrincipleRules(
  ld: LedgerData | null,
  reportedStatements?: ReportedStatementSet | null,
): Violation[] {
  if (!ld) return [];
  const results: Violation[] = [];

  const apply = (fn: () => Violation | Violation[] | null) => {
    try { const r = fn(); if (r) { if (Array.isArray(r)) results.push(...r); else results.push(r); } } catch {}
  };
  apply(() => checkVATMisclassifiedAsExpense(reportedStatements));
  apply(() => checkCashNegativeBalance(ld));
  apply(() => checkBankNegativeBalance(ld));
  apply(() => checkAccountsPayableDebitBalance(ld));
  apply(() => checkTaxPayableDebitBalance(ld));
  apply(() => checkOwnerEquityNegative(ld));
  apply(() => checkDepreciationConsistency(ld));
  apply(() => checkInventoryValuation(ld));
  apply(() => checkPrepaidExpensesConsistency(ld));
  apply(() => checkOffsetBalances(ld));
  apply(() => checkDepreciationPostingZero(ld));
  apply(() => checkWashPostings(ld));
  apply(() => checkLoanDebtRatio(ld));
  apply(() => checkSelfFundingRatio(ld));
  apply(() => checkAssetAccountCreditBalance(ld));
  apply(() => checkCCDCOverThreshold(ld));
  apply(() => checkConcentratedLiability(ld));
  apply(() => checkInterestExpenseDisclosure(reportedStatements));
  apply(() => checkAssetClassification(ld));
  apply(() => checkCurrencyUnit(reportedStatements));

  return results;
}
