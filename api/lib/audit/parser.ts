/* ==========================================================================
   parser.ts — Parse Excel BCTC → ReportedStatementSet (TypeScript)
   Port từ Python src/parsers/bctc_parser.py
   Dùng: xlsx (SheetJS) npm package
   ========================================================================== */

import * as XLSX from 'xlsx';
import {
  ReportedLineItem,
  ReportedStatementSet,
  normCode,
} from './schemas';

// ─── Helpers ───
const FORMULA_RE = /\(([^()]*=\s*[0-9+\-()\s]+)\)/;

/** Nhãn junk không phải line-item BCTC */
const JUNK_TOKENS = new Set(['check', 'kiểm tra', 'kiem tra', 'ktra', 'xem', 'test']);

function normText(val: unknown): string {
  if (val == null) return '';
  return String(val).normalize('NFC').toLowerCase().trim();
}

function isJunkLabel(label: string): boolean {
  const low = normText(label);
  for (const tok of JUNK_TOKENS) {
    if (low.includes(tok)) return true;
  }
  return false;
}

/**
 * Parse số VN từ cell value.
 * Xử lý: (1.234) → -1234, 1.234- → -1234, 1.234.567 → 1234567
 */
export function toFloat(raw: unknown): number | null {
  try {
    if (raw == null) return null;
    if (typeof raw === 'boolean') return null;
    if (typeof raw === 'number') {
      if (isNaN(raw)) return null;
      return raw;
    }
    let s = String(raw).trim();
    if (s === '' || s.toLowerCase() === 'nan') return null;

    let neg = false;
    // Dấu trừ cuối
    if (s.endsWith('-')) {
      neg = true;
      s = s.slice(0, -1).trim();
    }
    // Ngoặc đơn
    if (s.startsWith('(') && s.endsWith(')')) {
      neg = true;
      s = s.slice(1, -1).trim();
    }

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');

    if (hasDot && hasComma) {
      // Phân cách: dấu đứng sau cùng là thập phân
      if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
        s = s.replace(/,/g, '');
      } else {
        s = s.replace(/\./g, '').replace(',', '.');
      }
    } else if (hasDot) {
      s = s.replace(/\./g, '');
    } else if (hasComma) {
      const parts = s.split(',');
      const grpOk =
        parts.length >= 2 &&
        /^\d+$/.test(parts[0]) &&
        parts.slice(1).every(p => p.length === 3 && /^\d+$/.test(p));
      if (grpOk) {
        s = s.replace(/,/g, '');
      } else {
        s = s.replace(',', '.');
      }
    }

    const val = parseFloat(s);
    if (isNaN(val)) return null;
    return neg ? -val : val;
  } catch {
    return null;
  }
}

/** Coerce cell to code string */
function coerceCode(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (isNaN(raw)) return null;
    return String(Math.trunc(raw));
  }
  const s = String(raw).trim();
  if (s === '' || s.toLowerCase() === 'nan') return null;
  return s;
}

/**
 * Parse công thức nhúng trong nhãn: '(100=110+120+130+140+150)'
 */
export function parseFormula(label: string): [string | null, Array<[string, number]>] {
  if (!label) return [null, []];
  const m = FORMULA_RE.exec(label);
  if (!m) return [null, []];
  const inner = m[1].trim();
  if (!inner.includes('=')) return [null, []];
  const [, rhs] = inner.split('=', 2);
  const comps: Array<[string, number]> = [];
  const re = /([+-]?)\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rhs)) !== null) {
    const sign = match[1] === '-' ? -1 : 1;
    comps.push([normCode(match[2]), sign]);
  }
  if (comps.length === 0) return [null, []];
  return [inner, comps];
}

/**
 * Parse công thức từ cột riêng (không có '='): '110+120+130'
 */
function parseFormulaColumn(val: unknown): [string | null, Array<[string, number]>] {
  if (val == null) return [null, []];
  const s = String(val).trim();
  if (!s || s.includes('=')) return [null, []];
  const comps: Array<[string, number]> = [];
  const re = /([+-]?)\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    const sign = match[1] === '-' ? -1 : 1;
    comps.push([normCode(match[2]), sign]);
  }
  if (comps.length < 2) return [null, []]; // phải có ≥2 thành phần
  return [s, comps];
}

