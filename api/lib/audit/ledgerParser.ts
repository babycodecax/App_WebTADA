/* ==========================================================================
   ledgerParser.ts — Parse Bảng CĐPS (Cân đối phát sinh) Excel → LedgerData + CdpsData
   Port từ Python src/parsers/ledger_parser.py + cdps_parser.py
   ========================================================================== */

import * as XLSX from 'xlsx';
import { LedgerData, CdpsData, CdpsRow } from './schemas';

/**
 * Kiểm tra sheet có phải là CĐPS (Bảng cân đối phát sinh / Sổ cái) không
 */
export function isCdpsSheet(sheetName: string): boolean {
  const low = sheetName.toLowerCase().normalize('NFC');
  return low.includes('cân đối tài khoản')
    || low.includes('cân đối phát sinh')
    || low.includes('cdps')
    || low.includes('s06')
    || low.includes('sổ cái')
    || low.includes('bang can doi');
}

function cellFloat(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'boolean') return 0;
  const s = String(val).replace(/,/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Find header row for CDPS sheet.
 * Looks for row with ["Số tài khoản", "Tên tài khoản"] or similar
 */
function findCdpsHeader(data: unknown[][]): number | null {
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    let rowText = '';
    for (let c = 0; c < Math.min(data[r]?.length ?? 0, 4); c++) {
      rowText += String(data[r]?.[c] ?? '').toLowerCase() + ' ';
    }
    if ((rowText.includes('số tài khoản') || rowText.includes('so tai khoan')) &&
        rowText.includes('tên tài khoản')) {
      return r;
    }
  }
  // Fallback: find column with "Nợ" and "Có"
  for (let r = 0; r < Math.min(data.length, 12); r++) {
    const rowData = data[r] ?? [];
    const hasNo = rowData.some(c => String(c ?? '').toLowerCase().trim() === 'nợ');
    const hasCo = rowData.some(c => String(c ?? '').toLowerCase().trim() === 'có');
    if (hasNo && hasCo) return r;
  }
  return null;
}

/**
 * Detect column positions for CDPS sheet.
 * Common format: [Số TK] [Tên TK] [Đầu kỳ Nợ] [Đầu kỳ Có] [PS Nợ] [PS Có] [Cuối kỳ Nợ] [Cuối kỳ Có]
 * Or:            [Số TK] [Tên TK] [Đầu kỳ] [PS Nợ] [PS Có] [Cuối kỳ]
 * Detail:        [Số TK] [Tên TK] [Đầu kỳ Nợ] [Đầu kỳ Có] [PS Nợ] [PS Có] [Cuối kỳ Nợ] [Cuối kỳ Có]
 * Or simpler:    [Số TK] [Tên TK] [Đầu kỳ] [Phát sinh] [Cuối kỳ] with sub-header Nợ/Có
 */
function detectCdpsCols(data: unknown[][], hdrRow: number): {
  accountCol: number; nameCol: number;
  openingDebitCol: number | null; openingCreditCol: number | null;
  postingDebitCol: number | null; postingCreditCol: number | null;
  closingDebitCol: number | null; closingCreditCol: number | null;
} {
  const hdr = data[hdrRow] || [];
  const hdr2 = data[hdrRow + 1] || []; // sub-header row

  let accountCol = -1;
  let nameCol = -1;

  // Find account code column
  for (let c = 0; c < hdr.length; c++) {
    const v = String(hdr[c] ?? '').toLowerCase().trim();
    if (v.includes('số tài khoản') || v.includes('so tai khoan') || v === 'tk' || v === 'stt' || v === 'mã số') {
      accountCol = c;
    }
    if (v.includes('tên tài khoản') || v.includes('ten tai khoan') || v.includes('tên tk') || v.includes('diễn giải')) {
      nameCol = c;
    }
  }
  if (accountCol < 0) accountCol = 0; // fallback
  if (nameCol < 0) nameCol = 1; // fallback

  // Detect columns from sub-header (Nợ/Có pattern)
  let openingDebitCol: number | null = null;
  let openingCreditCol: number | null = null;
  let postingDebitCol: number | null = null;
  let postingCreditCol: number | null = null;
  let closingDebitCol: number | null = null;
  let closingCreditCol: number | null = null;

  if (hdr2.length > 0) {
    // Try to map from sub-header with "Nợ"/"Có"
    let foundNoCols: number[] = [];
    let foundCoCols: number[] = [];
    for (let c = 0; c < hdr2.length; c++) {
      const v = String(hdr2[c] ?? '').toLowerCase().trim();
      if (v === 'nợ' || v === 'no') foundNoCols.push(c);
      if (v === 'có' || v === 'co') foundCoCols.push(c);
    }

    // Also check main header for groups like [Đầu kỳ] [Phát sinh] [Cuối kỳ]
    const openingCol = findColSubstring(hdr, 'đầu kỳ');
    const postingCol = findColSubstring(hdr, 'phát sinh');
    const closingCol = findColSubstring(hdr, 'cuối kỳ');
    const beginCol = findColSubstring(hdr, 'đầu');
    const endCol = findColSubstring(hdr, 'cuối');
    const psCol = findColSubstring(hdr, 'phát sinh');

    // If we have 3-group layout: [Đầu kỳ] [Phát sinh] [Cuối kỳ] each with Nợ/Có
    if (openingCol != null && postingCol != null && closingCol != null) {
      openingDebitCol = openingCol; openingCreditCol = openingCol + 1;
      postingDebitCol = postingCol; postingCreditCol = postingCol + 1;
      closingDebitCol = closingCol; closingCreditCol = closingCol + 1;
    } else if (foundNoCols.length >= 3 && foundCoCols.length >= 3) {
      // Detail: [ĐK Nợ] [ĐK Có] [PS Nợ] [PS Có] [CK Nợ] [CK Có]
      openingDebitCol = foundNoCols[0]; openingCreditCol = foundCoCols[0];
      postingDebitCol = foundNoCols[1]; postingCreditCol = foundCoCols[1];
      closingDebitCol = foundNoCols[2]; closingCreditCol = foundCoCols[2];
    } else if (foundNoCols.length >= 2 && foundCoCols.length >= 2) {
      // [PS Nợ] [PS Có] [CK Nợ] [CK Có] or [ĐK Nợ] [ĐK Có] [PS Nợ] [PS Có] [CK]
      postingDebitCol = foundNoCols[0]; postingCreditCol = foundCoCols[0];
      closingDebitCol = foundNoCols[1]; closingCreditCol = foundCoCols[1];
    } else if (beginCol != null && endCol != null && psCol != null) {
      // Simple: [Đầu kỳ] [Phát sinh Nợ] [Phát sinh Có] [Cuối kỳ]
      if (foundNoCols.length >= 2) postingDebitCol = foundNoCols[0];
      else postingDebitCol = beginCol + 1;
      if (foundCoCols.length >= 2) postingCreditCol = foundCoCols[1];
      else postingCreditCol = beginCol + 2;
      openingDebitCol = beginCol;
      closingDebitCol = endCol;
    } else {
      // Monitor-style: [Số TK] [Tên TK] [Đầu kỳ Nợ] [Đầu kỳ Có] [PS Nợ] [PS Có] [Cuối kỳ Nợ] [Cuối kỳ Có]
      openingDebitCol = 2; openingCreditCol = 3;
      postingDebitCol = 4; postingCreditCol = 5;
      closingDebitCol = 6; closingCreditCol = 7;
    }
  }

  return {
    accountCol, nameCol,
    openingDebitCol, openingCreditCol,
    postingDebitCol, postingCreditCol,
    closingDebitCol, closingCreditCol,
  };
}

