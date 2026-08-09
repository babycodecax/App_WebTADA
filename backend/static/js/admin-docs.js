/* Admin Quản lý tài liệu — coordinator hợp nhất (Upload + Nguồn tri thức + Biểu mẫu).
   - 1 kết nối admin chung (ADMIN_PASSWORD → token tada_admin_token).
   - Upload 2 loại: Nguồn tri thức (POST /api/admin/upload) | Biểu mẫu (POST /api/admin/forms).
   - 2 sub-tab danh sách: Nguồn tri thức (tái dùng TADASources) | Biểu mẫu (tái dùng TADAForms).
   Dùng chung marked/DOMPurify đã load trong admin.html. */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';
  var TOKEN_KEY = 'tada_admin_token';

  var el = {
    password: null, connectBtn: null, connNote: null, logoutBtn: null, connMsg: null,
    uploadCard: null, file: null, fileHint: null, title: null,
    descWrap: null, description: null, sortWrap: null, sort: null,
    saveBtn: null, uploadMsg: null,
    subBtns: {}, subSource: null, subForms: null, listCard: null,
  };
  var currentSub = 'source';

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }
  function showMsg(target, text, type) {
    if (!target) return;
    target.textContent = text;
    target.className = 'form-msg' + (type ? ' ' + type : '');
    if (!type) target.className += ' hidden';
  }

  /* ===== Kết nối / đăng xuất (token dùng chung 3 panel) ===== */
  function connect() {
    var pw = el.password.value.trim();
    if (!pw) { showMsg(el.connMsg, 'Nhập mật khẩu quản trị', 'error'); return; }
    showMsg(el.connMsg, 'Đang kết nối...', '');

    fetch(API + '/api/admin/check', { headers: { 'Authorization': 'Bearer ' + pw } })
      .then(function (r) {
        if (r.status === 401) throw new Error('Mật khẩu quản trị không đúng');
        if (!r.ok) throw new Error('Kết nối thất bại (' + r.status + ')');
        return r.json();
      })
      .then(function () {
        setToken(pw);
        el.password.value = '';
        renderConnected(true);
        showMsg(el.connMsg, 'Kết nối thành công', 'success');
        refreshLists();
      })
      .catch(function (err) {
        showMsg(el.connMsg, 'Lỗi: ' + (err.message || 'Kết nối thất bại'), 'error');
      });
  }

  function logout() {
    setToken('');
    renderConnected(false);
    showMsg(el.connMsg, 'Đã đăng xuất', '');
  }

  function renderConnected(connected) {
    if (el.connNote) el.connNote.style.display = connected ? 'flex' : 'none';
    if (el.uploadCard) el.uploadCard.style.display = connected ? 'block' : 'none';
    if (el.listCard) el.listCard.style.display = connected ? 'block' : 'none';
    if (!connected) {
      var sl = document.getElementById('sources-list');
      var fl = document.getElementById('forms-list');
      if (sl) sl.innerHTML = '<div class="blog-empty">Chưa kết nối — nhập mật khẩu quản trị ở trên.</div>';
      if (fl) fl.innerHTML = '<div class="blog-empty">Chưa có biểu mẫu nào.</div>';
    }
  }

  /* ===== Sub-tab: Nguồn tri thức | Biểu mẫu (danh sách) ===== */
  function showSub(sub) {
    currentSub = sub;
    el.subBtns.forEach(function (b) {
      b.classList.toggle('active', b.dataset.sub === sub);
    });
    el.subSource.style.display = (sub === 'source') ? 'block' : 'none';
    el.subForms.style.display = (sub === 'forms') ? 'block' : 'none';
    applyUploadType(sub);
    if (getToken()) refreshLists();
  }

  /* ===== Loại upload hiện tại (radio) — chỉ đổi form upload, không đổi sub-tab ===== */
  var currentType = 'source';
  function onTypeChange(type) {
    currentType = type;
    applyUploadType(type);
  }
  function applyUploadType(type) {
    var isForm = type === 'forms' || type === 'form';
    if (el.descWrap) el.descWrap.style.display = isForm ? 'block' : 'none';
    // Ô "Thứ tự" đã bỏ — backend tự tính sort_order (max+1), không nhập tay
    if (el.sortWrap) el.sortWrap.style.display = 'none';
    if (el.fileHint) {
      el.fileHint.textContent = isForm
        ? 'hỗ trợ .pdf, .docx, .xlsx — tối đa 4 MB'
        : 'hỗ trợ .docx, .pdf, .txt, .md — tối đa 4 MB';
    }
    if (el.fileInput) {
      el.fileInput.accept = isForm ? '.pdf,.docx,.doc,.xlsx,.xls,.txt,.md' : '.docx,.pdf,.txt,.md';
    }
    if (el.saveBtn) {
      el.saveBtn.innerHTML = isForm ? '💾 Lưu biểu mẫu' : '📤 Upload &amp; cập nhật';
    }
  }

  function refreshLists() {
    if (currentSub === 'source' && window.TADASources) {
      window.TADASources.load();
    } else if (currentSub === 'forms' && window.TADAForms) {
      window.TADAForms.loadForms();
    }
  }

  /* ===== Upload (theo loại radio đang chọn) ===== */
  function onUpload() {
    var isForm = currentType === 'form';
    var file = el.fileInput.files[0];
    if (!file) { showMsg(el.uploadMsg, 'Chọn file để upload', 'error'); return; }

    if (isForm) {
      var name = el.title.value.trim();
      if (!name) { showMsg(el.uploadMsg, 'Nhập tên biểu mẫu', 'error'); return; }
      // Gọi TADAForms.saveForm sẽ conflict — gọi thẳng luồng thêm biểu mẫu
      var fd = new FormData();
      fd.append('file', file);
      fd.append('name', name);
      fd.append('description', el.description.value.trim());
      fd.append('sort_order', el.sort.value || '0');
      el.saveBtn.disabled = true;
      showMsg(el.uploadMsg, 'Đang tải lên...', '');
      fetch(API + '/api/admin/forms', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
        body: fd
      })
        .then(function (r) {
          return r.json().then(function (d) {
            if (r.status === 401) { setToken(''); renderConnected(false); throw new Error('Phiên hết hạn'); }
            if (!r.ok) throw new Error(d.error || 'Lưu thất bại');
            return d;
          });
        })
        .then(function () {
          showMsg(el.uploadMsg, 'Đã thêm biểu mẫu và upload file.', 'success');
          el.fileInput.value = '';
          el.title.value = '';
          el.description.value = '';
          el.sort.value = '0';
          if (window.TADAForms) window.TADAForms.loadForms();
        })
        .catch(function (err) {
          if (!/hết hạn/i.test(err.message || '')) showMsg(el.uploadMsg, 'Lỗi: ' + (err.message || 'lưu thất bại'), 'error');
        })
        .finally(function () { el.saveBtn.disabled = false; });
      return;
    }

    // Nguồn tri thức (chatbox)
    var title = el.title.value.trim();
    var fd2 = new FormData();
    fd2.append('file', file);
    if (title) fd2.append('title', title);
    el.saveBtn.disabled = true;
    showMsg(el.uploadMsg, 'Đang tải lên và cập nhật tri thức...', '');
    fetch(API + '/api/admin/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: fd2
    })
      .then(function (r) {
        return r.json().then(function (d) {
          if (r.status === 401) { setToken(''); renderConnected(false); throw new Error('Phiên hết hạn'); }
          if (!r.ok) throw new Error(d.error || 'Upload thất bại');
          return d;
        });
      })
      .then(function (d) {
        showMsg(el.uploadMsg, 'Đã upload: ' + (d.title || file.name) + ' — ' + (d.chunks || 0) + ' chunks.', 'success');
        el.fileInput.value = '';
        el.title.value = '';
        if (window.TADASources) window.TADASources.load();
      })
      .catch(function (err) {
        if (!/hết hạn/i.test(err.message || '')) showMsg(el.uploadMsg, 'Lỗi: ' + (err.message || 'upload thất bại'), 'error');
      })
      .finally(function () { el.saveBtn.disabled = false; });
  }

  /* ===== Khởi tạo ===== */
  function init() {
    el.password = document.getElementById('docs-password');
    el.connectBtn = document.getElementById('docs-connect-btn');
    el.connNote = document.getElementById('docs-conn-note');
    el.logoutBtn = document.getElementById('docs-logout-btn');
    el.connMsg = document.getElementById('docs-conn-msg');
    el.uploadCard = document.getElementById('docs-upload-card');
    el.fileInput = document.getElementById('docs-file');
    el.fileHint = document.getElementById('docs-file-hint');
    el.title = document.getElementById('docs-title');
    el.descWrap = document.getElementById('docs-desc-wrap');
    el.description = document.getElementById('docs-description');
    el.sortWrap = document.getElementById('docs-sort-wrap');
    el.sort = document.getElementById('docs-sort');
    el.saveBtn = document.getElementById('docs-save-btn');
    el.uploadMsg = document.getElementById('docs-upload-msg');
    el.subBtns = Array.prototype.slice.call(document.querySelectorAll('.docs-sub-btn'));
    el.subSource = document.getElementById('docs-sub-source');
    el.subForms = document.getElementById('docs-sub-forms');
    el.listCard = document.getElementById('docs-list-card');

    el.connectBtn?.addEventListener('click', connect);
    el.logoutBtn?.addEventListener('click', logout);
    el.saveBtn?.addEventListener('click', onUpload);
    el.password?.addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
    el.subBtns.forEach(function (b) {
      b.addEventListener('click', function () { showSub(b.dataset.sub); });
    });

    // Radio chọn loại upload (Nguồn tri thức | Biểu mẫu) — đồng bộ loại upload
    var radioSource = document.getElementById('docs-type-source');
    var radioForm = document.getElementById('docs-type-form');
    if (radioSource) radioSource.addEventListener('change', function () { onTypeChange('source'); });
    if (radioForm) radioForm.addEventListener('change', function () { onTypeChange('form'); });

    // Gắn TADAForms (id mới) — phải chạy sau khi DOM sẵn sàng
    if (window.TADAForms && window.TADAForms.bindTo) {
      window.TADAForms.bindTo(function (id) { return document.getElementById(id); });
    }

    var connected = !!getToken();
    renderConnected(connected);
    if (connected) {
      showSub(currentSub);
    } else {
      showSub(currentSub); // không tải gì (chưa có token)
    }

    // Khi mở tab "docs" (click sidebar) → refresh
    document.querySelectorAll('.admin-nav-btn[data-view="docs"]').forEach(function (btn) {
      btn.addEventListener('click', function () { setTimeout(showSub, 50, currentSub); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();