/* ==========================================================================
   template.ts — LV3_001-006: Template & mandatory code validation
   Port từ Python src/rules/template_rules.py
   ========================================================================== */

import { Violation, ReportedStatementSet } from '../schemas';

// Mã số bắt buộc theo từng loại báo cáo (TT99/2025)
const MANDATORY_ANCHOR_CODES: Record<string, string[]> = {
  balance_sheet: ['270', '280', '100', '200', '300', '400', '440'],
  income_statement: ['50', '60'],
  cashflow: ['50', '60', '70'],
};

// Mã code chỉ xuất hiện ở TT99/2025 (cột mã dài)
const TT99_CODES = new Set(['280', '281', '282', '283', '284', '285', '286', '287']);
// Mã code chỉ xuất hiện ở TT200
const TT200_CODES = new Set(['270', '271', '272', '273', '274', '275', '276', '277']);

/**
 * LV3_001-003: Kiểm tra mã số bắt buộc (mandatory codes)
 */
export function checkMandatoryCodes(
  stmt: ReportedStatementSet,
  reportType: string,
): Violation[] {
  const violations: Violation[] = [];
  const mandatory = MANDATORY_ANCHOR_CODES[reportType];
  if (!mandatory) return violations;

  const store = reportType === 'balance_sheet' ? stmt.balanceSheet
    : reportType === 'income_statement' ? stmt.incomeStatement
    : stmt.cashflow;

  // N?u b�o c�o d�ng m� qu?n tr? (kh�ng c� m� s? chu?n) -> b? qua
  if (hasMgmtFormat(reportType, store)) return violations;

  // Chi? kiem? anchor codes (cac? ma~ neo) de tránh false-positive
  for (const code of mandatory) {
    const item = store[code];
    if (!item) {
      violations.push({
        code: 'LV3_001',
        group: 'statement_template',
        severity: 'medium',
        description: `Thiếu mã số neo bắt buộc ${code} trên ${reportType}.`,
        expected: null, actual: null, difference: null,
        affectedAccounts: [],
        affectedPeriods: [],
        confidenceScore: 1.0,
      });
    } else if (item.closing == null) {
      violations.push({
        code: 'LV3_002',
        group: 'statement_template',
        severity: 'medium',
        description: `Chỉ tiêu mã ${code} (${item.label}) trên ${reportType} không có giá trị cuối kỳ.`,
        expected: null, actual: null, difference: null,
        affectedAccounts: [],
        affectedPeriods: ['closing'],
        confidenceScore: 1.0,
      });
    }
  }

  return violations;
}

/**
 * LV3_003: Kiểm tra công thức tham chiếu Phụ lục (formula references)
 * Chi? kiêm? các ma~ chinh da? biêt' (totals)
 */
export function checkReferenceFormulas(
  stmt: ReportedStatementSet,
  reportType: string,
): Violation[] {
  const violations: Violation[] = [];
  const store = reportType === 'balance_sheet' ? stmt.balanceSheet
    : reportType === 'income_statement' ? stmt.incomeStatement
    : stmt.cashflow;

  const formulaRefs = getFormulaReferences(reportType);
  for (const [mother, comps] of Object.entries(formulaRefs)) {
    const m = store[mother];
    if (!m || m.closing == null) continue;

    let expected = 0;
    let ok = true;
    for (const [code, sign] of comps) {
      const child = store[code];
      if (!child || child.closing == null) { ok = false; break; }
      expected += sign * child.closing;
    }
    if (!ok) continue;

    const diff = Math.abs(m.closing - expected);
    if (diff > 1.0) {
      violations.push({
        code: 'LV3_003', group: 'statement_template', severity: 'medium',
        description: `Mã ${mother} (${reportType}) không thỏa công thức tham chiếu Phụ lục: ${m.closing.toLocaleString('vi-VN')} ≠ ${expected.toLocaleString('vi-VN')}`,
        expected, actual: m.closing, difference: m.closing - expected,
        affectedAccounts: [mother, ...comps.map(([c]) => c)],
        affectedPeriods: ['closing'],
        confidenceScore: 1.0,
      });
    }
  }

  return violations;
}

function getFormulaReferences(reportType: string): Record<string, Array<[string, number]>> {
  const refs: Record<string, Record<string, Array<[string, number]>>> = {
    balance_sheet: {
      '270': [['100', 1], ['200', 1]],
      '300': [['310', 1], ['330', 1]],
      '400': [['410', 1], ['420', 1]],
      '440': [['300', 1], ['400', 1]],
    },
    income_statement: {
      '50': [['10', 1], ['20', 1], ['30', 1], ['40', 1]],
      '60': [['50', 1], ['51', 1]],
    },
    cashflow: {
      '50': [['20', 1], ['30', 1], ['40', 1]],
      '70': [['50', 1], ['60', 1]],
    },
  };
  return refs[reportType] || {};
}

/**
 * LV3_003: Kiểm tra consistency của template (TT99 vs TT200)
 * Phát hiện lẫn lộn mã số giữa 2 hệ thống
 */
