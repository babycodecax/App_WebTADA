/* admin-auth.js — Xác thực admin THỐNG NHẤT bằng tài khoản Google (Supabase session).
   Bỏ mật khẩu ADMIN_PASSWORD. Các module admin (docs/sources/forms/services) dùng
   TADAAdminAuth.getToken() để lấy access_token của session Google đã đăng nhập
   (blog-admin.js expose window.__tadaSession). */
(function () {
  'use strict';

  window.TADAAdminAuth = {
    /** Lấy access_token của session Google (rỗng nếu chưa đăng nhập). */
    getToken: function () {
      try {
        var s = window.__tadaSession;
        return (s && s.access_token) ? s.access_token : '';
      } catch (e) { return ''; }
    },
    /** Email admin đang đăng nhập (nếu có). */
    getEmail: function () {
      try {
        var s = window.__tadaSession;
        return (s && s.user && s.user.email) ? s.user.email : '';
      } catch (e) { return ''; }
    },
    /** Đã đăng nhập Google chưa. */
    isLoggedIn: function () {
      return !!this.getToken();
    }
  };
})();