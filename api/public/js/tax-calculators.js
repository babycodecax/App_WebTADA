/**
 * tax-calculators.js — Rules Engine tính thuế
 *
 * Tính toán chạy hoàn toàn trên trình duyệt (client-side, instant).
 * Kết quả trả về dạng object chuẩn hóa kèm lời khuyên cá nhân hóa.
 *
 * KHÔNG dùng LLM cho việc tính — chỉ dùng rules hardcode từ vault.
 * Disclaimer LUÔN được hiển thị kèm kết quả.
 */

window.TAX_CALC = (function () {
  "use strict";

  var R = window.TAX_RATES;

  // ──────────────────────────────────────────────
  // HELPER: Validate & parse input
  // ──────────────────────────────────────────────

  function num(v, name) {
    // Strip everything except digits, minus sign (dots are thousand separators)
    var n = Number(String(v).replace(/[^\d\-]/g, ""));
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }

  // ──────────────────────────────────────────────
  // HELPER: Format số tiền VND
  // ──────────────────────────────────────────────

  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return "0đ";
    var rounded = Math.round(Math.abs(n));
    if (rounded === 0) return "0đ";
    return rounded.toLocaleString("vi-VN") + "đ";
  }

  function fmtPct(n) {
    return (n * 100).toFixed(1) + "%";
  }

  // ──────────────────────────────────────────────
  // HELPER: Tính TNCN lũy tiến từ thu nhập tính thuế
  // ──────────────────────────────────────────────

  function progressiveTNCN(taxableIncome, brackets) {
    brackets = brackets || R.TNCN_BRACKETS_YEARLY;
    var totalTax = 0;
    var breakdown = [];
    var remaining = taxableIncome;

    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      var bracketWidth = b.max === Infinity ? Infinity : (b.max - b.min);
      var amountInBracket = Math.min(remaining, bracketWidth);

      if (amountInBracket <= 0) break;

      var tax = amountInBracket * b.rate;
      totalTax += tax;
      breakdown.push({
        label: b.label,
        income: amountInBracket,
        rate: b.rate,
        tax: tax,
        formula: fmt(amountInBracket) + " × " + fmtPct(b.rate) + " = " + fmt(tax),
      });
      remaining -= amountInBracket;
    }

    return { totalTax: totalTax, breakdown: breakdown };
  }

  // ──────────────────────────────────────────────
  // CALCULATOR 1: TNCN cá nhân (lương)
  // ──────────────────────────────────────────────

  function calculateSalaryTax(input) {
    var monthlySalary = num(input.salary);
    var dependents = num(input.dependents);
    var hasBHXH = input.hasBHXH !== false;
    var hasUnion = input.hasUnion || false;
    var period = input.period || "year";

    // 1. Tính tổng GTGC trong kỳ
    var personalDed = R.getPersonalDeduction();
    var dependentDed = R.DEPENDENT_DEDUCTION;
    var months = period === "quarter" ? 3 : 12;

    var totalPersonal = personalDed.monthly * months;
    var totalDependent = dependentDed.monthly * dependents * months;

    // 2. Tính BHXH (phần NLĐ đóng)
    var bhxhEmployee = 0;
    var bhxhBreakdown = [];
    var si = R.SOCIAL_INSURANCE.employee;
    var cappedSalary = Math.min(monthlySalary, si.bhxh.cap);

    if (hasBHXH) {
      var bhxh = cappedSalary * si.bhxh.rate * months;
      var bhtn = cappedSalary * si.bhtn.rate * months;
      var bhyt = cappedSalary * si.bhyt.rate * months;

      bhxhEmployee = bhxh + bhtn + bhyt;
      bhxhBreakdown = [
        { label: "BHXH (8%)", amount: bhxh,
          formula: fmt(cappedSalary) + " × 8% × " + months + " tháng" },
        { label: "BHTN (1%)", amount: bhtn,
          formula: fmt(cappedSalary) + " × 1% × " + months + " tháng" },
        { label: "BHYT (1.5%)", amount: bhyt,
          formula: fmt(cappedSalary) + " × 1.5% × " + months + " tháng" },
      ];
    }

    // Phí công đoàn: tách riêng khỏi BHXH check (luôn tính nếu có HĐLĐ)
    var union = hasUnion ? cappedSalary * si.union.rate * months : 0;
    bhxhEmployee += union;
    if (union > 0) {
      bhxhBreakdown.push({ label: "Phí công đoàn (1%)", amount: union,
        formula: fmt(cappedSalary) + " × 1% × " + months + " tháng" });
    }

    // 3. Thu nhập tính thuế
    var totalDeductions = totalPersonal + totalDependent + bhxhEmployee;
    var grossIncome = monthlySalary * months;
    var taxableIncome = Math.max(0, grossIncome - totalDeductions);

    // 4. Tính TNCN lũy tiến
    var result = progressiveTNCN(taxableIncome);

    // 5. Thuế thực nộp hàng tháng (nếu là quyết toán năm → chia 12)
    var monthlyTax = period === "year" ? result.totalTax / 12 : result.totalTax / months;

    // 6. Tỷ lệ hiệu quả
    var effectiveRate = grossIncome > 0 ? result.totalTax / grossIncome : 0;

    // 7. Lời khuyên cá nhân hóa
    var tips = [];
    var bhxhCap = R.SOCIAL_INSURANCE.employee.bhxh.cap;
    if (monthlySalary <= bhxhCap) {
      tips.push({
        icon: "💡",
        text: "Lương của bạn dưới trần BHXH (" + fmt(bhxhCap) + "/tháng) — bạn đang đóng đúng tỷ lệ.",
      });
    } else {
      tips.push({
        icon: "💡",
        text: "Lương vượt trần BHXH (" + fmt(bhxhCap) + "/tháng) — phần đóng BHXH đã được giới hạn, giảm trừ không tăng thêm.",
      });
    }

    if (taxableIncome > 0 && result.breakdown.length === 1) {
      tips.push({
        icon: "🎯",
        text: "Bạn đang ở bậc thuế " + result.breakdown[0].label + " (" +
              fmtPct(result.breakdown[0].rate) + "). Mỗi 1 triệu đồng thu nhập tăng thêm, bạn nộp thêm " +
              fmt(result.breakdown[0].rate * 1_000_000) + " thuế.",
      });
    }

    tips.push({
      icon: "📅",
      text: "Quyết toán TNCN trước 31/07. Nếu NSDLĐ đã khấu trừ thiếu, bạn được hoàn thuế.",
    });

    return {
      type: "salary",
      grossIncome: grossIncome,
      taxableIncome: taxableIncome,
      totalTax: result.totalTax,
      monthlyTax: monthlyTax,
      effectiveRate: effectiveRate,
      input: { salary: monthlySalary, dependents: dependents, hasBHXH: hasBHXH, hasUnion: hasUnion, months: months },
      deductions: {
        personal: totalPersonal,
        personalFormula: personalDed.monthly.toLocaleString("vi-VN") + "đ × " + months + " tháng",
        dependent: totalDependent,
        dependentCount: dependents,
        dependentFormula: dependents > 0 ? dependentDed.monthly.toLocaleString("vi-VN") + "đ × " + dependents + " người × " + months + " tháng" : null,
        bhxh: bhxhEmployee,
        bhxhBreakdown: bhxhBreakdown,
        total: totalDeductions,
        deductionLabel: personalDed.label,
      },
      breakdown: result.breakdown,
      forms: [R.FORMS_DATA.personal_salary],
      tips: tips,
      disclaimer: getDisclaimer(),
    };
  }

  // ──────────────────────────────────────────────
  // CALCULATOR 2: HKD/CNKD — 2 cách tính
  // ──────────────────────────────────────────────

  function calculateHKDTax(input) {
    var revenue = num(input.revenue);
    var businessType = input.businessType || "khac";
    var costs = num(input.costs);
    var dependents = num(input.dependents);

    var group = R.getHKDGroup(revenue);
    var gtgtRateInfo = R.HKD_GTGT_RATES[businessType] || R.HKD_GTGT_RATES.khac;
    var tncnRateInfo = R.HKD_TNCN_RATES[businessType] || R.HKD_TNCN_RATES.khac;

    // Case: Nhóm 1 — MIỄN
    if (group.exempt) {
      return {
        type: "hkd",
        group: group,
        exempt: true,
        totalTax: 0,
        effectiveRate: 0,
        gtgt: 0,
        tncnA: 0,
        tncnB: 0,
        totalA: 0,
        totalB: 0,
        recommendation: "MIỄN THUẾ",
        method1: null,
        method2: null,
        comparison: null,
        breakdown: [],
        forms: [R.FORMS_DATA.hkd_revenue_notice],
        tips: [
          { icon: "✅", text: "Doanh thu dưới 1 tỷ → bạn được MIỄN thuế TNCN và GTGT (NĐ 141/2026)." },
          { icon: "⚠️", text: "Tuy nhiên vẫn PHẢI: (1) Đăng ký hộ kinh doanh (TT 18/2026), (2) Thông báo doanh thu (TT 50/2026), (3) Lập sổ S1a-HKD." },
          { icon: "📅", text: "Thông báo doanh thu trong 30 ngày kể từ phát sinh. Nếu không → phạt 2-4 triệu." },
        ],
        disclaimer: getDisclaimer(),
      };
    }

    // Cách 1: Tính theo tỷ lệ % trên doanh thu
    var gtgtA = revenue * gtgtRateInfo.rate;
    var tncnRevenueExcess = Math.max(0, revenue - R.HKD_THRESHOLD);
    var tncnA = tncnRevenueExcess * tncnRateInfo.rate;
    var totalA = gtgtA + tncnA;

    // Cách 2: Tính theo biểu lũy tiến HKD (thu nhập thực tế)
    // Dùng HKD_PROGRESSIVE_RATES (15/17/20%) — KHÔNG phải TNCN 5 bậc
    var taxableRevenue = Math.max(0, revenue - costs);
    var gtgtB = gtgtA;  // GTGT vẫn tính trên doanh thu
    var tncnB = progressiveTNCN(taxableRevenue, R.HKD_PROGRESSIVE_RATES);
    var totalB = gtgtB + tncnB.totalTax;

    // So sánh và gợi ý
    var saving = totalA - totalB;
    var recommendation = saving > 0 ? "Cách 2" : saving < 0 ? "Cách 1" : "Cả hai bằng nhau";
    var savingLabel = saving > 0 ? "tiết kiệm " + fmt(Math.abs(saving)) :
                      saving < 0 ? "đắt hơn " + fmt(Math.abs(saving)) :
                      "bằng nhau";

    // Deadline theo nhóm
    var filingInfo = group.filingType;
    var deadlineNote = group.id <= 2 ? "30 ngày cuối quý" : "30 ngày đầu tháng sau";

    var tips = [
      {
        icon: "⚡",
        text: "Cách 2 (" + (saving > 0 ? "thu nhập thực tế" : "lũy tiến") + ") " + savingLabel + " so với Cách 1 (" + (saving > 0 ? "tỷ lệ %" : "tỷ lệ %") + ")." +
              (costs === 0 ? " Nhập chi phí vốn hàng hóa để kết quả chính xác hơn!" : ""),
      },
      {
        icon: "📋",
        text: "Bạn thuộc " + group.label + " — " + filingInfo + ". Thời hạn: " + deadlineNote + ".",
      },
    ];

    if (businessType === "phan_phoi" || businessType === "dich_vu_xd" || businessType === "sx_van_tai_xd") {
      tips.push({
        icon: "💡",
        text: "Giữ chứng từ mua hàng đầy đủ để chứng minh chi phí (nếu chọn Cách 2). Bảo quản ít nhất 5 năm theo NĐ 310/2025.",
      });
    }

    if (group.id >= 3) {
      tips.push({
        icon: "⏰",
        text: "Nhóm 3-4 phải kê khai THEO THÁNG — chuẩn bị tờ khai hàng tháng trước ngày 30.",
      });
    }

    tips.push({
      icon: "📝",
      text: "Lập sổ S1a-HKD ghi doanh thu hàng ngày. Nếu không → phạt 2-4 triệu (NĐ 310/2025).",
    });

    return {
      type: "hkd",
      group: group,
      exempt: false,
      businessType: businessType,
      gtgtRate: gtgtRateInfo,
      tncnRate: tncnRateInfo,
      revenue: revenue,
      costs: costs,
      // Cách 1
      method1: {
        label: "Cách 1: Tính theo tỷ lệ % trên doanh thu",
        gtgt: gtgtA,
        tncn: tncnA,
        total: totalA,
        gtgtRate: gtgtRateInfo.rate,
        tncnRate: tncnRateInfo.rate,
      },
      // Cách 2
      method2: {
        label: "Cách 2: Tính theo thu nhập thực tế (lũy tiến)",
        gtgt: gtgtB,
        tncn: tncnB.totalTax,
        total: totalB,
        taxableRevenue: taxableRevenue,
        breakdown: tncnB.breakdown,
      },
      // So sánh
      comparison: {
        saving: saving,
        savingLabel: savingLabel,
        recommendation: recommendation,
        savingFormatted: fmt(Math.abs(saving)),
      },
      // totalTax = phương án thấp hơn (dùng cho multi-source summary)
      totalTax: saving > 0 ? totalB : totalA,
      forms: [R.FORMS_DATA.hkd_quarterly],
      tips: tips,
      disclaimer: getDisclaimer(),
    };
  }

  // ──────────────────────────────────────────────
  // CALCULATOR 3: TNDN doanh nghiệp
  // ──────────────────────────────────────────────

  function calculateTNDNTax(input) {
    var revenue = num(input.revenue);
    var taxableIncome = num(input.taxableIncome);
    var charitableDonation = num(input.charitableDonation);
    var rdFund = num(input.rdFund);
    var lossCarryforward = num(input.lossCarryforward);

    // 1. Xác định thuế suất theo doanh thu
    var rateInfo = R.getTNDNRate(revenue);

    // 2. Miễn thuế DN nhỏ (doanh thu ≤ 1 tỷ)
    if (revenue <= R.TNDN_EXEMPTION.threshold) {
      return {
        type: "tndn",
        exempt: true,
        revenue: revenue,
        totalTax: 0,
        effectiveRate: 0,
        exemption: R.TNDN_EXEMPTION,
        forms: [R.FORMS_DATA.corporate],
        tips: [
          { icon: "✅", text: "DN có doanh thu ≤ 1 tỷ → MIỄN thuế TNDN (NĐ 141/2026)." },
          { icon: "📋", text: "Vẫn phải nộp tờ khai TNDN hàng quý (đưa doanh thu = 0, ghi lý do miễn)." },
        ],
        disclaimer: getDisclaimer(),
      };
    }

    // 3. Giảm trừ
    var maxCharitable = taxableIncome * R.TNDN_DEDUCTIONS.charitableMax;
    var maxRD = taxableIncome * R.TNDN_DEDUCTIONS.rdFundMax;
    var actualCharitable = Math.min(charitableDonation, maxCharitable);
    var actualRD = Math.min(rdFund, maxRD);

    // 4. Thu nhập tính thuế sau giảm trừ
    var incomeAfterDeductions = taxableIncome - actualCharitable - actualRD - lossCarryforward;
    incomeAfterDeductions = Math.max(0, incomeAfterDeductions);

    // 5. Tính thuế
    var tax = incomeAfterDeductions * rateInfo.rate;
    var effectiveRate = revenue > 0 ? tax / revenue : 0;

    // 6. Lời khuyên
    var tips = [];
    tips.push({
      icon: "📊",
      text: "Thuế suất áp dụng: " + rateInfo.label,
    });

    if (actualCharitable > 0 && actualCharitable < charitableDonation) {
      tips.push({
        icon: "💡",
        text: "Quyên góp từ thiện được trừ tối đa 20% thu nhập tính thuế. Bạn chỉ được trừ " + fmt(actualCharitable) +
              " (trong số " + fmt(charitableDonation) + " đã đóng).",
      });
    }

    if (actualRD > 0 && actualRD < rdFund) {
      tips.push({
        icon: "💡",
        text: "Quỹ R&D được trừ tối đa 10% thu nhập tính thuế. Bạn chỉ được trừ " + fmt(actualRD) +
              " (trong số " + fmt(rdFund) + " đã trích).",
      });
    }

    if (lossCarryforward > 0) {
      tips.push({
        icon: "📉",
        text: "Lỗ năm trước được bù tối đa 5 năm. Đảm bảo còn chứng từ lỗ từ các năm trước.",
      });
    }

    tips.push({
      icon: "⚠️",
      text: "Thanh toán tiền mặt ≥5 triệu/kinh doanh KHÔNG được trừ chi phí. Phải thanh toán qua ngân hàng (NĐ 320/2025 Đ9.1c).",
    });

    return {
      type: "tndn",
      exempt: false,
      revenue: revenue,
      taxableIncome: taxableIncome,
      rateInfo: rateInfo,
      deductions: {
        charitable: actualCharitable,
        charitableMax: maxCharitable,
        rd: actualRD,
        rdMax: maxRD,
        lossCarryforward: lossCarryforward,
      },
      incomeAfterDeductions: incomeAfterDeductions,
      totalTax: tax,
      effectiveRate: effectiveRate,
      forms: [R.FORMS_DATA.corporate],
      tips: tips,
      disclaimer: getDisclaimer(),
    };
  }

  // ──────────────────────────────────────────────
  // CALCULATOR 4: GTGT
  // ──────────────────────────────────────────────

  function calculateGTGT(input) {
    var output = num(input.output);
    var inputVAT = num(input.inputVAT);
    var isReduced = R.isReducedGTGT();

    var method = input.method || "deductible";

    var gtgtPayable;
    if (method === "deductible") {
      gtgtPayable = Math.max(0, output - inputVAT);
    } else {
      // Phương pháp trực tiếp: HKD dùng % theo ngành (HKD_GTGT_RATES)
      var directRate = input.directRate || 0.10;
      gtgtPayable = output * directRate;
    }

    var tips = [];
    if (isReduced) {
      tips.push({
        icon: "🎉",
        text: "Bạn được hưởng giảm GTGT 8% (tạm thời, NĐ 174/2025, đến 31/12/2026).",
      });
    }

    tips.push({
      icon: "💡",
      text: "Giữ hóa đơn đầu vào đầy đủ để khấu trừ GTGT. Hóa đơn phải hợp lệ theo Thông tư 78/2021.",
    });

    return {
      type: "gtgt",
      output: output,
      inputVAT: inputVAT,
      method: method,
      effectiveRate: isReduced ? 0.08 : 0.10,
      isReduced: isReduced,
      gtgtPayable: gtgtPayable,
      tips: tips,
      disclaimer: getDisclaimer(),
    };
  }

  // ──────────────────────────────────────────────
  // CALCULATOR 5: Nhà thầu nước ngoài
  // ──────────────────────────────────────────────

  function calculateForeignContractor(input) {
    var grossRevenue = num(input.grossRevenue);
    var fc = R.FOREIGN_CONTRACTOR;

    var tndn = grossRevenue * fc.tndn.rate;
    var gtgt = grossRevenue * fc.gtgt.rate;
    var total = tndn + gtgt;

    return {
      type: "foreign_contractor",
      grossRevenue: grossRevenue,
      tndn: tndn,
      gtgt: gtgt,
      totalTax: total,
      effectiveRate: grossRevenue > 0 ? total / grossRevenue : 0,
      forms: [R.FORMS_DATA.foreign_contractor],
      tips: [
        { icon: "📋", text: "Nhà thầu nước ngoài KHÔNG được trừ chi phí. Thuế tính trên doanh thu gross." },
        { icon: "📅", text: "Nộp tờ khai theo quý trước 30 ngày cuối quý." },
      ],
      disclaimer: getDisclaimer(),
    };
  }

  // ──────────────────────────────────────────────
  // CALCULATOR 6: Thuê BĐS
  // ──────────────────────────────────────────────

  function calculateRentalTax(input) {
    var revenue = num(input.revenue);
    var rental = R.RENTAL_TAX;

    if (revenue <= rental.threshold) {
      return {
        type: "rental",
        revenue: revenue,
        exempt: true,
        gtgt: 0,
        tncn: 0,
        totalTax: 0,
        tips: [
          { icon: "✅", text: "Doanh thu cho thuê ≤ 1 tỷ → MIỄN GTGT và TNCN." },
        ],
        disclaimer: getDisclaimer(),
      };
    }

    var gtgt = revenue * rental.gtgt.rate;
    var tncn = revenue * rental.tncn.rate;
    var total = gtgt + tncn;

    return {
      type: "rental",
      revenue: revenue,
      exempt: false,
      gtgt: gtgt,
      tncn: tncn,
      totalTax: total,
      effectiveRate: revenue > 0 ? total / revenue : 0,
      forms: [R.FORMS_DATA.rental],
      tips: [
        { icon: "📋", text: "Cho thuê BĐS: GTGT 5% + TNCN 5% trên doanh thu (không trừ chi phí)." },
        { icon: "📅", text: "Nộp tờ khai theo quý trước 30 ngày cuối quý." },
      ],
      disclaimer: getDisclaimer(),
    };
  }

  // ──────────────────────────────────────────────
  // CALCULATOR 7: Freelancer / GTA
  // ──────────────────────────────────────────────

  function calculateFreelancerTax(input) {
    var revenue = num(input.revenue);
    var costs = num(input.costs);
    var dependents = num(input.dependents);

    var personalDed = R.getPersonalDeduction();
    var taxableIncome = Math.max(0, revenue - costs - personalDed.yearly -
                                  (R.DEPENDENT_DEDUCTION.yearly * dependents));

    var result = progressiveTNCN(taxableIncome);
    var effectiveRate = revenue > 0 ? result.totalTax / revenue : 0;

    var tips = [
      {
        icon: "📋",
        text: "Freelancer không có HĐLĐ → tự kê khai và nộp thuế TNCN. Cần đăng ký MST cá nhân.",
      },
      {
        icon: "💡",
        text: "Giữ hợp đồng, hóa đơn đầu vào để chứng minh chi phí hợp lý. Chi phí được trừ phải liên quan trực tiếp đến công việc.",
      },
    ];

    if (taxableIncome > 0 && result.breakdown.length > 0) {
      var lastBracket = result.breakdown[result.breakdown.length - 1];
      if (lastBracket.rate >= 0.20) {
        tips.push({
          icon: "⚠️",
          text: "Thuế suất cao (" + fmtPct(lastBracket.rate) + ")! Xem xét đăng ký hộ kinh doanh — có thể tiết kiệm hơn nếu doanh thu > 1 tỷ.",
        });
      }
    }

    return {
      type: "freelancer",
      revenue: revenue,
      costs: costs,
      taxableIncome: taxableIncome,
      totalTax: result.totalTax,
      effectiveRate: effectiveRate,
      breakdown: result.breakdown,
      forms: [R.FORMS_DATA.personal_salary],
      tips: tips,
      disclaimer: getDisclaimer(),
    };
  }

  // ──────────────────────────────────────────────
  // HELPER: Disclaimer chung
  // ──────────────────────────────────────────────

  function getDisclaimer() {
    return "⚠️ Kết quả tính toán chỉ mang tính chất tham khảo. Vui lòng đối chiếu với văn bản pháp luật hiện hành (Luật 109/2025, Luật 67/2025, NĐ 141/2026, NĐ 320/2025) hoặc liên hệ chuyên gia thuế để được tư vấn chính xác.";
  }

  // ──────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────

  return {
    calculateSalaryTax: calculateSalaryTax,
    calculateHKDTax: calculateHKDTax,
    calculateTNDNTax: calculateTNDNTax,
    calculateGTGT: calculateGTGT,
    calculateForeignContractor: calculateForeignContractor,
    calculateRentalTax: calculateRentalTax,
    calculateFreelancerTax: calculateFreelancerTax,
    progressiveTNCN: progressiveTNCN,
    fmt: fmt,
    fmtPct: fmtPct,
    getDisclaimer: getDisclaimer,
  };
})();