// ─── Sheet detection ───
const SHEET_PRIORITY: Record<string, string[]> = {
  balance: [
    'bc tình', 'tình hình', 'cđkt', 'data bs', '2.bs', '3.bs',
    'b01', 'cdkt', 'cân đối', 'bảng cân',
  ],
  income: [
    '3.pl', '2.pl', 'b02', 'kqkd', 'kết quả', 'báo cáo kqkd',
    'sheet1', 'bckqhđkd', 'báo cáo kết quả hoạt động',
  ],
  cashflow: ['4.cf', 'b03', 'lctt', 'lưu chuyển', 'báo cáo lctt'],
  notes: ['5. notes', 'notes', 'thuyết minh', 'b09', 'b06', 'b07'],
};

const SHEET_KEYWORDS: Record<string, string[]> = {
  balance: ['cdkt', 'cân đối', 'cđkt', 'balance', 'b01', 'bảng cân'],
  income: ['kqkd', 'kết quả', 'kq', 'income', 'b02', 'kết quả kinh', 'sheet1', 'bckqhđkd'],
  cashflow: ['lctt', 'lưu chuyển', 'cash', 'cf', 'b03', 'lưu chuyển tiền'],
  notes: ['notes', 'thuyết minh', 'b09', 'b06', 'b07', 'bản thuyết'],
};

const CLOSE_KEYWORDS = ['số cuối năm', 'cuối kỳ', 'cuoi ky', 'closing', 'current year', 'kỳ này', 'ky nay', 'thực hiện', 'ytd', 'cuối kì'];
const OPEN_KEYWORDS = ['số đầu năm', 'đầu kỳ', 'dau ky', 'opening', 'previous year', 'kỳ trước', 'ky truoc', 'chi kỳ', 'previous', 'đầu kì'];
const CODE_KEYWORDS = ['stt', 'số thứ tự', 'mã số', 'mã', 'code'];
const LABEL_KEYWORDS = ['chỉ tiêu', 'tên chỉ tiêu', 'tên tiêu', 'label', 'description'];
const FORMULA_KEYWORDS = ['công thức', 'cong thuc', 'formula'];
const NOTE_KEYWORDS = ['thuyết minh', 'note', 'ghi chú'];
const CDPS_EXCLUDE = new Set(['tài khoản', 'tai khoan', 's06', 'số phát sinh', 'phat sinh']);

const CONTENT_KEYWORDS: Record<string, string[]> = {
  balance: ['bảng cân đối kế toán', 'bang can doi ke toan', 'b01 – dn'],
  income: ['kết quả hoạt động kinh doanh', 'ket qua hoat dong kinh doanh', 'b02 – dn'],
  cashflow: ['lưu chuyển tiền tệ', 'luu chuyen tien te', 'b03 – dn'],
};

function detectSheet(workbook: XLSX.WorkBook, stmtType: string): string | null {
  const names = workbook.SheetNames;

  // Priority 1
  for (const name of names) {
    const low = normText(name);
    for (const p of SHEET_PRIORITY[stmtType] || []) {
      if (low.includes(p)) {
        if (stmtType === 'balance' && [...CDPS_EXCLUDE].some(tok => low.includes(tok))) continue;
        return name;
      }
    }
  }

  // Priority 2
  const kws = SHEET_KEYWORDS[stmtType] || [];
  for (const name of names) {
    const low = normText(name);
    for (const kw of kws) {
      if (low.includes(kw)) {
        if (stmtType === 'balance' && [...CDPS_EXCLUDE].some(tok => low.includes(tok))) continue;
        return name;
      }
    }
  }

  // Priority 3: scan nội dung 20 dòng đầu
  const ckws = CONTENT_KEYWORDS[stmtType];
  if (ckws) {
    for (const name of names) {
      if (stmtType === 'balance' && [...CDPS_EXCLUDE].some(tok => normText(name).includes(tok))) continue;
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const ref = sheet['!ref'];
      if (!ref) continue;
      const range = XLSX.utils.decode_range(ref);
      let sample = '';
      for (let r = 0; r < Math.min(range.e.r + 1, 20); r++) {
        for (let c = 0; c < Math.min(range.e.c + 1, 6); c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const val = sheet[addr]?.v;
          if (val != null) sample += normText(val) + ' ';
        }
      }
      if (ckws.some(kw => sample.includes(kw))) return name;
    }
  }

  return null;
}

