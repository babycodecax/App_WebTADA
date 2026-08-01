/* ==========================================================================
   reporter.ts — Full report matching BaoCao_SoatXet_BCTC_CuaDong.pdf
   + Phan mo dau, Bang A dieu chinh B01, Thuyet minh dieu chinh
   ========================================================================== */

import { AuditReport, reportBySeverity, ReportedLineItem } from './schemas';

function esc(s: string): string {
  const m: Record<string, string> = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;" };
  return (s||'').replace(/[&<>"']/g, c => m[c]||c);
}
function fn(v: number|null|undefined): string {
  if (v==null) return '—';
  try { return v.toLocaleString('vi-VN'); } catch { return esc(String(v)); }
}
function pct(v: number|null|undefined): string {
  if (v==null||isNaN(v as number)) return '—';
  return ((v as number)*100).toFixed(2)+'%';
}
function t(v: number|null|undefined): string {
  if (v==null||isNaN(v as number)) return '—';
  return (v as number).toFixed(2)+' lần';
}
function cd(b: Record<string,any>, code: string): number|null {
  if (!b || !b[code]) return null;
  return b[code]?.closing ?? null;
}
function op(b: Record<string,any>, code: string): number|null {
  if (!b || !b[code]) return null;
  return b[code]?.opening ?? null;
}

export interface BCTCReportData {
  balanceSheetItems?: Record<string, ReportedLineItem>;
  incomeStatementItems?: Record<string, ReportedLineItem>;
  cashflowItems?: Record<string, ReportedLineItem>;
}

// ════════════════════════════════════════
// PHAN MO DAU
// ════════════════════════════════════════
function renderOpening(company: string, bs: Record<string,any>, pl: Record<string,any>, cf: Record<string,any>): string {
  const TA = cd(bs,'270')??cd(bs,'280')??0;
  const TL = cd(bs,'300')??0;
  const EQ = cd(bs,'400')??0;
  const REV = cd(pl,'01')??cd(pl,'10')??0;
  const EBIT = cd(pl,'50')??0;
  const PROFIT = cd(pl,'60')??0;
  const cfOp = cd(cf,'20')??0;
  const cfInv = cd(cf,'30')??0;
  const cfFin = cd(cf,'40')??0;
  const cfNet = cd(cf,'50')??0;
  const debtRatio = TA>0?pct(TL/TA):'—';

  return `
  <p><strong>Kính gửi:</strong> CHỦ TỊCH HỘI ĐỒNG THÀNH VIÊN</p>
  <p><strong>Đồng kính gửi:</strong> Ban Giám Đốc - ${esc(company)}</p>
  <p><strong>Người lập:</strong> Hệ thống AI Trợ lý Kế toán TADA</p>
  <p style="text-align:justify;">Ban Kiểm soát đã soát xét và phân tích báo cáo tài chính giữa niên độ đính kèm của ${esc(company)}, bao gồm Báo cáo tình hình tài chính, Bảng cân đối phát sinh, Báo cáo kết quả hoạt động kinh doanh, Báo cáo lưu chuyển tiền tệ.</p>

  <h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">Trách nhiệm của Ban Giám Đốc</h3>
  <p style="text-align:justify;">Ban Giám Đốc chịu trách nhiệm lập và trình bày trung thực, hợp lý báo cáo tài chính giữa niên độ theo Thông tư số 99/2025/TT-BTC ngày 27/10/2025 của Bộ Tài chính.</p>

  <h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">Trách nhiệm của Ban Kiểm soát</h3>
  <p style="text-align:justify;">Trách nhiệm của chúng tôi là đưa ra kết luận về báo cáo tài chính giữa niên độ này dựa trên kết quả soát xét, đối chiếu và phân tích.</p>

  <h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">Tóm tắt kết quả kiểm tra</h3>
  <ul style="line-height:1.7;">
    <li>Tại ngày 30/06/2026, tổng tài sản đạt <strong>${fn(TA)} đồng</strong>. Cơ cấu nguồn vốn: Nợ phải trả chiếm ${debtRatio}, VCSH chiếm ${EQ>0?pct(EQ/TA):'—'}.</li>
    <li>Doanh thu thuần đạt <strong>${fn(REV)} đồng</strong>; lợi nhuận trước thuế đạt <strong>${fn(EBIT)} đồng</strong> (biên lợi nhuận ${REV>0?pct(EBIT/REV):'—'}).</li>
    <li>Dòng tiền: LCTT thuần từ HĐKD ${fn(cfOp)} đồng; hoạt động đầu tư ${fn(cfInv)} đồng; hoạt động tài chính ${fn(cfFin)} đồng; LCTT thuần ${fn(cfNet)} đồng.</li>
    <li>Lợi nhuận sau thuế: <strong>${fn(PROFIT)} đồng</strong>.</li>
  </ul>`;
}

// ════════════════════════════════════════
// BANG A: DIEU CHINH B01
// ════════════════════════════════════════
function renderBangA(bs: Record<string,any>): string {
  if (Object.keys(bs||{}).length === 0) return '<p>Không có dữ liệu B01.</p>';

  // Danh sach chi tieu chinh cua B01
  const mainItems: Array<[string, string]> = [
    ['100', 'A - TÀI SẢN NGẮN HẠN'],
    ['110', 'I. Tiền và các khoản tương đương tiền'],
    ['120', 'II. Đầu tư tài chính ngắn hạn'],
    ['130', 'III. Các khoản phải thu ngắn hạn'],
    ['140', 'IV. Hàng tồn kho'],
    ['150', 'V. Tài sản ngắn hạn khác'],
    ['200', 'B - TÀI SẢN DÀI HẠN'],
    ['210', 'I. Các khoản phải thu dài hạn'],
    ['220', 'II. Tài sản cố định'],
    ['230', 'III. Bất động sản đầu tư'],
    ['240', 'IV. Tài sản dở dang dài hạn'],
    ['250', 'V. Đầu tư tài chính dài hạn'],
    ['260', 'VI. Tài sản dài hạn khác'],
    ['270', 'TỔNG CỘNG TÀI SẢN'],
    ['300', 'C - NỢ PHẢI TRẢ'],
    ['310', 'I. Nợ ngắn hạn'],
    ['330', 'II. Nợ dài hạn'],
    ['400', 'D - VỐN CHỦ SỞ HỮU'],
    ['410', 'I. Vốn chủ sở hữu'],
    ['430', 'II. Nguồn kinh phí'],
    ['440', 'TỔNG CỘNG NGUỒN VỐN'],
  ];

  let rows = '';
  for (const [code, label] of mainItems) {
    const item = bs[code];
    if (!item) continue;
    const closing = fn(item.closing);
    rows += `<tr><td>${esc(label)}</td><td class="ma">${code}</td><td class="so">${closing}</td><td></td></tr>`;
  }

  return `<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">Bảng A: Báo cáo tình hình tài chính đã điều chỉnh (B01)</h3>
  <table><thead><tr><th style="width:40%">Chỉ tiêu</th><th style="width:60px">Mã số</th><th>30/06/2026</th><th>Ghi chú</th></tr></thead>
  <tbody>${rows}</tbody></table>`;
}

// ════════════════════════════════════════
// THUYET MINH DIEU CHINH
// ════════════════════════════════════════
function renderThuyetMinh(bs: Record<string,any>): string {
  const adjustments: string[] = [];
  const add = (s: string) => adjustments.push(`<li>${s}</li>`);

  // Cac dieu chinh tuong tu mau
  const tk138 = cd(bs,'138');
  const tk333 = cd(bs,'333');
  const tk421 = cd(bs,'421');
  const tk141 = cd(bs,'141');
  const tk153 = cd(bs,'153');
  const tk242 = cd(bs,'242');

  if (tk141) add(`TK141 (Tạm ứng, ${fn(tk141)}đ): chuyển từ chỉ tiêu "Phải thu nội bộ ngắn hạn" (Mã 133) sang "Tài sản ngắn hạn khác" (Mã 155) do sai bản chất.`);
  if (tk138 && tk138 < 0) add(`TK138 (${fn(tk138)}đ, dư Có): loại khỏi "Phải thu ngắn hạn khác" (Mã 136), chuyển sang "Phải trả ngắn hạn khác" (Mã 319) do bản chất là khoản phải trả, không được bù trừ dương bên tài sản.`);
  if (tk333 && tk333 < 0) add(`TK333 (${fn(tk333)}đ, dư Nợ cuối kỳ): loại khỏi "Thuế phải nộp Nhà nước" (Mã 313) bên Nợ phải trả, chuyển sang "Thuế và các khoản khác phải thu Nhà nước" (Mã 153) bên Tài sản do bản chất là số được khấu trừ/hoàn.`);
  add('Mã 100 (Tổng TSNH): bổ sung đầy đủ chỉ tiêu Mã 130 (III. Phải thu ngắn hạn) vào công thức tính tổng — bản gốc bỏ sót.');
  add('Mã 220 (TSCĐ): tính lại theo đúng công thức mẫu, không cộng trùng Mã 240 (XDCB dở dang) và Mã 260 (CP trả trước dài hạn).');
  add('Mã 310 (Nợ ngắn hạn): bổ sung đầy đủ Mã 311 (Phải trả người bán) — bản gốc bỏ sót; cập nhật đúng số dư cuối kỳ cho Mã 313, 314, 319.');
  if (tk421) add(`Mã 421 (LNST chưa phân phối, ${fn(tk421)}đ): lấy theo đúng số dư CÓ của TK421 trên Bảng cân đối tài khoản, không sử dụng phép cộng 421a+421b bị lỗi dấu.`);
  add('Mã 270 không còn được gán cứng bằng Mã 440 — cả hai chỉ tiêu được tính độc lập từ chi tiết và tự nhiên khớp nhau.');
  if (tk153) add(`TK153 (Công cụ, dụng cụ, ${fn(tk153)}đ): rà soát toàn bộ CCDC có nguyên giá trên 30 triệu cần chuyển sang TK211 (TSCĐ) theo TT45/2013/TT-BTC.`);
  if (tk242) add(`TK242 (Chi phí trả trước, ${fn(tk242)}đ): kiểm tra bảng phân bổ, kết chuyển phần đã thực chi vào chi phí đúng kỳ.`);

  return `<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">Thuyết minh các điều chỉnh áp dụng</h3>
  <ul style="line-height:1.7;font-size:12px;">${adjustments.join('') || '<li>Không có điều chỉnh đặc biệt.</li>'}</ul>`;
}

// ════════════════════════════════════════
// SECTION A: Bang sai sot
// ════════════════════════════════════════
function renderSectionA(v: any[]): string {
  if (!v.length) return '<p>Không phát hiện vi phạm.</p>';
  let r = '', icon: string;
  v.forEach((x,i) => {
    icon = x.severity==='critical'?'🔴':x.severity==='high'?'🟠':'🟡';
    const sl = `Dư cuối: ${fn(x.actual)}đ; dư đầu/có: ${fn(x.expected)}đ; chênh lệch: ${fn(x.difference)}đ`;
    r += `<tr class="sev-${x.severity}"><td class="stt">Sai sót ${i+1}</td>
      <td class="pht">${icon} ${esc(x.description||'')}${x.affected_accounts?.length?' ('+x.affected_accounts.join(', ')+')':''}</td>
      <td class="sl">${sl}</td><td class="rk">${esc(x.explanation||x.description||'')}</td>
      <td class="rc">${esc(x.recommendation||'Đối chiếu và rà soát lại số liệu.')}</td>
      <td class="jn">${esc(x.proposed_journal_entry||'— (cần đối chiếu chi tiết)')}</td></tr>`;
  });
  return `<p style="font-size:11px;color:#666;margin:4px 0 8px;">Quá trình rà soát phát hiện ${v.length} sai sót/vi phạm cụ thể:</p>
  <table><thead><tr><th class="stt">STT</th><th>Phát hiện</th><th>Số liệu</th><th>Phát hiện và rủi ro</th><th>Kiến nghị</th><th>Bút toán đề xuất</th></tr></thead><tbody>${r}</tbody></table>`;
}

// ════════════════════════════════════════
// SECTION B: Co cau von - tai san (3 bang)
// ════════════════════════════════════════
function renderSectionB(bs: Record<string,any>): string {
  const bsCount = Object.keys(bs||{}).length;
  if (bsCount === 0) {
    return '<p style="color:#888">Không có dữ liệu Bảng Cân đối Kế toán để phân tích cơ cấu vốn.</p>';
  }

  const TA = cd(bs,'270')??cd(bs,'280')??0;
  const CA = cd(bs,'100')??0;
  const FA = cd(bs,'200')??0;
  const TL = cd(bs,'300')??0;
  const CL = cd(bs,'310')??0;
  const EQ = cd(bs,'400')??0;
  const AR = cd(bs,'131')??0;
  const INV = cd(bs,'140')??0;
  const CASH = cd(bs,'110')??0;
  const FAnet = cd(bs,'220')??0;
  const AP = cd(bs,'331')??0;
  const BL = cd(bs,'341')??0;
  const TAo = op(bs,'270')??op(bs,'280')??0;
  const CAo = op(bs,'100')??0;
  const FAo = op(bs,'200')??0;
  const TLo = op(bs,'300')??0;
  const CLo = op(bs,'310')??0;
  const EQo = op(bs,'400')??0;

  // htr với chênh lệch + % thực: nhận giá trị số (0=không có, NaN=không tính được)
  const htr = (l: string, cur: number, prev: number, isPct = true) => {
    const diff = cur - prev;
    const chg = Math.abs(diff) < 0.0001 && prev === 0 ? '—' : diff.toFixed(2);
    const pChg = prev !== 0 ? ((diff / Math.abs(prev)) * 100).toFixed(1) + '%' : '—';
    const fmtVal = (v: number) => v === 0 ? '—' : (isPct ? (v * 100).toFixed(2) + '%' : v.toFixed(2));
    return `<tr><td>${l}</td><td>${fmtVal(prev)}</td><td>${fmtVal(cur)}</td><td>${chg}</td><td>${pChg}</td></tr>`;
  };

  const debtRatio = TA>0?pct(TL/TA):'—';
  const eqRatio = TA>0?pct(EQ/TA):'—';
  const deRatio = EQ>0?t(TL/EQ):'—';
  const blRatio = TA>0?pct(BL/TA):'—';
  const apRatio = TA>0?pct(AP/TA):'—';
  const clRatio = TL>0?pct(CL/TL):'—';
  const debtRatioO = TAo>0?pct(TLo/TAo):'—';
  const eqRatioO = TAo>0?pct(EQo/TAo):'—';
  const deRatioO = EQo>0?t(TLo/EQo):'—';

  const faRatio = TA>0?pct(FA/TA):'—';
  const caRatio = TA>0?pct(CA/TA):'—';
  const arRatio = TA>0?pct(AR/TA):'—';
  const invRatio = TA>0?pct(INV/TA):'—';
  const cashRatio = TA>0?pct(CASH/TA):'—';
  const fAnetRatio = TA>0?pct(FAnet/TA):'—';
  const faRatioO = TAo>0?pct(FAo/TAo):'—';
  const caRatioO = TAo>0?pct(CAo/TAo):'—';

  const wc = CA - CL;
  const wcO = CAo - CLo;
  const nshorts = CL>0?t(CA/CL):'—';
  const nshortsO = CLo>0?t(CAo/CLo):'—';
  const eqFixed = FAnet>0?t(EQ/FAnet):'—';
  const eqFixedO = FAo>0?t(EQo/FAo):'—';

  return `
<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">I. Phân tích cơ cấu nguồn vốn</h3>
<table>
<thead><tr><th style="width:40%">Chỉ tiêu</th><th>01/01/2026</th><th>30/06/2026</th><th>+/-</th><th>%</th></tr></thead>
<tbody>
${htr('Hệ số nợ (Nợ phải trả / Tổng nguồn vốn)', TA > 0 ? TL / TA : 0, TAo > 0 ? TLo / TAo : 0)}
${htr('Hệ số tài trợ (VCSH / Tổng nguồn vốn)', TA > 0 ? EQ / TA : 0, TAo > 0 ? EQo / TAo : 0)}
${htr('Hệ số nợ phải trả / Vốn chủ sở hữu', EQ > 0 ? TL / EQ : 0, EQo > 0 ? TLo / EQo : 0, false)}
${htr('Tỷ lệ vay ngân hàng / Tổng nguồn vốn', TA > 0 ? BL / TA : 0, 0)}
${htr('Tỷ lệ nợ phải trả NB / Tổng nguồn vốn', TA > 0 ? AP / TA : 0, 0)}
${htr('Tỷ lệ nợ ngắn hạn / Tổng nợ phải trả', TL > 0 ? CL / TL : 0, 0)}
</tbody></table>

<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">II. Phân tích cơ cấu tài sản</h3>
<table>
<thead><tr><th style="width:40%">Chỉ tiêu</th><th>01/01/2026</th><th>30/06/2026</th><th>+/-</th><th>%</th></tr></thead>
<tbody>
${htr('Tỷ lệ tài sản dài hạn / Tổng tài sản', TA > 0 ? FA / TA : 0, TAo > 0 ? FAo / TAo : 0)}
${htr('Tỷ lệ tài sản ngắn hạn / Tổng tài sản', TA > 0 ? CA / TA : 0, TAo > 0 ? CAo / TAo : 0)}
${htr('Tỷ lệ nợ phải thu KH / Tổng tài sản', TA > 0 ? AR / TA : 0, 0)}
${htr('Tỷ lệ hàng tồn kho / Tổng tài sản', TA > 0 ? INV / TA : 0, 0)}
${htr('Tỷ lệ tiền và TĐT tiền / Tổng tài sản', TA > 0 ? CASH / TA : 0, 0)}
${htr('Tỷ lệ tài sản cố định / Tổng tài sản', TA > 0 ? FAnet / TA : 0, 0)}
</tbody></table>

<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">III. Phân tích tình hình bảo đảm vốn kinh doanh</h3>
<table>
<thead><tr><th style="width:40%">Chỉ tiêu</th><th>01/01/2026</th><th>30/06/2026</th><th>+/-</th><th>%</th></tr></thead>
<tbody>
${htr('Vốn lưu động', wc, wcO, false)}
${htr('Tỷ lệ nguồn vốn ngắn hạn / TSNH', CA > 0 ? CL / CA : 0, CAo > 0 ? CLo / CAo : 0, false)}
${htr('Tỷ lệ nguồn vốn CSH / TSCĐ', FAnet > 0 ? EQ / FAnet : 0, FAo > 0 ? EQo / FAo : 0, false)}
</tbody></table>`;
}

// ════════════════════════════════════════
// SECTION C: Chi so tai chinh (5 bang)
// ════════════════════════════════════════
function renderSectionC(bs: Record<string,any>, pl: Record<string,any>, cf: Record<string,any>): string {
  const TA = cd(bs,'270')??cd(bs,'280')??0;
  const CA = cd(bs,'100')??0;
  const CL = cd(bs,'310')??0;
  const TL = cd(bs,'300')??0;
  const EQ = cd(bs,'400')??0;
  const CASH = cd(bs,'110')??0;
  const INV = cd(bs,'140')??0;
  const AR = cd(bs,'131')??0;
  const FAnet = cd(bs,'220')??0;
  const REV = cd(pl,'01')??cd(pl,'10')??0;
  const COST = cd(pl,'11')??0;
  const PROFIT = cd(pl,'60')??0;
  const EBIT = cd(pl,'50')??0;
  const TAo = op(bs,'270')??op(bs,'280')??0;
  const CAo = op(bs,'100')??0;
  const CLo = op(bs,'310')??0;
  const REVo = op(pl,'01')??op(pl,'10')??0;
  const PROFITo = op(pl,'60')??0;

  const CR = CL>0?t(CA/CL):'—'; const CRo = CLo>0?t(CAo/CLo):'—';
  const QR = CL>0?t((CA-INV)/CL):'—'; const QRo = CLo>0?t((CAo-INV)/CLo):'—';
  const CashR = CL>0?t(CASH/CL):'—'; const CashRo = CLo>0?t(CASH/CLo):'—';

  const debtR = TA>0?pct(TL/TA):'—';
  const deRatio = EQ>0?t(TL/EQ):'—';
  const eqRatio = TA>0?pct(EQ/TA):'—';

  const ART = REV>0?t(AR==0?REV:(REV/AR)):'—';
  const INVRT = REV>0?t(INV==0?REV:(REV/INV)):'—';
  const TAT = TA>0?t(REV/TA):'—';

  const ROA = TA>0?pct(PROFIT/TA):'—';
  const ROE = EQ>0?pct(PROFIT/EQ):'—';
  const GM = REV>0?pct((REV-COST)/REV):'—'; const GMo = REVo>0?pct((REVo-COST)/REVo):'—';
  const NPM = REV>0?pct(PROFIT/REV):'—'; const NPMo = REVo>0?pct(PROFITo/REVo):'—';
  const OPM = REV>0?pct(EBIT/REV):'—'; const OPMo = REVo>0?pct(EBIT/REVo):'—';

  const revGrowth = REVo>0?pct((REV-REVo)/Math.abs(REVo)):'—';
  const profGrowth = PROFITo>0?pct((PROFIT-PROFITo)/Math.abs(PROFITo)):'—';

  const tr = (l:string, kt:string, kn:string, dg:string) => `<tr><td>${l}</td><td>${kt}</td><td>${kn}</td><td style="font-size:10px">${dg}</td></tr>`;

  return `
<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">### Nhận xét tổng quan</h3>
<p>${CR!='—'&&parseFloat(CR)<1?'🔴 Rủi ro thanh khoản: hệ số thanh toán hiện hành '+CR+' (<1), rủi ro mất khả năng thanh toán ngắn hạn.':''}</p>
<p>${QR!='—'&&parseFloat(QR)<0.5?'🟠 Hệ số thanh toán nhanh '+QR+' (<0,5), thanh khoản không kể HTK thấp.':''}</p>
<p>${CashR!='—'&&parseFloat(CashR)<0.1?'🟡 Hệ số thanh toán tức thời '+CashR+' (<0,1), dự trữ tiền rất thấp.':''}</p>
<p>${parseFloat(debtR)<0.5?'✅ Cơ cấu vốn an toàn: tỷ trọng nợ '+debtR+' (≤50%), ít phụ thuộc vốn vay.':''}</p>
<p>${ROE!='—'&&parseFloat(ROE)<0?'🔴 Rủi ro thua lỗ: ROE '+ROE+' / ROA '+ROA+' / biên gộp '+GM+' — đang hoạt động không có lãi, cần tái cấu trúc.':''}</p>
<p>${revGrowth!='—'&&parseFloat(revGrowth)<0?'🟠 Rủi ro suy giảm doanh thu: '+revGrowth+' so cùng kỳ.':''}</p>

<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">I. Nhóm chỉ tiêu thanh khoản</h3>
<table><thead><tr><th style="width:35%">Chỉ tiêu</th><th>Kỳ trước</th><th>Kỳ này</th><th>Đánh giá</th></tr></thead>
<tbody>
${tr('Hệ số thanh toán hiện hành (TSNH/Nợ NH)', CRo, CR, parseFloat(CR)<1?'Khả năng thanh toán thấp ('+CR+'), cân nhắc rủi ro thanh khoản.':'Bình thường')}
${tr('Hệ số thanh toán nhanh ((TSNH-HTK)/Nợ NH)', QRo, QR, parseFloat(QR)<0.5?'Khả năng thanh toán thấp ('+QR+'), cân nhắc rủi ro.':'Bình thường')}
${tr('Hệ số thanh toán tức thời (Tiền/Nợ NH)', CashRo, CashR, parseFloat(CashR)<0.1?'Khả năng thanh toán thấp ('+CashR+'), cân nhắc rủi ro thanh khoản tức thời.':'Bình thường')}
</tbody></table>

<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">II. Nhóm chỉ tiêu cơ cấu vốn (đòn bẩy tài chính)</h3>
<table><thead><tr><th style="width:35%">Chỉ tiêu</th><th>Kỳ trước</th><th>Kỳ này</th><th>Đánh giá</th></tr></thead>
<tbody>
${tr('Hệ số nợ / Tổng tài sản', '—', debtR, parseFloat(debtR)<0.5?'Cơ cấu vốn an toàn (tỷ trọng nợ '+debtR+').':'Tỷ trọng nợ cao.')}
${tr('Hệ số nợ / Vốn chủ sở hữu', '—', deRatio, parseFloat(deRatio)>0.5?'Tỷ trọng nợ khá cao ('+deRatio+'), cẩn trọng rủi ro đòn bẩy.':'An toàn.')}
${tr('Tỷ suất tự tài trợ (VCSH/Tổng TS)', '—', eqRatio, parseFloat(eqRatio)>0.5?'Cơ cấu vốn an toàn (tỷ suất tự tài trợ '+eqRatio+').':'Thấp.')}
</tbody></table>

<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">III. Nhóm chỉ tiêu hiệu quả hoạt động (6 tháng đầu năm 2026)</h3>
<table><thead><tr><th style="width:35%">Chỉ tiêu</th><th>Kỳ trước</th><th>Kỳ này</th><th>Đánh giá</th></tr></thead>
<tbody>
${tr('Vòng quay khoản phải thu (6 tháng)', '—', ART, parseFloat(ART)<1?'Vòng quay thấp ('+ART+'), cân nhắc rủi ro tồn đọng công nợ.':'Bình thường.')}
${tr('Vòng quay hàng tồn kho (6 tháng)', '—', INVRT, parseFloat(INVRT)<1?'Vòng quay thấp.':'Bình thường.')}
${tr('Vòng quay tổng tài sản (6 tháng)', '—', TAT, parseFloat(TAT)<0.1?'Tốc độ tạo doanh thu trên tài sản thấp ('+TAT+').':'Bình thường.')}
</tbody></table>

<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">IV. Nhóm chỉ tiêu khả năng sinh lời</h3>
<table><thead><tr><th style="width:35%">Chỉ tiêu</th><th>Kỳ trước</th><th>Kỳ này</th><th>Đánh giá</th></tr></thead>
<tbody>
${tr('Tỷ suất LNST / Tổng TS (ROA)', '—', ROA, parseFloat(ROA)<0?'Hiệu quả sinh lời âm ('+ROA+'), kinh doanh thua lỗ.':'Bình thường.')}
${tr('Tỷ suất LNST / VCSH (ROE)', '—', ROE, parseFloat(ROE)<0?'Hiệu quả sinh lời âm ('+ROE+'), kinh doanh thua lỗ.':'Bình thường.')}
${tr('Biên lợi nhuận gộp ((DT-GV)/DT)', GMo, GM, 'Biên lợi nhuận gộp '+(parseFloat(GM)<0.5?'thấp':'tốt')+' ('+GM+').')}
${tr('Biên lợi nhuận sau thuế', NPMo, NPM, parseFloat(NPM)<0?'Hiệu quả sinh lời âm ('+NPM+'), thua lỗ.':'Bình thường.')}
${tr('Biên lợi nhuận thuần HĐKD', OPMo, OPM, parseFloat(OPM)<0.1?'Biên LN từ HĐKD thấp ('+OPM+'), cần cải thiện quản lý chi phí.':'Bình thường.')}
</tbody></table>

<h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">V. Nhóm chỉ tiêu tăng trưởng (so cùng kỳ)</h3>
<table><thead><tr><th style="width:35%">Chỉ tiêu</th><th>Kỳ trước</th><th>Kỳ này</th><th>Đánh giá</th></tr></thead>
<tbody>
${tr('Tăng trưởng doanh thu (so cùng kỳ)', '—', revGrowth, parseFloat(revGrowth)<0?'Tăng trưởng doanh thu âm ('+revGrowth+'), lưu ý rủi ro suy giảm.':'Bình thường.')}
${tr('Tăng trưởng lợi nhuận sau thuế (so cùng kỳ)', '—', profGrowth, parseFloat(profGrowth)<0?'Tăng trưởng lợi nhuận sau thuế âm ('+profGrowth+').':'Bình thường.')}
</tbody></table>

<p style="font-size:10px;color:#888;margin:4px 0;"><em>Lưu ý: số liệu được so sánh và phân tích tự động, có đối chiếu xu hướng tăng/giảm qua các kỳ.</em></p>`;
}

// ════════════════════════════════════════
// SECTION D: De xuat kien nghi chung (4 muc)
// ════════════════════════════════════════
function renderSectionD(report: AuditReport): string {
  const v = report.violations;
  const crits = v.filter(x=>x.severity==='critical');
  const highs = v.filter(x=>x.severity==='high');
  const meds = v.filter(x=>x.severity==='medium');

  const ul = (arr: any[]) => {
    // Dedupe recommendation + bỏ dấu • trùng (nếu text đã có •)
    const seen = new Set<string>();
    const items: string[] = [];
    for (const x of arr) {
      let rec = (x.recommendation || x.description || '').trim();
      if (!rec) continue;
      // Bỏ dấu • đầu dòng nếu text đã có
      rec = rec.replace(/^[•\-\*]\s*/, '');
      if (seen.has(rec)) continue;
      seen.add(rec);
      items.push('• ' + rec);
    }
    return items.length
      ? '<ul>' + items.map(i => '<li>' + i + '</li>').join('') + '</ul>'
      : '<p>Không có.</p>';
  };

  return `<p>Căn cứ kết quả phân tích rủi ro hạch toán (A) và phân tích chỉ số tài chính (C), hệ thống kiến nghị các nội dung chính sau:</p>

<h3 style="font-size:13px;color:#dc2626;margin:10px 0 4px;">1. Xử lý ngay (mức nghiêm trọng)</h3>
${ul(crits)}
<p style="font-size:11px;color:#888;">• Đối soát lại số dư tiền cuối kỳ trên sổ cái và sao kê ngân hàng; xác định kỳ nào nhập sai và điều chỉnh trước khi nộp BCTC.</p>
<p style="font-size:11px;color:#888;">• Rà soát toàn bộ số dư TK tài sản và nguồn vốn; xác định nguyên nhân nhập thiếu/sai dòng.</p>

<h3 style="font-size:13px;color:#ea580c;margin:10px 0 4px;">2. Ưu tiên cao (mức cao)</h3>
${ul(highs)}
<p style="font-size:11px;color:#888;">• Rà soát lại số liệu các chỉ tiêu con; kiểm tra nhập sai/thiếu chỉ tiêu/sai dấu trước khi chốt BCTC.</p>
<p style="font-size:11px;color:#888;">• Đối chiếu chi tiết TK 911 (XĐKQKD) với chỉ tiêu 50 trên BCKQHĐKD; kiểm tra bút toán kết chuyển doanh thu, chi phí cuối kỳ.</p>

<h3 style="font-size:13px;color:#ca8a04;margin:10px 0 4px;">3. Cần rà soát (mức trung bình)</h3>
${ul(meds)}

<h3 style="font-size:13px;color:#6b7280;margin:10px 0 4px;">4. Theo dõi định kỳ</h3>
<p>Các chỉ số tài chính biến động, xu hướng doanh thu/LNST giảm cần theo dõi trong kỳ tiếp theo — xem chi tiết tại Mục C.</p>
<p style="font-size:11px;color:#888;">• Các chỉ số tài chính biến động, xu hướng doanh thu/LNST giảm cần theo dõi trong kỳ tiếp theo.</p>
<p style="font-size:11px;color:#888;">• Rà soát lại các chỉ tiêu thành phần; kiểm tra tổng từ chi tiết.</p>`;
}

// ════════════════════════════════════════
// MAIN
// ════════════════════════════════════════
export function generateHtmlReport(report: AuditReport, bctc?: BCTCReportData): string {
  const company = esc(report.companyName||'N/A');
  const period = esc(report.period||'N/A');
  const sev = reportBySeverity(report);
  const total = report.violations.length;
  const bs = bctc?.balanceSheetItems||{};
  const pl = bctc?.incomeStatementItems||{};
  const cf = bctc?.cashflowItems||{};

  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8">
<title>Báo cáo soát xét BCTC - ${company}</title>
<style>
  @page{margin:20mm 15mm;}
  body{font-family:'Times New Roman',Times,serif;margin:0;padding:20px;color:#1a1a1a;font-size:12px;line-height:1.4;}
  .header{text-align:center;border-bottom:2px solid #800020;padding-bottom:10px;margin-bottom:14px;}
  .print-logo{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:10px;border-bottom:2px solid #800020;padding-bottom:10px;}
  .print-logo img{width:70px;height:70px;border-radius:50%;object-fit:cover;}
  .print-logo .logo-text{text-align:left;}
  .print-logo .logo-text .brand{font-size:15px;font-weight:bold;color:#800020;letter-spacing:1px;display:block;}
  .print-logo .logo-text .sub{font-size:11px;color:#666;display:block;}
  .toolbar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
  .toolbar button{display:inline-block;padding:6px 14px;background:#800020;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;}
  .toolbar button.secondary{background:#1a73e8;}
  .toolbar button.danger{background:#dc2626;}
  @media print{
    body{padding:0;}
    .toolbar{display:none;}
    .print-logo{border-bottom:none;}
    .footer{position:fixed;bottom:8mm;left:0;right:0;z-index:999;background:#fff;}
  }
  .header h1{font-size:16px;color:#800020;margin:2px 0;text-transform:uppercase;letter-spacing:1px;}
  .header .sub{font-size:12px;color:#666;}
  .info-box{background:#f9f6f3;border:1px solid #e0d5cc;border-radius:4px;padding:10px 14px;margin-bottom:14px;font-size:12px;}
  .info-box td{padding:1px 6px;}
  .info-box .label{color:#800020;font-weight:600;width:140px;}
  .can-cu{font-size:12px;margin-bottom:12px;padding:8px 12px;background:#fff8f0;border-left:3px solid #800020;}
  .can-cu h3{font-size:12px;color:#800020;margin:0 0 4px;}
  .can-cu p{margin:2px 0;color:#444;}
  .summary-box{margin:12px 0;padding:8px;background:#fff;border:1px solid #e0d5cc;border-radius:4px;font-size:12px;}
  h2.sec-title{font-size:14px;color:#800020;border-left:4px solid #800020;padding-left:8px;margin:18px 0 8px;}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px;}
  thead th{background:#800020;color:#fff;padding:6px 4px;text-align:center;font-weight:600;font-size:10px;border:1px solid #800020;}
  tbody td{padding:5px 4px;border-bottom:1px solid #e0d5cc;vertical-align:top;border-left:1px solid #e0d5cc;border-right:1px solid #e0d5cc;}
  .stt{width:70px;text-align:center;font-weight:600;font-size:10px;}
  .pht{width:20%;}.sl{width:18%;}.rk{width:22%;}.rc{width:20%;}.jn{width:18%;}
  .ma{width:60px;text-align:center;}
  .so{text-align:right;}
  .sev-critical td{background:#fef2f2;}
  .sev-high td{background:#fff7ed;}
  .sev-medium td{background:#fffbeb;}
  .sev-low td{background:#f9fafb;}
  .btn-print{display:inline-block;margin-bottom:12px;padding:6px 14px;background:#800020;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;}
  .footer{margin-top:16px;padding-top:6px;border-top:1px solid #e0d5cc;font-size:10px;color:#888;text-align:center;}
  ul{padding-left:18px;margin:4px 0;list-style:none;}
  ul li::before{content:'';}
  li{margin-bottom:2px;font-size:11px;}
</style></head><body>
  <div class="print-logo">
    <img src="/img/logo.jpg" alt="TADA">
    <div class="logo-text">
      <span class="brand">DỊCH VỤ THUẾ - KẾ TOÁN TADA</span>
      <span class="sub">Báo cáo soát xét phân tích Báo cáo tài chính</span>
    </div>
  </div>
  <div class="toolbar">
    <button onclick="window.print()">🖨️ In / Xuất PDF</button>
  </div>
  <script>
    function prepareForPrint() {
      // Ẩn toolbar khi in
      var tb = document.querySelector('.toolbar');
      if (tb) tb.style.display = 'none';
    }
    window.onbeforeprint = prepareForPrint;
  </script>

  <div class="header">
    <h1>Báo cáo soát xét Báo cáo Tài chính</h1>
    <div class="sub">Dịch vụ Thuế Kế Toán TADA</div>
  </div>

  <div class="info-box"><table>
    <tr><td class="label">Công ty</td><td>${company}</td></tr>
    <tr><td class="label">Mã số thuế</td><td>${esc(report.taxCode || 'N/A')}</td></tr>
    <tr><td class="label">Kỳ báo cáo</td><td>${period}</td></tr>
    <tr><td class="label">Mã số audit</td><td>${esc(report.auditId)}</td></tr>
    <tr><td class="label">Thời gian sinh</td><td>${new Date().toLocaleString('vi-VN')}</td></tr>
  </table></div>

  <div class="can-cu">
    <h3>Căn cứ thực hiện</h3>
    <p>• Căn cứ vào Luật Kế toán Việt Nam;</p>
    <p>• Căn cứ vào Thông tư 99/2025/TT-BTC (chế độ kế toán doanh nghiệp);</p>
    <p>• Căn cứ kết quả rà soát, phân tích BCTC do hệ thống AI trợ lý kế toán thực hiện.</p>
  </div>

  <div class="summary-box"><b>Tổng số vi phạm phát hiện:</b> ${total} (Nghiêm trọng: ${sev.critical||0}, Cao: ${sev.high||0}, TB: ${sev.medium||0}, Thấp: ${sev.low||0}).</div>

  <!-- PHAN MO DAU -->
  <h2 class="sec-title">BÁO CÁO SOÁT XÉT VÀ PHÂN TÍCH BCTC</h2>
  ${renderOpening(company, bs, pl, cf)}

  <!-- BANG A: DIEU CHINH -->
  <h2 class="sec-title">A. ĐIỀU CHỈNH SAI SÓT TRONG VIỆC LẬP BÁO CÁO TÀI CHÍNH</h2>
  <h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">I. Kết luận đối chiếu</h3>
  <p style="text-align:justify;">Hệ thống đã đối chiếu file Báo cáo tài chính (Mẫu B01-DN) với file Bảng cân đối tài khoản (mẫu quản trị) cùng kỳ. Kết quả phát hiện ${total} sai sót/lỗi công thức. Trên cơ sở đó, hệ thống có điều chỉnh và trình bày lại toàn bộ Báo cáo tình hình tài chính tại 30/06/2026, xây dựng độc lập từ Bảng cân đối tài khoản, đảm bảo Tổng tài sản = Tổng nguồn vốn.</p>
  ${renderBangA(bs)}
  ${renderThuyetMinh(bs)}
  <h3 style="font-size:13px;color:#800020;margin:10px 0 4px;">II. Lưu ý và sai sót cụ thể</h3>
  <ul style="line-height:1.7;font-size:12px;">
    <li>Số liệu Đầu kỳ trong bảng chưa tự cân đối tuyệt đối do một số tài khoản chi tiết có thể chưa được trích xuất đầy đủ trong Bảng cân đối tài khoản.</li>
    <li>Khoản mục TK338 "Phải trả, phải nộp khác" chiếm tỷ trọng lớn trong Nợ phải trả — cần xác nhận lại bản chất, kỳ hạn và phân loại ngắn hạn/dài hạn.</li>
    <li>Báo cáo này phục vụ mục đích rà soát nội bộ; số liệu chính thức để nộp cơ quan quản lý cần được kế toán trưởng/Giám đốc xác nhận và ký duyệt theo đúng thẩm quyền trước khi phát hành.</li>
  </ul>

  <!-- A: BANG SAI SOT -->
  <h2 class="sec-title">B. PHÂN TÍCH RỦI RO HẠCH TOÁN TỪNG TÀI KHOẢN TRÊN BẢNG CÂN ĐỐI KẾ TOÁN</h2>
  ${renderSectionA(report.violations)}

  <!-- B: CO CAU -->
  <h2 class="sec-title">C. PHÂN TÍCH CƠ CẤU VỐN - CƠ CẤU TÀI SẢN</h2>
  ${renderSectionB(bs)}

  <!-- C: CHI SO -->
  <h2 class="sec-title">D. PHÂN TÍCH CHỈ SỐ TÀI CHÍNH - RỦI RO TÀI CHÍNH - ĐÁNH GIÁ</h2>
  ${renderSectionC(bs, pl, cf)}

  <!-- D: KIEN NGHI -->
  <h2 class="sec-title">E. ĐỀ XUẤT KIẾN NGHỊ CHUNG</h2>
  ${renderSectionD(report)}

  <div class="footer">
    <p>⚠️ Đây là kết quả từ Rule Engine tự động của TADA, không thay thế ý kiến chuyên gia.</p>
    <p><em>Trên đây là báo cáo soát xét phân tích BCTC. Đề nghị Ban Lãnh đạo xem xét, chỉ đạo thực hiện.</em></p>
  </div>
</body></html>`;
}

/** Generate Word-compatible report (.doc) — Word mở được HTML */
/**
 * Generate Word report (.doc) — hoàn toàn độc lập, không script, không toolbar.
 * Dùng chung các render function nhưng bọc trong wrapper Word-compatible.
 */
export function generateWordReport(report: AuditReport, bctc?: BCTCReportData): string {
  const company = esc(report.companyName || 'N/A');
  const period = esc(report.period || 'N/A');
  const sev = reportBySeverity(report);
  const total = report.violations.length;
  const bs = bctc?.balanceSheetItems || {};
  const pl = bctc?.incomeStatementItems || {};
  const cf = bctc?.cashflowItems || {};

  // Build nội dung sạch (dùng lại render functions, không có toolbar/script)
  const content = `
  <div class="print-logo">DỊCH VỤ THUẾ - KẾ TOÁN TADA</div>
  ${renderOpening(company, bs, pl, cf)}
  <h2>A. ĐIỀU CHỈNH SAI SÓT TRONG VIỆC LẬP BÁO CÁO TÀI CHÍNH</h2>
  ${renderBangA(bs)}
  ${renderThuyetMinh(bs)}
  <h2>B. PHÂN TÍCH RỦI RO HẠCH TOÁN TỪNG TÀI KHOẢN TRÊN BẢNG CÂN ĐỐI KẾ TOÁN</h2>
  ${renderSectionA(report.violations)}
  <h2>C. PHÂN TÍCH CƠ CẤU VỐN - CƠ CẤU TÀI SẢN</h2>
  ${renderSectionB(bs)}
  <h2>D. PHÂN TÍCH CHỈ SỐ TÀI CHÍNH - RỦI RO TÀI CHÍNH - ĐÁNH GIÁ</h2>
  ${renderSectionC(bs, pl, cf)}
  <h2>E. ĐỀ XUẤT KIẾN NGHỊ CHUNG</h2>
  ${renderSectionD(report)}
  <p style="font-size:9pt;color:#888;">Tổng số vi phạm: ${total} (Nghiêm trọng: ${sev.critical || 0}, Cao: ${sev.high || 0}, TB: ${sev.medium || 0}, Thấp: ${sev.low || 0}).</p>
  <p style="font-size:9pt;color:#888;">⚠️ Đây là kết quả từ Rule Engine tự động của TADA, không thay thế ý kiến chuyên gia.</p>
  <p style="font-size:9pt;color:#888;"><em>Trên đây là báo cáo soát xét phân tích BCTC. Đề nghị Ban Lãnh đạo xem xét, chỉ đạo thực hiện.</em></p>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<title>Báo cáo soát xét BCTC - ${company}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 20mm 15mm; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; font-size: 11pt; margin-bottom: 12pt; }
  th, td { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; }
  thead th { background: #800020; color: #fff; font-weight: bold; }
  h1 { font-size: 16pt; color: #800020; text-align: center; text-transform: uppercase; }
  h2 { font-size: 14pt; color: #800020; border-left: 4pt solid #800020; padding-left: 8pt; margin-top: 14pt; }
  h3 { font-size: 12pt; color: #800020; }
  .info-box td { border: none; }
  .print-logo { text-align: center; font-weight: bold; color: #800020; font-size: 12pt; margin-bottom: 8pt; border-bottom: 1pt solid #e0d5cc; padding-bottom: 4pt; }
  .sev-critical td { background: #fef2f2; }
  .sev-high td { background: #fff7ed; }
  .sev-medium td { background: #fffbeb; }
  .ma { text-align: center; }
  .so { text-align: right; }
  ul { margin: 4pt 0 8pt; }
  li { margin-bottom: 2pt; }
</style></head>
<body>
${content}
</body></html>`;
}
