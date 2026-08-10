/* Admin Quản lý nguồn tri thức — vault + upload (xem/xóa/khôi phục/tải) */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';
  var el = { list: null, origin: null, q: null };
  var allSources = [];

  // Bật GFM (bảng | cột |, gạch đầu dòng, strikethrough…) + breaks (xuống dòng
  // đơn = <br>) cho marked — thiếu cấu hình này bảng markdown bị render sai.
  if (window.marked && window.marked.setOptions) {
    window.marked.setOptions({ gfm: true, breaks: true });
  }

  // Render markdown → HTML có GFM. Bọc mỗi <table> trong khung cuộn ngang
  // (mobile không tràn, desktop giữ nguyên layout). Nếu marked chưa sẵn sàng
  // → fallback hiển thị dạng pre thuần.
  function mdHtml(content) {
    if (!window.marked || !window.marked.parse) {
      return '<pre class="source-view-pre">' + escHtml(content) + '</pre>';
    }
    var html = window.marked.parse(content);
    // Sanitize chống XSS — marked không tự lọc HTML độc hại trong nội dung.
    if (window.DOMPurify && window.DOMPurify.sanitize) {
      html = window.DOMPurify.sanitize(html);
    }
    html = html.replace(/<table[\s\S]*?<\/table>/g, function (t) {
      return '<div class="md-table-wrap">' + t + '</div>';
    });
    return '<div class="source-view-md">' + html + '</div>';
  }

  
  // Escape cho nội dung TEXT (hiển thị trong thẻ) — dùng createTextNode để an toàn ở cả text lẫn attribute (innerHTML chuyển &<>"' thành entity an toàn).
  function escHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  // Escape cho GIÁ TRỊ ATTRIBUTE (data-fp/data-title) — createTextNode + innerHTML không
  // escape dấu nháy " và ' → vỡ attribute → XSS khi title chứa dấu nháy.
  function escAttr(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ===== Tải danh sách nguồn ===== */
  function loadSources() {
    if (!el.list) return;
    el.list.innerHTML = '<div class="blog-empty">Đang tải nguồn...</div>';

    var origin = el.origin.value;
    var q = el.q.value.trim();
    var url = API + '/api/admin/sources?';
    if (origin) url += 'origin=' + encodeURIComponent(origin) + '&';
    if (q) url += 'q=' + encodeURIComponent(q) + '&';

    fetch(url, { headers: { 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') } })
      .then(function (r) {
        if (r.status === 401) throw new Error('Phiên hết hạn');
        return r.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        allSources = (data.sources || []);
        renderSources(allSources);
      })
      .catch(function (err) {
        if (/hết hạn/i.test(err.message || '')) {
          showAuthError();
          return;
        }
        el.list.innerHTML = '<div class="blog-error">Không thể tải danh sách nguồn: ' + escHtml(err.message || 'lỗi') + '</div>';
      });
  }

  function showAuthError() {
    el.list.innerHTML = '<div class="blog-error">Tài khoản của bạn không có quyền sử dụng chức năng này.</div>';
  }

  /* ===== Render bảng nguồn ===== */
  function renderSources(sources) {
    if (!sources.length) {
      el.list.innerHTML = '<div class="blog-empty">Không có nguồn nào.</div>';
      return;
    }

    var html = '<table class="sources-table"><thead><tr>' +
      '<th>STT</th><th>Tiêu đề</th><th>Loại</th><th>Số liệu</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      var originLabel = s.source_origin === 'upload' ? '📤 Upload' : '📚 Vault';
      var statusLabel = s.status === 'deleted' ? '<span class="src-status src-deleted">Đã xóa</span>'
        : s.status === 'processing' ? '<span class="src-status src-processing">Đang xử lý</span>'
        : s.status === 'error' ? '<span class="src-status src-error">Lỗi</span>'
        : '<span class="src-status src-ready">Sẵn sàng</span>';

      html += '<tr class="' + (s.status === 'deleted' ? 'src-row-deleted' : '') + '">' +
        '<td class="src-stt">' + (i + 1) + '</td>' +
        '<td><div class="src-title">' + escHtml(s.title || s.file_path) + '</div>' +
          '<div class="src-path">' + escHtml(s.file_path) + '</div></td>' +
        '<td>' + originLabel + '</td>' +
        '<td>' + (s.compliance_count || 0) + '</td>' +
        '<td>' + statusLabel + '</td>' +
        '<td>' + escHtml((s.updated_at || '').slice(0, 10)) + '</td>' +
        '<td class="src-actions">' +
          (s.status !== 'deleted'
            ? '<button type="button" class="src-btn" data-act="view" data-fp="' + escAttr(s.file_path) + '" data-title="' + escAttr(s.title || s.file_path) + '">Xem</button>' +
              '<button type="button" class="src-btn" data-act="download" data-fp="' + escAttr(s.file_path) + '" data-title="' + escAttr(s.title || s.file_path) + '">Tải</button>' +
              '<button type="button" class="src-btn src-btn-del" data-act="del" data-fp="' + escAttr(s.file_path) + '" data-title="' + escAttr(s.title || s.file_path) + '" data-origin="' + escAttr(s.source_origin || 'vault') + '">Xóa</button>'
            : '<button type="button" class="src-btn" data-act="restore" data-fp="' + escAttr(s.file_path) + '">Khôi phục</button>') +
        '</td></tr>';
    }
    html += '</tbody></table>';
    el.list.innerHTML = '<div class="sources-table-wrap">' + html + '</div>';

    // Bind thao tác
    el.list.querySelectorAll('button[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.dataset.act;
        var fp = btn.dataset.fp;
        if (act === 'view') viewSource(fp, btn.dataset.title);
        else if (act === 'download') downloadSource(fp, btn.dataset.title);
        else if (act === 'del') deleteSource(fp, btn.dataset.title, btn.dataset.origin);
        else if (act === 'restore') restoreSource(fp);
      });
    });
  }

  /* ===== Xem nội dung file word gốc (hoặc fallback chunks md) ===== */
  function viewSource(filePath, title) {
    var overlay = document.getElementById('source-view-overlay');
    var body = document.getElementById('source-view-body');
    var titleEl = document.getElementById('source-view-title');
    if (!overlay) return;
    titleEl.textContent = title || filePath;
    body.innerHTML = '<div class="blog-empty">Đang tải nội dung file word...</div>';
    overlay.style.display = 'flex';

    // Ưu tiên: đọc file word gốc từ Storage (docx route)
    fetch(API + '/api/admin/sources/docx?file_path=' + encodeURIComponent(filePath), {
      headers: { 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') }
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('Phiên hết hạn');
        return r.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        // Nếu có note (chưa có file word gốc) → fallback hiển thị chunks md
        if (data.note && !data.html) {
          body.innerHTML = '<div class="blog-empty">' + escHtml(data.note) + '</div>' +
            '<div class="src-fallback-hint">Hiển thị nội dung từ chunks đã xử lý:</div>';
          return loadContentFallback(filePath, title, body);
        }
        // HTML đầy đủ từ .docx gốc (mammoth convertToHtml — giữ bảng biểu như Word)
        if (data.html) {
          var safeHtml = window.DOMPurify && window.DOMPurify.sanitize ? window.DOMPurify.sanitize(data.html) : data.html;
          body.innerHTML = '<div class="legal-doc-html">' + safeHtml + '</div>';
        } else {
          var content = data.content || '';
          if (/[#*|`\[\]]/.test(content)) {
            body.innerHTML = mdHtml(content);
          } else {
            body.innerHTML = '<pre class="source-view-pre">' + escHtml(content) + '</pre>';
          }
        }
        body.dataset.fp = filePath;
        body.dataset.title = title || '';
        body.dataset.hasDocx = '1';
      })
      .catch(function (err) {
        // Fallback: hiển thị chunks md nếu docx route lỗi
        body.innerHTML = '<div class="blog-empty">Không tải được file word gốc. Thử nội dung chunks:</div>';
        loadContentFallback(filePath, title, body);
      });
  }

  function loadContentFallback(filePath, title, body) {
    fetch(API + '/api/admin/sources/content?file_path=' + encodeURIComponent(filePath), {
      headers: { 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') }
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        var content = data.content || '';
        if (/[#*|`\[\]]/.test(content)) {
          body.innerHTML += mdHtml(content);
        } else {
          body.innerHTML += '<pre class="source-view-pre">' + escHtml(content) + '</pre>';
        }
        body.dataset.fp = filePath;
        body.dataset.title = title || '';
      })
      .catch(function (err2) {
        body.innerHTML = '<div class="blog-error">' + escHtml(err2.message || 'Lỗi tải nội dung') + '</div>';
      });
  }

  /* ===== Tải về file word gốc (hoặc fallback markdown) ===== */
  function downloadSource(filePath, title) {
    // Thử tải raw .docx từ download route (Storage)
    fetch(API + '/api/admin/sources/download?file_path=' + encodeURIComponent(filePath), {
      headers: { 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('not found');
        return r.blob();
      })
      .then(function (blob) {
        var a = document.createElement('a');
        var name = (title || filePath.split('/').pop() || 'nguon').replace(/[^\w.\-]/g, '_') + '.docx';
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      })
      .catch(function () {
        // Fallback: tải markdown từ content route
        fetch(API + '/api/admin/sources/content?file_path=' + encodeURIComponent(filePath), {
          headers: { 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') }
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.error) throw new Error(data.error);
            var blob = new Blob([data.content || ''], { type: 'text/markdown;charset=utf-8' });
            var a = document.createElement('a');
            var name2 = (title || filePath.split('/').pop() || 'nguon').replace(/[^\w.\-]/g, '_') + '.md';
            a.href = URL.createObjectURL(blob);
            a.download = name2;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
          })
          .catch(function (err) {
            alert('Tải thất bại: ' + (err.message || 'lỗi'));
          });
      });
  }

  /* ===== Xóa nguồn (dùng dialog XÓA chung) ===== */
  function deleteSource(filePath, title, origin) {
    if (!window.TADAAdminDelete) {
      alert('Dialog xác nhận chưa sẵn sàng — thử lại.');
      return;
    }
    var note = origin === 'upload'
      ? 'Nguồn upload — xóa hẳn khỏi tri thức'
      : 'Nguồn vault — đánh dấu xóa (file gốc giữ nguyên)';
    window.TADAAdminDelete.open(
      { file_path: filePath, title: title, chunks: 0, note: note },
      function (fp) {
        fetch(API + '/api/admin/sources?file_path=' + encodeURIComponent(fp) + '&mode=exact', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') }
        })
          .then(function (r) {
            if (r.status === 401) throw new Error('Phiên hết hạn');
            return r.json();
          })
          .then(function (data) {
            if (!data.ok) throw new Error(data.error || 'Xóa thất bại');
            loadSources();
          })
          .catch(function (err) {
            if (!/hết hạn/i.test(err.message || '')) alert('Xóa thất bại: ' + (err.message || 'lỗi'));
          });
      }
    );
  }

  /* ===== Khôi phục nguồn ===== */
  function restoreSource(filePath) {
    if (!confirm('Khôi phục nguồn "' + filePath + '"?\n\nLưu ý: nếu kiến thức đã bị dọn, cần chạy lại ingest (backend local) để tái tạo chunks.')) return;
    fetch(API + '/api/admin/sources/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') },
      body: JSON.stringify({ file_path: filePath })
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('Phiên hết hạn');
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'Khôi phục thất bại');
        loadSources();
      })
      .catch(function (err) {
        if (!/hết hạn/i.test(err.message || '')) alert('Khôi phục thất bại: ' + (err.message || 'lỗi'));
      });
  }

  /* ===== Dialog xóa an toàn (gõ XÓA) — expose cho admin-sources + admin-upload ===== */
  window.TADAAdminDelete = (function () {
    var overlay, input, okBtn, cancelBtn, titleText, fpText, pending, onConfirm;

    function init() {
      overlay = document.getElementById('delete-confirm-overlay');
      input = document.getElementById('delete-confirm-input');
      okBtn = document.getElementById('delete-confirm-ok');
      cancelBtn = document.getElementById('delete-confirm-cancel');
      titleText = document.getElementById('delete-confirm-title-text');
      fpText = document.getElementById('delete-confirm-fp-text');
      if (!overlay) return;
      cancelBtn?.addEventListener('click', close);
      okBtn?.addEventListener('click', function () { if (!okBtn.disabled && onConfirm) onConfirm(pending); });
      input?.addEventListener('input', onInput);
      input?.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); if (!okBtn.disabled && onConfirm) onConfirm(pending); }
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    }

    function open(doc, cb) {
      if (!overlay) { alert('Dialog xóa chưa sẵn sàng — thử lại sau.'); return; }
      pending = doc.file_path;
      onConfirm = cb;
      titleText.textContent = doc.title || '(không tên)';
      fpText.textContent = doc.file_path + (doc.chunks ? ' — ' + doc.chunks + ' chunks' : '') + (doc.note ? ' — ' + doc.note : '');
      input.value = '';
      input.classList.remove('has-error');
      okBtn.disabled = true;
      overlay.style.display = 'flex';
      input.focus();
    }

    function onInput() {
      var v = input.value.trim().toUpperCase();
      var ok = (v === 'XÓA' || v === 'XOA');
      okBtn.disabled = !ok;
      input.classList.toggle('has-error', v !== '' && !ok);
    }

    function close() {
      if (!overlay) return;
      overlay.style.display = 'none';
      pending = null;
      onConfirm = null;
      input.value = '';
      okBtn.disabled = true;
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    return { open: open, close: close };
  })();

  /* ===== Tab active — khi mở tab sources thì load ===== */
  function bind() {
    el.list = document.getElementById('sources-list');
    el.origin = document.getElementById('sources-origin');
    el.q = document.getElementById('sources-q');
    el.origin?.addEventListener('change', loadSources);
    el.q?.addEventListener('input', debounce(loadSources, 350));

    // Modal xem nội dung
    var closeBtn = document.getElementById('source-view-close-btn');
    var cancelBtn = document.getElementById('source-view-cancel');
    var overlay = document.getElementById('source-view-overlay');
    var downloadBtn = document.getElementById('source-view-download');
    closeBtn?.addEventListener('click', function () { if (overlay) overlay.style.display = 'none'; });
    cancelBtn?.addEventListener('click', function () { if (overlay) overlay.style.display = 'none'; });
    overlay?.addEventListener('click', function (e) { if (e.target === overlay) overlay.style.display = 'none'; });
    downloadBtn?.addEventListener('click', function () {
      var body = document.getElementById('source-view-body');
      if (body && body.dataset.fp) downloadSource(body.dataset.fp, body.dataset.title);
    });
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function init() {
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose cho tab "Quản lý tài liệu" (admin-docs.js) tái sử dụng
  window.TADASources = {
    view: viewSource,
    download: downloadSource,
    del: deleteSource,
    restore: restoreSource,
    load: loadSources,
    mdHtml: mdHtml,
  };
})();