// ─── Header & Column detection ───

/** Convert worksheet to 2D array (string/number/null) */
function sheetToArray(sheet: XLSX.WorkSheet): unknown[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const data: unknown[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push(sheet[addr]?.v ?? null);
    }
    data.push(row);
  }
  return data;
}

function findHeaderRow(data: unknown[][]): number | null {
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      const val = normText(data[r][c]);
      if (CODE_KEYWORDS.some(kw => val.includes(kw))) {
        // Check if same row has closing keyword
        for (let c2 = 0; c2 < data[r].length; c2++) {
          const v2 = normText(data[r][c2]);
          if (CLOSE_KEYWORDS.some(ck => v2.includes(ck))) return r;
        }
      }
    }
  }
  // Fallback
  for (const kw of CODE_KEYWORDS) {
    for (let r = 0; r < data.length; r++) {
      for (let c = 0; c < (data[r]?.length || 0); c++) {
        const val = String(data[r][c] ?? '');
        if (val.length < 30 && normText(val).includes(kw)) return r;
      }
    }
  }
  return null;
}

function colIndex(data: unknown[][], row: number, tokens: string[]): number | null {
  if (row >= data.length) return null;
  const low = normText(data[row]?.map?.(v => String(v ?? '')).join(' ') ?? '');
  for (const tok of tokens) {
    if (low.includes(tok)) {
      // Find exact column
      for (let c = 0; c < data[row].length; c++) {
        if (normText(data[row][c]).includes(tok)) return c;
      }
      // return first col with any token
      for (let c = 0; c < data[row].length; c++) {
        if (tokens.some(t => normText(data[row][c]).includes(t))) return c;
      }
    }
  }
  return null;
}

function findFirstDataRow(data: unknown[][], start: number, codeCol: number): number {
  for (let r = start; r < data.length; r++) {
    const code = coerceCode(data[r]?.[codeCol]);
    if (code && /^\d+$/.test(code)) return r;
  }
  return data.length;
}

function detectColumns(data: unknown[][], hdr: number): {
  codeCol: number; labelCol: number; closingCol: number;
  openingCol: number | null; formulaCol: number | null; noteCol: number | null;
} | null {
  const codeCol = colIndexRow(data[hdr], CODE_KEYWORDS);
  if (codeCol == null) return null;

  let labelCol = colIndexRow(data[hdr], LABEL_KEYWORDS);
  if (labelCol == null) {
    labelCol = codeCol > 0 ? 0 : 1;
  }

  let closingCol = colIndexRow(data[hdr], CLOSE_KEYWORDS);
  if (closingCol == null) {
    const cand = [];
    for (let c = Math.max(codeCol, labelCol) + 1; c < data[hdr].length; c++) cand.push(c);
    closingCol = cand.length > 0 ? cand[cand.length - 1] : null;
  }
  if (closingCol == null) return null;

  let openingCol = colIndexRow(data[hdr], OPEN_KEYWORDS);
  if (openingCol == null) {
    const cand = [];
    for (let c = Math.max(codeCol, labelCol) + 1; c < closingCol; c++) cand.push(c);
    openingCol = cand.length > 0 ? cand[cand.length - 1] : null;
  }

  const formulaCol = colIndexRow(data[hdr], FORMULA_KEYWORDS);
  const noteCol = colIndexRow(data[hdr], NOTE_KEYWORDS);

  return { codeCol, labelCol, closingCol, openingCol, formulaCol, noteCol };
}

function colIndexRow(row: unknown[], tokens: string[]): number | null {
  if (!row) return null;
  // Ưu tiên "mã số" cho code columns
  if (tokens.includes('mã số') || tokens.includes('mã')) {
    for (let c = 0; c < row.length; c++) {
      const val = normText(row[c]);
      if (val === 'mã số' || val === 'ma so') return c;
    }
  }
  for (let c = 0; c < row.length; c++) {
    const val = normText(row[c]);
    for (const tok of tokens) {
      if (val.includes(tok) && !val.includes('mã số') && !val.includes('ma so')) return c;
    }
  }
  return null;
}

