/* van-ban-page.js — Trang toàn văn văn bản luật (/van-ban/<id>).
   SSR (route /van-ban/[id]) đã inject nội dung → chỉ cần dọn dòng loading.
   Fallback: nếu placeholder không được thay (SSR lỗi), fetch
   /api/library/legal-docs?id= và render bằng DOMPurify như modal thư viện. */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var article = document.getElementById('vanban-article');
    var loading = document.getElementById('vanban-loading');
    if (loading && loading.parentNode) loading.parentNode.removeChild(loading);

    // SSR đã inject (.vanban-head do route ghi vào) → không cần fallback
    if (article && article.querySelector('.vanban-head')) return;
    if (!article) return;

    // ==== Fallback client-side (escape text — HIGH-2 fix review) ====
    function escHtml(s) {
      var d = document.createElement('div');
      d.appendChild(document.createTextNode(String(s)));
      return d.innerHTML;
    }

    var m = window.location.pathname.match(/\/van-ban\/([^\/\?]+)/);
    var id = m ? m[1].replace(/[^a-zA-Z0-9\-_]/g, '') : '';
    if (!id) {
      article.innerHTML = '<p class="library-empty">Không tìm thấy văn bản.</p>';
      return;
    }

    fetch('/api/library/legal-docs?id=' + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error);
        var head =
          '<div class="vanban-head"><div class="vanban-meta">' +
          (d.doc_number ? '<span class="vanban-meta-item">Số hiệu: <strong>' + escHtml(d.doc_number) + '</strong></span>' : '') +
          '</div><h1 class="vanban-title">' + escHtml(d.title || 'Văn bản luật') + '</h1>' +
          (d.file_name ? '<a class="btn btn-ghost vanban-download" href="/api/library/legal-docs/download?file_name=' + encodeURIComponent(d.file_name) + '" target="_blank" rel="noopener nofollow">⬇ Tải file gốc (Word/PDF)</a>' : '') +
          '</div>';
        var hasPurify = window.DOMPurify && window.DOMPurify.sanitize;
        var body = (d.file_html && d.file_html.trim())
          ? (hasPurify ? window.DOMPurify.sanitize(d.file_html) : '')
          : '<p class="library-empty">Văn bản chưa có bản hiển thị — hãy dùng nút tải file gốc phía trên.</p>';
        if ((d.file_html && d.file_html.trim()) && !hasPurify) {
          // Không có DOMPurify (CDN lỗi/CSP) → KHÔNG chèn HTML chưa sanitize
          body = '<p class="library-empty">Không thể hiển thị nội dung an toàn — hãy <a href="/api/library/legal-docs/download?file_name=' + encodeURIComponent(d.file_name || '') + '" target="_blank" rel="noopener nofollow">tải file gốc</a> hoặc tải lại trang.</p>';
        }
        article.innerHTML = head + '<div class="vanban-body legal-doc-html">' + body + '</div>';
      })
      .catch(function () {
        article.innerHTML = '<p class="library-empty">Không tải được nội dung văn bản. Vui lòng thử lại sau.</p>';
      });
  });
})();
