/* Blog — list + detail view */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';  // '' = same-origin proxy

  // Domain gốc — dùng cho canonical/structured data (SEO)
  var SITE_ROOT = 'https://ketoanthuetada.com';

  /** URL bài viết theo slug — chuẩn clean path /blog/:slug (SEO) */
  function postUrl(slug) {
    return '/blog/' + encodeURIComponent((slug || '').split('/').join('-'));
  }

  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { year:'numeric', month:'long', day:'numeric' });
  }

  // === Detect if this is detail page ===
  // URL chuẩn: /blog/:slug (clean path — SEO tốt hơn ?slug=). Vercel rewrite
  // /blog/:slug → blog.html, slug đọc từ pathname. Fallback: ?slug= cũ.
  function getSlugFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('slug');
    if (q) return q;
    var path = window.location.pathname || '';
    // /blog/<slug> (sau tiền tố /blog)
    var m = path.match(/^\/blog\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function init() {
    var slug = getSlugFromUrl();
    var grid = document.getElementById('blog-grid');

    if (!grid) return;

    if (slug) {
      // Ẩn H1 header danh sách khi xem chi tiết bài — chỉ còn 1 H1/trang (chuẩn Google)
      var pageHeader = document.querySelector('.blog-header');
      if (pageHeader) pageHeader.style.display = 'none';
      renderDetail(slug, grid);
    } else {
      renderList(grid);
    }
  }

  function renderList(grid) {
    // SSR: route /blog da render san rows (data-ssr) → giu nguyen, khong fetch lai (van bat reveal)
    if (grid.dataset && grid.dataset.ssr === '1' && grid.querySelector('.blog-mini-card')) {
      observeMiniReveal(grid);
      return;
    }
    grid.innerHTML = '<div class="blog-loading">Đang tải bài viết...</div>';

    fetch(API + '/api/blog?limit=999')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (posts) {
        if (!posts || !posts.length) {
          grid.innerHTML = '<div class="blog-empty">Chưa có bài viết nào.</div>';
          return;
        }
        grid.innerHTML = '';
        var isMini = grid.id === 'blog-mini-grid';
        var list = isMini ? posts.slice(0, 5) : posts;
        list.forEach(function (p, idx) {
          var card = document.createElement('a');
          card.href = postUrl(p.slug);
          if (isMini) {
            card.className = 'blog-mini-card';
            card.style.setProperty('--i', idx);
            card.innerHTML =
              '<span class="blog-mini-num" aria-hidden="true">' + ('0' + (idx + 1)).slice(-2) + '</span>' +
              '<span class="blog-mini-text">' +
                '<span class="blog-mini-title">' + escHtml(p.title) + '</span>' +
                '<span class="blog-mini-date">' + formatDate(p.published_at) + '</span>' +
              '</span>' +
              '<span class="services-arrow" aria-hidden="true">→</span>';
          } else {
            card.className = 'blog-mini-card';
            card.style.setProperty('--i', Math.min(idx, 20));
            card.innerHTML =
              '<span class="blog-mini-num" aria-hidden="true">' + ('0' + (idx + 1)).slice(-2) + '</span>' +
              '<span class="blog-mini-text">' +
                '<span class="blog-mini-title">' + escHtml(p.title) + '</span>' +
                '<span class="blog-mini-date">' + formatDate(p.published_at) + '</span>' +
              '</span>' +
              '<span class="services-arrow" aria-hidden="true">→</span>';
          }
          grid.appendChild(card);
        });
        observeMiniReveal(grid);

        // JSON-LD ItemList để Google hiểu cấu trúc danh sách bài
        injectItemListSchema(posts);
      })
      .catch(function (err) {
        grid.innerHTML = '<div class="blog-error">Không thể tải bài viết: ' + escHtml(err.message) + '</div>';
      });
  }

  /** Reveal lan luot cho blog-mini-grid (giong services-grid) — HAI CHIEU:
      vao >=.25 add inview (stagger card), roi xuong <.15 | roi khung -> remove
      de lan cuon sau chay lai tu dau (dung voi hysteresis section-bg 2026-10-30). */
  function observeMiniReveal(grid) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.intersectionRatio >= 0.25) grid.classList.add('inview');
          else if (e.intersectionRatio < 0.15 || !e.isIntersecting) grid.classList.remove('inview');
        });
      }, { threshold: [0.15, 0.25] });
      io.observe(grid);
      // Luoi an toan: hien sau 4s NEU dang trong viewport (position check)
      setTimeout(function () {
        var r = grid.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.85 && r.bottom > 0) grid.classList.add('inview');
      }, 4000);
    } else {
      grid.classList.add('inview');
    }
  }

  /** Inject JSON-LD ItemList — Google đọc cấu trúc danh sách bài viết. */
  function injectItemListSchema(posts) {
    try {
      var items = (posts || []).slice(0, 1000).map(function (p, i) {
        return {
          '@type': 'ListItem',
          position: i + 1,
          name: p.title,
          url: SITE_ROOT + '/blog/' + encodeURIComponent(p.slug)
        };
      });
      var schema = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Bài viết & Hướng dẫn Thuế Kế Toán — TADA',
        itemListElement: items
      };
      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = JSON.stringify(schema);
      document.head.appendChild(script);
    } catch (e) { /* SEO bổ sung — lỗi không chặn render */ }
  }

  function renderDetail(slug, container) {
    container.innerHTML = '<div class="blog-loading">Đang tải bài viết...</div>';

    // Thêm class wrap để loại bỏ padding container
    var parentContainer = container.closest ? container.closest('.container') : null;
    if (parentContainer) parentContainer.classList.add('blog-detail-wrap');

    fetch(API + '/api/blog?slug=' + encodeURIComponent(slug))
      .then(function (r) {
        if (r.status === 404) throw new Error('Bài viết không tồn tại');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (post) {
        // Noi dung markdown thuong mo dau bang '# tieu de' trung voi H1 tren -> cat bo
        var md = (post.content || '').replace(/^\s*#[^\n]*\n/, '');
        var contentHtml = renderMarkdown(md);
        if (parentContainer) parentContainer.classList.add('blog-detail-wrap');
        container.innerHTML =
          '<article class="blog-detail">' +
            '<a href="/blog" class="blog-detail-back">← Quay lại danh sách</a>' +
            '<h1>' + escHtml(post.title) + '</h1>' +
            '<div class="meta">' +
              'Đăng ngày ' + formatDate(post.published_at) +
              (post.author_email ? ' bởi ' + escHtml(post.author_email) : '') +
            '</div>' +
            '<div class="content">' + contentHtml + '</div>' +
          '</article>';
        document.title = post.title + ' — TADA';
        updateDetailSeo(post);
      })
      .catch(function (err) {
        // Xóa wrap class khi lỗi
        if (parentContainer) parentContainer.classList.remove('blog-detail-wrap');
        container.innerHTML =
          '<div class="blog-error">' + escHtml(err.message) + '</div>' +
          '<div style="text-align:center;margin-top:20px"><a href="/blog" class="btn btn-primary">← Quay lại danh sách</a></div>';
      });
  }

  /** Cập nhật SEO động cho trang chi tiết bài viết.
      Google Starter Guide: mỗi trang cần title, description, canonical,
      structured data riêng để index đúng nội dung. */
  function updateDetailSeo(post) {
    var slug = post.slug || '';
    var url = SITE_ROOT + '/blog/' + encodeURIComponent(slug);
    var author = post.author_email || 'Dịch Vụ Thuế Kế Toán TADA';

    // 1) Meta description (động từ summary/content)
    var desc = post.summary || '';
    if (!desc) {
      desc = (post.content || '').replace(/[#*`\-\[\]()!>|]/g, '')
        .replace(/\s+/g, ' ').trim().substring(0, 155);
    }
    setMeta('description', desc);

    // 2) Canonical — trỏ đúng URL bài viết (tránh trùng nội dung)
    setLink('canonical', url);

    // 3) Open Graph + Twitter
    setMeta('og:title', post.title + ' — TADA');
    setMeta('og:description', desc);
    setMeta('og:url', url);
    setMeta('og:type', 'article');
    setMeta('article:published_time', post.published_at || '');
    setMeta('twitter:title', post.title + ' — TADA');
    setMeta('twitter:description', desc);

    // 4) JSON-LD BlogPosting/Article — rich result cho Google
    injectBlogPostingSchema(post, url, author);

    // 5) BreadcrumbList — giúp Google hiểu vị trí trang trong cây
    injectBreadcrumbSchema(url, post.title);
  }

  function setMeta(name, content) {
    // Ưu tiên dùng meta hiện có, tạo mới nếu chưa có
    var el = document.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]');
    if (el) { el.setAttribute('content', content || ''); return; }
    var m = document.createElement('meta');
    if (name.indexOf(':') > -1) { m.setAttribute('property', name); }
    else { m.setAttribute('name', name); }
    m.setAttribute('content', content || '');
    document.head.appendChild(m);
  }

  function setLink(rel, href) {
    var el = document.querySelector('link[rel="' + rel + '"]');
    if (el) { el.setAttribute('href', href); return; }
    var l = document.createElement('link');
    l.setAttribute('rel', rel);
    l.setAttribute('href', href);
    document.head.appendChild(l);
  }

  function injectBlogPostingSchema(post, url, author) {
    try {
      var base = 'https://ketoanthuetada.com';
      // Xoá schema BlogPosting cũ nếu có (tránh trùng khi đổi bài)
      document.querySelectorAll('script[type="application/ld+json"][data-seo="blogposting"]')
        .forEach(function (s) { s.remove(); });

      // Mô tả ngắn 120-160 ký tự từ summary/content — chuẩn meta description
      var desc = post.summary || '';
      if (!desc) {
        desc = (post.content || '')
          .replace(/[#*`\-\[\]()!>|]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 155);
      }
      var publisherName = 'Dịch Vụ Thuế Kế Toán TADA';
      var logoUrl = base + '/static/img/logo.jpg';
      var schema = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: desc,
        url: url,
        datePublished: post.published_at || new Date().toISOString(),
        dateModified: post.updated_at || post.published_at || new Date().toISOString(),
        author: { '@type': 'Person', 'name': author },
        publisher: {
          '@type': 'Organization',
          'name': publisherName,
          'logo': { '@type': 'ImageObject', 'url': logoUrl }
        },
        image: logoUrl,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        '@id': url,
        inLanguage: 'vi'
      };
      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', 'blogposting');
      script.text = JSON.stringify(schema);
      document.head.appendChild(script);
    } catch (e) { /* SEO bổ sung — không chặn render */ }
  }

  /** Inject JSON-LD BreadcrumbList — chuẩn Google Starter Guide cho trang con. */
  function injectBreadcrumbSchema(url, postTitle) {
    try {
      document.querySelectorAll('script[type="application/ld+json"][data-seo="breadcrumb"]')
        .forEach(function (s) { s.remove(); });

      var schema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: SITE_ROOT + '/' },
          { '@type': 'ListItem', position: 2, name: 'Bài viết & Hướng dẫn', item: SITE_ROOT + '/blog' },
          { '@type': 'ListItem', position: 3, name: postTitle, item: url }
        ]
      };
      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', 'breadcrumb');
      script.text = JSON.stringify(schema);
      document.head.appendChild(script);
    } catch (e) { /* SEO bổ sung — không chặn render */ }
  }

  function renderMarkdown(md) {
    var html;
    if (typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true });
      html = marked.parse(md || '');
    } else {
      // fallback: simple line breaks
      html = (md || '').replace(/\n/g, '<br>');
    }
    // Chống stored XSS từ content DB: luôn lọc qua DOMPurify trước khi innerHTML
    if (typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input', 'iframe'], FORBID_ATTR: ['onerror', 'onclick', 'onload'] });
    }
    // DOMPurify mất tải → chiến lược an toàn: render thuần văn bản, không HTML
    return escHtml(md || '').replace(/\n/g, '<br>');
  }

  function escHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(s));
    return div.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