function parseStatementDF(data: unknown[][]): Record<string, ReportedLineItem> {
  const items: Record<string, ReportedLineItem> = {};
  const hdr = findHeaderRow(data);
  if (hdr == null) return items;

  const cols = detectColumns(data, hdr);
  if (!cols) return items;

  const { codeCol, labelCol, closingCol, openingCol, formulaCol, noteCol } = cols;
  const start = findFirstDataRow(data, hdr, codeCol);

  for (let r = start; r < data.length; r++) {
    const raw = coerceCode(data[r]?.[codeCol]);
    if (!raw) continue;

    const label = String(data[r]?.[labelCol] ?? '');
    if (isJunkLabel(label)) continue;

    // Formula: embedded in label → fallback column
    let [formula, comps] = parseFormula(label);
    if (!comps && formulaCol != null) {
      const fval = data[r]?.[formulaCol];
      if (fval != null && String(fval).trim()) {
        [formula, comps] = parseFormulaColumn(fval);
      }
    }

    let section: string | undefined;
    if (noteCol != null && data[r]?.[noteCol] != null) {
      section = String(data[r][noteCol]).trim() || undefined;
    }

    const item: ReportedLineItem = {
      code: normCode(raw),
      rawCode: raw,
      label,
      section,
      formula: formula ?? undefined,
      formulaComponents: comps,
      closing: toFloat(data[r]?.[closingCol]),
      opening: openingCol != null ? toFloat(data[r]?.[openingCol]) : null,
    };
    items[item.code] = item;
  }

  return items;
}

// ─── Public parsing functions ───

export function parseBalanceSheetDF(df: unknown[][]): Record<string, ReportedLineItem> {
  return parseStatementDF(df);
}

export function parseIncomeStatementDF(df: unknown[][]): Record<string, ReportedLineItem> {
  const items = parseStatementDF(df);
  // fallback to management format if empty
  if (Object.keys(items).length === 0) {
    return parseMgmtIncomeDF(df);
  }
  return items;
}

/**
 * Parse management income format (B/B01/AA/A/C/D codes)
 * Port từ Python parse_mgmt_income()
 */
function parseMgmtIncomeDF(data: unknown[][]): Record<string, ReportedLineItem> {
  const items: Record<string, ReportedLineItem> = {};
  let hdr: number | null = null;

  // Find header: row with "ma~ khoản mục" + "tháng"
  for (let r = 0; r < Math.min(data.length, 10); r++) {
    let text = '';
    for (let c = 0; c < Math.min(data[r]?.length ?? 0, 6); c++) {
      text += String(data[r]?.[c] ?? '').toLowerCase() + ' ';
    }
    if (text.includes('mã khoản mục') && text.includes('tháng')) { hdr = r; break; }
  }
  if (hdr == null) return items;

  for (let r = hdr + 1; r < data.length; r++) {
    const raw = String(data[r]?.[0] ?? '').trim();
    if (!raw || raw === 'nan') continue;
    if (!/^[A-Z]/.test(raw)) continue; // management codes start with letter

    const label = String(data[r]?.[1] ?? '').trim();
    // Closing = ky nay (col 3 cho THANG 6), opening = ky truoc (col 2 cho THANG 5)
    let closingRaw = data[r]?.[3];
    let openingRaw = data[r]?.[2];

    const closing = toFloat(closingRaw);
    const opening = toFloat(openingRaw);

    items[raw] = {
      code: raw,
      rawCode: raw,
      label,
      formulaComponents: [],
      closing,
      opening,
    };
  }
  return items;
}

export function parseCashflowDF(df: unknown[][]): Record<string, ReportedLineItem> {
  return parseStatementDF(df);
}

/**
 * Extract MST from BCTC sheet (near "Mã số thuế" label)
 */
