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

    document.querySelectorAll('.nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
      });
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
