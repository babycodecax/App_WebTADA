/* Blog — list + detail view */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';  // '' = same-origin proxy

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

  // === Detect if this is detail page (has query param ?slug=xxx) ===
  function init() {
    var params = new URLSearchParams(window.location.search);
    var slug = params.get('slug');
    var grid = document.getElementById('blog-grid');

    if (!grid) return;

    if (slug) {
      renderDetail(slug, grid);
    } else {
      renderList(grid);
    }
  }

  /** Tìm bài viết liên quan: matching keyword từ title */
  function findRelated(currentSlug, currentTitle, allPosts, maxCount) {
    if (maxCount === undefined) maxCount = 4;
    // Extract meaningful keywords (≥ 5 ký tự) từ title hiện tại
    var keywords = (currentTitle || '').toLowerCase().split(/[\s,.\-:;!?()]+/).filter(function (w) {
      return w.length >= 5 && !['của', 'trong', 'với', 'cho', 'năm', 'các', 'có', 'theo', 'tại', 'từ', 'để', 'khi', 'nào', 'bao', 'nhiêu', 'làm', 'sao', 'thế', 'này', 'như', 'về', 'còn', 'đã', 'sẽ', 'đang', 'bị', 'không', 'những', 'một', 'ngày', 'tháng', 'đó', 'thì'].includes(w);
    });

    // Score each post by keyword matches in title + summary
    var scored = [];
    allPosts.forEach(function (p) {
      if (p.slug === currentSlug) return;
      var text = ((p.title || '') + ' ' + (p.summary || '')).toLowerCase();
      var score = 0;
      keywords.forEach(function (kw) {
        if (text.includes(kw)) score++;
      });
      if (score > 0) scored.push({ post: p, score: score });
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, maxCount).map(function (s) { return s.post; });
  }

  /** Render danh sách bài viết liên quan */
  function renderRelatedPosts(related, container) {
    if (!related || related.length === 0) return;
    var html = '<div class="blog-related"><h3>📖 Bài viết liên quan</h3><div class="blog-related-grid">';
    related.forEach(function (p) {
      html +=
        '<a href="?slug=' + encodeURIComponent(p.slug) + '" class="blog-related-card">' +
          '<h4>' + escHtml(p.title) + '</h4>' +
          (p.summary ? '<p>' + escHtml(p.summary.slice(0, 100)) + '</p>' : '') +
        '</a>';
    });
    html += '</div></div>';
    container.insertAdjacentHTML('beforeend', html);
  }

  function renderList(grid) {
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
        posts.forEach(function (p) {
          var card = document.createElement('a');
          card.className = 'blog-card';
          card.href = '?slug=' + encodeURIComponent(p.slug);
          card.innerHTML =
            '<h2 class="blog-card-title">' + escHtml(p.title) + '</h2>' +
            '<p class="blog-card-summary">' + escHtml(p.summary || '') + '</p>' +
            '<div class="blog-card-meta">' +
              '<span>' + formatDate(p.published_at) + '</span>' +
            '</div>' +
            '<span class="blog-card-link">Đọc tiếp →</span>';
          grid.appendChild(card);
        });

        // JSON-LD ItemList để Google hiểu cấu trúc danh sách bài
        injectItemListSchema(posts);
      })
      .catch(function (err) {
        grid.innerHTML = '<div class="blog-error">Không thể tải bài viết: ' + escHtml(err.message) + '</div>';
      });
  }

  /** Inject JSON-LD ItemList — Google đọc cấu trúc danh sách bài viết. */
  function injectItemListSchema(posts) {
    try {
      var items = (posts || []).slice(0, 100).map(function (p, i) {
        return {
          '@type': 'ListItem',
          position: i + 1,
          name: p.title,
          url: 'https://api-nu-drab.vercel.app/blog?slug=' + encodeURIComponent(p.slug)
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
        var contentHtml = renderMarkdown(post.content || '');
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

        // B�i vi?t li�n quan
        fetch(API + '/api/blog?limit=999')
          .then(function (r) { return r.json(); })
          .then(function (allPosts) {
            var related = findRelated(post.slug, post.title, allPosts);
            var articleEl = container.querySelector('.blog-detail');
            if (articleEl && related.length > 0) {
              renderRelatedPosts(related, container);
            }
          })
          .catch(function () { /* silent */ });
      })
      .catch(function (err) {
        // Xóa wrap class khi lỗi
        if (parentContainer) parentContainer.classList.remove('blog-detail-wrap');
        container.innerHTML =
          '<div class="blog-error">' + escHtml(err.message) + '</div>' +
          '<div style="text-align:center;margin-top:20px"><a href="/blog" class="btn btn-primary">← Quay lại danh sách</a></div>';
      });
  }

  function renderMarkdown(md) {
    if (typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true });
      return marked.parse(md || '');
    }
    // fallback: simple line breaks
    return (md || '').replace(/\n/g, '<br>');
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