export function extractTaxCode(workbook: XLSX.WorkBook, bsName?: string): string {
  const candidates = [bsName, 'BCTC', workbook.SheetNames[0]].filter(Boolean) as string[];
  for (const name of candidates) {
    if (!name || !workbook.Sheets[name]) continue;
    const sheet = workbook.Sheets[name];
    const ref = sheet['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    for (let r = 0; r < Math.min(range.e.r + 1, 12); r++) {
      for (let c = 0; c < Math.min(range.e.c + 1, 5); c++) {
        const val = String(sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? '');
        const low = val.toLowerCase().normalize('NFC');
        if (low.includes('mã số thuế') || low.includes('ma so thue') || low.includes('[02]')) {
          const m = val.match(/(\d{10,14})/);
          if (m) return m[1];
          // Try next cell
          const next = String(sheet[XLSX.utils.encode_cell({ r, c: c + 1 })]?.v ?? '');
          const m2 = next.match(/(\d{10,14})/);
          if (m2) return m2[1];
        }
      }
    }
  }
  return '';
}

/**
 * Extract company name from BCTC sheet.
 * Typically in cell A1 or near "Tên người nộp thuế" label
 */
export function extractCompanyName(workbook: XLSX.WorkBook, bsName?: string): string {
  // Try balance sheet first
  const candidates = [bsName, 'BCTC', workbook.SheetNames[0]].filter(Boolean) as string[];
  for (const name of candidates) {
    if (!name || !workbook.Sheets[name]) continue;
    const sheet = workbook.Sheets[name];
    const ref = sheet['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    // Check first 10 rows, first 4 columns for company name
    for (let r = 0; r < Math.min(range.e.r + 1, 10); r++) {
      for (let c = 0; c < Math.min(range.e.c + 1, 4); c++) {
        const val = String(sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? '');
        const low = val.toLowerCase().normalize('NFC');
        // Look for company name after "Tên người nộp thuế" or "CÔNG TY"
        if (low.includes('tên người nộp thuế') || low.includes('ten nguoi nop thue')) {
          const match = val.match(/tên người nộp thuế:\s*(.+?)(?:\r?\n|$)/i);
          if (match) {
            const name = match[1].trim();
            if (name) return name;
          }
        }
        // First cell with "CÔNG TY" or "CONG TY"
        if (low.startsWith('công ty') || low.startsWith('cong ty')) {
          return val.trim();
        }
      }
    }
    // Check cell B1, A1 for company-like text
    for (const cell of ['A1', 'B1', 'A2']) {
      const val = String(sheet[cell]?.v ?? '').trim();
      if (val && val.length > 5 && !val.startsWith('Mẫu') && !val.startsWith('BẢNG') && !val.startsWith('BÁO')) {
        return val;
      }
    }
  }
  return '';
}

/**
 * Parse result bao gom ca company name
 */
export interface ParseResult {
  statements: ReportedStatementSet;
  companyName: string;
  taxCode: string;
}

/**
 * Đọc file buffer → ReportedStatementSet
 * Port của Python parse_bctc()
 */
export function parseBCTC(
  buffer: ArrayBuffer | Uint8Array,
  sheetNames?: { bs?: string; pl?: string; cf?: string; notes?: string },
): ReportedStatementSet {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });

  const bsName = sheetNames?.bs || detectSheet(workbook, 'balance');
  const plName = sheetNames?.pl || detectSheet(workbook, 'income');
  const cfName = sheetNames?.cf || detectSheet(workbook, 'cashflow');
  const notesName = sheetNames?.notes || detectSheet(workbook, 'notes');

  let bs: Record<string, ReportedLineItem> = {};
  let pl: Record<string, ReportedLineItem> = {};
  let cf: Record<string, ReportedLineItem> = {};
  let notes: Record<string, ReportedLineItem> = {};

  if (bsName && workbook.Sheets[bsName]) {
    bs = parseBalanceSheetDF(sheetToArray(workbook.Sheets[bsName]));
  }
  if (plName && workbook.Sheets[plName]) {
    pl = parseIncomeStatementDF(sheetToArray(workbook.Sheets[plName]));
    pl = normalizeMgmtCodes(pl);
  }
  if (cfName && workbook.Sheets[cfName]) {
    cf = parseCashflowDF(sheetToArray(workbook.Sheets[cfName]));
  }
  if (notesName && workbook.Sheets[notesName]) {
    notes = parseStatementDF(sheetToArray(workbook.Sheets[notesName]));
  }

  return {
    balanceSheet: bs,
    incomeStatement: pl,
    cashflow: cf,
    notes,
  };
}

