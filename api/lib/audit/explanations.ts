/* ==========================================================================
   explanations.ts — Generate explanation/recommendation từ template (không LLM)
   Port từ Python src/knowledge/explanation_engine.py
   ========================================================================== */

import { Violation, AuditReport } from './schemas';

const EXPLANATION_TEMPLATES: Record<string, [string, string]> = {
  'XV_008': [
    'Tiền trên B03 không khớp với Tiền trên B01. B03 ghi {exp} nhưng B01 ghi {act} (chênh lệch {diff}). Căn cứ: {cite}.',
    'Đối soát lại số dư tiền cuối kỳ/đầu kỳ; xác định kỳ nào nhập sai; điều chỉnh trước khi nộp BCTC. Căn cứ: {basis}.',
  ],
  'XV_009': [
    'LNST trên B02 không khớp LNST cuối năm trên B01. B02 ghi {exp}, B01 ghi {act} (chênh lệch {diff}).',
    'Kiểm tra khâu chuyển lợi nhuận kỳ này sang B01; rà soát chỉ tiêu 60 và 420b. Căn cứ: {basis}.',
  ],
  'XV_010': [
    'Tiền đầu kỳ LCTT không khớp Tiền CĐKT đầu kỳ. LCTT ghi {act}, B01 ghi {exp} (chênh lệch {diff}).',
    'Đối chiếu số dư tiền đầu kỳ giữa LCTT và CĐKT, xác định số liệu gốc chính xác. Căn cứ: {basis}.',
  ],
  'SF_001': [
    'Chỉ tiêu tổng hợp không thỏa công thức nhúng: {act} ≠ tổng các thành phần {exp} (chênh lệch {diff}).',
    'Rà soát lại số liệu các chỉ tiêu con; kiểm tra nhập sai / thiếu chỉ tiêu / sai dấu. Căn cứ: {basis}.',
  ],
  'LV3_001': [
    'Thiếu mã số bắt buộc trong báo cáo theo cấu trúc chuẩn.',
    'Bổ sung mã số vào BCTC theo đúng template (TT200 Điều 112 / TT99/2025 Điều 17).',
  ],
  'LV3_002': [
    'Chỉ tiêu không có giá trị cuối kỳ.',
    'Kiểm tra lại số liệu chỉ tiêu; bổ sung giá trị cuối kỳ nếu thuộc phạm vi báo cáo.',
  ],
  'LV3_004': [
    'Thiếu Thuyết minh BCTC (B06/B09).',
    'Bổ sung Thuyết minh BCTC theo đúng mẫu quy định. Căn cứ: TT200 Điều 115.',
  ],
  'LV3_006': [
    'Phát hiện lẫn lộn mã số TT99/2025 và TT200/2014 trong cùng báo cáo.',
    'Chuẩn hóa template theo đúng một hệ thống mã số. Căn cứ: TT99/2025 Điều 17.',
  ],
  'BS_001': [
    'Bảng CĐKT không cân bằng: Tổng TS {act} ≠ Tổng NV {exp} (chênh lệch {diff}).',
    'Rà soát lại số liệu từng phần hành, xác định nguyên nhân mất cân bằng và điều chỉnh. Căn cứ: {basis}.',
  ],
  'PL_001': [
    'Lợi nhuận sau thuế không đúng công thức: {act} ≠ kỳ vọng {exp} (chênh lệch {diff}).',
    'Kiểm tra lại các khoản doanh thu, chi phí và thuế TNDN. Căn cứ: {basis}.',
  ],
  'CF_001': [
    'Tiền cuối kỳ không khớp công thức: {act} ≠ {exp} (chênh lệch {diff}).',
    'Rà soát từng dòng tiền (HĐKD, đầu tư, tài chính). Căn cứ: {basis}.',
  ],
  'AN_101': [
    'Tỷ suất LNST/Doanh thu bất thường ở mức {act}.',
    'Rà soát cơ cấu doanh thu và chi phí; giải trình biến động bất thường.',
  ],
  'AN_102': [
    'Doanh thu tăng nhưng LNTT không tương xứng.',
    'Kiểm tra chi phí tăng tương ứng; rà soát chính sách giá bán và giá vốn.',
  ],
  'AN_103': [
    'Đòn bẩy tài chính cao hoặc VCSH âm.',
    'Đánh giá khả năng thanh toán; xem xét tái cấu trúc nợ hoặc tăng vốn.',
  ],
  'AN_104': [
    'Tiền bất thường (âm hoặc = 0 dù có doanh thu).',
    'Đối chiếu sao kê ngân hàng và kiểm kê quỹ tiền mặt.',
  ],
  'AN_107': [
    'Lợi nhuận gộp âm - biên lãi gộp âm.',
    'Rà soát giá vốn và doanh thu từng mặt hàng/dịch vụ.',
  ],
  'AN_108': [
    'Nợ phải trả/Tổng tài sản cao > 80%.',
    'Đánh giá rủi ro vốn và khả năng thanh toán dài hạn.',
  ],
  'AN_109': [
    'Biến động bất thường > 100% so với kỳ trước.',
    'Giải trình nguyên nhân biến động trong Thuyết minh BCTC.',
  ],
  'AN_110': [
    'Chi phí tài chính > LNTT - gánh nặng lãi vay cao.',
    'Đánh giá hiệu quả sử dụng vốn vay và khả năng trả lãi.',
  ],
  'AP_001': [
    'TK 111 (Tiền mặt) có số dư âm. Đây là vi phạm nguyên tắc kế toán.',
    'Kiểm kê quỹ, đối chiếu sổ phụ ngân hàng, thực hiện bút toán điều chỉnh.',
  ],
  'AP_002': [
    'TK 112 (Tiền gửi NH) có số dư âm.',
    'Đối chiếu sao kê ngân hàng, xác định và điều chỉnh chênh lệch.',
  ],
  'AP_003': [
    'TK 331 (Phải trả NB) có dư Nợ - vi phạm không bù trừ.',
    'Đối chiếu chi tiết từng nhà cung cấp, trình bày số dư thuần.',
  ],
  'AP_005': [
    'Vốn chủ sở hữu có tài khoản âm.',
    'Rà soát và điều chỉnh; đảm bảo vốn góp không âm theo Luật Doanh nghiệp.',
  ],
  'AP_007': [
    'Hàng tồn kho có tài khoản âm.',
    'Kiểm kê kho, điều chỉnh số liệu tồn kho theo thực tế.',
  ],
  'AP_009': [
    'Phát hiện bù trừ dư Nợ - dư Có trên cùng TK đối ứng.',
    'Trình bày số dư thuần theo từng đối tượng, không bù trừ giữa Nợ và Có.',
  ],
  'AP_011': [
    'TK có phát sinh quay vòng bất thường, không để lại số dư.',
    'Rà soát bản chất các giao dịch, xem xét phân loại lại TK cho phù hợp.',
  ],
  'AP_017': [
    'Thuế GTGT bị hạch toán sai vào chi phí.',
    'Điều chỉnh: Nợ 8211 / Có 3334; loại bỏ thuế GTGT ra khỏi chi phí.',
  ],
  'AP_018': [
    'TK tài sản có dư Có - cần tái phân loại.',
    'Rà soát và tái phân loại sang nợ phải trả theo VAS 21.',
  ],
  'AP_019': [
    'CCDC/CP trả trước > 30tr có thể cần ghi nhận TSCĐ.',
    'Kiểm tra chi tiết: nếu đơn giá >= 30tr, chuyển sang TK 211 và trích khấu hao.',
  ],
  'AP_025': [
    'Nợ vay/VCSH cao - rủi ro đòn bẩy tài chính.',
    'Đánh giá khả năng trả nợ; cân nhương tái cấu trúc nguồn vốn.',
  ],
  'AP_026': [
    'Tỷ suất tự tài trợ < 20% - phụ thuộc vốn vay.',
    'Xem xét tăng VCSH hoặc giảm vay nợ để cải thiện chỉ số.',
  ],
  'AP_028': [
    'Nợ tập trung bất thường vào 1 TK.',
    'Rà soát bản chất và kỳ hạn từng khoản mục, thuyết minh chi tiết.',
  ],
  'AP_029': [
    'Chi phí lãi vay không được tách bạch.',
    'Rà soát chi tiết chi phí tài chính, trình bày riêng mã 23.',
  ],
  'KLT_001': [
    'LNST âm - cảnh báo khả năng hoạt động liên tục.',
    'Đánh giá khả năng phục hồi; lập kế hoạch cải thiện kết quả kinh doanh.',
  ],
  'KLT_002': [
    'VCSH âm - doanh nghiệp mất khả năng thanh toán.',
    'Đánh giá khả năng hoạt động liên tục; xem xét tăng vốn hoặc tái cấu trúc.',
  ],
  'KLT_003': [
    'Nợ phải trả > Tổng tài sản - không đáp ứng giả định hoạt động liên tục (Điều 24 TT99/2025).',
    'Xem xét khả năng thanh toán nợ; lập phương án tái cấu trúc tài chính; nếu không khả thi, lập BCTC trên cơ sở không hoạt động liên tục.',
  ],
  'AP_030': [
    'Tài sản dài hạn (TSCĐ, XDCB, CP trả trước) bị trình bày sai trong TSNH.',
    'Tái phân loại TS dài hạn theo đúng bản chất (Điều 112 TT200 / Điều 20 TT99).',
  ],
};

