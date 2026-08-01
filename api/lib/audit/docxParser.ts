/* ==========================================================================
   docxParser.ts — Parse BCTC từ .docx (paragraphs + Word tables)
   Port từ Python src/parsers/docx_bctc_parser.py
   Dùng: zipfile (Node built-in) + regex, không cần mammoth
   ========================================================================== */

import * as zlib from 'zlib';
import {
  ReportedStatementSet,
  ReportedLineItem,
  normCode,
} from './schemas';

/** Đọc document.xml từ docx (zip) */
function readDocumentXml(buffer: Buffer): string | null {
  try {
    // Docx là zip, tìm entry word/document.xml
    // Parse zip headers đơn giản (central directory)
    const data = buffer;
    // Tìm end of central directory
    let eocd = data.length - 22;
    while (eocd > 0 && !(data[eocd] === 0x50 && data[eocd+1] === 0x4b && data[eocd+2] === 0x05 && data[eocd+3] === 0x06)) {
      eocd--;
    }
    if (eocd <= 0) return null;

    const totalEntries = data.readUInt16LE(eocd + 10);
    const cdSize = data.readUInt32LE(eocd + 12);
    const cdOffset = data.readUInt32LE(eocd + 16);

    let offset = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      // Central directory entry
      const method = data.readUInt16LE(offset + 10);
      const compSize = data.readUInt32LE(offset + 20);
      const uncompSize = data.readUInt32LE(offset + 24);
      const nameLen = data.readUInt16LE(offset + 28);
      const extraLen = data.readUInt16LE(offset + 30);
      const commentLen = data.readUInt16LE(offset + 32);
      const localOffset = data.readUInt32LE(offset + 42);
      const name = data.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');

      if (name === 'word/document.xml') {
        // Read local header
        const lhNameLen = data.readUInt16LE(localOffset + 26);
        const lhExtraLen = data.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
        const compressed = data.subarray(dataStart, dataStart + compSize);
        if (method === 0) {
          return compressed.toString('utf8');
        } else if (method === 8) {
          return zlib.inflateRawSync(compressed).toString('utf8');
        }
        return null;
      }
      offset += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  } catch {
    return null;
  }
}

/** Đọc paragraphs từ document.xml */
function readParagraphs(xml: string): string[] {
  const lines: string[] = [];
  const pRe = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(xml)) !== null) {
    const inner = m[1];
    // Lấy tất cả text trong w:t
    const texts: string[] = [];
    const tRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(inner)) !== null) {
      texts.push(decodeXml(tm[1]));
    }
    const line = texts.join('').trim();
    if (line) lines.push(line);
  }
  return lines;
}

/** Đọc bảng Word (w:tbl) thành dòng pipe-delimited */
function readTables(xml: string): string[] {
  const rows: string[] = [];
  const tblRe = /<w:tbl[^>]*>([\s\S]*?)<\/w:tbl>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tblRe.exec(xml)) !== null) {
    const tblInner = tm[1];
    const trRe = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
    let rm: RegExpExecArray | null;
    while ((rm = trRe.exec(tblInner)) !== null) {
      const cells: string[] = [];
      const tcRe = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
      let cm: RegExpExecArray | null;
      while ((cm = tcRe.exec(rm[1])) !== null) {
        const texts: string[] = [];
        const tRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
        let xm: RegExpExecArray | null;
        while ((xm = tRe.exec(cm[1])) !== null) {
          texts.push(decodeXml(xm[1]));
        }
        cells.push(texts.join('').trim());
      }
      if (cells.length && cells.some(c => c.trim())) {
        rows.push('| ' + cells.join(' | ') + ' |');
      }
    }
  }
  return rows;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// ─── Section signatures ───
const SECTION_SIGNATURES: Array<[RegExp, string]> = [
  [/financial position|balance sheet|cân đối kế toán|bảng cân đối/i, 'balance_sheet'],
  [/profit\s+or\s+loss|income statement|báo cáo kết quả|kết quả (hoạt động )?kinh doanh/i, 'income_statement'],
  [/cash\s+flow|lưu chuyển tiền tệ|lưu chuyển/i, 'cashflow'],
];

function detectSection(text: string): string | null {
  for (const [re, type] of SECTION_SIGNATURES) {
    if (re.test(text)) return type;
  }
  return null;
}

/** Parse 1 dòng pipe-delimited hoặc text thành line item */
function parseLine(line: string): ReportedLineItem | null {
  // Format: | Mã | Tên | ... | Số | hoặc "Mã Tên Số..."
  const parts = line.split('|').map(p => p.trim()).filter(p => p);
  if (parts.length >= 2) {
    // Tìm mã số (chuỗi số)
    const codeMatch = parts[0].match(/\d{2,4}/);
    if (codeMatch) {
      const code = normCode(codeMatch[0]);
      // Tìm số cuối (giá trị lớn nhất có dấu phẩy)
      let closing: number | null = null;
      for (let i = parts.length - 1; i >= 1; i--) {
        const num = parseVNNumber(parts[i]);
        if (num !== null && Math.abs(num) > 1000) {
          closing = num;
          break;
        }
      }
      return {
        code,
        rawCode: code,
        label: parts[1] || '',
        formulaComponents: [],
        closing,
        opening: null,
      };
    }
  }
  return null;
}

/** Parse số VN từ chuỗi */
function parseVNNumber(s: string): number | null {
  const clean = s.replace(/[đ.]/g, '').replace(/,/g, '').trim();
  if (!/^-?\d+$/.test(clean)) return null;
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

/** Nhận diện dòng line-item (có mã + số) */
function isLineItem(text: string): boolean {
  const codeMatch = text.match(/\b\d{2,4}\b/);
  const numMatch = text.match(/\d{1,3}(?:[.,]\d{3})+\s*(?:đ|VND)?/);
  return !!(codeMatch && numMatch);
}

/**
 * Extract BCTC statements from .docx buffer
 * Port từ Python extract_docx_statements()
 */
export function parseDocxBCTC(buffer: ArrayBuffer | Uint8Array): ReportedStatementSet {
  const buf = Buffer.from(buffer as Uint8Array);
  const xml = readDocumentXml(buf);
  const statements: ReportedStatementSet = {
    balanceSheet: {},
    incomeStatement: {},
    cashflow: {},
    notes: {},
  };
  if (!xml) return statements;

  const lines = [...readParagraphs(xml), ...readTables(xml)];

  // Route line-items vào đúng báo cáo theo section signature
  let currentSection: string | null = null;
  for (const line of lines) {
    const section = detectSection(line);
    if (section) {
      currentSection = section;
      continue;
    }
    if (!currentSection || !isLineItem(line)) continue;

    const item = parseLine(line);
    if (!item) continue;

    const store = currentSection === 'balance_sheet' ? statements.balanceSheet
      : currentSection === 'income_statement' ? statements.incomeStatement
      : statements.cashflow;
    store[item.code] = item;
  }

  return statements;
}

/** Kiểm tra file có phải docx không */
export function isDocx(buffer: Buffer): boolean {
  return buffer.length > 4 &&
    buffer[0] === 0x50 && buffer[1] === 0x4b &&
    buffer[2] === 0x03 && buffer[3] === 0x04;
}