/** parseBCTC plus company name */
export function parseBCTCWithCompany(buffer: ArrayBuffer | Uint8Array): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });
  const bsName = detectSheet(workbook, 'balance');
  const plName = detectSheet(workbook, 'income');
  const cfName = detectSheet(workbook, 'cashflow');
  const notesName = detectSheet(workbook, 'notes');

  const statements: ReportedStatementSet = {
    balanceSheet: bsName && workbook.Sheets[bsName] ? parseBalanceSheetDF(sheetToArray(workbook.Sheets[bsName])) : {},
    incomeStatement: plName && workbook.Sheets[plName] ? normalizeMgmtCodes(parseIncomeStatementDF(sheetToArray(workbook.Sheets[plName]))) : {},
    cashflow: cfName && workbook.Sheets[cfName] ? parseCashflowDF(sheetToArray(workbook.Sheets[cfName])) : {},
    notes: notesName && workbook.Sheets[notesName] ? parseStatementDF(sheetToArray(workbook.Sheets[notesName])) : {},
  };

  const companyName = extractCompanyName(workbook, bsName || undefined);
  const taxCode = extractTaxCode(workbook, bsName || undefined);

  return { statements, companyName, taxCode };
}

// ─── Management Code Normalization ───

const MGMT_CODE_MAP: Record<string, string> = {
  'B': '10', 'B01': '01', 'B02': '02', 'B03': '03', 'B04': '04',
  'B05': '05', 'B06': '06', 'B07': '07', 'B10': '08', 'B11': '10',
  'A': '20', 'AA': '11', 'A00': '11', 'A01': '21', 'A02': '22',
  'A03': '23', 'A06': '24', 'A07': '25', 'A09': '26', 'A10': '27',
  'A11': '28', 'AAA': '29', 'AAAA': '30', 'A12': '31', 'A14': '32',
  'A13': '40', 'A1301': '41', 'A1302': '42',
  'C': '50', 'D': '60',
};

function normalizeMgmtCodes(items: Record<string, ReportedLineItem>): Record<string, ReportedLineItem> {
  const normalized: Record<string, ReportedLineItem> = {};
  for (const [code, item] of Object.entries(items)) {
    const upper = code.toUpperCase();
    if (MGMT_CODE_MAP[upper]) {
      item.code = MGMT_CODE_MAP[upper];
      normalized[item.code] = item;
      if (code !== item.code && !normalized[code]) normalized[code] = item;
    } else {
      normalized[code] = item;
    }
  }
  return normalized;
}

/**
 * Auto-detect period từ tên file + dữ liệu
 */
export function detectPeriod(
  fileName: string,
  stmt?: ReportedStatementSet,
): string {
  const fname = fileName.toLowerCase();
  // Mặc định năm hiện tại (thay vì 2024)
  let year = String(new Date().getFullYear());
  const m = /(20\d{2})/.exec(fname);
  if (m) year = m[1];

  if (/t1-t6|ban nien|bán niên|6 tháng/.test(fname)) return `${year}-H1`;
  if (/t1-t3|quy 1|quý 1|q1/.test(fname)) return `${year}-Q1`;
  if (/t1-t6|quy 2|quý 2|q2/.test(fname)) return `${year}-H1`;
  if (/quy 3|quý 3|q3/.test(fname)) return `${year}-Q3`;
  if (/quy 4|quý 4|q4/.test(fname)) return `${year}-Q4`;
  if (/tháng \d|thang \d/.test(fname)) {
    const mm = fname.match(/tháng\s*(\d{1,2})|thang\s*(\d{1,2})/);
    if (mm) {
      const month = parseInt(mm[1] || mm[2] || '1', 10);
      if (month >= 7) return `${year}-H2`;
      return `${year}-H1`;
    }
  }

  // Heuristic từ dữ liệu
  if (stmt) {
    let allOpen = true;
    let anyClose = false;
    for (const store of [stmt.balanceSheet, stmt.incomeStatement, stmt.cashflow]) {
      for (const item of Object.values(store)) {
        if (item.opening != null && item.opening !== 0) allOpen = false;
        if (item.closing != null && item.closing !== 0) anyClose = true;
      }
    }
    if (allOpen && anyClose) return year;
  }

  return year;
}
