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

  // Link nhóm Zalo (zalo.me/g/...) — KHÔNG CHẶN click mặc định.
  // Zalo server trả 302 → zalo://qr/g/{code} khi truy cập từ mobile,
  // trình duyệt mobile tự chuyển tới app Zalo và mở ĐÚNG nhóm.
  // Vì vậy để trình duyệt xử lý tự nhiên, khỏi preventDefault.
  // Chỉ thêm fallback hướng dẫn nếu sau vài giây page vẫn hiển thị
  // (tức app chưa được mở).
  var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) {
    document.querySelectorAll('a[href*="zalo.me/g/"]').forEach(function (link) {
      link.addEventListener('click', function () {
        // Không preventDefault — để trình duyệt tự xử lý redirect zalo://qr/...

        // Kiểm tra sau 2.5s: nếu page vẫn hiển thị (app không mở)
        // → hiển thị hướng dẫn mở app / tìm nhóm
        var hiddenBefore = document.hidden || document.visibilityState === 'hidden';
        setTimeout(function () {
          var hiddenNow = document.hidden || document.visibilityState === 'hidden';
          if (hiddenNow === hiddenBefore) {
            showZaloGuide();
          }
        }, 2500);
      });
    });
  }

  // Hướng dẫn mở nhóm Zalo trên điện thoại — thay alert bằng dialog đẹp hơn
  function showZaloGuide() {
    // Tạo overlay thông báo (tránh alert gây khó chịu)
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;padding:28px 24px;max-width:340px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.25);';
    box.innerHTML =
      '<div style="font-size:42px;margin-bottom:8px;">💬</div>' +
      '<h3 style="margin:0 0 10px;font-size:18px;color:#1f2937;">Nhóm Zalo TADA</h3>' +
      '<p style="margin:0 0 6px;font-size:14px;color:#6b7280;line-height:1.6;">Nhóm chỉ mở được trong <b>ứng dụng Zalo</b>.</p>' +
      '<p style="margin:0 0 18px;font-size:13px;color:#9ca3af;text-align:left;line-height:1.7;">👉 Nếu app Zalo chưa mở: hãy mở <b>Zalo</b> rồi tìm nhóm <b>"TADA Dịch Vụ Thuế Kế Toán"</b>.<br>👉 Hoặc gọi Zalo <b>0986.4242.86</b> để được mời vào nhóm.</p>' +
      '<button id="zalo-guide-close" style="background:#0b5fff;color:#fff;border:0;border-radius:10px;padding:12px 32px;font-size:15px;font-weight:600;cursor:pointer;">Đã hiểu</button>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('#zalo-guide-close').addEventListener('click', function () {
      overlay.remove();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  // 2. Services Tab Switcher
  var tabButtons = document.querySelectorAll('.tab-btn');
  var tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      tabButtons.forEach(function (btn) { btn.classList.remove('active'); });
      tabPanels.forEach(function (panel) { panel.classList.remove('active'); });

      button.classList.add('active');
      var tabId = button.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // 3. FAQ Accordion
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

  // 4. Marquee — clone cards for seamless R→L scroll
  (function () {
    var tracks = document.querySelectorAll('[data-marquee], [data-marquee-testimonial], [data-marquee-stats]');
    tracks.forEach(function (track) {
      var cards = Array.from(track.children);
      cards.forEach(function (c) { track.appendChild(c.cloneNode(true)); });
    });

    /* Pause hover */
    document.querySelectorAll('.marquee-container').forEach(function (c) {
      c.addEventListener('mouseenter', function () {
        var t = c.querySelector('.marquee-track');
        if (t) t.style.animationPlayState = 'paused';
      });
      c.addEventListener('mouseleave', function () {
        var t = c.querySelector('.marquee-track');
        if (t) t.style.animationPlayState = 'running';
      });
    });

    /* Pause 2s on touch */
    tracks.forEach(function (track) {
      var timer = null;
      track.addEventListener('touchstart', function () {
        clearTimeout(timer);
        track.style.animationPlayState = 'paused';
      }, { passive: true });
      track.addEventListener('touchend', function () {
        timer = setTimeout(function () { track.style.animationPlayState = 'running'; }, 2000);
      }, { passive: true });
    });

    /* Reset animation on tab switch */
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(function () {
          tracks.forEach(function (t) {
            t.style.animation = 'none';
            void t.offsetHeight;
            t.style.animation = '';
          });
        }, 60);
      });
    });
  })();
});
