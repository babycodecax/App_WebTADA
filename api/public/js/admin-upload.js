/* Admin Upload — upload tài liệu vào tri thức chatbox (ADMIN_PASSWORD, tách khỏi login Google blog) */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';
  var TOKEN_KEY = 'tada_admin_token';

  var el = {
    connCard: null,
    formCard: null,
    docsCard: null,
    password: null,
    connStatus: null,
    connMsg: null,
    file: null,
    title: null,
    uploadBtn: null,
    uploadMsg: null,
    docsList: null,
    deleteOverlay: null,
    deleteTitleText: null,
    deleteFpText: null,
    deleteInput: null,
    deleteOk: null,
    deleteCancel: null
  };

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

  /* ===== Kết nối quản trị ===== */
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
        showMsg(el.connMsg, 'Kết nối thành công', 'success');
        renderConnected(true);
        loadDocs();
      })
      .catch(function (err) {
        showMsg(el.connMsg, 'Lỗi: ' + (err.message || 'Kết nối thất bại'), 'error');
      });
  }

  function logout() {
    setToken('');
    renderConnected(false);
    showMsg(el.connMsg, 'Đã đăng xuất', '');
    el.docsList.innerHTML = '';
  }

  function renderConnected(connected) {
    el.password.closest('.upload-conn-row').style.display = connected ? 'none' : 'flex';
    el.connStatus.style.display = connected ? 'flex' : 'none';
    el.formCard.style.display = connected ? 'block' : 'none';
    el.docsCard.style.display = connected ? 'block' : 'none';
  }

  /* ===== Upload file ===== */
  function upload() {
    var file = el.file.files[0];
    if (!file) { showMsg(el.uploadMsg, 'Chọn file trước khi upload', 'error'); return; }

    var title = el.title.value.trim();
    var fd = new FormData();
    fd.append('file', file);
    if (title) fd.append('title', title);

    el.uploadBtn.disabled = true;
    el.uploadBtn.textContent = 'Đang upload...';
    showMsg(el.uploadMsg, 'Đang xử lý...', '');

    fetch(API + '/api/admin/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: fd
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || ('Upload thất bại (' + r.status + ')'));
          return data;
        });
      })
      .then(function (data) {
        showMsg(el.uploadMsg,
          'Đã ingest ' + data.chunks + ' chunks — chatbox sẽ tìm thấy tài liệu này ngay khi hỏi. (file_path: ' + data.file_path + ')',
          'success');
        el.file.value = '';
        el.title.value = '';
        loadDocs();
      })
      .catch(function (err) {
        var msg = err.message || String(err);
        if (msg.indexOf('401') >= 0 || /unauthorized/i.test(msg)) {
          showMsg(el.uploadMsg, 'Phiên kết nối hết hạn. Kết nối lại.', 'error');
          setToken('');
          renderConnected(false);
        } else {
          showMsg(el.uploadMsg, 'Lỗi: ' + msg, 'error');
        }
      })
      .finally(function () {
        el.uploadBtn.disabled = false;
        el.uploadBtn.textContent = 'Upload & cập nhật tri thức';
      });
  }

  /* ===== Danh sách tài liệu ===== */
  function loadDocs() {
    el.docsList.innerHTML = '<div class="blog-loading">Đang tải...</div>';

    fetch(API + '/api/admin/knowledge', { headers: { 'Authorization': 'Bearer ' + getToken() } })
      .then(function (r) {
        if (r.status === 401) { setToken(''); renderConnected(false); throw new Error('Phiên hết hạn'); }
        return r.json();
      })
      .then(function (data) {
        var docs = (data && data.docs) || [];
        if (!docs.length) {
          el.docsList.innerHTML = '<div class="blog-empty">Chưa có tài liệu nào được upload.</div>';
          return;
        }
        el.docsList.innerHTML = '';
        docs.forEach(function (d) {
          var item = document.createElement('div');
          item.className = 'upload-doc-item';
          item.innerHTML =
            '<div class="upload-doc-info">' +
              '<div class="upload-doc-title">' + escHtml(d.title) + '</div>' +
              '<div class="upload-doc-meta">' + escHtml(d.file_path) + ' — ' + (d.chunk_count || 0) + ' chunks</div>' +
            '</div>' +
            '<button type="button" class="upload-doc-delete" data-fp="' + escHtml(d.file_path) + '" data-title="' + escHtml(d.title || '') + '" data-chunks="' + (d.chunk_count || 0) + '">Xoá</button>';
          el.docsList.appendChild(item);
        });

        el.docsList.querySelectorAll('.upload-doc-delete').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (window.TADAAdminDelete) {
              window.TADAAdminDelete.open(
                { file_path: btn.dataset.fp, title: btn.dataset.title, chunks: btn.dataset.chunks },
                function (fp) { deleteDoc(fp); }
              );
            }
          });
        });
      })
      .catch(function (err) {
        if (/hết hạn/i.test(err.message || '')) return;
        el.docsList.innerHTML = '<div class="blog-error">Không thể tải danh sách.</div>';
      });
  }

  /* ===== Xóa tài liệu — dialog xác nhận an toàn (gõ XÓA) ===== */
  // Dùng chung dialog xác nhận qua window.TADAAdminDelete (admin-sources.js cũng dùng)
  function deleteDoc(filePath) {
    fetch(API + '/api/admin/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken()
      },
      body: JSON.stringify({ file_path: filePath, mode: 'exact' })
    })
      .then(function (r) {
        if (r.status === 401) { setToken(''); renderConnected(false); throw new Error('Phiên hết hạn'); }
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'Xoá thất bại');
        showMsg(el.uploadMsg, 'Đã xoá ' + (data.deleted || 0) + ' chunks và toàn bộ kiến thức liên quan', 'success');
        loadDocs();
      })
      .catch(function (err) {
        if (!/hết hạn/i.test(err.message || '')) {
          showMsg(el.uploadMsg, 'Lỗi xoá: ' + (err.message || 'thất bại'), 'error');
        }
      });
  }

  /* ===== Helpers ===== */
  function escHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function bind() {
    el.connCard = document.getElementById('upload-conn-card');
    el.formCard = document.getElementById('upload-form-card');
    el.docsCard = document.getElementById('upload-docs-card');
    el.password = document.getElementById('upload-password');
    el.connStatus = document.getElementById('upload-conn-status');
    el.connMsg = document.getElementById('upload-conn-msg');
    el.file = document.getElementById('upload-file');
    el.title = document.getElementById('upload-title');
    el.uploadBtn = document.getElementById('upload-btn');
    el.uploadMsg = document.getElementById('upload-msg');
    el.docsList = document.getElementById('upload-docs-list');

    document.getElementById('upload-connect-btn')?.addEventListener('click', connect);
    document.getElementById('upload-logout-btn')?.addEventListener('click', logout);
    el.uploadBtn?.addEventListener('click', upload);
    el.password?.addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
  }

  function init() {
    bind();
    if (window.TADAAdminDelete) window.TADAAdminDelete.bind();
    if (getToken()) {
      renderConnected(true);
      loadDocs();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ===== Dialog xác nhận xóa dùng chung (admin-upload + admin-sources) =====
 * Toàn cục: TADAAdminDelete.open(docInfo, onConfirm) — hiện dialog, gõ XÓA để xác nhận. */
(function () {
  'use strict';

  var _overlay = null, _titleText = null, _fpText = null, _input = null, _okBtn = null, _cancelBtn = null;
  var _pending = null;

  function clearState() {
    if (!_input) return;
    _input.value = '';
    _input.classList.remove('has-error');
    _okBtn.disabled = true;
  }

  function openConfirm(doc, onConfirm) {
    if (!_overlay) throw new Error('Dialog chưa khởi tạo — gọi bindDeleteDialog() trước');
    _pending = { doc: doc, onConfirm: onConfirm };
    _titleText.textContent = (doc && doc.title) || '(không tên)';
    _fpText.textContent = (doc && doc.file_path || '') + ' — ' + (doc && doc.chunks != null ? doc.chunks : 0) + (doc && doc.note ? ' · ' + doc.note : '');
    clearState();
    _overlay.style.display = 'flex';
    _input.focus();
  }

  function closeConfirm() {
    if (!_overlay) return;
    _overlay.style.display = 'none';
    _pending = null;
    clearState();
  }

  function onInput() {
    var v = _input.value.trim().toUpperCase();
    var ok = (v === 'XÓA' || v === 'XOA');
    _okBtn.disabled = !ok;
    _input.classList.toggle('has-error', v !== '' && !ok);
  }

  function confirm() {
    if (!_pending || _okBtn.disabled) return;
    var cb = _pending.onConfirm;
    var filePath = _pending.doc.file_path;
    closeConfirm();
    if (cb) cb(filePath);
  }

  window.TADAAdminDelete = {
    bind: function () {
      _overlay = document.getElementById('delete-confirm-overlay');
      _titleText = document.getElementById('delete-confirm-title-text');
      _fpText = document.getElementById('delete-confirm-fp-text');
      _input = document.getElementById('delete-confirm-input');
      _okBtn = document.getElementById('delete-confirm-ok');
      _cancelBtn = document.getElementById('delete-confirm-cancel');
      _cancelBtn?.addEventListener('click', closeConfirm);
      _okBtn?.addEventListener('click', confirm);
      _input?.addEventListener('input', onInput);
      _input?.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); confirm(); }
        if (e.key === 'Escape') { e.preventDefault(); closeConfirm(); }
      });
      _overlay?.addEventListener('click', function (e) { if (e.target === _overlay) closeConfirm(); });
    },
    open: openConfirm,
    close: closeConfirm
  };
})();