function findColSubstring(row: unknown[], substr: string): number | null {
  for (let c = 0; c < row.length; c++) {
    if (String(row[c] ?? '').toLowerCase().includes(substr)) return c;
  }
  return null;
}

/**
 * Parse sheet CĐPS → LedgerData + CdpsData
 */
export function parseCdps(data: unknown[][]): { ledgerData: LedgerData; cdpsData: CdpsData; } {
  const hdrRow = findCdpsHeader(data);
  const cols = hdrRow != null ? detectCdpsCols(data, hdrRow) : null;

  const ledger: LedgerData = {
    balances: {}, openingBalances: {}, postings: {},
    openingDebit: {}, openingCredit: {},
    closingDebit: {}, closingCredit: {},
  };
  const cdpsRows: CdpsRow[] = [];

  const startRow = (hdrRow ?? 0) + 2; // skip header + sub-header
  for (let r = startRow; r < data.length; r++) {
    const code = String(data[r]?.[cols?.accountCol ?? 0] ?? '').trim();
    if (!code || !/^\d+$/.test(code)) continue; // only account codes

    const label = String(data[r]?.[cols?.nameCol ?? 1] ?? '').trim();

    const od = cols?.openingDebitCol != null ? cellFloat(data[r][cols.openingDebitCol]) : 0;
    const oc = cols?.openingCreditCol != null ? cellFloat(data[r][cols.openingCreditCol]) : 0;
    const pd = cols?.postingDebitCol != null ? cellFloat(data[r][cols.postingDebitCol]) : 0;
    const pc = cols?.postingCreditCol != null ? cellFloat(data[r][cols.postingCreditCol]) : 0;
    const cd = cols?.closingDebitCol != null ? cellFloat(data[r][cols.closingDebitCol]) : 0;
    const cc = cols?.closingCreditCol != null ? cellFloat(data[r][cols.closingCreditCol]) : 0;

    // Quy uoc so du mang dau: No duong, Co am
    const balanceFromDetail = cd > 0 ? cd : (cc > 0 ? -cc : 0);
    const openingBalance = od > 0 ? od : (oc > 0 ? -oc : 0);

    ledger.balances[code] = ledger.balances[code] ?? 0;
    // Accumulate if duplicate (different sub-accounts)
    if (ledger.balances[code] !== 0) {
      // check if this is a sub-account
    } else {
      ledger.balances[code] = balanceFromDetail;
    }

    ledger.openingBalances[code] = openingBalance;
    ledger.closingDebit[code] = cd;
    ledger.closingCredit[code] = cc;
    ledger.openingDebit[code] = od;
    ledger.openingCredit[code] = oc;
    ledger.postings[code] = { no: pd, co: pc };

    cdpsRows.push({ account: code, label, openingDebit: od, openingCredit: oc, postingDebit: pd, postingCredit: pc, closingDebit: cd, closingCredit: cc });
  }

  return { ledgerData: ledger, cdpsData: { rows: cdpsRows } };
}

/**
 * Tìm và parse sheet CĐPS từ workbook
 */
export function parseLedgerFromWorkbook(workbook: XLSX.WorkBook): { ledgerData: LedgerData; cdpsData: CdpsData } | null {
  // Try exact names first
  const cdpsCandidates = workbook.SheetNames.filter(n => isCdpsSheet(n));
  const name = cdpsCandidates[0];
  if (!name) return null;

  const sheet = workbook.Sheets[name];
  if (!sheet) return null;

  const data = sheetToUnknownArray(sheet);
  if (data.length < 5) return null;

  return parseCdps(data);
}

function sheetToUnknownArray(sheet: XLSX.WorkSheet): unknown[][] {
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
