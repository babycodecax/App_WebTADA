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
            openDeleteConfirm({
              file_path: btn.dataset.fp,
              title: btn.dataset.title,
              chunk_count: btn.dataset.chunks
            });
          });
        });
      })
      .catch(function (err) {
        if (/hết hạn/i.test(err.message || '')) return;
        el.docsList.innerHTML = '<div class="blog-error">Không thể tải danh sách.</div>';
      });
  }

  /* ===== Xóa tài liệu — dialog xác nhận an toàn (gõ XÓA) ===== */
  var pendingDeleteDoc = null;

  function openDeleteConfirm(doc) {
    if (!el.deleteOverlay) return;
    pendingDeleteDoc = doc;
    el.deleteTitleText.textContent = doc.title || '(không tên)';
    el.deleteFpText.textContent = doc.file_path + ' — ' + (doc.chunk_count || 0) + ' chunks';
    el.deleteInput.value = '';
    el.deleteInput.classList.remove('has-error');
    el.deleteOk.disabled = true;
    el.deleteOverlay.style.display = 'flex';
    el.deleteInput.focus();
  }

  function closeDeleteConfirm() {
    if (!el.deleteOverlay) return;
    el.deleteOverlay.style.display = 'none';
    pendingDeleteDoc = null;
    el.deleteInput.value = '';
    el.deleteOk.disabled = true;
  }

  function onDeleteInput() {
    var v = el.deleteInput.value.trim().toUpperCase();
    var ok = (v === 'XÓA' || v === 'XOA');
    el.deleteOk.disabled = !ok;
    el.deleteInput.classList.toggle('has-error', v !== '' && !ok);
  }

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
        closeDeleteConfirm();
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
    el.deleteOverlay = document.getElementById('delete-confirm-overlay');
    el.deleteTitleText = document.getElementById('delete-confirm-title-text');
    el.deleteFpText = document.getElementById('delete-confirm-fp-text');
    el.deleteInput = document.getElementById('delete-confirm-input');
    el.deleteOk = document.getElementById('delete-confirm-ok');
    el.deleteCancel = document.getElementById('delete-confirm-cancel');

    document.getElementById('upload-connect-btn')?.addEventListener('click', connect);
    document.getElementById('upload-logout-btn')?.addEventListener('click', logout);
    el.uploadBtn?.addEventListener('click', upload);
    el.password?.addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });

    // Dialog xác nhận xóa
    el.deleteCancel?.addEventListener('click', closeDeleteConfirm);
    el.deleteOk?.addEventListener('click', function () {
      if (pendingDeleteDoc) deleteDoc(pendingDeleteDoc.file_path);
    });
    el.deleteInput?.addEventListener('input', onDeleteInput);
    el.deleteInput?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!el.deleteOk.disabled && pendingDeleteDoc) deleteDoc(pendingDeleteDoc.file_path);
      }
      if (e.key === 'Escape') { e.preventDefault(); closeDeleteConfirm(); }
    });
    el.deleteOverlay?.addEventListener('click', function (e) {
      if (e.target === el.deleteOverlay) closeDeleteConfirm();
    });
  }

  function init() {
    bind();
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
