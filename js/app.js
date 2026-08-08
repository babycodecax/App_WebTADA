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

  // 3. Services — render động 2 nhóm dịch vụ từ /api/services.
  //    Fallback: dữ liệu tĩnh nhúng sẵn nếu API lỗi/trống (trang vẫn hiển thị đầy đủ cho SEO).
  var FALLBACK_SERVICES = [
    {
      name: 'Hộ kinh doanh & Doanh nghiệp',
      emoji: '🏠',
      items: [
        { name: 'Kế toán dịch vụ trọn gói',
          description: 'Thay mặt doanh nghiệp xử lý toàn bộ các công việc kế toán phát sinh hàng tháng, báo cáo cơ quan thuế định kỳ.',
          features: ['Nhận, phân loại chứng từ hóa đơn', 'Ghi chép sổ sách kế toán trên phần mềm', 'Đóng vai trò kế toán trưởng làm việc với thuế'] },
        { name: 'Thành lập & Giải thể Doanh nghiệp',
          description: 'Hỗ trợ trọn gói các thủ tục pháp lý thành lập công ty mới hoặc thực hiện quy trình giải thể doanh nghiệp đúng luật, nhanh gọn.',
          features: ['Soạn thảo hồ sơ đăng ký kinh doanh', 'Thay mặt doanh nghiệp nộp Sở KH&ĐT', 'Thủ tục giải thể, quyết toán thuế'] },
        { name: 'Kê khai thuế TNCN / GTGT',
          description: 'Thực hiện lập tờ khai, kiểm tra số liệu thuế Thu nhập cá nhân và Thuế Giá trị gia tăng định kỳ (tháng/quý) chính xác.',
          features: ['Kê khai báo cáo thuế GTGT đầu ra, đầu vào', 'Khai thuế TNCN cho người lao động', 'Hạn chế tối đa sai sót và chậm trễ nộp tờ khai'] },
        { name: 'Đăng ký HKD & Hóa đơn điện tử',
          description: 'Trọn gói đăng ký hộ kinh doanh cá thể, thiết lập hệ thống sổ sách và đăng ký sử dụng hóa đơn điện tử lần đầu.',
          features: ['Đăng ký giấy phép Hộ kinh doanh', 'Khởi tạo và đăng ký hóa đơn điện tử', 'Hướng dẫn sử dụng chi tiết, đúng luật'] },
        { name: 'Kiểm toán & Lập BCTC, Fix lỗi Thuế',
          description: 'Kiểm tra toàn bộ hệ thống sổ sách, lập báo cáo tài chính cuối năm và thực hiện sửa lỗi dữ liệu thuế lịch sử.',
          features: ['Soát xét sổ sách kế toán nhiều năm', 'Khắc phục, điều chỉnh tờ khai sai sót', 'Hỗ trợ lên BCTC chuyên nghiệp chuẩn mực'] },
        { name: 'Kê khai Bảo hiểm xã hội',
          description: 'Thực hiện các thủ tục khai báo bảo hiểm, đăng ký tăng giảm lao động và giải quyết các chế độ BHXH định kỳ cho doanh nghiệp.',
          features: ['Báo tăng, giảm lao động tham gia BHXH', 'Giải quyết các chế độ thai sản, ốm đau', 'Hồ sơ cấp thẻ BHYT nhanh chóng'] }
      ]
    },
    {
      name: 'Cá nhân/Người lao động',
      emoji: '🌟',
      items: [
        { name: 'Hoàn thuế TNCN',
          description: 'Hỗ trợ người nộp thuế lập hồ sơ quyết toán và xin hoàn lại số thuế TNCN nộp thừa một cách nhanh nhất, đúng quy định.',
          features: ['Kiểm tra chứng từ khấu trừ thuế', 'Lập tờ khai quyết toán thuế TNCN điện tử', 'Theo dõi tiến độ hồ sơ cho đến khi nhận tiền'] },
        { name: 'Giải quyết BHXH thất nghiệp',
          description: 'Tư vấn hồ sơ và quy trình hưởng trợ cấp thất nghiệp của bảo hiểm xã hội, hỗ trợ chuẩn bị hồ sơ đầy đủ.',
          features: ['Kiểm tra quá trình đóng và chốt sổ BHXH', 'Hướng dẫn quy trình nộp hồ sơ online/offline', 'Giải quyết các trường hợp vướng mắc'] },
        { name: 'Thay đổi thông tin cá nhân (CCCD, địa chỉ, SĐT)',
          description: 'Cập nhật thông tin CCCD mới, số điện thoại hoặc địa chỉ liên lạc với Cơ quan thuế và Bảo hiểm xã hội.',
          features: ['Điều chỉnh mã số thuế theo CCCD mới', 'Cập nhật thông tin ứng dụng VssID', 'Hồ sơ đồng bộ dữ liệu cá nhân liên quan'] }
      ]
    }
  ];

  // Escape HTML để render dữ liệu từ DB an toàn (chặn XSS qua tên/mô tả).
  function escHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function renderServices(groups) {
    var content = document.getElementById('services-content');
    if (!content) return;
    content.innerHTML = '';

    (groups || []).forEach(function (group) {
      var wrap = document.createElement('div');
      wrap.className = 'services-group';

      var heading = document.createElement('h2');
      heading.className = 'services-group-title';
      heading.textContent = (group.emoji ? group.emoji + ' ' : '') + group.name;

      var list = document.createElement('div');
      list.className = 'services-group-list';

      (group.items || []).forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'service-card';

        var body = document.createElement('div');
        body.className = 'service-card-body';

        var title = document.createElement('h3');
        title.className = 'service-title';
        title.textContent = item.name || '';

        var desc = document.createElement('p');
        desc.className = 'service-desc';
        desc.textContent = item.description || '';

        body.appendChild(title);
        body.appendChild(desc);

        if (Array.isArray(item.features) && item.features.length) {
          var ul = document.createElement('ul');
          ul.className = 'service-features-list';
          item.features.forEach(function (feat) {
            var li = document.createElement('li');
            li.className = 'service-feat-item';
            var bullet = document.createElement('span');
            bullet.className = 'service-feat-bullet';
            bullet.textContent = '✦';
            li.appendChild(bullet);
            li.appendChild(document.createTextNode(String(feat)));
            ul.appendChild(li);
          });
          body.appendChild(ul);
        }

        card.appendChild(body);
        list.appendChild(card);
      });

      wrap.appendChild(heading);
      wrap.appendChild(list);
      content.appendChild(wrap);
    });
  }

  function loadServices() {
    var API = window.LOCAL_API ? window.LOCAL_API : '';  // '' = same-origin proxy
    fetch(API + '/api/services')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var groups = (data && data.groups && data.groups.length) ? data.groups : null;
        if (!groups) throw new Error('empty');
        renderServices(groups);
      })
      .catch(function () {
        // API lỗi/trống → fallback dữ liệu tĩnh
        renderServices(FALLBACK_SERVICES);
      });
  }

  loadServices();
});