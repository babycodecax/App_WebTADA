/* ==========================================================================
   INTERACTION LOGIC - WEBSITE DỊCH VỤ THUẾ & KẾ TOÁN
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // 1. Sticky Header & Active Scroll
  var header = document.getElementById('header');
  window.addEventListener('scroll', function () {
    header.classList.toggle('scrolled', window.scrollY > 50);
  });

  // Mobile Menu Toggle
  var navToggle = document.getElementById('nav-toggle');
  var navMenu = document.getElementById('nav-menu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function () {
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
    });

    // Lưu ý: .dropdown-trigger cũng có class .nav-link — loại trừ nó khỏi
    // listener đóng menu, nếu không click trigger sẽ tự đóng navMenu ngay.
    document.querySelectorAll('.nav-link:not(.dropdown-trigger)').forEach(function (link) {
      link.addEventListener('click', function () {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });
  }

  // Dropdown "Kênh nền tảng" — hover chỉ hoạt động desktop,
  // mobile/touch cần click để mở menu (toggle class .active)
  var dropdown = document.querySelector('.nav-dropdown');
  var dropdownTrigger = document.querySelector('.dropdown-trigger');
  if (dropdown && dropdownTrigger) {
    dropdownTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      // stopImmediatePropagation: chặn cả listener .nav-link còn lại
      // (đóng menu) — không được để trigger tự đóng navMenu.
      e.stopImmediatePropagation();
      dropdown.classList.toggle('active');
    });

    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nav-dropdown')) {
        dropdown.classList.remove('active');
      }
    });

    // Đóng dropdown sau khi click 1 mục bên trong
    dropdown.querySelectorAll('.dropdown-item').forEach(function (item) {
      item.addEventListener('click', function () {
        dropdown.classList.remove('active');
      });
    });
  }

  // Link nhóm Zalo (zalo.me/g/{code}) — xử lý riêng trên mobile
  // để MỞ APP Zalo thay vì mở tab web (Zalo không hiển thị group trên web).
  //
  // Cách hoạt động:
  // - Desktop: giữ href + target="_blank" mặc định (mở trang Zalo bình thường).
  // - Mobile: khi chạm, chuyển hướng ngay trong TAB HIỆN TẠI (không mở popup)
  //   tới deep link đúng nền tảng mà Zalo tự trả khi redirect mobile:
  //     + iOS/other: zalo://qr/g/{code}
  //     + Android:   intent://zalo.me/g/{code}#Intent;scheme=https;...
  //   Bằng cách KHÔNG dùng popup, trình duyệt được phép mở scheme custom
  //   → app Zalo khởi động và vào đúng nhóm.
  //   Nếu app không mở được (chưa cài), sau ~900ms fallback mở trang web.
  var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) {
    document.querySelectorAll('a[href*="zalo.me/g/"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();

        var href = link.getAttribute('href');          // https://zalo.me/g/{code}
        var code = href.split('/g/')[1];               // {code}
        var isAndroid = /Android/i.test(navigator.userAgent);

        // Deep link đúng theo redirect Zalo
        var deepUrl;
        if (isAndroid) {
          deepUrl = 'intent://zalo.me/g/' + code +
                    '#Intent;scheme=https;package=com.zing.zalo;' +
                    'S.browser_fallback_url=' + encodeURIComponent(href) + ';end';
        } else {
          // iOS & others: chính là scheme Zalo trả redirect tới
          deepUrl = 'zalo://qr/g/' + code;
        }

        // Trạng thái trước khi chuyển
        var hiddenBefore = document.hidden || document.visibilityState === 'hidden';

        // Chuyển hướng trong tab hiện tại → mở app
        try { window.location.href = deepUrl; } catch (err) {}

        // Fallback: sau 900ms nếu app chưa mở (page vẫn visible) → mở trang web
        setTimeout(function () {
          var hiddenNow = document.hidden || document.visibilityState === 'hidden';
          if (hiddenNow === hiddenBefore) {
            window.location.href = href;
          }
        }, 900);
      });
    });
  }

  // 2. FAQ Accordion
  var faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(function (item) {
    var faqHeader = item.querySelector('.faq-header');
    faqHeader.addEventListener('click', function () {
      var isActive = item.classList.contains('active');
      faqItems.forEach(function (f) { f.classList.remove('active'); });
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });

  // 3. Services — hiển thị 1 khối văn bản nối tiếp (mỗi dòng 1 dịch vụ) từ /api/services.
  //    Fallback: văn bản tĩnh nhúng sẵn nếu API lỗi/trống (trang vẫn hiển thị đầy đủ cho SEO).
  var FALLBACK_CONTENT =
    '🏠 Kế toán dịch vụ trọn gói\n' +
    '🏠 Thành lập & Giải thể Doanh nghiệp\n' +
    '🏠 Kê khai thuế TNCN / GTGT\n' +
    '🏠 Đăng ký HKD & Hóa đơn điện tử\n' +
    '🏠 Kiểm toán & Lập BCTC, Fix lỗi Thuế\n' +
    '🏠 Kê khai Bảo hiểm xã hội\n' +
    '🌟 Hoàn thuế TNCN\n' +
    '🌟 Giải quyết BHXH thất nghiệp\n' +
    '🌟 Thay đổi thông tin cá nhân (CCCD, địa chỉ, SĐT)';

  function renderServicesContent(text) {
    var content = document.getElementById('services-content');
    if (!content) return;
    content.innerHTML = '';

    var block = document.createElement('div');
    block.className = 'services-text-block';
    block.textContent = text || '';
    content.appendChild(block);
  }

  function loadServices() {
    var API = window.LOCAL_API ? window.LOCAL_API : '';  // '' = same-origin proxy
    fetch(API + '/api/services')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var content = (data && typeof data.content === 'string' && data.content.trim()) ? data.content : null;
        if (!content) throw new Error('empty');
        renderServicesContent(content);
      })
      .catch(function () {
        // API lỗi/trống → fallback văn bản tĩnh
        renderServicesContent(FALLBACK_CONTENT);
      });
  }

  loadServices();

  // 4. Thư viện Biểu mẫu & Văn bản Luật — 2 tab, dữ liệu từ /api/library.
  //    Fallback: danh sách văn bản luật tĩnh (SEO) nếu API lỗi.
  var LEGAL_FALLBACK = [
    { title: 'Luật Quản lý thuế 2019 (sửa đổi 2025)', doc_type: 'luat' },
    { title: 'Luật Thuế TNCN 2007 (sửa đổi 2025)', doc_type: 'luat' },
    { title: 'Luật Thuế GTGT (sửa đổi 2025)', doc_type: 'luat' },
    { title: 'Nghị định 141/2026/NĐ-CP — hộ kinh doanh', doc_type: 'nd' },
    { title: 'Nghị định 253/2026/NĐ-CP — hướng dẫn thuế TNCN', doc_type: 'nd' },
    { title: 'Nghị định 254/2026/NĐ-CP — hóa đơn điện tử', doc_type: 'nd' },
    { title: 'Thông tư 87/2026/TT-BTC — thuế TNCN', doc_type: 'tt' },
    { title: 'Thông tư 20/2026/TT-BTC — quản lý thuế TNDN', doc_type: 'tt' },
    { title: 'Văn bản hợp nhất Luật Doanh nghiệp', doc_type: 'vbhn' }
  ];
  var DOC_TYPE_LABEL = {
    luat: 'Luật',
    nd: 'Nghị định',
    tt: 'Thông tư',
    nq: 'Nghị quyết',
    vbhn: 'VBHN'
  };

  function docTypeLabel(dt) {
    return DOC_TYPE_LABEL[dt] || (dt ? dt.toUpperCase() : 'Văn bản');
  }

  function escHtml(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function legalCard(item, idx) {
    var badge = docTypeLabel(item.doc_type);
    var eff = item.effective_date || item.effective_from || '';
    var meta =
      '<span>📄 ' + escHtml(badge) + '</span>' +
      (eff ? '<span>🗓 ' + escHtml(fmtDate(eff)) + '</span>' : '');
    var btn = item.file_url
      ? '<a class="library-card-btn" data-kind="legal" href="' + escHtml(item.file_url) + '"' +
        ' target="_blank" rel="noopener nofollow">⬇ Xem / Tải</a>'
      : '<span class="library-card-btn" data-kind="legal" style="cursor:default;opacity:.85">📄 Tra cứu trực tiếp</span>';
    return (
      '<article class="library-card" data-kind="legal" id="legal-item-' + idx + '">' +
        '<div class="library-card-top">' +
          '<span class="library-card-icon">⚖️</span>' +
          '<div>' +
            '<div class="library-card-badges"><span class="library-badge">' + escHtml(badge) + '</span></div>' +
            '<h3>' + escHtml(item.title || item.file_path || 'Văn bản luật') + '</h3>' +
          '</div>' +
        '</div>' +
        '<div class="library-card-meta">' + meta + '</div>' +
        btn +
      '</article>'
    );
  }

  function formCard(item, idx) {
    var size = fmtSize(item.file_size);
    var meta = '<span>📎 ' + escHtml(item.file_name || 'File tải xuống') + '</span>' +
      (size ? '<span>💾 ' + escHtml(size) + '</span>' : '');
    return (
      '<article class="library-card" data-kind="form" id="form-item-' + idx + '">' +
        '<div class="library-card-top">' +
          '<span class="library-card-icon">📄</span>' +
          '<div>' +
            '<div class="library-card-badges"><span class="library-badge">Biểu mẫu</span></div>' +
            '<h3>' + escHtml(item.name) + '</h3>' +
          '</div>' +
        '</div>' +
        (item.description ? '<p class="library-card-desc">' + escHtml(item.description) + '</p>' : '') +
        '<div class="library-card-meta">' + meta + '</div>' +
        (item.file_url
          ? '<a class="library-card-btn" href="' + escHtml(item.file_url) + '" target="_blank" rel="noopener nofollow">⬇ Tải biểu mẫu</a>'
          : '<span class="library-card-btn" style="cursor:default;opacity:.85">Chưa có file</span>') +
      '</article>'
    );
  }

  function renderLibraryGrid(container, items, cardFn) {
    if (!container) return;
    container.innerHTML = '';
    if (!items || !items.length) {
      container.innerHTML = '<div class="library-empty">Chưa có nội dung trong thư viện.</div>';
      return;
    }
    items.forEach(function (item, idx) {
      var el = document.createElement('div');
      el.innerHTML = cardFn(item, idx);
      container.appendChild(el.firstElementChild);
    });
  }

  function loadLibrary() {
    var API = window.LOCAL_API ? window.LOCAL_API : '';
    var legalGrid = document.getElementById('library-legal');
    var formsGrid = document.getElementById('library-forms');
    var countLegal = document.getElementById('library-count-legal');
    var countForms = document.getElementById('library-count-forms');
    if (!legalGrid && !formsGrid) return;

    fetch(API + '/api/library')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || (data.error && !data.forms && !data.legal_documents)) throw new Error('empty');
        var legal = Array.isArray(data.legal_documents) ? data.legal_documents : [];
        var forms = Array.isArray(data.forms) ? data.forms : [];
        if (!legal.length) legal = LEGAL_FALLBACK; // kho trống → fallback tĩnh (SEO)
        renderLibraryGrid(legalGrid, legal, legalCard);
        renderLibraryGrid(formsGrid, forms, formCard);
        if (countLegal) countLegal.textContent = String(legal.length);
        if (countForms) countForms.textContent = String(forms.length);
      })
      .catch(function () {
        renderLibraryGrid(legalGrid, LEGAL_FALLBACK, legalCard);
        renderLibraryGrid(formsGrid, [], formCard);
        if (countLegal) countLegal.textContent = String(LEGAL_FALLBACK.length);
        if (countForms) countForms.textContent = '0';
      });
  }

  // Tab chuyển đổi
  var legalGrid = document.getElementById('library-legal');
  var formsGrid = document.getElementById('library-forms');
  document.querySelectorAll('.library-tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.library-tab-btn').forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      var showLegal = btn.dataset.tab === 'legal';
      if (legalGrid) legalGrid.hidden = !showLegal;
      if (formsGrid) formsGrid.hidden = showLegal;
    });
  });

  loadLibrary();
});
