/* ==========================================================================
   LIBRARY PAGE RIÊNG — /library
   Danh sách dọc 2 tab: Văn bản luật (toàn văn HTML từ landing_legal_docs,
   fallback chunks markdown) + Biểu mẫu (tải file). Dữ liệu từ /api/library.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  var API = window.LOCAL_API ? window.LOCAL_API : ''; // '' = same-origin proxy

  var DOC_TYPE_LABEL = {
    luat: 'Luật',
    nd: 'Nghị định',
    tt: 'Thông tư',
    nq: 'Nghị quyết',
    vbhn: 'VBHN'
  };

  function docTypeLabel(dt) {
    return DOC_TYPE_LABEL[dt] || (dt ? dt.toUpperCase() : 'Văn bản');
  }

  function escHtml(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  // ===== Render danh sách dọc =====
  // Văn bản luật: id+file_html → click mở modal; fallback file_path → chunks.
  function legalRow(item, idx) {
    var badge = docTypeLabel(item.doc_type);
    var eff = item.effective_date || item.created_at || '';
    var meta =
      '<span class="library-badge">' + escHtml(badge) + '</span>' +
      (eff ? '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="vertical-align:-2px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + escHtml(fmtDate(eff)) + '</span>' : '') +
      (item.doc_number ? '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="vertical-align:-2px"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> ' + escHtml(item.doc_number) + '</span>' : '');
    var clickable = item.id || item.file_path;
    var title = item.title || item.file_name || item.file_path || 'Văn bản luật';
    // Nút Tải .docx gốc (nếu có file_name) — public download route
    var downloadBtn = item.file_name
      ? '<a class="library-row-btn library-row-btn-dl" href="' + API + '/api/library/legal-docs/download?file_name=' + encodeURIComponent(item.file_name) + '" target="_blank" rel="noopener nofollow" aria-label="Tải file: ' + escHtml(title) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:-2px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Tải</a>'
      : '';
    return (
      '<article class="library-row" data-kind="legal" data-id="' + escHtml(clickable) + '" ' +
        'data-has-html="' + (item.id ? '1' : '0') + '" tabindex="0" role="button" ' +
        'aria-label="Xem toàn văn: ' + escHtml(title) + '">' +
        '<span class="library-row-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/></svg></span>' +
        '<div class="library-row-main">' +
          '<h3 class="library-row-title">' + escHtml(title) + '</h3>' +
          '<div class="library-row-meta">' + meta + '</div>' +
        '</div>' +
        '<span class="library-row-btn" data-kind="legal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:-2px"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> Xem toàn văn</span>' +
        downloadBtn +
      '</article>'
    );
  }

  function formRow(item, idx) {
    var size = fmtSize(item.file_size);
    var meta =
      '<span class="library-badge">Biểu mẫu</span>' +
      '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="vertical-align:-2px"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> ' + escHtml(item.file_name || 'File tải xuống') + '</span>' +
      (size ? '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="vertical-align:-2px"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> ' + escHtml(size) + '</span>' : '') +
      (item.created_at ? '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="vertical-align:-2px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + escHtml(fmtDate(item.created_at)) + '</span>' : '');
    var btn = item.file_url
      ? '<a class="library-row-btn" href="' + escHtml(item.file_url) + '" target="_blank" rel="noopener nofollow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:-2px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Tải biểu mẫu</a>'
      : '<span class="library-row-btn" style="opacity:.6;cursor:default">Chưa có file</span>';
    return (
      '<article class="library-row" data-kind="form">' +
        '<span class="library-row-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span>' +
        '<div class="library-row-main">' +
          '<h3 class="library-row-title">' + escHtml(item.name) + '</h3>' +
          (item.description ? '<p style="margin:0 0 4px;font-size:13px;color:var(--text-muted-dark)">' + escHtml(item.description) + '</p>' : '') +
          '<div class="library-row-meta">' + meta + '</div>' +
        '</div>' +
        btn +
      '</article>'
    );
  }

  function renderList(container, items, rowFn) {
    if (!container) return;
    container.innerHTML = '';
    if (!items || !items.length) {
      container.innerHTML = '<div class="library-empty">Chưa có nội dung trong thư viện.</div>';
      return;
    }
    items.forEach(function (item, idx) {
      var el = document.createElement('div');
      el.innerHTML = rowFn(item, idx);
      container.appendChild(el.firstElementChild);
    });
  }

  // ===== Modal xem toàn văn =====
  function escAttr(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function openDetail(title) {
    var overlay = document.getElementById('legal-detail-overlay');
    var body = document.getElementById('legal-detail-body');
    var titleEl = document.getElementById('legal-detail-title');
    if (!overlay || !body) return;
    titleEl.textContent = title || 'Văn bản luật';
    body.innerHTML = '<div class="library-empty">Đang tải nội dung văn bản...</div>';
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function showError(msg) {
    var body = document.getElementById('legal-detail-body');
    if (body) body.innerHTML = '<div class="library-error">Không tải được nội dung văn bản: ' + escHtml(msg) + '</div>';
  }

  function closeDetail() {
    var overlay = document.getElementById('legal-detail-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function bindClose() {
    var b1 = document.getElementById('legal-detail-close-btn');
    var b2 = document.getElementById('legal-detail-close-btn-2');
    var overlay = document.getElementById('legal-detail-overlay');
    if (b1) b1.addEventListener('click', closeDetail);
    if (b2) b2.addEventListener('click', closeDetail);
    if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDetail(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') closeDetail();
    });
  }

  // Văn bản từ landing_legal_docs (id) → /api/library/legal-docs?id= → file_html (bảng như Word)
  function openLegalDocHtml(id, title) {
    openDetail(title);
    fetch(API + '/api/library/legal-docs?id=' + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        var html = data.file_html || '';
        if (!html) {
          var body = document.getElementById('legal-detail-body');
          if (body) body.innerHTML = '<div class="library-empty">Văn bản chưa có nội dung để hiển thị.</div>';
          return;
        }
        var body = document.getElementById('legal-detail-body');
        var safe = window.DOMPurify && window.DOMPurify.sanitize ? window.DOMPurify.sanitize(html) : html;
        if (body) body.innerHTML = '<div class="legal-doc-html">' + safe + '</div>';
      })
      .catch(function (err) { showError(err.message || 'lỗi'); });
  }

  // Văn bản từ vault (file_path) → /api/library/legal-content → markdown chunks
  function openLegalDocMarkdown(filePath, title) {
    openDetail(title);
    fetch(API + '/api/library/legal-content?file_path=' + encodeURIComponent(filePath || ''))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        var content = data.content || '';
        if (!content) {
          var body = document.getElementById('legal-detail-body');
          if (body) body.innerHTML = '<div class="library-empty">Văn bản chưa có nội dung để hiển thị.</div>';
          return;
        }
        var body = document.getElementById('legal-detail-body');
        var html = '';
        if (window.marked && window.marked.parse) {
          html = window.marked.parse(content);
          if (window.DOMPurify && window.DOMPurify.sanitize) html = window.DOMPurify.sanitize(html);
        } else {
          html = '<pre style="white-space:pre-wrap">' + escHtml(content) + '</pre>';
        }
        if (body) body.innerHTML = '<div class="legal-doc-html">' + html + '</div>';
      })
      .catch(function (err) { showError(err.message || 'lỗi'); });
  }

  // ===== Load dữ liệu =====
  var allLegal = [];
  var allForms = [];
  var searchBox = null;

  function applySearch() {
    var q = searchBox ? searchBox.value.trim().toLowerCase() : '';
    var legalList = document.getElementById('lib-legal-list');
    var formsList = document.getElementById('lib-forms-list');
    var countLegal = document.getElementById('library-count-legal');
    var countForms = document.getElementById('library-count-forms');
    if (!q) {
      renderList(legalList, allLegal, legalRow);
      renderList(formsList, allForms, formRow);
      if (countLegal) countLegal.textContent = String(allLegal.length);
      if (countForms) countForms.textContent = String(allForms.length);
      return;
    }
    var filteredLegal = allLegal.filter(function (it) {
      return ((it.title || '') + ' ' + (it.doc_number || '')).toLowerCase().includes(q);
    });
    var filteredForms = allForms.filter(function (it) {
      return ((it.name || '') + ' ' + (it.description || '') + ' ' + (it.file_name || '')).toLowerCase().includes(q);
    });
    renderList(legalList, filteredLegal, legalRow);
    renderList(formsList, filteredForms, formRow);
    if (countLegal) countLegal.textContent = String(filteredLegal.length);
    if (countForms) countForms.textContent = String(filteredForms.length);
  }

  function loadLibrary() {
    var legalList = document.getElementById('lib-legal-list');
    var formsList = document.getElementById('lib-forms-list');
    var countLegal = document.getElementById('library-count-legal');
    var countForms = document.getElementById('library-count-forms');
    if (!legalList && !formsList) return;

    // ?_t=timestamp chống cache CDN/trình duyệt — admin upload mới hiện ngay
    fetch(API + '/api/library?_t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || (data.error && !data.forms && !data.legal_documents && !data.legal_docs)) throw new Error('empty');
        var legalDocs = Array.isArray(data.legal_docs) ? data.legal_docs : [];
        var legalVault = Array.isArray(data.legal_documents) ? data.legal_documents : [];
        var forms = Array.isArray(data.forms) ? data.forms : [];
        // Ưu tiên bảng landing_legal_docs (toàn văn HTML) — thiếu thì fallback vault
        allLegal = legalDocs.length ? legalDocs : legalVault;
        allForms = forms;
        applySearch();
      })
      .catch(function () {
        allLegal = [];
        allForms = [];
        renderList(legalList, [], legalRow);
        renderList(formsList, [], formRow);
        if (countLegal) countLegal.textContent = '0';
        if (countForms) countForms.textContent = '0';
      });
  }

  // Click/Enter row văn bản luật → mở modal đúng loại (HTML id / markdown file_path)
  function bindLegalList() {
    var legalList = document.getElementById('lib-legal-list');
    if (!legalList) return;
    legalList.addEventListener('click', function (e) {
      var btn = e.target.closest('a.library-row-btn');
      if (btn) return; // nút Tải — không mở modal
      var row = e.target.closest('.library-row[data-kind="legal"]');
      if (!row) return;
      openRow(row);
    });
    legalList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest('.library-row[data-kind="legal"]');
      if (!row) return;
      e.preventDefault();
      openRow(row);
    });
  }

  function openRow(row) {
    var id = row.getAttribute('data-id') || '';
    var hasHtml = row.getAttribute('data-has-html') === '1';
    var title = row.querySelector('.library-row-title')?.textContent || '';
    if (hasHtml) openLegalDocHtml(id, title);
    else openLegalDocMarkdown(id, title);
  }

  // Tab chuyển đổi
  function bindTabs() {
    document.querySelectorAll('.library-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.library-tab-btn').forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        var showLegal = btn.dataset.tab === 'legal';
        var legalList = document.getElementById('lib-legal-list');
        var formsList = document.getElementById('lib-forms-list');
        if (legalList) legalList.hidden = !showLegal;
        if (formsList) formsList.hidden = showLegal;
      });
    });
  }

  // Sticky header scrolled
  var header = document.getElementById('header');
  window.addEventListener('scroll', function () {
    header.classList.toggle('scrolled', window.scrollY > 50);
  });

  // Mobile menu toggle
  var navToggle = document.getElementById('nav-toggle');
  var navMenu = document.getElementById('nav-menu');
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function () {
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
    });
    document.querySelectorAll('.nav-link:not(.dropdown-trigger)').forEach(function (link) {
      link.addEventListener('click', function () {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });
  }

  // Tìm kiếm thư viện (lọc client-side cả 2 tab)
  searchBox = document.getElementById('library-search');
  if (searchBox) {
    searchBox.addEventListener('input', function () { applySearch(); });
  }

  bindClose();
  bindTabs();
  bindLegalList();
  loadLibrary();
});
