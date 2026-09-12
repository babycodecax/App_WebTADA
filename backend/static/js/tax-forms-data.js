/**
 * tax-forms-data.js — Dữ liệu forms, deadline, lịch nộp thuế cho UI
 */

window.TAX_FORMS = (function () {
  "use strict";

  // ──────────────────────────────────────────────
  // BUSINESS TYPE OPTIONS (cho dropdown HKD)
  // ──────────────────────────────────────────────

  var BUSINESS_TYPES = [
    { id: "phan_phoi", icon: "👗", label: "Bán lẻ / Phân phối hàng hóa", example: "Quần áo, giày dép, tạp hóa" },
    { id: "dich_vu_xd", icon: "🔧", label: "Dịch vụ / XD không bao thầu", example: "Hair salon, sửa chữa, tư vấn" },
    { id: "sx_van_tai_xd", icon: "🏭", label: "SX / Vận tải / XD bao thầu", example: "Nhà xưởng, taxi, xây dựng trọn gói" },
    { id: "khac", icon: "💻", label: "KD khác", example: "Pharmacy, tiệm vàng, quán net" },
    { id: "cho_thue_bds", icon: "🏠", label: "Cho thuê BĐS", example: "Cho thuê nhà, đất, mặt bằng" },
    { id: "cho_thue_ts", icon: "🚗", label: "Cho thuê xe / máy / sân bãi", example: "Cho thuê xe máy, bãi đỗ xe" },
  ];

  // ──────────────────────────────────────────────
  // INCOME SOURCE TYPES (cho multi-select wizard)
  // ──────────────────────────────────────────────

  var INCOME_SOURCES = [
    { id: "salary", icon: "👤", label: "Đi làm, nhận lương",
      description: "Nhân viên có hợp đồng lao động, nhận lương hàng tháng",
      badge: "TNCN lũy tiến 5 bậc" },
    { id: "hkd", icon: "🏪", label: "Kinh doanh, hộ kinh doanh",
      description: "Hộ kinh doanh cá thể, CNKD, SHKD",
      badge: "4 nhóm, 2 cách tính" },
    { id: "rental", icon: "🏠", label: "Cho thuê nhà, đất, tài sản",
      description: "Cho thuê BĐS, cho thuê mặt bằng",
      badge: "5% GTGT + 5% TNCN" },
    { id: "freelancer", icon: "💻", label: "Freelancer, tư vấn, dịch vụ",
      description: "Thu nhập từ hợp đồng dịch vụ (không có HĐLĐ)",
      badge: "TNCN lũy tiến" },
    { id: "investment", icon: "💰", label: "Đầu tư, cổ phiếu, lãi tiết kiệm",
      description: "Lãi tiết kiệm, cổ phiếu, chuyển nhượng BĐS",
      badge: "Nhiều tỷ lệ khác nhau" },
    { id: "corporate", icon: "🏢", label: "Công ty, doanh nghiệp",
      description: "TNDN + GTGT cho DN",
      badge: "TNDN 15-20%" },
    { id: "foreign", icon: "🌏", label: "Cá nhân nước ngoài",
      description: "Tư vấn, dịch vụ từ nước ngoài",
      badge: "1% TNDN + 5% GTGT" },
  ];

  // ──────────────────────────────────────────────
  // FILING DEADLINES CALENDAR
  // ──────────────────────────────────────────────

  var DEADLINES_2026 = [
    // Q1
    { date: "2026-04-30", label: "Nộp tờ khai Q1/2026 (HKD nhóm 2, DN)", type: "filing", severity: "normal" },
    { date: "2026-04-30", label: "Nộp tờ khai TNCN tháng 3/2026 (nhóm 3-4)", type: "filing", severity: "normal" },
    // Q2
    { date: "2026-04-30", label: "Nộp tờ khai TNDN + GTGT quý 1 (DN)", type: "filing", severity: "normal" },
    { date: "2026-07-30", label: "Nộp tờ khai Q2/2026 (HKD nhóm 2)", type: "filing", severity: "normal" },
    { date: "2026-07-30", label: "Nộp tờ khai quyết toán TNCN năm 2025 (nếu có 2+ nguồn thu)", type: "filing", severity: "important" },
    // Q3
    { date: "2026-10-30", label: "Nộp tờ khai Q3/2026 (HKD nhóm 2)", type: "filing", severity: "normal" },
    // Q4
    { date: "2027-01-30", label: "Nộp tờ khai Q4/2026 (HKD nhóm 2)", type: "filing", severity: "normal" },
    { date: "2027-03-31", label: "Nộp báo cáo tài chính năm 2026 (DN)", type: "report", severity: "important" },
    { date: "2027-07-31", label: "Nộp quyết toán TNCN năm 2026 (nếu có 2+ nguồn thu)", type: "filing", severity: "important" },
  ];

  // ──────────────────────────────────────────────
  // COMMON TIPS / LỜI KHUYÊN CHUNG
  // ──────────────────────────────────────────────

  var COMMON_TIPS = {
    hkd_registration: {
      icon: "📝",
      text: "Đăng ký hộ kinh doanh tại UBND cấp huyện trong 10 ngày kể từ ngày bắt đầu kinh doanh.",
    },
    revenue_book: {
      icon: "📒",
      text: "Lập sổ S1a-HKD ghi doanh thu HÀNG NGÀY. Phải ghi ngay khi phát sinh, không được ghi sau.",
    },
    invoice_electronic: {
      icon: "🧾",
      text: "Sử dụng hóa đơn điện tử từ máy tính tiền (bắt buộc từ 01/01/2026 theo NĐ 123/2020).",
    },
    bank_transfer: {
      icon: "🏦",
      text: "Thanh toán tiền mặt ≥5 triệu KHÔNG được trừ chi phí TNDN. Phải qua ngân hàng.",
    },
    keep_documents: {
      icon: "📁",
      text: "Giữ chứng từ, hóa đơn ít nhất 5 năm (NĐ 310/2025). Bảo quản cả bản giấy và bản điện tử.",
    },
    etax_mobile: {
      icon: "📱",
      text: "Nộp tờ khai qua eTax Mobile — nhanh, tiện, không cần đến Cục Thuế. Tải app trên App Store / Google Play.",
    },
    penalty_warning: {
      icon: "⚠️",
      text: "Phạt chậm nộp tờ khai: 1 triệu/lần (cá nhân). Phạt chậm nộp thuế: 0,03%/ngày. Nộp đúng hạn!",
    },
  };

  // ──────────────────────────────────────────────
  // STEPS PROCEDURE (cho kết quả)
  // ──────────────────────────────────────────────

  var PROCEDURES = {
    hkd_group1: [
      { step: 1, text: "Đăng ký hộ kinh doanh tại UBND cấp huyện", icon: "📝" },
      { step: 2, text: "Đăng ký mã số thuế tại Cục Thuế", icon: "🔢" },
      { step: 3, text: "Thông báo doanh thu với cơ quan thuế (TT 50/2026)", icon: "📋" },
      { step: 4, text: "Lập sổ S1a-HKD ghi doanh thu hàng ngày", icon: "📒" },
      { step: 5, text: "Sử dụng hóa đơn điện tử từ máy tính tiền", icon: "🧾" },
    ],
    hkd_group2: [
      { step: 1, text: "Đăng ký hộ kinh doanh + mã số thuế", icon: "📝" },
      { step: 2, text: "Đăng ký sử dụng hóa đơn điện tử", icon: "🧾" },
      { step: 3, text: "Lập sổ S1a-HKD ghi doanh thu hàng ngày", icon: "📒" },
      { step: 4, text: "Kê khai thuế GTGT + TNCN theo quý", icon: "📊" },
      { step: 5, text: "Nộp tờ khai 01/CNKD trước 30 ngày cuối quý", icon: "📅" },
      { step: 6, text: "Nộp thuế qua eTax Mobile hoặc ngân hàng", icon: "🏦" },
    ],
    hkd_group3: [
      { step: 1, text: "Đăng ký hộ kinh doanh + mã số thuế", icon: "📝" },
      { step: 2, text: "Đăng ký sử dụng hóa đơn điện tử", icon: "🧾" },
      { step: 3, text: "Lập sổ S1a-HKD ghi doanh thu hàng ngày", icon: "📒" },
      { step: 4, text: "Kê khai thuế GTGT + TNCN theo THÁNG", icon: "📊" },
      { step: 5, text: "Nộp tờ khai 01/CNKD trước ngày 30 hàng tháng", icon: "📅" },
      { step: 6, text: "Nộp thuế qua eTax Mobile hoặc ngân hàng", icon: "🏦" },
    ],
    salary: [
      { step: 1, text: "Đăng ký mã số thuế cá nhân (nếu chưa có)", icon: "🔢" },
      { step: 2, text: "Cung cấp MST cho NSDLĐ để khấu trừ TNCN hàng tháng", icon: "📋" },
      { step: 3, text: "Nộp quyết toán TNCN trước 31/07 hàng năm (nếu có 2+ nguồn thu)", icon: "📅" },
      { step: 4, text: "Kiểm tra: được hoàn thuế nếu NSDLĐ khấu trừ thiếu", icon: "💰" },
    ],
    rental: [
      { step: 1, text: "Đăng ký mã số thuế cá nhân", icon: "🔢" },
      { step: 2, text: "Kê khai thuế GTGT + TNCN theo quý (nếu >1 tỷ)", icon: "📊" },
      { step: 3, text: "Nộp tờ khai 01/TNCN trước 30 ngày cuối quý", icon: "📅" },
      { step: 4, text: "Nộp thuế qua eTax Mobile hoặc ngân hàng", icon: "🏦" },
    ],
    freelancer: [
      { step: 1, text: "Đăng ký mã số thuế cá nhân", icon: "🔢" },
      { step: 2, text: "Lập hợp đồng dịch vụ với khách hàng", icon: "📝" },
      { step: 3, text: "Giữ hợp đồng + hóa đơn đầu vào", icon: "📁" },
      { step: 4, text: "Nộp quyết toán TNCN trước 31/07 hàng năm", icon: "📅" },
    ],
    corporate: [
      { step: 1, text: "Đăng ký doanh nghiệp + mã số thuế DN", icon: "📝" },
      { step: 2, text: "Đăng ký sử dụng hóa đơn điện tử", icon: "🧾" },
      { step: 3, text: "Lập sổ kế toán theo TT 152/2025", icon: "📒" },
      { step: 4, text: "Kê khai GTGT + TNDN theo quý/tháng", icon: "📊" },
      { step: 5, text: "Nộp báo cáo tài chính hàng năm trước 31/03", icon: "📅" },
      { step: 6, text: "Nộp quyết toán TNDN trước 31/10", icon: "📅" },
    ],
  };

  return {
    BUSINESS_TYPES: BUSINESS_TYPES,
    INCOME_SOURCES: INCOME_SOURCES,
    DEADLINES_2026: DEADLINES_2026,
    COMMON_TIPS: COMMON_TIPS,
    PROCEDURES: PROCEDURES,
  };
})();
