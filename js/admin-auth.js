/* admin-auth.js — Xác thực admin THỐNG NHẤT bằng tài khoản Google (Supabase session).
   CHỈ khóa 4 chức năng trong trang admin (Quản lý tài liệu, Dịch vụ, Soạn bài,
   Bài viết) cho tài khoản khách — trang chủ public (thư viện, chatbox, blog xem)
   KHÔNG bị ảnh hưởng.
   Chỉ tài khoản trong ADMIN_EMAILS mới là admin. */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';
  var _adminEmails = [];
  var _isLoading = false;

  // Lấy danh sách admin emails từ /api/config (gọi 1 lần)
  function loadAdminEmails() {
    if (_isLoading) return;
    _isLoading = true;
    fetch(API + '/api/config')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        _adminEmails = (cfg && Array.isArray(cfg.adminEmails)) ? cfg.adminEmails : [];
        // Sau khi có danh sách → thông báo cho các module cập nhật UI
        var n = window.TADAAdminAuth && window.TADAAdminAuth._notify;
        if (n) n();
      })
      .catch(function () { /* giữ rỗng — mặc định không admin */ })
      .finally(function () { _isLoading = false; });
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
    /** Có phải ADMIN (email ∈ ADMIN_EMAILS) không — tài khoản khách = false. */
    isAdmin: function () {
      if (!this.isLoggedIn()) return false;
      var email = this.getEmail().toLowerCase();
      if (!email) return false;
      return _adminEmails.indexOf(email) !== -1;
    },
    /** Danh sách email admin được cấp quyền (public config). */
    getAdminEmails: function () {
      return _adminEmails.slice();
    },
    /** Callback — các module đăng ký để nhận thông báo khi danh sách admin đổi. */
    _notify: null
  };

  // Tải danh sách admin emails khi load
  loadAdminEmails();
})();