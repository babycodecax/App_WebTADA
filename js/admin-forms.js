/* Admin Thư viện biểu mẫu — CRUD biểu mẫu (upload file lên Storage 'forms' qua
   /api/admin/forms multipart) + danh sách văn bản luật đọc-only từ /api/library.
   Dùng chung token tada_admin_token với các tab admin khác (ADMIN_PASSWORD). */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';

  var el = {
    password: null, msg: null, connNote: null, connStatus: null,
    editorCard: null, editorTitle: null, editId: null,
    name: null, description: null, file: null, sort: null, active: null,
    saveBtn: null, cancelBtn: null, saveMsg: null,
    listCard: null, list: null, legalCard: null, legalList: null
  };


  function showMsg(target, text, type) {
    if (!target) return;
    target.textContent = text;
    target.className = 'form-msg' + (type ? ' ' + type : '');
    if (!type) target.className += ' hidden';
  }

  function escHtml(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function fmtSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ===== Trạng thái đăng nhập Google ===== */
  function renderConnected(connected) {
    if (el.editorCard) el.editorCard.style.display = connected ? 'block' : 'none';
    if (el.listCard) el.listCard.style.display = connected ? 'block' : 'none';
    if (!connected && el.list) {
      el.list.innerHTML = '<div class="blog-empty">Chưa đăng nhập — bấm nút Đăng nhập (Google) ở góc trên bên phải.</div>';
    }
  }

  /* ===== Danh sách biểu mẫu ===== */
  function loadForms() {
    el.list.innerHTML = '<div class="blog-loading">Đang tải...</div>';
    fetch(API + '/api/admin/forms', { headers: { 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') } })
      .then(function (r) {
        if (r.status === 401) { window.__tadaSession = null; renderConnected(false); throw new Error('Phiên hết hạn'); }
        return r.json();
      })
      .then(function (data) {
        if (data && data.error) throw new Error(data.error);
        var forms = (data && data.forms) || [];
        if (!forms.length) {
          el.list.innerHTML = '<div class="blog-empty">Chưa có biểu mẫu nào. Thêm biểu mẫu đầu tiên ở trên.</div>';
          return;
        }
        el.list.innerHTML = '';
        forms.forEach(function (f) {
          var row = document.createElement('div');
          row.className = 'form-row';
          row.innerHTML =
            '<div class="form-row-main">' +
              '<div class="form-row-title">' + escHtml(f.name) +
                (f.is_active === false ? ' <span class="form-badge form-badge-off">Ẩn</span>' : '') +
              '</div>' +
              (f.description ? '<div class="form-row-desc">' + escHtml(f.description) + '</div>' : '') +
              '<div class="form-row-meta">' +
                '📎 ' + escHtml(f.file_name || '—') +
                (f.file_size ? ' · ' + escHtml(fmtSize(f.file_size)) : '') +
                ' · Thứ tự ' + (typeof f.sort_order === 'number' ? f.sort_order : 0) +
              '</div>' +
            '</div>' +
            '<div class="form-row-actions">' +
              (f.file_url ? '<a class="btn btn-outline btn-sm" href="' + escHtml(f.file_url) + '" target="_blank" rel="noopener">Tải</a>' : '') +
              '<button type="button" class="btn btn-outline btn-sm" data-act="edit" data-id="' + escHtml(f.id) + '">Sửa</button>' +
              '<button type="button" class="btn btn-danger btn-sm" data-act="del" data-id="' + escHtml(f.id) + '" data-name="' + escHtml(f.name) + '">Xóa</button>' +
            '</div>';
          el.list.appendChild(row);
        });

        el.list.querySelectorAll('[data-act="edit"]').forEach(function (btn) {
          btn.addEventListener('click', function () { startEdit(btn.dataset.id, forms); });
        });
        el.list.querySelectorAll('[data-act="del"]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (confirm('Xóa biểu mẫu "' + (btn.dataset.name || '') + '"?')) deleteForm(btn.dataset.id);
          });
        });
      })
      .catch(function (err) {
        if (/hết hạn/i.test(err.message || '')) return;
        el.list.innerHTML = '<div class="blog-error">Không thể tải danh sách biểu mẫu: ' + escHtml(err.message || 'lỗi') + '</div>';
      });
  }

  /* ===== Văn bản luật (đọc-only từ /api/library) ===== */
  var DOC_TYPE_LABEL = { luat: 'Luật', nd: 'Nghị định', tt: 'Thông tư', nq: 'Nghị quyết', vbhn: 'VBHN' };

  function loadLegalDocs() {
    el.legalList.innerHTML = '<div class="blog-loading">Đang tải...</div>';
    fetch(API + '/api/library')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.error) throw new Error(data.error);
        var docs = (data && data.legal_documents) || [];
        if (!docs.length) {
          el.legalList.innerHTML = '<div class="blog-empty">Chưa có văn bản luật trong kho nguồn.</div>';
          return;
        }
        el.legalList.innerHTML = '';
        docs.forEach(function (d) {
          var row = document.createElement('div');
          row.className = 'form-row form-row-readonly';
          var label = DOC_TYPE_LABEL[d.doc_type] || (d.doc_type || '').toUpperCase() || 'Văn bản';
          row.innerHTML =
            '<div class="form-row-main">' +
              '<div class="form-row-title">[' + escHtml(label) + '] ' + escHtml(d.title || d.file_path) + '</div>' +
              '<div class="form-row-meta">' +
                '📄 ' + escHtml(d.file_path || '') +
                (d.effective_date ? ' · 🗓 Hiệu lực: ' + escHtml(d.effective_date) : '') +
              '</div>' +
            '</div>';
          el.legalList.appendChild(row);
        });
      })
      .catch(function () {
        el.legalList.innerHTML = '<div class="blog-error">Không tải được danh sách văn bản luật (kiểm tra /api/library).</div>';
      });
  }

  function loadAll() {
    loadForms();
    loadLegalDocs();
  }

  /* ===== Thêm / sửa ===== */
  function resetEditor() {
    if (el.editId) el.editId.value = '';
    if (el.editorTitle) el.editorTitle.textContent = '➖ Thêm biểu mẫu mới';
    if (el.name) el.name.value = '';
    if (el.description) el.description.value = '';
    if (el.file) el.file.value = '';
    if (el.sort) el.sort.value = '0';
    if (el.active) el.active.value = 'true';
    if (el.cancelBtn) el.cancelBtn.style.display = 'none';
    showMsg(el.saveMsg, '', '');
  }

  function startEdit(id, forms) {
    var f = forms.find(function (x) { return String(x.id) === String(id); });
    if (!f) return;
    // SỬA THẬT biểu mẫu đã chọn: điền id + tên/mô tả, Lưu = PUT (không tạo mới,
    // không nhập lại url — file cũ giữ nguyên).
    if (el.editId) el.editId.value = String(f.id);
    if (el.editorTitle) el.editorTitle.textContent = '✏️ Sửa biểu mẫu: ' + f.name;
    if (el.name) el.name.value = f.name || '';
    if (el.description) el.description.value = f.description || '';
    if (el.file) el.file.value = '';
    if (el.sort) el.sort.value = typeof f.sort_order === 'number' ? String(f.sort_order) : '0';
    if (el.active) el.active.value = f.is_active === false ? 'false' : 'true';
    if (el.cancelBtn) el.cancelBtn.style.display = 'inline-flex';
    showMsg(el.saveMsg, 'Sửa tên/mô tả rồi bấm Lưu — file đã có giữ nguyên (không cần chọn lại).', '');
    if (el.editorCard) el.editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function saveForm() {
    var id = el.editId ? el.editId.value : '';
    var isEdit = !!id;
    var name = el.name.value.trim();
    if (!name) { showMsg(el.saveMsg, 'Nhập tên biểu mẫu', 'error'); return; }

    var file = el.file.files[0];
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = 'Đang lưu...';
    showMsg(el.saveMsg, '', '');

    var done = function () { el.saveBtn.disabled = false; el.saveBtn.textContent = '💾 Lưu biểu mẫu'; };

    if (file) {
      // Có file mới: nếu đang SỬA → PUT cập nhật file/url/name; nếu THÊM → POST tạo mới.
      // Route forms PUT hỗ trợ file_url mới; upload file mới lên storage rồi PUT.
      var fd = new FormData();
      fd.append('file', file);
      fd.append('name', name);
      fd.append('description', el.description.value.trim());
      fd.append('sort_order', el.sort && /^\d+$/.test(el.sort.value) ? el.sort.value : '');
      if (isEdit) fd.append('id', id);
      // upload file → nhận file_url → PUT hoặc POST
      uploadFormFileWithMeta(fd, isEdit, name, done);
      return;
    }

    // Không có file — JSON path: PUT nếu đang sửa (giữ file cũ), POST nếu thêm mới
    var payload = isEdit
      ? { id: id, name: name, description: el.description.value.trim() }
      : {
          name: name,
          description: el.description.value.trim(),
          file_name: '',
          file_url: '',
          file_type: '',
          file_size: 0,
          sort_order: el.sort && /^\d+$/.test(el.sort.value) ? parseInt(el.sort.value, 10) : 0
        };

    fetch(API + '/api/admin/forms', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().then(function (d) {
          if (r.status === 401) { window.__tadaSession = null; renderConnected(false); throw new Error('Phiên hết hạn'); }
          if (!r.ok) throw new Error(d.error || ('Lưu thất bại (' + r.status + ')'));
          return d;
        });
      })
      .then(function () {
        showMsg(el.saveMsg, isEdit ? 'Đã cập nhật biểu mẫu.' : 'Đã thêm biểu mẫu mới.', 'success');
        resetEditor();
        loadForms();
      })
      .catch(function (err) {
        if (!/hết hạn/i.test(err.message || '')) showMsg(el.saveMsg, 'Lỗi: ' + (err.message || 'lưu thất bại'), 'error');
      })
      .finally(done);
  }

  // Upload file kèm metadata — 1 request duy nhất. Route multipart tự xử lý:
  // có field `id` → SỬA (update row cũ, thay file); không có → TẠO MỚI.
  function uploadFormFileWithMeta(fd, isEdit, name, done) {
    fetch(API + '/api/admin/forms', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') },
      body: fd
    })
      .then(function (r) {
        return r.json().then(function (d) {
          if (r.status === 401) { window.__tadaSession = null; renderConnected(false); throw new Error('Phiên hết hạn'); }
          if (!r.ok) throw new Error(d.error || ('Lưu thất bại (' + r.status + ')'));
          return d;
        });
      })
      .then(function () {
        showMsg(el.saveMsg, isEdit ? 'Đã cập nhật biểu mẫu (đổi file).' : 'Đã thêm biểu mẫu và upload file.', 'success');
        resetEditor();
        loadForms();
      })
      .catch(function (err) {
        if (!/hết hạn/i.test(err.message || '')) showMsg(el.saveMsg, 'Lỗi: ' + (err.message || 'lưu thất bại'), 'error');
      })
      .finally(done);
  }

  function deleteForm(id) {
    fetch(API + '/api/admin/forms?id=' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '') }
    })
      .then(function (r) {
        if (r.status === 401) { window.__tadaSession = null; renderConnected(false); throw new Error('Phiên hết hạn'); }
        return r.json();
      })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'Xóa thất bại');
        showMsg(el.saveMsg, 'Đã xóa biểu mẫu.', 'success');
        loadForms();
      })
      .catch(function (err) {
        if (!/hết hạn/i.test(err.message || '')) showMsg(el.saveMsg, 'Lỗi xóa: ' + (err.message || 'thất bại'), 'error');
      });
  }

  /* ===== Khởi tạo =====
     bindTo(get) — gắn DOM của tab "Quản lý tài liệu" (admin-docs.js gọi).
     Kết nối/quản lý phiên do admin-docs.js đảm nhiệm (1 ô password chung). */
  function bindTo(get) {
    el.password = null; // bỏ mật khẩu — dùng Google auth
    el.msg = get('docs-conn-msg');
    el.connNote = get('docs-conn-note');
    el.editorCard = get('docs-upload-card');
    el.editorTitle = get('docs-upload-title') || (el.editorCard ? el.editorCard.querySelector('h3') : null);
    el.name = get('docs-title');
    el.description = get('docs-description');
    el.file = get('docs-file');
    el.sort = get('docs-sort');
    el.listCard = get('docs-list-card');
    el.list = get('forms-list');
    el.saveBtn = get('docs-save-btn');
    el.saveMsg = get('docs-upload-msg');
    el.cancelBtn = null; // tab hợp nhất không có nút hủy sửa riêng
    el.active = null;    // luôn hiển thị
    el.editId = null;
    el.legalCard = null;
    el.legalList = null;

    // KHÔNG bind nút Lưu ở đây — admin-docs.js đã bind `docs-save-btn` → onUpload
    // (xử lý cả 2 loại). Bind 2 nơi = mỗi click tạo 2 biểu mẫu trùng nhau.
  }

  /* ===== Hiển thị trạng thái kết nối (gọi từ admin-docs) ===== */
  function renderConnected(connected) {
    if (el.connNote) el.connNote.style.display = connected ? 'flex' : 'none';
    if (el.editorCard) el.editorCard.style.display = connected ? 'block' : 'none';
    if (el.listCard) el.listCard.style.display = connected ? 'block' : 'none';
    if (!connected && el.list) {
      el.list.innerHTML = '<div class="blog-empty">Chưa đăng nhập — bấm nút Đăng nhập (Google) ở góc trên bên phải.</div>';
    }
  }

  /* ===== Kết nối — delegate cho admin-docs (token chung) ===== */
  function getDocToken() {
    return (window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '');
  }

  // Expose cho tab "Quản lý tài liệu" (admin-docs.js)
  window.TADAForms = {
    bindTo: bindTo,
    renderConnected: renderConnected,
    loadForms: loadForms,
    saveForm: saveForm,
    deleteForm: deleteForm,
    resetEditor: resetEditor,
    hasToken: function () { return !!(window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : ''); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      // Không tự bind — chờ admin-docs.js gọi TADAForms.bindTo()
    });
  }
})();
