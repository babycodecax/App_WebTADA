/* ==========================================================================
   wordGenerator.ts — Sinh file .docx thật từ AuditReport (dùng docx library)
   Word mở được 100%
   ========================================================================== */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} from 'docx';
import { AuditReport, reportBySeverity } from './schemas';

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  try { return v.toLocaleString('vi-VN'); } catch { return String(v); }
}

function p(text: string, opts?: { bold?: boolean; color?: string; size?: number; italic?: boolean; center?: boolean }): Paragraph {
  return new Paragraph({
    alignment: opts?.center ? AlignmentType.CENTER : undefined,
    children: [new TextRun({
      text,
      bold: opts?.bold,
      italics: opts?.italic,
      color: opts?.color,
      size: opts?.size ?? 24, // half-points: 24 = 12pt
    })],
  });
}

function tableCell(text: string, isHeader = false): TableCell {
  return new TableCell({
    shading: isHeader ? { fill: '800020' } : undefined,
    children: [p(text, isHeader ? { bold: true, color: 'FFFFFF', size: 20 } : { size: 20 })],
  });
}

/** Tạo .docx Buffer từ report */
export async function generateDocxBuffer(
  report: AuditReport,
  bctc?: { balanceSheetItems?: any; incomeStatementItems?: any; cashflowItems?: any },
): Promise<Buffer> {
  const company = report.companyName || 'N/A';
  const period = report.period || 'N/A';
  const sev = reportBySeverity(report);
  const total = report.violations.length;
  const bs = bctc?.balanceSheetItems || {};
  const pl = bctc?.incomeStatementItems || {};

  const children: Array<Paragraph | Table> = [];

  // Header
  children.push(p('DỊCH VỤ THUẾ - KẾ TOÁN TADA', { bold: true, color: '800020', size: 30, center: true }));
  children.push(p('BÁO CÁO SOÁT XÉT VÀ PHÂN TÍCH BCTC', { bold: true, color: '800020', size: 26, center: true }));
  children.push(p(`Công ty: ${company} | Kỳ: ${period}`, { size: 20, center: true }));
  children.push(p(`Tổng vi phạm: ${total} (Nghiêm trọng: ${sev.critical || 0}, Cao: ${sev.high || 0}, TB: ${sev.medium || 0}, Thấp: ${sev.low || 0})`, { size: 20, center: true }));
  children.push(p(''));

  // Bảng A: B01 điều chỉnh
  children.push(p('A. ĐIỀU CHỈNH SAI SÓT TRONG VIỆC LẬP BÁO CÁO TÀI CHÍNH', { bold: true, color: '800020', size: 26 }));

  const mainItems: Array<[string, string]> = [
    ['100', 'Tài sản ngắn hạn'], ['110', 'Tiền và tương đương tiền'],
    ['120', 'Đầu tư tài chính ngắn hạn'], ['130', 'Các khoản phải thu ngắn hạn'],
    ['140', 'Hàng tồn kho'], ['150', 'Tài sản ngắn hạn khác'],
    ['200', 'Tài sản dài hạn'], ['220', 'Tài sản cố định'],
    ['270', 'TỔNG CỘNG TÀI SẢN'],
    ['300', 'Nợ phải trả'], ['310', 'Nợ ngắn hạn'], ['330', 'Nợ dài hạn'],
    ['400', 'Vốn chủ sở hữu'], ['410', 'Vốn chủ sở hữu'],
    ['440', 'TỔNG CỘNG NGUỒN VỐN'],
  ];

  const rowsA: TableRow[] = [
    new TableRow({ children: ['Chỉ tiêu', 'Mã số', 'Số cuối kỳ'].map(h => tableCell(h, true)) }),
  ];
  for (const [code, label] of mainItems) {
    const item = bs[code];
    const val = item?.closing != null ? fmt(item.closing) : '—';
    rowsA.push(new TableRow({
      children: [tableCell(label), tableCell(code), tableCell(val)],
    }));
  }
  children.push(new Table({ rows: rowsA, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  // ─── I. Kết luận đối chiếu + II. Thuyết minh + III. Lưu ý (thuộc mục A) ───
  children.push(p('I. Kết luận đối chiếu', { bold: true, size: 22 }));
  children.push(p(`Hệ thống đã đối chiếu file BCTC (Mẫu B01-DN) với file Bảng cân đối tài khoản cùng kỳ. Kết quả phát hiện ${total} sai sót/lỗi công thức. Trên cơ sở đó, hệ thống điều chỉnh và trình bày lại Báo cáo tình hình tài chính, đảm bảo Tổng tài sản = Tổng nguồn vốn.`));
  children.push(p('II. Thuyết minh các điều chỉnh áp dụng', { bold: true, size: 22 }));
  const tk141 = bs['141']?.closing;
  const tk138 = bs['138']?.closing;
  const tk333 = bs['333']?.closing;
  const tk421 = bs['421']?.closing;
  const tk153 = bs['153']?.closing;
  const tk242 = bs['242']?.closing;
  if (tk141) children.push(p(`• TK141 (Tạm ứng, ${fmt(tk141)}đ): chuyển sang "Tài sản ngắn hạn khác" (Mã 155) do sai bản chất.`));
  if (tk138 && tk138 < 0) children.push(p(`• TK138 (${fmt(tk138)}đ, dư Có): chuyển sang "Phải trả ngắn hạn khác" (Mã 319).`));
  if (tk333 && tk333 < 0) children.push(p(`• TK333 (${fmt(tk333)}đ, dư Nợ cuối kỳ): chuyển sang "Thuế phải thu Nhà nước" (Mã 153).`));
  children.push(p('• Mã 100 (Tổng TSNH): bổ sung đầy đủ Mã 130 vào công thức tính tổng.'));
  children.push(p('• Mã 220 (TSCĐ): tính lại theo đúng công thức mẫu, không cộng trùng Mã 240, 260.'));
  children.push(p('• Mã 310 (Nợ ngắn hạn): bổ sung đầy đủ Mã 311; cập nhật đúng số dư cuối kỳ.'));
  if (tk421) children.push(p(`• Mã 421 (LNST chưa phân phối, ${fmt(tk421)}đ): lấy theo đúng số dư Có TK421 trên Bảng cân đối tài khoản.`));
  children.push(p('• Mã 270 không gán cứng bằng Mã 440 — tính độc lập từ chi tiết.'));
  if (tk153) children.push(p(`• TK153 (CCDC, ${fmt(tk153)}đ): rà soát CCDC nguyên giá trên 30 triệu cần chuyển TK211 (TT45/2013/TT-BTC).`));
  if (tk242) children.push(p(`• TK242 (Chi phí trả trước, ${fmt(tk242)}đ): kiểm tra bảng phân bổ, kết chuyển đúng kỳ.`));
  children.push(p('III. Lưu ý và sai sót cụ thể', { bold: true, size: 22 }));
  children.push(p('• Số liệu đầu kỳ chưa tự cân đối tuyệt đối do một số TK chi tiết chưa được trích xuất đầy đủ.'));
  children.push(p('• TK338 "Phải trả, phải nộp khác" chiếm tỷ trọng lớn trong Nợ phải trả — cần xác nhận lại bản chất, kỳ hạn.'));
  children.push(p('• Báo cáo phục vụ rà soát nội bộ; số liệu chính thức cần kế toán trưởng/Giám đốc xác nhận, ký duyệt.'));
  children.push(p(''));

  // Bảng B: Sai sót
  children.push(p('B. PHÂN TÍCH RỦI RO HẠCH TOÁN TỪNG TÀI KHOẢN', { bold: true, color: '800020', size: 26 }));

  const rowsB: TableRow[] = [
    new TableRow({ children: ['STT', 'Phát hiện', 'Số liệu', 'Kiến nghị', 'Bút toán đề xuất'].map(h => tableCell(h, true)) }),
  ];
  report.violations.forEach((v, i) => {
    const sl = `Dư cuối: ${fmt(v.actual)}đ; dư đầu: ${fmt(v.expected)}đ; chênh lệch: ${fmt(v.difference)}đ`;
    rowsB.push(new TableRow({
      children: [
        tableCell(String(i + 1)),
        tableCell(v.description || ''),
        tableCell(sl),
        tableCell(v.recommendation || ''),
        tableCell(v.proposedJournalEntry || '—'),
      ],
    }));
  });
  children.push(new Table({ rows: rowsB, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  // ─── Tính chỉ số chung ───
  const TA = bs['270']?.closing ?? bs['280']?.closing ?? 0;
  const TAo = bs['270']?.opening ?? bs['280']?.opening ?? 0;
  const TL = bs['300']?.closing ?? 0;
  const TLo = bs['300']?.opening ?? 0;
  const EQ = bs['400']?.closing ?? 0;
  const EQo = bs['400']?.opening ?? 0;
  const CA = bs['100']?.closing ?? 0;
  const CAo = bs['100']?.opening ?? 0;
  const FA = bs['200']?.closing ?? 0;
  const FAo = bs['200']?.opening ?? 0;
  const CL = bs['310']?.closing ?? 0;
  const CLo = bs['310']?.opening ?? 0;
  const CASH = bs['110']?.closing ?? 0;
  const INV = bs['140']?.closing ?? 0;
  const AR = bs['131']?.closing ?? 0;
  const AP = bs['331']?.closing ?? 0;
  const BL = bs['341']?.closing ?? 0;
  const REV = pl['01']?.closing ?? pl['10']?.closing ?? 0;
  const REVo = pl['01']?.opening ?? pl['10']?.opening ?? 0;
  const PROFIT = pl['60']?.closing ?? 0;
  const PROFITo = pl['60']?.opening ?? 0;
  const COGS = pl['11']?.closing ?? 0;
  const EBIT = pl['50']?.closing ?? 0;

  const pct = (v: number) => v !== 0 ? (v * 100).toFixed(2) + '%' : '—';
  const lan = (v: number) => v !== 0 ? v.toFixed(2) + ' lần' : '—';

  // ─── C. Cơ cấu vốn - tài sản (3 bảng) ───
  children.push(p('C. PHÂN TÍCH CƠ CẤU VỐN - CƠ CẤU TÀI SẢN', { bold: true, color: '800020', size: 26 }));
  children.push(p('I. Phân tích cơ cấu nguồn vốn', { bold: true, size: 22 }));
  const rowsC1: TableRow[] = [
    new TableRow({ children: ['Chỉ tiêu', 'Đầu kỳ', 'Cuối kỳ', '+/-', '%'].map(h => tableCell(h, true)) }),
  ];
  const c1d = (label: string, open: number, close: number) => {
    const diff = close - open;
    const pctChg = open !== 0 ? ((diff / Math.abs(open)) * 100).toFixed(1) + '%' : '—';
    rowsC1.push(new TableRow({ children: [
      tableCell(label),
      tableCell(open !== 0 ? (label.includes('Hệ số') ? lan(open) : pct(open)) : '—'),
      tableCell(close !== 0 ? (label.includes('Hệ số') ? lan(close) : pct(close)) : '—'),
      tableCell(diff !== 0 ? diff.toFixed(2) : '—'),
      tableCell(pctChg),
    ] }));
  };
  c1d('Hệ số nợ (Nợ/Tổng NV)', TAo > 0 ? TLo / TAo : 0, TA > 0 ? TL / TA : 0);
  c1d('Hệ số tài trợ (VCSH/Tổng NV)', TAo > 0 ? EQo / TAo : 0, TA > 0 ? EQ / TA : 0);
  c1d('Hệ số nợ/VCSH', EQo > 0 ? TLo / EQo : 0, EQ > 0 ? TL / EQ : 0);
  rowsC1.push(new TableRow({ children: [tableCell('Tỷ lệ vay NH/Tổng NV'), tableCell('—'), tableCell(TA > 0 ? pct(BL / TA) : '—'), tableCell('—'), tableCell('—')] }));
  rowsC1.push(new TableRow({ children: [tableCell('Tỷ lệ nợ PTNB/Tổng NV'), tableCell('—'), tableCell(TA > 0 ? pct(AP / TA) : '—'), tableCell('—'), tableCell('—')] }));
  rowsC1.push(new TableRow({ children: [tableCell('Tỷ lệ nợ ngắn hạn/Tổng nợ'), tableCell('—'), tableCell(TL > 0 ? pct(CL / TL) : '—'), tableCell('—'), tableCell('—')] }));
  children.push(new Table({ rows: rowsC1, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  children.push(p('II. Phân tích cơ cấu tài sản', { bold: true, size: 22 }));
  const rowsC2: TableRow[] = [
    new TableRow({ children: ['Chỉ tiêu', 'Đầu kỳ', 'Cuối kỳ', '+/-', '%'].map(h => tableCell(h, true)) }),
  ];
  const c2d = (label: string, open: number, close: number) => {
    const diff = close - open;
    const pctChg = open !== 0 ? ((diff / Math.abs(open)) * 100).toFixed(1) + '%' : '—';
    rowsC2.push(new TableRow({ children: [
      tableCell(label),
      tableCell(open !== 0 ? pct(open) : '—'),
      tableCell(close !== 0 ? pct(close) : '—'),
      tableCell(diff !== 0 ? diff.toFixed(2) : '—'),
      tableCell(pctChg),
    ] }));
  };
  c2d('Tỷ lệ TSDH/Tổng TS', TAo > 0 ? FAo / TAo : 0, TA > 0 ? FA / TA : 0);
  c2d('Tỷ lệ TSNH/Tổng TS', TAo > 0 ? CAo / TAo : 0, TA > 0 ? CA / TA : 0);
  rowsC2.push(new TableRow({ children: [tableCell('Tỷ lệ phải thu KH/Tổng TS'), tableCell('—'), tableCell(TA > 0 ? pct(AR / TA) : '—'), tableCell('—'), tableCell('—')] }));
  rowsC2.push(new TableRow({ children: [tableCell('Tỷ lệ HTK/Tổng TS'), tableCell('—'), tableCell(TA > 0 ? pct(INV / TA) : '—'), tableCell('—'), tableCell('—')] }));
  rowsC2.push(new TableRow({ children: [tableCell('Tỷ lệ tiền/Tổng TS'), tableCell('—'), tableCell(TA > 0 ? pct(CASH / TA) : '—'), tableCell('—'), tableCell('—')] }));
  children.push(new Table({ rows: rowsC2, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  children.push(p('III. Phân tích bảo đảm vốn kinh doanh', { bold: true, size: 22 }));
  const rowsC3: TableRow[] = [
    new TableRow({ children: ['Chỉ tiêu', 'Đầu kỳ', 'Cuối kỳ', '+/-', '%'].map(h => tableCell(h, true)) }),
  ];
  const c3d = (label: string, open: number, close: number, isMoney = false) => {
    const diff = close - open;
    const pctChg = open !== 0 ? ((diff / Math.abs(open)) * 100).toFixed(1) + '%' : '—';
    rowsC3.push(new TableRow({ children: [
      tableCell(label),
      tableCell(isMoney ? fmt(open) : lan(open)),
      tableCell(isMoney ? fmt(close) : lan(close)),
      tableCell(isMoney ? fmt(diff) : diff.toFixed(2)),
      tableCell(pctChg),
    ] }));
  };
  c3d('Vốn lưu động', CAo - CLo, CA - CL, true);
  c3d('Nguồn vốn ngắn hạn/TSNH', CAo > 0 ? CLo / CAo : 0, CA > 0 ? CL / CA : 0);
  c3d('VCSH/TSCĐ', FAo > 0 ? EQo / FAo : 0, FA > 0 ? EQ / FA : 0);
  rowsC3.push(new TableRow({ children: [tableCell('Vốn lưu động'), tableCell(fmt(CAo - CLo)), tableCell(fmt(CA - CL))] }));
  rowsC3.push(new TableRow({ children: [tableCell('Nguồn vốn ngắn hạn/TSNH'), tableCell(CAo > 0 ? lan(CLo / CAo) : '—'), tableCell(CA > 0 ? lan(CL / CA) : '—')] }));
  rowsC3.push(new TableRow({ children: [tableCell('VCSH/TSCĐ'), tableCell(FAo > 0 ? lan(EQo / FAo) : '—'), tableCell(FA > 0 ? lan(EQ / FA) : '—')] }));
  children.push(new Table({ rows: rowsC3, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  // ─── D. Chỉ số tài chính (5 nhóm) ───
  children.push(p('D. PHÂN TÍCH CHỈ SỐ TÀI CHÍNH - RỦI RO TÀI CHÍNH - ĐÁNH GIÁ', { bold: true, color: '800020', size: 26 }));

  const CR = CL > 0 ? CA / CL : 0;
  const QR = CL > 0 ? (CA - INV) / CL : 0;
  const CashR = CL > 0 ? CASH / CL : 0;
  children.push(p('I. Nhóm chỉ tiêu thanh khoản', { bold: true, size: 22 }));
  const rowsD1: TableRow[] = [
    new TableRow({ children: ['Chỉ tiêu', 'Kỳ này', 'Đánh giá'].map(h => tableCell(h, true)) }),
  ];
  rowsD1.push(new TableRow({ children: [tableCell('Hệ số thanh toán hiện hành'), tableCell(lan(CR)), tableCell(CR < 1 ? 'Rủi ro thanh khoản' : 'Bình thường')] }));
  rowsD1.push(new TableRow({ children: [tableCell('Hệ số thanh toán nhanh'), tableCell(lan(QR)), tableCell(QR < 0.5 ? 'Thanh khoản thấp' : 'Bình thường')] }));
  rowsD1.push(new TableRow({ children: [tableCell('Hệ số thanh toán tức thời'), tableCell(lan(CashR)), tableCell(CashR < 0.1 ? 'Dự trữ tiền thấp' : 'Bình thường')] }));
  children.push(new Table({ rows: rowsD1, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  children.push(p('II. Nhóm chỉ tiêu cơ cấu vốn (đòn bẩy tài chính)', { bold: true, size: 22 }));
  const rowsD2: TableRow[] = [
    new TableRow({ children: ['Chỉ tiêu', 'Kỳ này', 'Đánh giá'].map(h => tableCell(h, true)) }),
  ];
  rowsD2.push(new TableRow({ children: [tableCell('Hệ số nợ/Tổng tài sản'), tableCell(TA > 0 ? pct(TL / TA) : '—'), tableCell(TL / TA < 0.5 ? 'Cơ cấu an toàn' : 'Tỷ trọng nợ cao')] }));
  rowsD2.push(new TableRow({ children: [tableCell('Hệ số nợ/VCSH'), tableCell(EQ > 0 ? lan(TL / EQ) : '—'), tableCell(EQ > 0 && TL / EQ > 0.5 ? 'Cẩn trọng đòn bẩy' : 'An toàn')] }));
  rowsD2.push(new TableRow({ children: [tableCell('Tỷ suất tự tài trợ'), tableCell(TA > 0 ? pct(EQ / TA) : '—'), tableCell(EQ / TA > 0.5 ? 'An toàn' : 'Thấp')] }));
  children.push(new Table({ rows: rowsD2, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  children.push(p('III. Nhóm chỉ tiêu hiệu quả hoạt động', { bold: true, size: 22 }));
  const ART = AR > 0 ? REV / AR : (REV > 0 ? REV : 0);
  const INVRT = INV > 0 ? REV / INV : (REV > 0 ? REV : 0);
  const TAT = TA > 0 ? REV / TA : 0;
  const rowsD3: TableRow[] = [
    new TableRow({ children: ['Chỉ tiêu', 'Kỳ này', 'Đánh giá'].map(h => tableCell(h, true)) }),
  ];
  rowsD3.push(new TableRow({ children: [tableCell('Vòng quay khoản phải thu'), tableCell(lan(ART)), tableCell(ART < 1 ? 'Rủi ro tồn đọng công nợ' : 'Bình thường')] }));
  rowsD3.push(new TableRow({ children: [tableCell('Vòng quay hàng tồn kho'), tableCell(lan(INVRT)), tableCell(INVRT < 1 ? 'Vòng quay thấp' : 'Bình thường')] }));
  rowsD3.push(new TableRow({ children: [tableCell('Vòng quay tổng tài sản'), tableCell(lan(TAT)), tableCell(TAT < 0.1 ? 'Hiệu quả sử dụng vốn kém' : 'Bình thường')] }));
  children.push(new Table({ rows: rowsD3, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  children.push(p('IV. Nhóm chỉ tiêu khả năng sinh lời', { bold: true, size: 22 }));
  const ROA = TA > 0 ? PROFIT / TA : 0;
  const ROE = EQ > 0 ? PROFIT / EQ : 0;
  const GM = REV > 0 ? (REV - COGS) / REV : 0;
  const NPM = REV > 0 ? PROFIT / REV : 0;
  const OPM = REV > 0 ? EBIT / REV : 0;
  const rowsD4: TableRow[] = [
    new TableRow({ children: ['Chỉ tiêu', 'Kỳ này', 'Đánh giá'].map(h => tableCell(h, true)) }),
  ];
  rowsD4.push(new TableRow({ children: [tableCell('ROA'), tableCell(pct(ROA)), tableCell(ROA < 0 ? 'Thua lỗ' : 'Bình thường')] }));
  rowsD4.push(new TableRow({ children: [tableCell('ROE'), tableCell(pct(ROE)), tableCell(ROE < 0 ? 'Thua lỗ' : 'Bình thường')] }));
  rowsD4.push(new TableRow({ children: [tableCell('Biên lợi nhuận gộp'), tableCell(pct(GM)), tableCell(GM < 0.5 ? 'Thấp' : 'Tốt')] }));
  rowsD4.push(new TableRow({ children: [tableCell('Biên lợi nhuận sau thuế'), tableCell(pct(NPM)), tableCell(NPM < 0 ? 'Thua lỗ' : 'Bình thường')] }));
  rowsD4.push(new TableRow({ children: [tableCell('Biên LN thuần HĐKD'), tableCell(pct(OPM)), tableCell(OPM < 0.1 ? 'Cần cải thiện chi phí' : 'Bình thường')] }));
  children.push(new Table({ rows: rowsD4, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  children.push(p('V. Nhóm chỉ tiêu tăng trưởng', { bold: true, size: 22 }));
  const revG = REVo !== 0 ? (REV - REVo) / Math.abs(REVo) : 0;
  const profG = PROFITo !== 0 ? (PROFIT - PROFITo) / Math.abs(PROFITo) : 0;
  const rowsD5: TableRow[] = [
    new TableRow({ children: ['Chỉ tiêu', 'Kỳ này', 'Đánh giá'].map(h => tableCell(h, true)) }),
  ];
  rowsD5.push(new TableRow({ children: [tableCell('Tăng trưởng doanh thu'), tableCell(REVo !== 0 ? pct(revG) : '—'), tableCell(revG < 0 ? 'Suy giảm doanh thu' : 'Bình thường')] }));
  rowsD5.push(new TableRow({ children: [tableCell('Tăng trưởng LNST'), tableCell(PROFITo !== 0 ? pct(profG) : '—'), tableCell(profG < 0 ? 'Suy giảm lợi nhuận' : 'Bình thường')] }));
  children.push(new Table({ rows: rowsD5, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(p(''));

  // ─── E. Kiến nghị (4 mục, dedupe) ───
  children.push(p('E. ĐỀ XUẤT KIẾN NGHỊ CHUNG', { bold: true, color: '800020', size: 26 }));
  const crits = report.violations.filter(v => v.severity === 'critical');
  const highs = report.violations.filter(v => v.severity === 'high');
  const meds = report.violations.filter(v => v.severity === 'medium');

  const pushDeduped = (arr: any[]) => {
    const seen = new Set<string>();
    for (const x of arr) {
      const rec = (x.recommendation || x.description || '').trim();
      if (!rec || seen.has(rec)) continue;
      seen.add(rec);
      children.push(p('• ' + rec));
    }
    if (arr.length === 0) children.push(p('• Không có.'));
  };

  children.push(p('1. Xử lý ngay (mức nghiêm trọng):', { bold: true, color: 'DC2626' }));
  pushDeduped(crits);
  children.push(p('2. Ưu tiên cao (mức cao):', { bold: true, color: 'EA580C' }));
  pushDeduped(highs);
  children.push(p('3. Cần rà soát (mức trung bình):', { bold: true, color: 'CA8A04' }));
  pushDeduped(meds);
  children.push(p('4. Theo dõi định kỳ:', { bold: true, color: '6B7280' }));
  children.push(p('• Các chỉ số tài chính biến động, xu hướng doanh thu/LNST giảm cần theo dõi trong kỳ tiếp theo.'));
  children.push(p('• Rà soát lại các chỉ tiêu thành phần; kiểm tra tổng từ chi tiết.'));
  children.push(p(''));
  children.push(p('⚠️ Đây là kết quả từ Rule Engine tự động của TADA, không thay thế ý kiến chuyên gia. Đề nghị Ban Lãnh đạo xem xét, chỉ đạo thực hiện.', { italic: true, size: 18, color: '888888' }));

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 24 },
        },
      },
    },
    sections: [{ children }],
  });

  return await Packer.toBuffer(doc);
}
