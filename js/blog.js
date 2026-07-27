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

  function renderList(grid) {
    grid.innerHTML = '<div class="blog-loading">Đang tải bài viết...</div>';

    fetch(API + '/api/blog?limit=20')
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
      })
      .catch(function (err) {
        grid.innerHTML = '<div class="blog-error">Không thể tải bài viết: ' + escHtml(err.message) + '</div>';
      });
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
