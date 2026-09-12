/**
 * tax-rates.js — Bảng thuế & constants cho Công cụ tính thuế TADA
 *
 * Single Source of Truth cho SO LIỆU THUẾ 2026.
 * Nguồn: _cheatsheet-thue-2026.md (vault) + Luật 109/2025, Luật 67/2025,
 *        Luật 48/2024, NĐ 141/2026, NĐ 320/2025, NĐ 174/2025, NĐ 310/2025.
 *
 * KHÔNG hardcode — dùng rate table theo thời gian (time-aware).
 */

window.TAX_RATES = (function () {
  "use strict";

  /* ================================================================
   * 1. THUẾ TNCN — Biểu lũy tiến 5 bậc (Điều 9, Luật 109/2025)
   * ================================================================ */

  var TNCN_BRACKETS_YEARLY = [
    { min: 0,            max: 120_000_000,   rate: 0.05, label: "Bậc 1" },
    { min: 120_000_000,  max: 360_000_000,   rate: 0.10, label: "Bậc 2" },
    { min: 360_000_000,  max: 720_000_000,   rate: 0.20, label: "Bậc 3" },
    { min: 720_000_000,  max: 1_200_000_000, rate: 0.30, label: "Bậc 4" },
    { min: 1_200_000_000, max: Infinity,      rate: 0.35, label: "Bậc 5" },
  ];

  /* ================================================================
   * 2. GIẢM TRỪ — Theo thời gian (time-aware)
   * ================================================================ */

  var PERSONAL_DEDUCTION = [
    { from: null, to: "2026-06-30", monthly: 11_000_000, yearly: 132_000_000,
      label: "Giảm trừ bản thân (trước 01/07/2026)" },
    { from: "2026-07-01", to: null, monthly: 15_500_000, yearly: 186_000_000,
      label: "Giảm trừ bản thân (từ 01/07/2026, Luật 109/2025)" },
  ];

  var DEPENDENT_DEDUCTION = {
    monthly: 6_200_000,
    yearly: 74_400_000,
    label: "Giảm trừ người phụ thuộc",
  };

  /* ================================================================
   * 3. BHXH / BHTN / BHYT — Tỷ lệ đóng bảo hiểm xã hội
   *    Căn cứ: Luật 41/2024/BHXH, Nghị định 14/2025
   * ================================================================ */

  var SOCIAL_INSURANCE = {
    employee: {
      bhxh:  { rate: 0.08,  cap: 29_800_000, label: "BHXH người lao động (8%)" },
      bhtn:  { rate: 0.01,  cap: 29_800_000, label: "BHTN người lao động (1%)" },
      bhyt:  { rate: 0.015, cap: 29_800_000, label: "BHYT người lao động (1.5%)" },
      union: { rate: 0.01,  cap: null,        label: "Phí công đoàn (1%, tự nguyện)" },
    },
    employer: {
      bhxh: { rate: 0.175, label: "BHXHNSDLĐ (17.5%)" },
      bhtn: { rate: 0.01,  label: "BHTNNSDLĐ (1%)" },
      bhyt: { rate: 0.03,  label: "BHYTNSDLĐ (3%)" },
    },
    // Tổng chi phí BHXH (để DN tính chi phí lao động)
    totalEmployerRate: 0.215,  // 17.5% + 1% + 3% = 21.5%
    totalEmployeeRate: 0.105,  // 8% + 1% + 1.5% = 10.5%
  };

  /* ================================================================
   * 4. HỘ KINH DOANH — 4 nhóm + tỷ lệ theo ngành
   *    Căn cứ: Luật 109 Đ7, TT 50/2026, TT 69/2025
   * ================================================================ */

  var HKD_GROUPS = [
    { id: 1, maxRevenue: 1_000_000_000, label: "Nhóm 1",
      exempt: true, filingType: "Không kê khai",
      description: "Doanh thu dưới 1 tỷ → MIỄN thuế TNCN + GTGT" },
    { id: 2, maxRevenue: 3_000_000_000, label: "Nhóm 2",
      exempt: false, filingType: "Kê khai theo quý",
      description: "Doanh thu 1-3 tỷ → Kê khai theo quý" },
    { id: 3, maxRevenue: 50_000_000_000, label: "Nhóm 3",
      exempt: false, filingType: "Kê khai theo tháng",
      description: "Doanh thu 3-50 tỷ → Kê khai theo tháng" },
    { id: 4, maxRevenue: Infinity, label: "Nhóm 4",
      exempt: false, filingType: "Kê khai tháng + hạch toán đầy đủ",
      description: "Doanh thu từ 50 tỷ → Kê khai theo tháng, hạch toán đầy đủ" },
  ];

  // Tỷ lệ GTGT trên DOANH THU (không phải trên chênh lệch)
  var HKD_GTGT_RATES = {
    phan_phoi:       { rate: 0.01, label: "Phân phối hàng hóa (1%)" },
    dich_vu_xd:      { rate: 0.05, label: "Dịch vụ / XD không bao thầu (5%)" },
    sx_van_tai_xd:   { rate: 0.03, label: "SX / vận tải / XD bao thầu (3%)" },
    khac:            { rate: 0.02, label: "KD khác (2%)" },
    cho_thue_bds:    { rate: 0.05, label: "Cho thuê BĐS (5%)" },
    cho_thue_ts:     { rate: 0.03, label: "Cho thuê xe/máy/sân bãi (3%)" },
  };

  // Tỷ lệ TNCN trên (doanh thu - 1 tỷ) cho nhóm 2
  var HKD_TNCN_RATES = {
    phan_phoi:       { rate: 0.005, label: "Phân phối hàng hóa (0.5%)" },
    dich_vu_xd:      { rate: 0.02,  label: "Dịch vụ / XD không bao thầu (2%)" },
    sx_van_tai_xd:   { rate: 0.015, label: "SX / vận tải / XD bao thầu (1.5%)" },
    khac:            { rate: 0.01,  label: "KD khác (1%)" },
    cho_thue_bds:    { rate: 0.05,  label: "Cho thuê BĐS (5%) — tính trên DT tính thuế" },
    cho_thue_ts:     { rate: 0.05,  label: "Cho thuê TS / đại lý (5%)" },
  };

  // Biểu lũy tiến TNCN cho HKD (Cách 2 — so sánh với Cách 1)
  var HKD_PROGRESSIVE_RATES = [
    { min: 0,            max: 2_000_000_000,  rate: 0.15, label: "Doanh thu 1-3 tỷ" },
    { min: 2_000_000_000, max: 49_000_000_000, rate: 0.17, label: "Doanh thu 3-50 tỷ" },
    { min: 49_000_000_000, max: Infinity,       rate: 0.20, label: "Doanh thu > 50 tỷ" },
  ];

  var HKD_THRESHOLD = 1_000_000_000;  // Ngưỡng miễn thuế

  /* ================================================================
   * 5. THUẾ TNDN — Doanh nghiệp
   *    Căn cứ: Luật 67/2025, NĐ 320/2025
   * ================================================================ */

  var TNDN_RATES = [
    { maxRevenue: 3_000_000_000,  rate: 0.15, label: "DN nhỏ (≤3 tỷ) — 15%" },
    { maxRevenue: 50_000_000_000, rate: 0.17, label: "DN vừa (3-50 tỷ) — 17%" },
    { maxRevenue: Infinity,       rate: 0.20, label: "DN thường (>50 tỷ) — 20%" },
  ];

  var TNDN_DEDUCTIONS = {
    charitableMax: 0.20,    // Quyên góp từ thiện: tối đa 20% thu nhập tính thuế
    rdFundMax: 0.10,        // Quỹ R&D: tối đa 10% thu nhập tính thuế
    lossCarryforwardYears: 5, // Bù lỗ: tối đa 5 năm
    cashPaymentLimit: 5_000_000, // Thanh toán tiền mặt ≥5 triệu: KHÔNG được trừ
  };

  // Miễn thuế TNDN cho DN nhỏ
  var TNDN_EXEMPTION = {
    threshold: 1_000_000_000,  // DN có doanh thu ≤ 1 tỷ → miễn
    label: "Miễn thuế TNDN (DN doanh thu ≤ 1 tỷ, NĐ 141/2026)",
  };

  /* ================================================================
   * 6. THUẾ GTGT — Giá trị gia tăng
   *    Căn cứ: Luật 48/2024, NĐ 174/2025 (giảm tạm thời)
   * ================================================================ */

  var GTGT_RATES = {
    standard: [
      { rate: 0,    label: "0% — Xuất khẩu, hàng hóa không chịu thuế" },
      { rate: 0.05, label: "5% — Nước sạch, phân bón, GD, sách..." },
      { rate: 0.10, label: "10% — Còn lại" },
    ],
    // Giảm tạm thời 8% (NĐ 174/2025)
    reduced: {
      rate: 0.08,
      from: "2025-07-01",
      to: "2026-12-31",
      label: "Giảm 8% (tạm thời, NĐ 174/2025, đến 31/12/2026)",
    },
  };

  // Các đối tượng KHÔNG chịu GTGT (Điều 5 Luật 48/2024)
  var GTGT_EXEMPT = [
    "Đất đai",
    "Bảo hiểm nhân thọ, bảo hiểm y tế",
    "Khám chữa bệnh, giáo dục",
    "Bưu chính viễn thông công ích",
    "Hộ/cá nhân SXKD có doanh thu ≤ 1 tỷ/năm",
  ];

  /* ================================================================
   * 7. NHÀ THẦU NƯỚC NGOÀI
   *    Căn cứ: Luật 109/2025, TT 20/2026
   * ================================================================ */

  var FOREIGN_CONTRACTOR = {
    tndn: { rate: 0.01, label: "TNDN nhà thầu: 1% trên DT gross (không trừ CP)" },
    gtgt: { rate: 0.05, label: "GTGT nhà thầu: 5% trên DT gross" },
  };

  /* ================================================================
   * 8. THUÊ BĐS — Tỷ lệ cố định
   *    Căn cứ: Luật 109 Điều 7
   * ================================================================ */

  var RENTAL_TAX = {
    gtgt: { rate: 0.05, label: "GTGT cho thuê BĐS: 5%" },
    tncn: { rate: 0.05, label: "TNCN cho thuê BĐS: 5% trên DT tính thuế" },
    threshold: 1_000_000_000, // Miễn nếu ≤ 1 tỷ
  };

  /* ================================================================
   * 9. CÁC LOẠI THU NHẬP KHÁC — TNCN từ vốn, BĐS, trúng thưởng
   *    Căn cứ: Điều 12-15 Luật 109/2025
   * ================================================================ */

  var OTHER_INCOME_TAX = {
    dau_tu_von: { rate: 0.05, label: "Đầu tư vốn (5%)" },
    chuyen_nhuong_von: { rate: 0.20, label: "Chuyển nhượng vốn (20%)" },
    chuyen_nhuong_co_phieu: { rate: 0.001, label: "Chuyển nhượng chứng khoán (0.1%)" },
    chuyen_nhuong_bds: { rate: 0.02, label: "Chuyển nhượng BĐS (2%)" },
    trung_thuong: { rate: 0.10, threshold: 20_000_000,
      label: "Trúng thưởng, thừa kế, quà tặng (10% phần >20 triệu)" },
    ban_quyen: { rate: 0.05, threshold: 20_000_000,
      label: "Bản quyền, nhượng quyền (5% phần >20 triệu/hợp đồng)" },
    lai_tiet_kiem: { rate: 0, label: "Lãi tiền gửi — MIỄN" },
    bao_hiem: { rate: 0, label: "Bồi thường bảo hiểm — MIỄN" },
    kieu_hoi: { rate: 0, label: "Kiều hối — MIỄN" },
  };

  /* ================================================================
   * 10. KHẤU HAO TSCĐ — Tỷ lệ khấu hao hàng năm
   *     Căn cứ: NĐ 320/2025, Điều 9
   * ================================================================ */

  var DEPRECIATION = {
    building:    { years: 20, rate: 0.05,  label: "Nhà xưởng, công trình: 20 năm (5%/năm)" },
    equipment:   { years: [6, 10], rate: [0.10, 0.167],
      label: "Máy móc, thiết bị: 6-10 năm" },
    vehicle:     { years: 8,  rate: 0.125, label: "Xe ô tô, máy móc vận tải: 8 năm" },
    furniture:   { years: 5,  rate: 0.20,  label: "Bàn ghế, máy tính: 5 năm" },
    carCap:      1_600_000_000,  // Trần khấu hao ô tô ≤9 chỗ
    carCapLabel: "Trần khấu hao ô tô ≤9 chỗ: 1,6 tỷ (NĐ 320/2025 Đ10.6.e1)",
  };

  /* ================================================================
   * 11. HÌNH PHẠT — NĐ 310/2025
   * ================================================================ */

  var PENALTIES = {
    lateReturn: {
      organization: 2_000_000,   // 2 triệu/lần
      individual: 1_000_000,     // 1 triệu/lần
      label: "Phạt chậm nộp tờ khai",
    },
    latePayment: { rate: 0.0003, label: "Phạt chậm nộp thuế: 0,03%/ngày" },
    falseDeclaration: { rate: 0.20, label: "Khai sai: 20% số thuế thiếu" },
    taxEvasion: { minRate: 1, maxRate: 3, label: "Trốn thuế: 1-3 lần số thuế trốn" },
  };

  /* ================================================================
   * 12. LƯƠNG TỐI THIỂU VÙNG 2026 — NĐ 293/2025
   * ================================================================ */

  var MINIMUM_WAGE = {
    region1: 5_310_000,
    region2: 4_730_000,
    region3: 4_140_000,
    region4: 3_700_000,
  };

  /* ================================================================
   * 13. DỮ LIỆU FORM — Mẫu đơn, thời hạn, quy trình
   * ================================================================ */

  var FORMS_DATA = {
    personal_salary: {
      formCode: "02/TNCN",
      formName: "Tờ khai quyết toán thuế TNCN",
      deadline: "31/07 hàng năm",
      where: "eTax Mobile hoặc Cục Thuế",
      steps: [
        "Truy cập eTax Mobile hoặc Cổng thông tin thuế",
        "Chọn 'Kê khai trực tuyến' → 'Quyết toán TNCN'",
        "Điền thông tin: mã số thuế, thu nhập, giảm trừ",
        "Nộp tờ khai và xác nhận",
        "In xác nhận nộp tờ khai (lưu giữ)",
      ],
    },
    hkd_quarterly: {
      formCode: "01/CNKD",
      formName: "Tờ khai thuế GTGT, TNCN theo quý",
      deadline: "30 ngày cuối quý",
      where: "eTax Mobile hoặc Cục Thuế",
      steps: [
        "Truy cập eTax Mobile",
        "Chọn 'Kê khai theo quý'",
        "Nhập doanh thu quý, tính GTGT + TNCN theo tỷ lệ",
        "Nộp tờ khai và nộp thuế",
        "Lưu xác nhận",
      ],
    },
    hkd_revenue_notice: {
      formCode: "TT 50/2026",
      formName: "Thông báo doanh thu (HKD dưới 1 tỷ)",
      deadline: "30 ngày kể từ phát sinh",
      where: "eTax Mobile hoặc Cục Thuế",
      steps: [
        "Đăng ký hộ kinh doanh (nếu chưa)",
        "Truy cập eTax Mobile",
        "Chọn 'Thông báo doanh thu'",
        "Nhập thông tin hộ kinh doanh và doanh thu",
        "Nộp thông báo",
      ],
    },
    hkd_monthly: {
      formCode: "01/CNKD",
      formName: "Tờ khai thuế GTGT, TNCN theo tháng",
      deadline: "30 ngày đầu tháng sau",
      where: "eTax Mobile hoặc Cục Thuế",
      steps: [
        "Truy cập eTax Mobile",
        "Chọn 'Kê khai theo tháng'",
        "Nhập doanh thu tháng, tính GTGT + TNCN",
        "Nộp tờ khai và nộp thuế",
        "Lưu xác nhận",
      ],
    },
    corporate: {
      formCode: "01/TNDN + 01/GTGT",
      formName: "Tờ khai TNDN + GTGT hàng quý/tháng",
      deadline: "30 ngày đầu quý/tháng sau",
      where: "eTax hoặc Cục Thuế",
      steps: [
        "Lập báo cáo tài chính",
        "Tính TNDN trên thu nhập tính thuế",
        "Tính GTGT (đầu ra - đầu vào)",
        "Nộp tờ khai và nộp thuế",
        "Lưu xác nhận",
      ],
    },
    foreign_contractor: {
      formCode: "01/NTNN",
      formName: "Tờ khai thuế nhà thầu nước ngoài",
      deadline: "30 ngày cuối quý",
      where: "eTax hoặc Cục Thuế",
      steps: [
        "Xác định doanh thu gross tại Việt Nam",
        "Tính TNDN (1%) + GTGT (5%) trên gross",
        "Nộp tờ khai và nộp thuế",
      ],
    },
    rental: {
      formCode: "01/TNCN",
      formName: "Tờ khai thuế TNCN từ cho thuê BĐS",
      deadline: "30 ngày cuối quý",
      where: "eTax Mobile hoặc Cục Thuế",
      steps: [
        "Xác định doanh thu cho thuê",
        "Tính GTGT (5%) + TNCN (5%)",
        "Nộp tờ khai và nộp thuế",
      ],
    },
  };

  /* ================================================================
   * PUBLIC API
   * ================================================================ */

  return {
    TNCN_BRACKETS_YEARLY: TNCN_BRACKETS_YEARLY,
    PERSONAL_DEDUCTION: PERSONAL_DEDUCTION,
    DEPENDENT_DEDUCTION: DEPENDENT_DEDUCTION,
    SOCIAL_INSURANCE: SOCIAL_INSURANCE,
    HKD_GROUPS: HKD_GROUPS,
    HKD_GTGT_RATES: HKD_GTGT_RATES,
    HKD_TNCN_RATES: HKD_TNCN_RATES,
    HKD_PROGRESSIVE_RATES: HKD_PROGRESSIVE_RATES,
    HKD_THRESHOLD: HKD_THRESHOLD,
    TNDN_RATES: TNDN_RATES,
    TNDN_DEDUCTIONS: TNDN_DEDUCTIONS,
    TNDN_EXEMPTION: TNDN_EXEMPTION,
    GTGT_RATES: GTGT_RATES,
    GTGT_EXEMPT: GTGT_EXEMPT,
    FOREIGN_CONTRACTOR: FOREIGN_CONTRACTOR,
    RENTAL_TAX: RENTAL_TAX,
    OTHER_INCOME_TAX: OTHER_INCOME_TAX,
    DEPRECIATION: DEPRECIATION,
    PENALTIES: PENALTIES,
    MINIMUM_WAGE: MINIMUM_WAGE,
    FORMS_DATA: FORMS_DATA,

    // Helper: lấy GTGC bản thân theo thời gian
    getPersonalDeduction: function (dateStr) {
      var d = dateStr ? new Date(dateStr) : new Date();
      for (var i = 0; i < PERSONAL_DEDUCTION.length; i++) {
        var p = PERSONAL_DEDUCTION[i];
        if (p.from && d < new Date(p.from)) continue;
        if (p.to && d > new Date(p.to)) continue;
        return p;
      }
      return PERSONAL_DEDUCTION[PERSONAL_DEDUCTION.length - 1];
    },

    // Helper: xác định nhóm HKD theo doanh thu
    getHKDGroup: function (revenue) {
      for (var i = 0; i < HKD_GROUPS.length; i++) {
        if (revenue <= HKD_GROUPS[i].maxRevenue) return HKD_GROUPS[i];
      }
      return HKD_GROUPS[HKD_GROUPS.length - 1];
    },

    // Helper: lấy tỷ lệ TNDN theo doanh thu
    getTNDNRate: function (revenue) {
      for (var i = 0; i < TNDN_RATES.length; i++) {
        if (revenue <= TNDN_RATES[i].maxRevenue) return TNDN_RATES[i];
      }
      return TNDN_RATES[TNDN_RATES.length - 1];
    },

    // Helper: kiểm tra có trong thời gian giảm 8% GTGT không
    isReducedGTGT: function (dateStr) {
      var d = dateStr ? new Date(dateStr) : new Date();
      return d >= new Date("2025-07-01") && d <= new Date("2026-12-31");
    },
  };
})();
