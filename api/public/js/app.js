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

  // Dropdown menu (Kenh nen tang, Cong cu...) — hover chi hoat dong desktop,
  // mobile/touch can click de mo menu (toggle class .active)
  var dropdowns = document.querySelectorAll('.nav-dropdown');
  dropdowns.forEach(function (dropdown) {
    var dropdownTrigger = dropdown.querySelector('.dropdown-trigger');
    if (!dropdownTrigger) return;
    dropdownTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      // stopImmediatePropagation: chan ca listener .nav-link con lai
      // (dong menu) — khong duoc de trigger tu dong navMenu.
      e.stopImmediatePropagation();
      var wasActive = dropdown.classList.contains('active');
      dropdowns.forEach(function (d) { d.classList.remove('active'); });
      if (!wasActive) dropdown.classList.add('active');
    });

    // Dong dropdown sau khi click 1 muc ben trong
    dropdown.querySelectorAll('.dropdown-item').forEach(function (item) {
      item.addEventListener('click', function () {
        dropdown.classList.remove('active');
      });
    });
  });

  // Dong moi dropdown khi click ra ngoai
  if (dropdowns.length) {
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nav-dropdown')) {
        dropdowns.forEach(function (d) { d.classList.remove('active'); });
      }
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

  // 3. Services — hiển thị MỖI DÒNG 1 CARD HÀNG NGANG (giống blog-mini-card),
  //    admin nhập 1 dòng = 1 dịch vụ trong /api/services → trang chủ tự cập nhật.
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
  // Map slug bai mo ta -> bo tu khoa nhan dien (ten da chuan hoa khong dau).
  // Card khop rule nao truoc thi link bai do; khong khop -> card thuong.
  // Chiu duoc admin doi cau chu, mien la giu tu khoa chinh.
  var SERVICE_LINKS = [
    { slug: 'dich-vu-ke-toan-tron-goi', keys: ['tron', 'goi'] },
    { slug: 'dich-vu-thanh-lap-giai-the-doanh-nghiep', keys: ['thanh', 'lap'] },
    { slug: 'dich-vu-ke-khai-thue-tncn-gtgt', keys: ['ke', 'khai', 'thue'] },
    { slug: 'dich-vu-ke-khai-bao-hiem-xa-hoi', keys: ['khai', 'bao', 'hiem'] },
    { slug: 'dich-vu-dang-ky-hkd-hoa-don-dien-tu', keys: ['dang', 'ky'] },
    { slug: 'dich-vu-kiem-toan-lap-bctc-fix-loi-thue', keys: ['kiem', 'toan'] },
    { slug: 'dich-vu-hoan-thue-tncn', keys: ['hoan', 'thue'] },
    { slug: 'dich-vu-giai-quyet-bhxh-that-nghiep', keys: ['that', 'nghiep'] },
    { slug: 'dich-vu-thay-doi-thong-tin-ca-nhan', keys: ['thay', 'doi', 'thong', 'tin'] },
    { slug: 'dich-vu-tu-van-thue-ke-toan-tong-hop', keys: ['tu', 'van', 'thue'] },
    { slug: 'dich-vu-phan-mem-ke-toan-hoa-don', keys: ['phan', 'mem'] }
  ];

  function normName(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/\s+/g, ' ').trim();
  }

  function findServiceSlug(norm) {
    for (var i = 0; i < SERVICE_LINKS.length; i++) {
      var r = SERVICE_LINKS[i];
      var ok = true;
      for (var j = 0; j < r.keys.length; j++) {
        if (!new RegExp('\\b' + r.keys[j] + '\\b').test(norm)) { ok = false; break; }
      }
      if (ok) return r.slug;
    }
    return '';
  }
    var content = document.getElementById('services-content');
    if (!content) return;
    content.innerHTML = '';

    // Tách từng dòng (admin nhập mỗi dòng 1 dịch vụ) → bỏ dòng trống
    // Dong dau co the la ten dich vu tong hop (khong can ket thuc dac biet)
    var lines = (text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'services-grid';

    lines.forEach(function (line, idx) {
      // Tach emoji dau dong (neu co) de lay ten chuan -> tra map link bai mo ta.
      // Khong render icon: huong editorial chi giu so thu tu + ten (quyet dinh 2026-09-19).
      var name = line;
      var m = line.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]\s*)(.+)$/u);
      if (m) { name = m[2].trim(); }
      var slug = findServiceSlug(normName(name));

      var card = document.createElement(slug ? 'a' : 'div');
      card.className = 'services-card';
      if (slug) card.href = '/blog/' + slug;
      card.style.setProperty('--i', idx);

      // So thu tu editorial 01, 02, ... (trang tri, an voi screen reader)
      var numEl = document.createElement('span');
      numEl.className = 'services-num';
      numEl.setAttribute('aria-hidden', 'true');
      numEl.textContent = ('0' + (idx + 1)).slice(-2);
      card.appendChild(numEl);

      var nameEl = document.createElement('span');
      nameEl.className = 'services-card-name';
      nameEl.textContent = name || line;
      card.appendChild(nameEl);

      var arrowEl = document.createElement('span');
      arrowEl.className = 'services-arrow';
      arrowEl.setAttribute('aria-hidden', 'true');
      arrowEl.textContent = '→';
      card.appendChild(arrowEl);

      wrapper.appendChild(card);
    });

    content.appendChild(wrapper);

    // Reveal lan luot khi cuon toi (stagger qua --i trong CSS)
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { wrapper.classList.add('inview'); io.disconnect(); }
        });
      }, { threshold: 0.12 });
      io.observe(wrapper);
      // Luoi an toan: hien sau 4s neu IO khong kich hoat
      setTimeout(function () { wrapper.classList.add('inview'); }, 4000);
    } else {
      wrapper.classList.add('inview');
    }
  }

  function loadServices() {
    var API = window.LOCAL_API ? window.LOCAL_API : '';  // '' = same-origin proxy
    // Skeleton cho doi API — thuan hien thi, renderServicesContent se xoa khi co du lieu
    var holder = document.getElementById('services-content');
    if (holder && !holder.firstElementChild) {
      var sk = document.createElement('div');
      sk.className = 'services-skeleton';
      sk.setAttribute('aria-hidden', 'true');
      for (var k = 0; k < 6; k++) {
        var row = document.createElement('div');
        row.className = 'services-skeleton-row';
        sk.appendChild(row);
      }
      holder.appendChild(sk);
    }
    // ?_t=timestamp chống cache CDN/trình duyệt tuyệt đối — admin lưu nội dung
    // mới → F5/mở tab mới là thấy NGAY (không bao giờ lấy response cũ).
    fetch(API + '/api/services?_t=' + Date.now(), { cache: 'no-store' })
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
});
