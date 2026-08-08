/* Admin Quản lý dịch vụ landing page — 1 ô textarea + 1 nút Lưu (ADMIN_PASSWORD, dùng chung token với tab Upload) */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';
  var TOKEN_KEY = 'tada_admin_token';
  var el = { textarea: null, msg: null, saveMsg: null, saveBtn: null, editorWrap: null };

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
    target.className = 'form-msg' + (type ? ' ' + type : '') + (type ? '' : ' hidden');
  }

  /* ===== Kết nối admin (mật khẩu) ===== */
  function connect() {
    var pw = document.getElementById('services-password').value.trim();
    if (!pw) { showMsg(el.msg, 'Nhập mật khẩu quản trị', 'error'); return; }
    showMsg(el.msg, 'Đang kết nối...', '');

    fetch(API + '/api/admin/check', { headers: { 'Authorization': 'Bearer ' + pw } })
      .then(function (r) {
        if (r.status === 401) throw new Error('Mật khẩu quản trị không đúng');
        if (!r.ok) throw new Error('Kết nối thất bại (' + r.status + ')');
        return r.json();
      })
      .then(function () {
        setToken(pw);
        document.getElementById('services-password').value = '';
        renderConnected(true);
        showMsg(el.msg, 'Kết nối thành công', 'success');
        loadContent();
      })
      .catch(function (err) {
        showMsg(el.msg, 'Lỗi: ' + (err.message || 'Kết nối thất bại'), 'error');
      });
  }

  function logout() {
    setToken('');
    renderConnected(false);
    showMsg(el.msg, 'Đã đăng xuất', '');
  }

  function renderConnected(connected) {
    var connRow = document.getElementById('services-conn');
    var note = document.getElementById('services-conn-note');
    if (connRow) connRow.style.display = connected ? 'flex' : 'block';
    if (note) note.style.display = connected ? 'flex' : 'none';
    var statusEl = document.getElementById('services-conn-status');
    if (statusEl) {
      statusEl.textContent = connected
        ? 'Đã kết nối quản trị.'
        : 'Chưa kết nối — nhập mật khẩu hoặc vào tab Upload tài liệu để đăng nhập:';
    }
    if (el.editorWrap) el.editorWrap.style.display = connected ? 'block' : 'none';
  }

  /* ===== Tải nội dung dịch vụ hiện tại ===== */
  function loadContent() {
    fetch(API + '/api/admin/services', { headers: { 'Authorization': 'Bearer ' + getToken() } })
      .then(function (r) {
        if (r.status === 401) throw new Error('hết hạn');
        return r.json();
      })
      .then(function (data) {
        if (data && data.error) throw new Error(data.error);
        el.textarea.value = (data && typeof data.content === 'string') ? data.content : '';
        showMsg(el.saveMsg, 'Đã tải nội dung hiện tại.', 'success');
        renderConnected(true);
      })
      .catch(function (err) {
        if (/hết hạn/i.test(err.message || '')) {
          renderConnected(false);
          showMsg(el.msg, 'Phiên quản trị hết hạn — kết nối lại ở mục trên.', 'error');
          return;
        }
        showMsg(el.msg, 'Không thể tải nội dung dịch vụ: ' + (err.message || 'lỗi'), 'error');
      });
  }

  /* ===== Lưu toàn bộ nội dung ===== */
  function saveContent() {
    var content = el.textarea.value;
    el.saveBtn.disabled = true;
    showMsg(el.saveMsg, 'Đang lưu...', '');

    fetch(API + '/api/admin/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ content: content })
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('hết hạn');
        return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Lưu thất bại'); return d; });
      })
      .then(function () {
        showMsg(el.saveMsg, 'Đã lưu. Trang chủ sẽ hiển thị đúng nội dung này.', 'success');
      })
      .catch(function (err) {
        if (/hết hạn/i.test(err.message || '')) {
          showMsg(el.saveMsg, 'Phiên hết hạn — kết nối lại', 'error');
          renderConnected(false);
        } else {
          showMsg(el.saveMsg, 'Lưu thất bại: ' + (err.message || 'lỗi'), 'error');
        }
      })
      .finally(function () {
        el.saveBtn.disabled = false;
      });
  }

  /* ===== Khởi tạo ===== */
  function bind() {
    el.textarea = document.getElementById('services-textarea');
    el.msg = document.getElementById('services-msg');
    el.saveMsg = document.getElementById('services-save-msg');
    el.saveBtn = document.getElementById('services-save-btn');
    el.editorWrap = document.getElementById('services-editor-wrap');

    var connectBtn = document.getElementById('services-connect-btn');
    var logoutBtn = document.getElementById('services-logout-btn');
    var pwInput = document.getElementById('services-password');

    connectBtn?.addEventListener('click', connect);
    logoutBtn?.addEventListener('click', logout);
    pwInput?.addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
    el.saveBtn?.addEventListener('click', saveContent);

    // Hiển thị trạng thái kết nối ban đầu + auto load nếu đã có token
    var hasToken = !!getToken();
    renderConnected(hasToken);
    if (hasToken) loadContent();

    document.querySelectorAll('.admin-nav-btn[data-view="services"]').forEach(function (btn) {
      btn.addEventListener('click', function () { setTimeout(loadContentIfToken, 50); });
    });
  }

  function loadContentIfToken() {
    if (getToken()) loadContent();
  }

  function init() {
    bind();
    var active = document.querySelector('.admin-nav-btn.active');
    if (active && active.dataset.view === 'services') loadContentIfToken();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();