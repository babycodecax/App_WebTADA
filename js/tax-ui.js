/**
 * tax-ui.js — UI Controller cho Công cụ tính thuế TADA
 *
 * Dieu phoi wizard 3 buoc: Chon nguon → Nhap thong tin → Xem ket qua.
 * Tinh toan chay hoan toan tren trinh duyet (client-side, instant).
 */

(function () {
  "use strict";

  var R = window.TAX_RATES;
  var C = window.TAX_CALC;
  var F = window.TAX_FORMS;

  // ── State ──
  // selectedSources: [{id: "salary", key: "salary_1"}, {id: "freelancer", key: "freelancer_1"}, ...]
  var state = {
    selectedSources: [],
    sourceCounters: {},    // {salary: 1, freelancer: 2, ...}
    currentStep: 1,
  };

  // ── DOM cache ──
  var dom = {
    sourceGrid: document.getElementById("source-grid"),
    commonInfo: document.getElementById("common-info"),
    btnToStep2: document.getElementById("btn-to-step2"),
    btnBackStep1: document.getElementById("btn-back-step1"),
    btnCalculate: document.getElementById("btn-calculate"),
    btnCalcAgain: document.getElementById("btn-calc-again"),
    btnShare: document.getElementById("btn-share"),
    step1: document.getElementById("step-1"),
    step2: document.getElementById("step-2"),
    step3: document.getElementById("step-3"),
    step2Forms: document.getElementById("step2-forms"),
    resultContainer: document.getElementById("result-container"),
  };

  // ================================================================
  // INIT
  // ================================================================

  function init() {
    renderSourceCards();
    bindEvents();
    // Auto-fill from URL hash (shareable link)
    restoreFromHash();
  }

  // ================================================================
  // STEP 1: Render source selection cards
  // ================================================================

  function renderSourceCards() {
    var html = "";
    F.INCOME_SOURCES.forEach(function (src) {
      html += '<div class="calc-source-card" data-source="' + src.id + '">' +
        '<div class="calc-source-icon">' + src.icon + '</div>' +
        '<div class="calc-source-label">' + src.label + '</div>' +
        '<div class="calc-source-desc">' + src.description + '</div>' +
        '<span class="calc-source-badge">' + src.badge + '</span>' +
      '</div>';
    });
    dom.sourceGrid.innerHTML = html;
  }

  function toggleSource(sourceId) {
    // Step 1: click = toggle 1 lần (chọn/bỏ loại nguồn)
    var exists = state.selectedSources.some(function (s) { return s.id === sourceId; });
    if (exists) {
      // Bỏ TẤT CẢ instances của loại này
      state.selectedSources = state.selectedSources.filter(function (s) { return s.id !== sourceId; });
      delete state.sourceCounters[sourceId];
    } else {
      // Thêm 1 instance đầu tiên
      if (!state.sourceCounters[sourceId]) state.sourceCounters[sourceId] = 0;
      state.sourceCounters[sourceId]++;
      state.selectedSources.push({ id: sourceId, key: sourceId + "_" + state.sourceCounters[sourceId] });
    }
    updateSourceUI();
  }

  function addSourceInstance(sourceId) {
    // Step 2: nút "+ Thêm nguồn" — thêm 1 instance mới
    if (!state.sourceCounters[sourceId]) state.sourceCounters[sourceId] = 0;
    state.sourceCounters[sourceId]++;
    state.selectedSources.push({ id: sourceId, key: sourceId + "_" + state.sourceCounters[sourceId] });
    renderStep2Forms();
  }

  function removeSource(key) {
    state.selectedSources = state.selectedSources.filter(function (s) { return s.key !== key; });
    renderStep2Forms();
  }

  function getSourceCount(sourceId) {
    return state.selectedSources.filter(function (s) { return s.id === sourceId; }).length;
  }

  function updateSourceUI() {
    var cards = dom.sourceGrid.querySelectorAll(".calc-source-card");
    cards.forEach(function (card) {
      var src = card.getAttribute("data-source");
      var exists = state.selectedSources.some(function (s) { return s.id === src; });
      card.classList.toggle("selected", exists);
    });
    dom.commonInfo.style.display = "none";
    var hasAny = state.selectedSources.length > 0;
    dom.btnToStep2.disabled = !hasAny;
  }

  // ================================================================
  // STEP 2: Render forms for selected sources
  // ================================================================

  function renderStep2Forms() {
    var html = "";

    state.selectedSources.forEach(function (s) {
      html += renderSourceForm(s.id, s.key);
    });

    // Nút thêm nguồn
    html += renderAddButtons(["salary", "freelancer", "foreign", "hkd", "rental"]);

    // Cache existing values before re-render
    var cachedValues = {};
    dom.step2Forms.querySelectorAll(".calc-input, .calc-select, .calc-stepper-input").forEach(function (el) {
      if (el.id) cachedValues[el.id] = el.type === "checkbox" ? el.checked : el.value;
    });

    dom.step2Forms.innerHTML = html;

    // Restore cached values
    Object.keys(cachedValues).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = cachedValues[id];
      else el.value = cachedValues[id];
    });

    bindFormEvents();
  }

  function renderAddButtons(types) {
    var html = '<div class="calc-add-buttons">';
    types.forEach(function (t) {
      var src = findSource(t);
      if (!src) return;
      html += '<button class="calc-add-btn" data-add-source="' + t + '">+ ' + src.icon + ' ' + src.label + '</button>';
    });
    html += '</div>';
    return html;
  }

  function renderSourceForm(sourceId, key) {
    var src = findSource(sourceId);
    if (!src) return '';
    var count = getSourceCount(sourceId);
    var label = count > 1 ? src.label + ' (' + key.split('_').pop() + ')' : src.label;
    var html = '<div class="calc-source-form" data-source="' + sourceId + '" data-key="' + key + '">';
    html += '<div class="calc-source-header">';
    html += '<span class="calc-source-header-icon">' + src.icon + '</span>';
    html += '<span class="calc-source-header-title">' + label + '</span>';
    if (count > 1) {
      html += '<button class="calc-source-remove" data-key="' + key + '" title="Xóa nguồn này">✕</button>';
    }
    html += '</div>';
    // Tính key suffix cho input IDs (salary → salary-input_1, salary-input_2)
    var suffix = count > 1 ? '_' + key.split('_').pop() : '';
    if (sourceId === "salary") html += renderSalaryForm(suffix);
    else if (sourceId === "hkd") html += renderHKDForm();
    else if (sourceId === "rental") html += renderRentalForm();
    else if (sourceId === "freelancer") html += renderFreelancerForm();
    else if (sourceId === "corporate") html += renderCorporateForm();
    else if (sourceId === "foreign") html += renderForeignForm();
    else if (sourceId === "investment") html += renderInvestmentForm();
    html += '</div>';
    return html;
  }

  function renderSalaryForm(suffix) {
    suffix = suffix || '';
    var showNPT = suffix === ''; // Chỉ hiện NPT ở nguồn lương ĐẦU TIÊN
    var html = '' +
      '<div class="calc-form-row">' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Lương gross hàng tháng</label>' +
      '    <div class="calc-input-group">' +
      '      <input type="text" class="calc-input" id="salary-input' + suffix + '" placeholder="Ví dụ: 20.000.000" inputmode="numeric">' +
      '      <span class="calc-input-suffix">VNĐ</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Đóng BHXH?</label>' +
      '    <div class="calc-toggle-row">' +
      '      <label class="calc-toggle"><input type="checkbox" id="bhxh-toggle' + suffix + '" checked><span class="calc-toggle-slider"></span></label>' +
      '      <div><span class="calc-toggle-label">Có đóng BHXH</span><div class="calc-toggle-hint">8% BHXH + 1% BHTN + 1.5% BHYT = 10.5%</div></div>' +
      '    </div>' +
      '    <div class="calc-toggle-row" style="margin-top:8px;">' +
      '      <label class="calc-toggle"><input type="checkbox" id="union-toggle' + suffix + '" checked><span class="calc-toggle-slider"></span></label>' +
      '      <div><span class="calc-toggle-label">Phí công đoàn (1%)</span><div class="calc-toggle-hint">Tùy doanh nghiệp — thường có nếu có tổ chức CĐ</div></div>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    if (showNPT) {
      html += '<div class="calc-source-tip" style="background:#f0fdf4;border-left:3px solid #2d8a4e;padding:8px 12px;margin-top:8px;border-radius:4px;font-size:13px;">' +
        '✅ Được giảm trừ bản thân + NPT (1 lần trên tổng thu nhập lương). NPT áp dụng cho tất cả nguồn tiền lương.</div>';
      html += '<div class="calc-form-group" style="margin-top:12px;">' +
        '<label class="calc-label">Số người phụ thuộc</label>' +
        '<div class="calc-stepper">' +
        '<button class="calc-stepper-btn" data-action="decrease">−</button>' +
        '<input type="number" id="npt-shared" class="calc-stepper-input" value="0" min="0" max="20" readonly>' +
        '<button class="calc-stepper-btn" data-action="increase">+</button>' +
        '</div>' +
        '<span class="calc-hint">6,2 triệu/người/tháng — Điều 9 Luật 109/2025</span>' +
        '</div>';
    }
    return html;
  }

  function renderHKDForm() {
    var bizOpts = '';
    F.BUSINESS_TYPES.forEach(function (bt) {
      bizOpts += '<option value="' + bt.id + '">' + bt.icon + ' ' + bt.label + ' (' + bt.example + ')</option>';
    });

    return '' +
      '<div class="calc-form-row">' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Doanh thu năm ước tính</label>' +
      '    <div class="calc-input-group">' +
      '      <input type="text" class="calc-input" id="hkd-revenue-input" placeholder="Ví dụ: 2.500.000.000" inputmode="numeric">' +
      '      <span class="calc-input-suffix">VNĐ/năm</span>' +
      '    </div>' +
      '    <div id="hkd-live-badge"></div>' +
      '  </div>' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Lĩnh vực kinh doanh</label>' +
      '    <select class="calc-select" id="hkd-biz-type">' + bizOpts + '</select>' +
      '  </div>' +
      '</div>' +
      '<div class="calc-form-row">' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Chi phí vốn hàng hóa (nếu biết) — tùy chọn</label>' +
      '    <div class="calc-input-group">' +
      '      <input type="text" class="calc-input" id="hkd-costs-input" placeholder="Để trống nếu không biết" inputmode="numeric">' +
      '      <span class="calc-input-suffix">VNĐ/năm</span>' +
      '    </div>' +
      '    <span class="calc-hint">Chi phí hợp lý: giá mua + vận chuyển + bảo hiểm. Giữ chứng từ!</span>' +
      '  </div>' +
      '</div>';
  }

  function renderRentalForm() {
    return '' +
      '<div class="calc-form-group">' +
      '  <label class="calc-label">Doanh thu cho thuê hàng năm</label>' +
      '  <div class="calc-input-group">' +
      '    <input type="text" class="calc-input" id="rental-revenue-input" placeholder="Ví dụ: 600.000.000" inputmode="numeric">' +
      '    <span class="calc-input-suffix">VNĐ/năm</span>' +
      '  </div>' +
      '</div>';
  }

  function renderFreelancerForm() {
    return '' +
      '<div class="calc-form-group">' +
      '  <label class="calc-label">Bạn hoạt động theo hình thức nào?</label>' +
      '  <div class="calc-radio-group">' +
      '    <label class="calc-radio">' +
      '      <input type="radio" name="freelancer-mode' + '_form" id="freelancer-mode-free" value="free" checked>' +
      '      <div class="calc-radio-content">' +
      '        <span class="calc-radio-title">💼 HĐDV — Cá nhân tự do</span>' +
      '        <span class="calc-radio-desc">Chưa đăng ký kinh doanh. Thuế: tạm khấu trừ 10% tại nguồn, cuối năm quyết toán theo lũy tiến 5 bậc + GTGC + NPT.</span>' +
      '      </div>' +
      '    </label>' +
      '    <label class="calc-radio">' +
      '      <input type="radio" name="freelancer-mode' + '_form" id="freelancer-mode-business" value="business">' +
      '      <div class="calc-radio-content">' +
      '        <span class="calc-radio-title">🏪 HĐKD — Có đăng ký kinh doanh</span>' +
      '        <span class="calc-radio-desc">Thuế GTGT + TNCN theo tỷ lệ % trên doanh thu. KHÔNG giảm trừ gia cảnh.</span>' +
      '      </div>' +
      '    </label>' +
      '  </div>' +
      '</div>' +
      '<div class="calc-form-row">' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Doanh thu năm</label>' +
      '    <div class="calc-input-group">' +
      '      <input type="text" class="calc-input" id="freelancer-revenue-input" placeholder="Ví dụ: 200.000.000" inputmode="numeric">' +
      '      <span class="calc-input-suffix">VNĐ/năm</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Chi phí hợp lý (nếu có)</label>' +
      '    <div class="calc-input-group">' +
      '      <input type="text" class="calc-input" id="freelancer-costs-input" placeholder="Để trống nếu không có" inputmode="numeric">' +
      '      <span class="calc-input-suffix">VNĐ/năm</span>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<div id="freelancer-npt-section" style="display:none;">' +
      '<div class="calc-source-tip" style="background:#f0fdf4;border-left:3px solid #2d8a4e;padding:8px 12px;margin-top:8px;border-radius:4px;font-size:13px;">' +
      '✅ HĐDV = tiền lương, tiền công → được GTGC + NPT (quyết toán năm).</div>' +
      '<div class="calc-form-group" style="margin-top:12px;">' +
      '<label class="calc-label">Số người phụ thuộc</label>' +
      '<div class="calc-stepper">' +
      '<button class="calc-stepper-btn" data-action="decrease">−</button>' +
      '<input type="number" id="npt-shared" class="calc-stepper-input" value="0" min="0" max="20" readonly>' +
      '<button class="calc-stepper-btn" data-action="increase">+</button>' +
      '</div>' +
      '<span class="calc-hint">6,2 triệu/người/tháng</span>' +
      '</div></div>';
  }

  function renderCorporateForm() {
    return '' +
      '<div class="calc-form-row">' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Doanh thu năm</label>' +
      '    <div class="calc-input-group">' +
      '      <input type="text" class="calc-input" id="corp-revenue-input" placeholder="Ví dụ: 10.000.000.000" inputmode="numeric">' +
      '      <span class="calc-input-suffix">VNĐ/năm</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Thu nhập tính thuế</label>' +
      '    <div class="calc-input-group">' +
      '      <input type="text" class="calc-input" id="corp-taxable-input" placeholder="DT - CP được trừ" inputmode="numeric">' +
      '      <span class="calc-input-suffix">VNĐ/năm</span>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<div class="calc-form-row">' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Quyên góp từ thiện (nếu có)</label>' +
      '    <div class="calc-input-group">' +
      '      <input type="text" class="calc-input" id="corp-charity-input" placeholder="Tối đa 20% thu nhập tính thuế" inputmode="numeric">' +
      '      <span class="calc-input-suffix">VNĐ</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="calc-form-group">' +
      '    <label class="calc-label">Quỹ R&D (nếu có)</label>' +
      '    <div class="calc-input-group">' +
      '      <input type="text" class="calc-input" id="corp-rd-input" placeholder="Tối đa 10% thu nhập tính thuế" inputmode="numeric">' +
      '      <span class="calc-input-suffix">VNĐ</span>' +
      '    </div>' +
      '  </div>' +
      '</div>';
  }

  function renderForeignForm() {
    return '' +
      '<div class="calc-form-group">' +
      '  <label class="calc-label">Trường hợp thuế</label>' +
      '  <select class="calc-select" id="foreign-type">' +
      '    <option value="service">NC cư trú + HĐ dịch vụ → 1% TNDN + 5% GTGT trên gross</option>' +
      '    <option value="salary">NC cư trú + thu nhập dạng lương → lũy tiến 5 bậc + GTGC</option>' +
      '    <option value="non_resident">NC không cư trú → 20% + 5% trên gross</option>' +
      '  </select>' +
      '</div>' +
      '<div class="calc-form-group">' +
      '  <label class="calc-label">Thu nhập tại Việt Nam</label>' +
      '  <div class="calc-input-group">' +
      '    <input type="text" class="calc-input" id="foreign-revenue-input" placeholder="Ví dụ: 500.000.000" inputmode="numeric">' +
      '    <span class="calc-input-suffix">VNĐ/tháng</span>' +
      '  </div>' +
      '</div>' +
      '<div class="calc-source-tip" style="background:#fef9f0;border-left:3px solid var(--calc-accent);padding:8px 12px;margin-top:8px;border-radius:4px;font-size:13px;">' +
      '💡 NC cư trú + lương → được GTGC + NPT. NC cư trú + HĐDV hoặc NC không cư trú → KHÔNG giảm trừ.</div>';
  }

  function renderInvestmentForm() {
    return '' +
      '<div class="calc-form-group">' +
      '  <label class="calc-label">Loại đầu tư</label>' +
      '  <select class="calc-select" id="invest-type">' +
      '    <option value="lai_tiet_kiem">💰 Lãi tiết kiệm (MIỄN thuế)</option>' +
      '    <option value="co_phieu">📈 Cổ phiếu (0.1%)</option>' +
      '    <option value="chuyen_nhuong_bds">🏠 Chuyển nhượng BĐS (2%)</option>' +
      '    <option value="dau_tu_von">💼 Đầu tư vốn (5%)</option>' +
      '  </select>' +
      '</div>' +
      '<div class="calc-form-group">' +
      '  <label class="calc-label">Doanh thu/Thu nhập</label>' +
      '  <div class="calc-input-group">' +
      '    <input type="text" class="calc-input" id="invest-amount-input" placeholder="Số tiền thu được" inputmode="numeric">' +
      '    <span class="calc-input-suffix">VNĐ</span>' +
      '  </div>' +
      '</div>';
  }

  // ================================================================
  // FORM EVENTS
  // ================================================================

  function bindFormEvents() {
    // Freelancer mode radio — show/hide NPT
    var freeModeFree = document.getElementById("freelancer-mode-free");
    var freeModeBusiness = document.getElementById("freelancer-mode-business");
    var freeNptSection = document.getElementById("freelancer-npt-section");
    if (freeModeFree && freeNptSection) {
      freeModeFree.addEventListener("change", function () { freeNptSection.style.display = this.checked ? "" : "none"; });
    }
    if (freeModeBusiness && freeNptSection) {
      freeModeBusiness.addEventListener("change", function () { freeNptSection.style.display = this.checked ? "none" : ""; });
    }

    // Format number inputs
    document.querySelectorAll(".calc-input[inputmode='numeric']").forEach(function (input) {
      input.addEventListener("input", function () {
        var raw = this.value.replace(/[^\d]/g, "");
        if (raw) {
          this.value = Number(raw).toLocaleString("vi-VN");
        }
        onInputChange();
      });
    });

    // HKD live badge
    var hkdRevenue = document.getElementById("hkd-revenue-input");
    if (hkdRevenue) {
      hkdRevenue.addEventListener("input", function () {
        var raw = parseNumber(this.value);
        var badgeEl = document.getElementById("hkd-live-badge");
        if (raw > 0) {
          var group = R.getHKDGroup(raw);
          if (group.exempt) {
            badgeEl.innerHTML = '<span class="calc-live-badge exempt">✅ ' + group.label + ' — MIỄN thuế (doanh thu < 1 tỷ)</span>';
          } else {
            badgeEl.innerHTML = '<span class="calc-live-badge group">✨ ' + group.label + ' — ' + group.filingType + '</span>';
          }
        } else {
          badgeEl.innerHTML = '';
        }
      });
    }


    // Generic stepper handler — any stepper inside forms
    document.querySelectorAll(".calc-source-form .calc-stepper-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var stepper = this.closest(".calc-stepper");
        var inp = stepper.querySelector(".calc-stepper-input");
        if (!inp) return;
        var val = parseInt(inp.value, 10) || 0;
        var action = this.getAttribute("data-action");
        if (action === "increase" && val < 20) inp.value = val + 1;
        if (action === "decrease" && val > 0) inp.value = val - 1;
      });
    });
  }

  function onInputChange() {
    // Auto-advise when inputs change (future enhancement)
  }

  // ================================================================
  // STEP NAVIGATION
  // ================================================================

  function goToStep(step) {
    state.currentStep = step;

    // Hide all steps
    dom.step1.classList.remove("active");
    dom.step2.classList.remove("active");
    dom.step3.classList.remove("active");

    // Show target step
    document.getElementById("step-" + step).classList.add("active");

    // Update progress
    document.querySelectorAll(".calc-progress-step").forEach(function (el) {
      var s = parseInt(el.getAttribute("data-step"));
      el.classList.remove("active", "done");
      if (s === step) el.classList.add("active");
      if (s < step) el.classList.add("done");
    });

    // Render step 2 forms when entering step 2
    if (step === 2) {
      renderStep2Forms();
    }

    // Scroll to calculator
    document.getElementById("calculator").scrollIntoView({ behavior: "smooth" });
  }

  // ================================================================
  // CALCULATE
  // ================================================================

  function calculateAll() {
    // Validate
    var hasInput = false;
    state.selectedSources.forEach(function (s) {
      var form = document.querySelector('.calc-source-form[data-key="' + s.key + '"]');
      if (!form) return;
      form.querySelectorAll('.calc-input[inputmode="numeric"]').forEach(function (inp) {
        if (parseNumber(inp.value) > 0) hasInput = true;
      });
    });
    if (!hasInput) { alert("Vui lòng nhập ít nhất một số tiền."); return; }

    var npt = parseNumber(getVal("npt-shared"));
    var results = [];
    var salaryApplied = false; // GTGC + NPT chỉ 1 lần

    state.selectedSources.forEach(function (s) {
      var result = null;
      var form = document.querySelector('.calc-source-form[data-key="' + s.key + '"]');
      if (!form) return;
      var g = function (id) { var el = form.querySelector("#" + id); return el ? el.value : ""; };
      var p = function (id) { return parseNumber(g(id)); };
      var c = function (id) { var el = form.querySelector("#" + id); return el ? el.checked : false; };

      var isSalaryType = (s.id === "salary" || s.id === "freelancer" || s.id === "foreign");
      var firstSalary = isSalaryType && !salaryApplied;
      if (isSalaryType) salaryApplied = true;

      if (s.id === "salary") {
        result = C.calculateSalaryTax({ salary: p("salary-input"), dependents: firstSalary ? npt : 0, hasBHXH: c("bhxh-toggle"), hasUnion: c("union-toggle"), applyPersonalDed: firstSalary, applyDependent: firstSalary });
      } else if (s.id === "hkd") {
        result = C.calculateHKDTax({ revenue: p("hkd-revenue-input"), businessType: g("hkd-biz-type"), costs: p("hkd-costs-input") });
      } else if (s.id === "rental") {
        result = C.calculateRentalTax({ revenue: p("rental-revenue-input") });
      } else if (s.id === "freelancer") {
        var freeMode = form.querySelector('input[name="freelancer-mode_form"]:checked');
        var ft = freeMode ? freeMode.value : "free";
        result = C.calculateFreelancerTax({ revenue: p("freelancer-revenue-input"), costs: p("freelancer-costs-input"), mode: ft, applyPersonalDed: firstSalary });
      } else if (s.id === "corporate") {
        result = C.calculateTNDNTax({ revenue: p("corp-revenue-input"), taxableIncome: p("corp-taxable-input"), charitableDonation: p("corp-charity-input"), rdFund: p("corp-rd-input") });
      } else if (s.id === "foreign") {
        result = C.calculateForeignContractor({ grossRevenue: p("foreign-revenue-input"), contractorType: g("foreign-type"), dependents: npt });
      } else if (s.id === "investment") {
        var type = g("invest-type"); var amt = p("invest-amount-input"); var ri = R.OTHER_INCOME_TAX[type];
        if (ri && amt > 0) { var tx = ri.threshold ? Math.max(0, amt - ri.threshold) * ri.rate : amt * ri.rate; result = { type: "investment", revenue: amt, totalTax: tx, effectiveRate: amt > 0 ? tx / amt : 0, label: ri.label, tips: [{ icon: "📋", text: ri.label }, tx === 0 ? { icon: "✅", text: "MIỄN THUẾ" } : null].filter(Boolean), disclaimer: C.getDisclaimer() }; }
      }
      if (result) results.push(result);
    });

    if (results.length > 0) { renderResults(results); goToStep(3); showConfetti(); }
  }

  function calculateInvestment() {
    var type = getVal("invest-type");
    var amount = parseNumber(getVal("invest-amount-input"));
    var rateInfo = R.OTHER_INCOME_TAX[type];

    if (!rateInfo || amount <= 0) return null;

    var tax = 0;
    if (rateInfo.threshold) {
      tax = Math.max(0, amount - rateInfo.threshold) * rateInfo.rate;
    } else {
      tax = amount * rateInfo.rate;
    }

    return {
      type: "investment",
      revenue: amount,
      totalTax: tax,
      effectiveRate: amount > 0 ? tax / amount : 0,
      label: rateInfo.label,
      tips: [
        { icon: "📋", text: rateInfo.label },
        tax === 0 ? { icon: "✅", text: "Thu nhập này được MIỄN thuế." } : null,
      ].filter(Boolean),
      disclaimer: C.getDisclaimer(),
    };
  }

  // ================================================================
  // RENDER RESULTS
  // ================================================================

  function renderResults(results) {
    var isMulti = results.length > 1;
    var totalTax = results.reduce(function (sum, r) { return sum + (r.totalTax || 0); }, 0);

    var html = '';

    // Hero card
    html += '<div class="calc-result-hero">';
    html += '<div class="calc-result-emoji">🎉</div>';
    html += '<div class="calc-result-label">' + (isMulti ? 'TỔNG THUẾ PHẢI NỘP' : 'Thuế phải nộp') + '</div>';
    html += '<div class="calc-result-total">' + C.fmt(totalTax) + ' / năm</div>';
    html += '<div class="calc-result-label">' + C.fmt(Math.round(totalTax / 12)) + ' / tháng</div>';

    // Multi-source warning
    if (isMulti) {
      html += '<div class="calc-live-badge group" style="margin-top:12px;">⚠️ Bạn có ' + results.length + ' nguồn thu — BẮT BUỘC quyết toán trước 31/07</div>';
    }
    html += '</div>';

    // Tabs
    html += '<div class="calc-result-tabs">';
    html += '<button class="calc-result-tab active" data-tab="detail">📊 Chi tiết</button>';
    html += '<button class="calc-result-tab" data-tab="advice">💡 Lời khuyên</button>';
    html += '<button class="calc-result-tab" data-tab="calendar">📅 Lịch nộp thuế</button>';
    html += '</div>';

    // Tab: Detail
    html += '<div class="calc-result-panel active" data-panel="detail">';

    if (isMulti) {
      results.forEach(function (r) {
        var icon = getSourceIcon(r.type);
        var label = getSourceLabel(r.type);
        html += '<div style="margin:16px 0 8px;padding-bottom:6px;border-bottom:2px solid var(--calc-border);font-size:15px;font-weight:700;color:var(--calc-primary);">' + icon + ' ' + label + ' — ' + C.fmt(r.totalTax || 0) + '</div>';
        html += renderDetailBreakdown(r);
      });
    } else {
      html += renderDetailBreakdown(results[0]);
    }

    // Forms needed
    html += '<h3 style="font-size:16px;font-weight:700;color:var(--calc-primary);margin:20px 0 10px;">📝 Thủ tục cần làm</h3>';
    results.forEach(function (r) {
      if (r.forms) {
        r.forms.forEach(function (f) {
          html += '<div style="margin-bottom:8px;font-size:14px;"><strong>' + f.formCode + '</strong> — ' + f.formName + '<br><span style="color:var(--calc-muted);">Thời hạn: ' + f.deadline + ' | Nộp tại: ' + f.where + '</span></div>';
        });
      }
    });

    html += '</div>';

    // Tab: Advice
    html += '<div class="calc-result-panel" data-panel="advice">';
    var allTips = [];
    results.forEach(function (r) {
      if (r.tips) allTips = allTips.concat(r.tips);
    });
    // Add common tips
    allTips.push(F.COMMON_TIPS.keep_documents);
    allTips.push(F.COMMON_TIPS.etax_mobile);
    allTips.push(F.COMMON_TIPS.penalty_warning);

    allTips.forEach(function (tip) {
      if (tip) {
        html += '<div class="calc-tip"><span class="calc-tip-icon">' + tip.icon + '</span><span class="calc-tip-text">' + tip.text + '</span></div>';
      }
    });

    // Disclaimer
    html += '<div class="calc-disclaimer-box" style="margin-top:20px;">' + results[0].disclaimer + '</div>';
    html += '</div>';

    // Tab: Calendar
    html += '<div class="calc-result-panel" data-panel="calendar">';
    html += renderCalendar(results);
    html += '</div>';

    dom.resultContainer.innerHTML = html;
    bindResultTabs();
  }

  function renderSourceSummary(r) {
    var icon = getSourceIcon(r.type);
    var label = getSourceLabel(r.type);
    var html = '<div class="calc-source-summary">';
    html += '<span class="calc-source-summary-icon">' + icon + '</span>';
    html += '<div class="calc-source-summary-info">';
    html += '<div class="calc-source-summary-label">' + label + '</div>';
    html += '<div class="calc-source-summary-tax">' + C.fmt(r.totalTax || 0) + '</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderDetailBreakdown(r) {
    var html = '<table class="calc-breakdown">';

    if (r.type === "salary") {
      var inp = r.input || {};
      var m = inp.months || 12;
      html += '<tr><td>Thu nhập gross</td><td>' + C.fmt(r.grossIncome) + '</td></tr>';
      html += '<tr class="formula-row"><td colspan="2">' + C.fmt(inp.salary || 0) + ' × ' + m + ' tháng</td></tr>';
      html += '<tr class="deduction"><td>− ' + r.deductions.deductionLabel + '</td><td>' + C.fmt(r.deductions.personal) + '</td></tr>';
      if (r.deductions.personalFormula) html += '<tr class="formula-row"><td colspan="2">' + r.deductions.personalFormula + '</td></tr>';
      if (r.deductions.bhxh > 0 && r.deductions.bhxhBreakdown) {
        r.deductions.bhxhBreakdown.forEach(function (b) {
          html += '<tr class="deduction"><td>− ' + b.label + '</td><td>' + C.fmt(b.amount) + '</td></tr>';
          if (b.formula) html += '<tr class="formula-row"><td colspan="2">' + b.formula + '</td></tr>';
        });
        html += '<tr class="deduction" style="font-weight:600;"><td>− Tổng BHXH + CĐ</td><td>' + C.fmt(r.deductions.bhxh) + '</td></tr>';
      }
      if (r.deductions.dependent > 0) {
        html += '<tr class="deduction"><td>− GTGC NPT (' + r.deductions.dependentCount + ' người)</td><td>' + C.fmt(r.deductions.dependent) + '</td></tr>';
        if (r.deductions.dependentFormula) html += '<tr class="formula-row"><td colspan="2">' + r.deductions.dependentFormula + '</td></tr>';
      }
      html += '<tr class="subtotal"><td>Thu nhập tính thuế</td><td>' + C.fmt(r.taxableIncome) + '</td></tr>';
      html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.grossIncome) + ' − ' + C.fmt(r.deductions.total) + '</td></tr>';
      if (r.breakdown) {
        r.breakdown.forEach(function (b) {
          html += '<tr><td>' + b.label + ' (' + C.fmtPct(b.rate) + ')</td><td>' + C.fmt(b.tax) + '</td></tr>';
          if (b.formula) html += '<tr class="formula-row"><td colspan="2">' + b.formula + '</td></tr>';
        });
      }
      html += '<tr class="subtotal"><td>TỔNG THUẾ</td><td>' + C.fmt(r.totalTax) + '</td></tr>';

    } else if (r.type === "hkd" && !r.exempt) {
      // Dual comparison
      html += '<tr><td>Doanh thu năm</td><td>' + C.fmt(r.revenue) + '</td></tr>';
      html += '<tr class="formula-row"><td colspan="2">Thuộc ' + r.group.label + ' — ' + r.group.filingType + '</td></tr>';
      if (r.costs > 0) {
        html += '<tr><td>Chi phí vốn</td><td>' + C.fmt(r.costs) + '</td></tr>';
      }
      html += '<tr><td>Ngành nghề</td><td>' + (r.gtgtRate?.label || '') + '</td></tr>';
      html += '</table>';

      // Cách 1 detail
      html += '<div style="margin:12px 0 6px;font-size:13px;font-weight:700;color:var(--calc-primary);">Cách 1: Tính trên doanh thu</div>';
      html += '<table class="calc-breakdown">';
      html += '<tr><td>GTGT (' + C.fmtPct(r.method1.gtgtRate) + ' × DT)</td><td>' + C.fmt(r.method1.gtgt) + '</td></tr>';
      html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.revenue) + ' × ' + C.fmtPct(r.method1.gtgtRate) + '</td></tr>';
      html += '<tr><td>TNCN (' + C.fmtPct(r.method1.tncnRate) + ' × (DT−1 tỷ))</td><td>' + C.fmt(r.method1.tncn) + '</td></tr>';
      html += '<tr class="formula-row"><td colspan="2">(' + C.fmt(r.revenue) + ' − 1.000.000.000) × ' + C.fmtPct(r.method1.tncnRate) + '</td></tr>';
      html += '<tr class="subtotal"><td>Tổng Cách 1</td><td>' + C.fmt(r.method1.total) + '</td></tr>';
      html += '</table>';

      // Cách 2 detail
      html += '<div style="margin:12px 0 6px;font-size:13px;font-weight:700;color:var(--calc-primary);">Cách 2: Tính trên thu nhập thực tế</div>';
      html += '<table class="calc-breakdown">';
      html += '<tr><td>GTGT (giống Cách 1)</td><td>' + C.fmt(r.method2.gtgt) + '</td></tr>';
      html += '<tr><td>Thu nhập tính thuế</td><td>' + C.fmt(r.method2.taxableRevenue) + '</td></tr>';
      html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.revenue) + ' − ' + C.fmt(r.costs) + '</td></tr>';
      if (r.method2.breakdown && r.method2.breakdown.length > 0) {
        r.method2.breakdown.forEach(function (b) {
          html += '<tr><td>TNCN ' + b.label + ' (' + C.fmtPct(b.rate) + ')</td><td>' + C.fmt(b.tax) + '</td></tr>';
          if (b.formula) html += '<tr class="formula-row"><td colspan="2">' + b.formula + '</td></tr>';
        });
      } else {
        html += '<tr><td>TNCN</td><td>' + C.fmt(r.method2.tncn) + '</td></tr>';
      }
      html += '<tr class="subtotal"><td>Tổng Cách 2</td><td>' + C.fmt(r.method2.total) + '</td></tr>';
      html += '</table>';

      // So sánh
      html += '<div class="calc-compare">';
      html += '<div class="calc-compare-box' + (r.comparison.recommendation === "Cách 1" ? " winner" : "") + '">';
      html += '<div class="calc-compare-label">' + r.method1.label + '</div>';
      html += '<div class="calc-compare-amount">' + C.fmt(r.method1.total) + '</div>';
      html += '<div class="calc-compare-tag ' + (r.comparison.recommendation === "Cách 1" ? "win" : "lose") + '">' +
        (r.comparison.recommendation === "Cách 1" ? "✅ Nên chọn" : "Đắt hơn") + '</div>';
      html += '</div>';

      html += '<div class="calc-compare-box' + (r.comparison.recommendation === "Cách 2" ? " winner" : "") + '">';
      html += '<div class="calc-compare-label">' + r.method2.label + '</div>';
      html += '<div class="calc-compare-amount">' + C.fmt(r.method2.total) + '</div>';
      html += '<div class="calc-compare-tag ' + (r.comparison.recommendation === "Cách 2" ? "win" : "lose") + '">' +
        (r.comparison.recommendation === "Cách 2" ? "✅ Nên chọn" : "Đắt hơn") + '</div>';
      html += '</div>';
      html += '</div>';

      if (r.comparison.saving > 0) {
        html += '<div class="calc-result-saving">⚡ Cách 2 tiết kiệm ' + r.comparison.savingFormatted + '</div>';
      }

      return html;

    } else if (r.type === "hkd" && r.exempt) {
      html += '<tr><td>Doanh thu năm</td><td>' + C.fmt(r.revenue || 0) + '</td></tr>';
      html += '<tr class="subtotal"><td>TRẠNG THÁI</td><td style="color:var(--calc-success);">✅ MIỄN THUẾ</td></tr>';

    } else if (r.type === "tndn") {
      if (r.exempt) {
        html += '<tr><td>Doanh thu năm</td><td>' + C.fmt(r.revenue) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">DN doanh thu ≤ 1 tỷ → MIỄN (NĐ 141/2026)</td></tr>';
        html += '<tr class="subtotal"><td>TRẠNG THÁI</td><td style="color:var(--calc-success);">✅ MIỄN THUẾ TNDN</td></tr>';
      } else {
        html += '<tr><td>Doanh thu năm</td><td>' + C.fmt(r.revenue) + '</td></tr>';
        html += '<tr><td>Thuế suất</td><td>' + r.rateInfo.label + '</td></tr>';
        html += '<tr><td>Thu nhập tính thuế</td><td>' + C.fmt(r.taxableIncome) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.revenue) + ' (DT) → xác định thuế suất theo nhóm DN</td></tr>';
        if (r.deductions.charitable > 0) {
          html += '<tr class="deduction"><td>− Quyên góp từ thiện</td><td>' + C.fmt(r.deductions.charitable) + '</td></tr>';
          html += '<tr class="formula-row"><td colspan="2">Tối đa 20% thu nhập tính thuế</td></tr>';
        }
        if (r.deductions.rd > 0) {
          html += '<tr class="deduction"><td>− Quỹ R&D</td><td>' + C.fmt(r.deductions.rd) + '</td></tr>';
          html += '<tr class="formula-row"><td colspan="2">Tối đa 10% thu nhập tính thuế</td></tr>';
        }
        if (r.deductions.lossCarryforward > 0) html += '<tr class="deduction"><td>− Bù lỗ năm trước</td><td>' + C.fmt(r.deductions.lossCarryforward) + '</td></tr>';
        html += '<tr class="subtotal"><td>Thu nhập sau giảm trừ</td><td>' + C.fmt(r.incomeAfterDeductions) + '</td></tr>';
        html += '<tr><td>Thuế TNDN</td><td>' + C.fmt(r.totalTax) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.incomeAfterDeductions) + ' × ' + C.fmtPct(r.rateInfo.rate) + '</td></tr>';
        html += '<tr class="subtotal"><td>TỔNG THUẾ</td><td>' + C.fmt(r.totalTax) + '</td></tr>';
      }

    } else if (r.type === "rental") {
      html += '<tr><td>Doanh thu cho thuê</td><td>' + C.fmt(r.revenue) + '</td></tr>';
      if (r.exempt) {
        html += '<tr class="formula-row"><td colspan="2">DT ≤ 1 tỷ → MIỄN GTGT + TNCN</td></tr>';
        html += '<tr class="subtotal"><td>TRẠNG THÁI</td><td style="color:var(--calc-success);">✅ MIỄN THUẾ</td></tr>';
      } else {
        html += '<tr><td>GTGT (5%)</td><td>' + C.fmt(r.gtgt) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.revenue) + ' × 5%</td></tr>';
        html += '<tr><td>TNCN (5%)</td><td>' + C.fmt(r.tncn) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.revenue) + ' × 5%</td></tr>';
        html += '<tr class="subtotal"><td>TỔNG THUẾ</td><td>' + C.fmt(r.totalTax) + '</td></tr>';
      }

    } else if (r.type === "freelancer") {
      html += '<tr><td>Doanh thu năm</td><td>' + C.fmt(r.revenue) + '</td></tr>';
      if (r.costs > 0) {
        html += '<tr class="deduction"><td>− Chi phí hợp lý</td><td>' + C.fmt(r.costs) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">Giảm chi phí thực tế liên quan đến công việc</td></tr>';
      }
      html += '<tr class="deduction"><td>− Giảm trừ bản thân</td><td>' + C.fmt(R.getPersonalDeduction().yearly) + '</td></tr>';
      html += '<tr class="formula-row"><td colspan="2">' + R.getPersonalDeduction().monthly.toLocaleString("vi-VN") + 'đ × 12 tháng</td></tr>';
      html += '<tr class="formula-row"><td colspan="2">KHÔNG trừ NPT (hợp đồng dịch vụ → thu nhập khác)</td></tr>';
      html += '<tr class="subtotal"><td>Thu nhập tính thuế</td><td>' + C.fmt(r.taxableIncome) + '</td></tr>';
      html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.revenue) + ' − ' + C.fmt(r.costs || 0) + ' − ' + C.fmt(R.getPersonalDeduction().yearly) + '</td></tr>';
      if (r.breakdown) {
        r.breakdown.forEach(function (b) {
          html += '<tr><td>' + b.label + ' (' + C.fmtPct(b.rate) + ')</td><td>' + C.fmt(b.tax) + '</td></tr>';
          if (b.formula) html += '<tr class="formula-row"><td colspan="2">' + b.formula + '</td></tr>';
        });
      }
      html += '<tr class="subtotal"><td>TỔNG THUẾ</td><td>' + C.fmt(r.totalTax) + '</td></tr>';

    } else if (r.type === "foreign_contractor") {
      if (r.subType === "salary") {
        // NCNN cư trú + HĐLĐ → lũy tiến
        html += '<tr><td>Thu nhập gross/tháng</td><td>' + C.fmt(r.grossRevenue) + '</td></tr>';
        html += '<tr class="deduction"><td>− Giảm trừ bản thân</td><td>' + C.fmt(R.getPersonalDeduction().monthly) + '/tháng</td></tr>';
        html += '<tr><td>Thu nhập tính thuế/năm</td><td>' + C.fmt(r.taxableIncome) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.annualRevenue) + ' − GTGC − NPT</td></tr>';
        if (r.breakdown) {
          r.breakdown.forEach(function (b) {
            html += '<tr><td>' + b.label + ' (' + C.fmtPct(b.rate) + ')</td><td>' + C.fmt(b.tax) + '</td></tr>';
            if (b.formula) html += '<tr class="formula-row"><td colspan="2">' + b.formula + '</td></tr>';
          });
        }
        html += '<tr class="subtotal"><td>Thuế TNCN/tháng</td><td>' + C.fmt(r.monthlyTax) + '</td></tr>';
        html += '<tr><td>GTGT 5%/tháng</td><td>' + C.fmt(r.gtgt) + '</td></tr>';
        html += '<tr class="subtotal"><td>TỔNG THUẾ/tháng</td><td>' + C.fmt(r.totalTax) + '</td></tr>';

      } else if (r.subType === "non_resident") {
        // NC không cư trú → 20% + 5%
        html += '<tr><td>Thu nhập gross</td><td>' + C.fmt(r.grossRevenue) + '</td></tr>';
        html += '<tr><td>TNDN (20% × gross)</td><td>' + C.fmt(r.tndn) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.grossRevenue) + ' × 20%</td></tr>';
        html += '<tr><td>GTGT (5% × gross)</td><td>' + C.fmt(r.gtgt) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.grossRevenue) + ' × 5%</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">⚠️ KHÔNG giảm trừ — NC không cư trú</td></tr>';
        html += '<tr class="subtotal"><td>TỔNG THUẾ</td><td>' + C.fmt(r.totalTax) + '</td></tr>';

      } else {
        // NC cư trú + HĐ dịch vụ → 1% + 5%
        html += '<tr><td>Doanh thu gross</td><td>' + C.fmt(r.grossRevenue) + '</td></tr>';
        html += '<tr><td>TNDN (1% × gross)</td><td>' + C.fmt(r.tndn) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.grossRevenue) + ' × 1%</td></tr>';
        html += '<tr><td>GTGT (5% × gross)</td><td>' + C.fmt(r.gtgt) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.grossRevenue) + ' × 5%</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">NC cư trú + HĐ dịch vụ → không giảm trừ</td></tr>';
        html += '<tr class="subtotal"><td>TỔNG THUẾ</td><td>' + C.fmt(r.totalTax) + '</td></tr>';
      }

    } else {
      html += '<tr><td>Thu nhập</td><td>' + C.fmt(r.revenue) + '</td></tr>';
      html += '<tr><td>Loại</td><td>' + (r.label || '') + '</td></tr>';
      if (r.totalTax > 0) {
        html += '<tr><td>Thuế</td><td>' + C.fmt(r.totalTax) + '</td></tr>';
        html += '<tr class="formula-row"><td colspan="2">' + C.fmt(r.revenue) + ' × tỷ lệ theo loại thu nhập</td></tr>';
      } else {
        html += '<tr class="formula-row"><td colspan="2">✅ MIỄN THUẾ</td></tr>';
      }
      html += '<tr class="subtotal"><td>TỔNG THUẾ</td><td>' + C.fmt(r.totalTax) + '</td></tr>';
    }

    html += '</table>';
    return html;
  }

  function renderCalendar(results) {
    var html = '<h3 style="font-size:16px;font-weight:700;color:var(--calc-primary);margin:0 0 12px;">📅 Lịch nộp thuế 2026</h3>';

    var deadlines = F.DEADLINES_2026;
    var now = new Date();

    deadlines.forEach(function (d) {
      var deadlineDate = new Date(d.date);
      var diffDays = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      var dotClass = diffDays < 0 ? "red" : diffDays < 30 ? "yellow" : "green";
      var timeLabel = diffDays < 0 ? "ĐÃ HẾT HẠN" :
                      diffDays === 0 ? "HÔM NAY" :
                      "Còn " + diffDays + " ngày";

      html += '<div class="calc-calendar-item">';
      html += '<span class="calc-calendar-dot ' + dotClass + '"></span>';
      html += '<div class="calc-calendar-text">';
      html += '<strong>' + d.label + '</strong>';
      html += '<br><span style="font-size:12px;color:var(--calc-muted);">' + d.date + ' — ' + timeLabel + '</span>';
      html += '</div>';
      html += '</div>';
    });

    return html;
  }

  // ================================================================
  // RESULT TABS
  // ================================================================

  function bindResultTabs() {
    document.querySelectorAll(".calc-result-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = this.getAttribute("data-tab");
        document.querySelectorAll(".calc-result-tab").forEach(function (t) { t.classList.remove("active"); });
        document.querySelectorAll(".calc-result-panel").forEach(function (p) { p.classList.remove("active"); });
        this.classList.add("active");
        document.querySelector('[data-panel="' + target + '"]').classList.add("active");
      });
    });
  }

  // ================================================================
  // CONFETTI
  // ================================================================

  var confettiTimeouts = [];

  function showConfetti() {
    // Clear previous confetti to prevent stacking
    confettiTimeouts.forEach(function (t) { clearTimeout(t); });
    confettiTimeouts = [];
    document.querySelectorAll(".calc-confetti").forEach(function (el) { el.remove(); });

    var colors = ["#800020", "#d4af37", "#2d8a4e", "#2563eb", "#f59e0b"];
    for (var i = 0; i < 30; i++) {
      (function (idx) {
        var t = setTimeout(function () {
          var el = document.createElement("div");
          el.className = "calc-confetti";
          el.style.left = Math.random() * 100 + "vw";
          el.style.top = "80vh";
          el.style.background = colors[idx % colors.length];
          el.style.animationDuration = (1 + Math.random()) + "s";
          document.body.appendChild(el);
          var t2 = setTimeout(function () { el.remove(); }, 2000);
          confettiTimeouts.push(t2);
        }, idx * 30);
        confettiTimeouts.push(t);
      })(i);
    }
  }

  // ================================================================
  // HELPERS
  // ================================================================

  function parseNumber(str) {
    if (!str) return 0;
    return parseInt(String(str).replace(/[^\d]/g, ""), 10) || 0;
  }

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }

  function isChecked(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  // ── Shareable Link ──
  function encodeToHash() {
    var parts = ["v=1"];
    state.selectedSources.forEach(function (s) {
      if (s === "salary") {
        parts.push("s=" + parseNumber(getVal("salary-input")));
        parts.push("bhxh=" + (isChecked("bhxh-toggle") ? 1 : 0));
        parts.push("uni=" + (isChecked("union-toggle") ? 1 : 0));
      } else if (s === "hkd") {
        parts.push("hr=" + parseNumber(getVal("hkd-revenue-input")));
        parts.push("hb=" + getVal("hkd-biz-type"));
        parts.push("hc=" + parseNumber(getVal("hkd-costs-input")));
      } else if (s === "rental") {
        parts.push("rr=" + parseNumber(getVal("rental-revenue-input")));
      } else if (s === "freelancer") {
        parts.push("fr=" + parseNumber(getVal("freelancer-revenue-input")));
        parts.push("fc=" + parseNumber(getVal("freelancer-costs-input")));
      } else if (s === "corporate") {
        parts.push("cr=" + parseNumber(getVal("corp-revenue-input")));
        parts.push("ct=" + parseNumber(getVal("corp-taxable-input")));
      } else if (s === "foreign") {
        parts.push("fg=" + parseNumber(getVal("foreign-revenue-input")));
      } else if (s === "investment") {
        parts.push("it=" + getVal("invest-type"));
        parts.push("ia=" + parseNumber(getVal("invest-amount-input")));
      }
    });
    parts.push("dep=" + (parseNumber(getVal("npt-shared")) || parseNumber(getVal("npt-shared")) || parseNumber(getVal("npt-shared")) || 0));
    return "#!" + parts.join("&");
  }

  function restoreFromHash() {
    var hash = window.location.hash;
    if (!hash || hash.indexOf("#!") !== 0) return;
    var params = {};
    hash.substring(2).split("&").forEach(function (p) {
      var kv = p.split("=");
      if (kv.length === 2) params[kv[0]] = kv[1];
    });
    if (!params.v) return;

    // Detect sources from params
    var sources = [];
    if (params.s) sources.push("salary");
    if (params.hr) sources.push("hkd");
    if (params.rr) sources.push("rental");
    if (params.fr) sources.push("freelancer");
    if (params.cr) sources.push("corporate");
    if (params.fg) sources.push("foreign");
    if (params.ia) sources.push("investment");
    if (sources.length === 0) return;

    // Select sources
    sources.forEach(function (s) { state.selectedSources.push(s); });
    state.dependents = parseInt(params.dep, 10) || 0;
    updateSourceUI();

    // Go to step 2 to render forms
    goToStep(2);

    // Wait for DOM, then fill values
    setTimeout(function () {
      if (params.s) {
        setVal("salary-input", params.s);
        setChecked("bhxh-toggle", params.bhxh !== "0");
        setChecked("union-toggle", params.uni !== "0");
      }
      if (params.hr) {
        setVal("hkd-revenue-input", params.hr);
        if (params.hb) setSelect("hkd-biz-type", params.hb);
        if (params.hc) setVal("hkd-costs-input", params.hc);
      }
      if (params.rr) setVal("rental-revenue-input", params.rr);
      if (params.fr) {
        setVal("freelancer-revenue-input", params.fr);
        if (params.fc) setVal("freelancer-costs-input", params.fc);
      }
      if (params.cr) {
        setVal("corp-revenue-input", params.cr);
        if (params.ct) setVal("corp-taxable-input", params.ct);
      }
      if (params.fg) setVal("foreign-revenue-input", params.fg);
      if (params.ia) {
        setVal("invest-amount-input", params.ia);
        if (params.it) setSelect("invest-type", params.it);
      }
      if (parseInt(params.dep, 10) > 0) {
        var depEl = document.getElementById("npt-shared") || document.getElementById("npt-shared") || document.getElementById("npt-shared");
        if (depEl) depEl.value = params.dep;
      }
      // Auto-calculate
      calculateAll();
    }, 200);
  }

  function setVal(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = Number(val).toLocaleString("vi-VN");
    el.dispatchEvent(new Event("input"));
  }

  function setChecked(id, checked) {
    var el = document.getElementById(id);
    if (el) el.checked = checked;
  }

  function setSelect(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val;
  }

  function findSource(id) {
    for (var i = 0; i < F.INCOME_SOURCES.length; i++) {
      if (F.INCOME_SOURCES[i].id === id) return F.INCOME_SOURCES[i];
    }
    return null;
  }

  function getSourceIcon(type) {
    var map = { salary: "👤", hkd: "🏪", rental: "🏠", freelancer: "💻", corporate: "🏢", foreign: "🌏", investment: "💰" };
    return map[type] || "📋";
  }

  function getSourceLabel(type) {
    var src = findSource(type);
    return src ? src.label : type;
  }

  // ================================================================
  // EVENT BINDINGS
  // ================================================================

  function bindEvents() {
    // Source card clicks — thêm instance mới mỗi lần click
    dom.sourceGrid.addEventListener("click", function (e) {
      var card = e.target.closest(".calc-source-card");
      if (card) toggleSource(card.getAttribute("data-source"));
    });

    // Remove source button (in step 2)
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".calc-source-remove");
      if (btn) {
        e.stopPropagation();
        removeSource(btn.getAttribute("data-key"));
      }
      // Add source button (in step 2)
      var addBtn = e.target.closest(".calc-add-btn");
      if (addBtn) {
        e.stopPropagation();
        addSourceInstance(addBtn.getAttribute("data-add-source"));
      }
    });

    // Navigation
    dom.btnToStep2.addEventListener("click", function () { goToStep(2); });
    dom.btnBackStep1.addEventListener("click", function () { goToStep(1); });
    dom.btnCalculate.addEventListener("click", function () { calculateAll(); });
    dom.btnCalcAgain.addEventListener("click", function () {
      state.selectedSources = [];
      updateSourceUI();
      goToStep(1);
    });
    dom.btnShare.addEventListener("click", function () {
      var hash = encodeToHash();
      var shareUrl = window.location.origin + "/tinh-thue" + hash;
      var total = dom.resultContainer.querySelector(".calc-result-total")?.textContent || "";
      var text = "Kết quả tính thuế TADA: " + total + "\n" + shareUrl;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          dom.btnShare.textContent = "✅ Đã copy link!";
          window.history.replaceState(null, "", hash);
          setTimeout(function () { dom.btnShare.textContent = "📤 Chia sẻ kết quả"; }, 2000);
        });
      }
    });
  }

  // ================================================================
  // START
  // ================================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
