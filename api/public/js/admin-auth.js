/* admin-auth.js — Xác thực admin THỐNG NHẤT bằng tài khoản Google (Supabase session).
   CHỈ khóa 4 chức năng trong trang admin (Quản lý tài liệu, Dịch vụ, Soạn bài,
   Bài viết) cho tài khoản khách — trang chủ public (thư viện, chatbox, blog xem)
   KHÔNG bị ảnh hưởng.
   Quyền admin KIỂM TRA Ở SERVER (/api/admin/check) — client KHÔNG giữ danh
   sách ADMIN_EMAILS (fix review 2026-08-10: không lộ email admin qua /api/config). */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';
  var _isAdmin = false;
  var _isLoading = false;

  // Gọi /api/admin/check với Bearer token — server quyết định đúng/sai.
  // Nếu chưa có session (blog-admin.js chưa set xong __tadaSession) → thử lại
  // sau 300ms tối đa 10 lần — tránh kết luận "không admin" sai trước khi session sẵn.
  var _retries = 0;
  function checkAdmin() {
    if (_isLoading) return;
    var token = window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '';
    if (!token) {
      _retries++;
      if (_retries <= 10) { setTimeout(checkAdmin, 300); return; }
      _isAdmin = false; notify(); return;
    }
    _isLoading = true;
    fetch(API + '/api/admin/check', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) {
        _isAdmin = r.ok;
        _retries = 0;
        notify();
      })
      .catch(function () { _isAdmin = false; notify(); })
      .finally(function () { _isLoading = false; });
  }

  function notify() {
    var n = window.TADAAdminAuth && window.TADAAdminAuth._notify;
    if (n) n();
  }

  window.TADAAdminAuth = {
    /** Lấy access_token của session Google (rỗng nếu chưa đăng nhập). */
    getToken: function () {
      try {
        var s = window.__tadaSession;
        return (s && s.access_token) ? s.access_token : '';
      } catch (e) { return ''; }
    },
    /** Email đang đăng nhập (nếu có). */
    getEmail: function () {
      try {
        var s = window.__tadaSession;
        return (s && s.user && s.user.email) ? s.user.email : '';
      } catch (e) { return ''; }
    },
    /** Đã đăng nhập Google chưa (bất kỳ tài khoản nào). */
    isLoggedIn: function () {
      return !!this.getToken();
    },
    /** Có phải ADMIN không — kết quả SERVER (Bearer token), cache tới khi session đổi. */
    isAdmin: function () {
      return _isAdmin;
    },
    /** Yêu cầu kiểm tra lại quyền admin (gọi khi session thay đổi). */
    refreshAdmin: function () {
      _isAdmin = false;
      checkAdmin();
    },
    /** Callback — các module đăng ký để nhận thông báo khi trạng thái đổi. */
    _notify: null
  };

  // Kiểm tra admin khi load (nếu đã có session trong localStorage của supabase-js).
  // Lưu ý: window.__tadaSession được blog-admin.js set SAU khi có session — các
  // module khác (admin-docs/admin-services) tự gọi refreshAdmin khi session đổi.
  // Nếu checkAdmin() chạy khi CHƯA có token (chưa login) → refreshAdmin()
  // được gọi lại sau khi đăng nhập (blog-admin.js) để lấy kết quả đúng.
  checkAdmin();
})();