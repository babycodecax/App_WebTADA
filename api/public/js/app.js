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