export function checkTemplateConsistency(stmt: ReportedStatementSet): Violation[] {
  const violations: Violation[] = [];

  for (const [type, store] of Object.entries({
    balance_sheet: stmt.balanceSheet,
    income_statement: stmt.incomeStatement,
    cashflow: stmt.cashflow,
  })) {
    const codes = Object.keys(store);
    const hasTT99 = codes.some(c => TT99_CODES.has(c));
    const hasTT200 = codes.some(c => TT200_CODES.has(c));

    if (hasTT99 && hasTT200) {
      violations.push({
        code: 'LV3_006',
        group: 'statement_template',
        severity: 'high',
        description: `${type}: Phát hiện lẫn lộn mã số TT99/2025 và TT200/2014.`,
        expected: null, actual: null, difference: null,
        affectedAccounts: [],
        affectedPeriods: [],
        confidenceScore: 1.0,
        legalCitations: ['TT99/2025 Điều 17'],
      });
    }
  }

  return violations;
}

/**
 * LV3_004: Kiểm tra thuyết minh BCTC có mã số bắt buộc
 */
export function checkNotesMandatoryCodes(stmt: ReportedStatementSet): Violation[] {
  if (Object.keys(stmt.notes).length === 0) {
    return [{
      code: 'LV3_004',
      group: 'statement_template',
      severity: 'medium',
      description: 'Không tìm thấy Thuyết minh BCTC (B06/B09). Thiếu giải trình chi tiết số liệu.',
      expected: null, actual: null, difference: null,
      affectedAccounts: [],
      affectedPeriods: [],
      confidenceScore: 1.0,
      legalCitations: ['TT_200_2014 Điều 115 - Thuyết minh BCTC'],
    }];
  }
  return [];
}

/**
 * LV3_005: Kiểm tra mã số trùng TRONG CÙNG loại báo cáo (nội bộ).
 * Mã số giống nhau ở B01/B02/B03 là bình thường (mỗi báo cáo có hệ thống mã riêng).
 */
export function checkDuplicateCodes(stmt: ReportedStatementSet): Violation[] {
  const violations: Violation[] = [];

  for (const [type, store] of Object.entries({
    balance_sheet: stmt.balanceSheet,
    income_statement: stmt.incomeStatement,
    cashflow: stmt.cashflow,
  })) {
    const seen = new Map<string, string[]>();
    for (const code of Object.keys(store)) {
      const label = store[code]?.label || '';
      const prev = seen.get(code);
      if (prev) {
        // Chỉ báo nếu label khác nhau (cùng mã nhưng khác tên chỉ tiêu)
        if (!prev.includes(label)) {
          violations.push({
            code: 'LV3_005',
            group: 'statement_template',
            severity: 'low',
            description: `Mã số ${code} xuất hiện 2 lần trong ${type}: "${prev[0]}" và "${label}".`,
            expected: null, actual: null, difference: null,
            affectedAccounts: [],
            affectedPeriods: [],
            confidenceScore: 1.0,
          });
        }
        prev.push(label);
      } else {
        seen.set(code, [label]);
      }
    }
  }

  return violations;
}

// Kiem tra store co dung ma quan tri (chu cai) hay ma so chuan
function hasMgmtFormat(reportType: string, store: Record<string, any>): boolean {
  if (reportType !== 'income_statement') return false;
  const keys = Object.keys(store);
  if (keys.length === 0) return false;
  const alphaCount = keys.filter(k => /^[A-Za-z]/.test(k)).length;
  return alphaCount > keys.length / 2;
}

export function runStatementTemplateValidation(
  stmt: ReportedStatementSet,
  reportType: string,
): Violation[] {
  return checkMandatoryCodes(stmt, reportType);
}

// ════════════════════════════════════════
// LV3_006: Template mismatch detection
// ════════════════════════════════════════

/**
 * Detect template system for each report based on key codes
 * TT200 uses: 270 (Tong TS), 113 (PL)
 * TT99 uses: 280 (Tong TS), 70 (LNST), 23 (CP lai vay)
 */
function detectTemplateSystem(codes: Set<string>): string {
  // TT99 signals
  if (codes.has('280') || codes.has('70') || codes.has('23') || codes.has('24')) return 'TT99';
  // TT200 signals
  if (codes.has('270') || codes.has('113') || codes.has('114')) return 'TT200';
  return 'unknown';
}

/**
 * LV3_006: Detect template mismatch across reports
 * B01 uses TT200 but B02 uses TT99 -> mismatch
 */
export function checkTemplateMismatch(stmt: ReportedStatementSet): Violation[] {
  const violations: Violation[] = [];

  const bsCodes = new Set(Object.keys(stmt.balanceSheet));
  const plCodes = new Set(Object.keys(stmt.incomeStatement));
  const cfCodes = new Set(Object.keys(stmt.cashflow));

  const bsSys = detectTemplateSystem(bsCodes);
  const plSys = detectTemplateSystem(plCodes);
  const cfSys = detectTemplateSystem(cfCodes);

  const systems = new Set([bsSys, plSys, cfSys].filter(s => s !== 'unknown'));

  if (systems.size > 1) {
    const bsLabel = bsSys !== 'unknown' ? `B01=${bsSys}` : 'B01=unknown';
    const plLabel = plSys !== 'unknown' ? `B02=${plSys}` : 'B02=unknown';
    const cfLabel = cfSys !== 'unknown' ? `B03=${cfSys}` : 'B03=unknown';
    violations.push({
      code: 'LV3_006',
      group: 'statement_template',
      severity: 'medium',
      description: `Phát hiện lẫn lộn template BCTC: ${bsLabel}, ${plLabel}, ${cfLabel}.`,
      expected: null, actual: null, difference: null,
      affectedAccounts: [],
      affectedPeriods: [],
      confidenceScore: 1.0,
      legalCitations: ['TT99/2025 Dieu 17'],
    });
  }

  return violations;
}
