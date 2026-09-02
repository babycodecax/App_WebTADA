/* Admin Quản lý dịch vụ landing page — 1 ô textarea + 1 nút Lưu.
   Xác thực: TÀI KHOẢN GOOGLE (TADAAdminAuth.getToken) — bỏ mật khẩu ADMIN_PASSWORD. */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';
  var el = { textarea: null, msg: null, saveMsg: null, saveBtn: null, editorWrap: null };

  function getToken() {
    return (window.TADAAdminAuth && window.TADAAdminAuth.getToken) ? window.TADAAdminAuth.getToken() : '';
  }
  function isAdminUser() {
    return !!(window.TADAAdminAuth && window.TADAAdminAuth.isAdmin && window.TADAAdminAuth.isAdmin());
  }

  function showMsg(target, text, type) {
    if (!target) return;
    target.textContent = text;
    target.className = 'form-msg' + (type ? ' ' + type : '') + (type ? '' : ' hidden');
  }

  /* ===== Trạng thái ADMIN (Google + ADMIN_EMAILS) ===== */
  function renderConnected(isAdmin) {
    var note = document.getElementById('services-conn-note');
    if (note) note.style.display = isAdmin ? 'flex' : 'none';
    var statusEl = document.getElementById('services-conn-status');
    if (statusEl) {
      statusEl.textContent = isAdmin
        ? 'Đã đăng nhập quản trị (Google).'
        : (window.TADAAdminAuth && window.TADAAdminAuth.isLoggedIn && window.TADAAdminAuth.isLoggedIn())
          ? 'Tài khoản của bạn không có quyền sử dụng chức năng này.'
          : 'Vui lòng đăng nhập bằng tài khoản quản trị (Google) để sử dụng chức năng.';
    }
    if (el.editorWrap) el.editorWrap.style.display = isAdmin ? 'block' : 'none';
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
          showMsg(el.msg, 'Phiên đăng nhập hết hạn — đăng nhập lại (Google).', 'error');
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
          showMsg(el.saveMsg, 'Phiên hết hạn — đăng nhập lại', 'error');
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

    el.saveBtn?.addEventListener('click', saveContent);

    // Trạng thái ADMIN — theo dõi session + danh sách admin thay đổi
    function syncAuth() {
      var isAdmin = isAdminUser();
      renderConnected(isAdmin);
      if (isAdmin) loadContent();
    }
    syncAuth();
    var _orig = window.__tadaSession;
    setInterval(function () {
      if (window.__tadaSession !== _orig) {
        _orig = window.__tadaSession;
        syncAuth();
      }
    }, 1500);
    // Khi danh sách admin emails tải xong (/api/config) → check lại
    // Chain callback: không ghi đè mà gọi cả notify cũ
    if (window.TADAAdminAuth) {
      var _prevNotify = window.TADAAdminAuth._notify;
      window.TADAAdminAuth._notify = function () {
        if (_prevNotify) _prevNotify();
        syncAuth();
      };
    }

    document.querySelectorAll('.admin-nav-btn[data-view="services"]').forEach(function (btn) {
      btn.addEventListener('click', function () { setTimeout(function () { if (getToken()) loadContent(); }, 50); });
    });
  }

  function init() {
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();