function fmtNum(v: number | null | undefined): string {
  if (v == null) return 'không xác định';
  try { return v.toLocaleString('vi-VN'); } catch { return String(v); }
}

function fillTemplate(template: string, v: Violation): string {
  const acc = (v.affectedAccounts && v.affectedAccounts.length > 0) ? v.affectedAccounts.join(', ') : 'liên quan';
  const cite = (v.legalCitations && v.legalCitations.length > 0) ? v.legalCitations.join(', ') : 'quy định hiện hành';
  const basis = (v.professionalBasis && v.professionalBasis.length > 0) ? v.professionalBasis.join(', ') : 'TT200 / TT99/2025';
  return template
    .replace(/\{exp\}/g, v.expected != null ? fmtNum(v.expected) : 'N/A')
    .replace(/\{act\}/g, v.actual != null ? fmtNum(v.actual) : 'N/A')
    .replace(/\{diff\}/g, v.difference != null ? fmtNum(v.difference) : 'N/A')
    .replace(/\{acc\}/g, acc)
    .replace(/\{cite\}/g, cite)
    .replace(/\{basis\}/g, basis);
}

/** Sinh bút toán đề xuất cho violations (in-place) */
const JOURNAL_TEMPLATES: Record<string, string> = {
  'AP_017': 'Nợ TK 3334 / Có TK 8211: điều chỉnh thuế GTGT bị hạch toán vào chi phí.',
  'AP_003': 'Nợ TK 331 / Có TK 3311: tách bạch dư Nợ và dư Có TK 331 theo từng nhà cung cấp.',
  'AP_004': 'Nợ TK 333 / Có TK 133: bù trừ thuế GTGT được khấu trừ với thuế phải nộp.',
  'AP_009': 'Nợ TK 138 / Có TK 338: chuyển khoản dư Có trên TK phải thu sang phải trả.',
  'AP_018': 'Nợ TK 331 / Có TK 138: tái phân loại TK tài sản dư Có sang nợ phải trả.',
  'AP_019': 'Nợ TK 211 / Có TK 153: chuyển CCDC nguyên giá >= 30tr thành TSCĐ; Nợ TK 642, 627 / Có TK 214: trích khấu hao.',
  'AP_005': 'Nợ TK 411 / Có TK 421: điều chỉnh vốn góp bù trừ lỗ lũy kế.',
  'AP_007': 'Nợ TK 632 / Có TK 152,153,154,155,156,157: điều chỉnh HTK âm theo kiểm kê.',
  'AP_001': 'Nợ TK 111 / Có TK 338: điều chỉnh số dư tiền mặt âm theo kiểm kê quỹ.',
  'AP_002': 'Nợ TK 112 / Có TK 338: điều chỉnh số dư tiền gửi âm theo sao kê ngân hàng.',
  'AP_025': 'Nợ TK 138 / Có TK 338: tái phân loại TK đầu 1 chỉ có dư Có.',
  'AP_024': 'Nợ TK 214 / Có TK 211: điều chỉnh TK tài sản dư Có theo bản chất.',
  'AP_026': 'Nợ TK 411 / Có TK 112: tăng vốn góp để cải thiện tỷ suất tự tài trợ.',
  'AP_028': 'Nợ TK 338 / Có TK 341: tái phân loại nợ tập trung theo kỳ hạn.',
  'SF_001': 'Rà soát và điều chỉnh số liệu chỉ tiêu tổng theo đúng công thức nhúng; kiểm tra từng chỉ tiêu thành phần.',
  'XV_008': 'Đối chiếu sao kê ngân hàng và sổ quỹ; điều chỉnh số dư tiền cuối kỳ trên B03 hoặc B01.',
  'XV_009': 'Kiểm tra bút toán kết chuyển LNST (Nợ 911 / Có 421); điều chỉnh chỉ tiêu 60 trên B02.',
  'XV_012': 'Rà soát toàn bộ số dư TK tài sản và nguồn vốn; xác định nguyên nhân mất cân bằng và điều chỉnh.',
  'XV_017': 'Đối chiếu TK 632 với B02 mã 11; kiểm tra bút toán kết chuyển giá vốn.',
  'XV_020': 'Kiểm kê kho và đối chiếu TK 152-157 với B01 mã 140; điều chỉnh số dư.',
  'XV_021': 'Nợ 111 / Có 112: phản ánh đầy đủ tiền mặt tại quỹ trên BCLCTT.',
  'LV3_001': 'Bổ sung mã số thiếu theo đúng template TT200 hoặc TT99/2025.',
  'LV3_003': 'Kiểm tra và điều chỉnh số liệu chỉ tiêu tổng hợp theo công thức Phụ lục.',
  'LV3_006': 'Thống nhất sử dụng một hệ thống mẫu biểu (TT200 hoặc TT99/2025) cho cả B01, B02, B03.',
  'AN_105': 'Điều chỉnh số liệu âm trên các chỉ tiêu tài sản ngắn hạn; kiểm tra dư lệch.',
  'AN_106': 'Đối chiếu từng chỉ tiêu con với tổng; điều chỉnh số liệu tổng nhập thiếu.',
  'KLT_001': 'Lập kế hoạch cải thiện kết quả kinh doanh; đánh giá khả năng hoạt động liên tục.',
  'KLT_002': 'Xem xét tăng vốn điều lệ hoặc tái cấu trúc nợ; đánh giá khả năng hoạt động liên tục.',
  'KLT_003': 'Nợ 421 / Có 411 hoặc tái cấu trúc nợ vay; lập BCTC trên cơ sở không hoạt động liên tục nếu cần.',
  'AP_030': 'Nợ 211,213,241 / Có 153,242: tái phân loại TSDH theo đúng bản chất tài sản.',
  'AP_031': 'Chuyển đổi BCTC sang VND theo tỷ giá quy định; trình bày rõ phương pháp chuyển đổi.',
  'AP_029': 'Nợ 635 / Có 112: tách bạch chi phí lãi vay (mã 23) khỏi chi phí tài chính chung (mã 22).',
  'AN_101': 'Rà soát cơ cấu doanh thu/chi phí; giải trình tỷ suất LNST bất thường.',
  'AN_102': 'Kiểm tra nguyên nhân tăng doanh thu không tương xứng lợi nhuận.',
  'AN_103': 'Đánh giá khả năng thanh toán; xem xét tái cấu trúc nợ hoặc tăng vốn.',
  'AN_104': 'Đối chiếu sao kê ngân hàng và kiểm kê quỹ tiền mặt.',
  'AN_107': 'Rà soát giá vốn và doanh thu từng mặt hàng/dịch vụ.',
  'AN_108': 'Đánh giá rủi ro vốn và khả năng thanh toán dài hạn.',
  'AN_109': 'Giải trình nguyên nhân biến động >100% trong Thuyết minh BCTC.',
  'AN_110': 'Đánh giá hiệu quả sử dụng vốn vay và khả năng trả lãi.',
  'AN_202': 'Kiểm tra biến động bất thường giữa các kỳ; giải trình trong Thuyết minh.',
};

export function generateJournalEntries(report: AuditReport): void {
  for (const v of report.violations) {
    if (v.proposedJournalEntry) continue;
    const j = JOURNAL_TEMPLATES[v.code];
    if (j) v.proposedJournalEntry = j;
  }
}

/** Sinh explanation/recommendation cho violations (in-place) */
export function generateExplanations(report: AuditReport): void {
  for (const v of report.violations) {
    if (v.explanation || v.recommendation) continue;
    const tmpl = EXPLANATION_TEMPLATES[v.code];
    if (!tmpl) continue;
    v.explanation = fillTemplate(tmpl[0], v);
    v.recommendation = fillTemplate(tmpl[1], v);
  }
  generateJournalEntries(report);
}
