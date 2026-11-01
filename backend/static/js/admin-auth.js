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
  var _tokenRetries = 0; // chờ session sẵn (blog-admin set __tadaSession)
  var _netRetries = 0; // retry lỗi MẠNG — không đổi trạng thái hiện tại
  var _netRetrying = false; // đang hẹn retry mạng (chưa tạm coi "loading")
  var _pendingCheck = false; // có yêu cầu check khi đang chạy 1 check khác

  // Gọi /api/admin/check với Bearer token — server quyết định đúng/sai.
  // Nếu chưa có session (blog-admin.js chưa set xong __tadaSession) → thử lại
  // sau 300ms tối đa 10 lần — tránh kết luận "không admin" sai trước khi session sẵn.
  // SỰ CỐ TẠM THỜI (offline, gateway, HTTP 5xx) → GIỮ trạng thái cũ, retry 1s
  // đến 3 lần — không ẩn panel admin vì lỗi hạ tầng nhất thời (fix 2026-11-01:
  // trước đây 1 lần fail network/5xx là _isAdmin=false → panel tự ẩn hết).
  // 401/403 (server chủ động từ chối) → mới ẩn đúng ý.
  function scheduleRetry() {
    if (_netRetries < 3) {
      _netRetries++;
      _netRetrying = true;
      setTimeout(function () {
        _netRetrying = false;
        _isLoading = false;
        checkAdmin();
      }, 1000);
      return true;
    }
    return false; // hết retry: vẫn giữ trạng thái cũ
  }

  function checkAdmin() {
    if (_isLoading) { _pendingCheck = true; return; }
    var token = window.TADAAdminAuth ? window.TADAAdminAuth.getToken() : '';
    if (!token) {
      _tokenRetries++;
      if (_tokenRetries <= 10) { setTimeout(checkAdmin, 300); return; }
      _isAdmin = false; notify(); return;
    }
    _isLoading = true;
    fetch(API + '/api/admin/check', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) {
        if (r.status >= 500) {
          scheduleRetry(); // lỗi server — giữ trạng thái cũ (như sự cố mạng)
          return;
        }
        _isAdmin = r.ok;
        _tokenRetries = 0; _netRetries = 0;
        notify();
      })
      .catch(function () {
        // Lỗi mạng — giữ trạng thái cũ, retry tối đa 3 lần
        var scheduledAll = scheduleRetry();
        if (!scheduledAll) notify();
      })
      .finally(function () {
        if (!_netRetrying) _isLoading = false;
        if (_pendingCheck && !_netRetrying) { _pendingCheck = false; checkAdmin(); }
      });
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
    /** Yêu cầu kiểm tra lại quyền admin (gọi khi session thay đổi).
     *  fix 2026-11-01: KHÔNG xá _isAdmin=false trước khi check (false-first
     *  làm panel admin chớp tắt/mất) — chỉ ẩn ngay khi đã đăng XUẤT (mất token).
     *  Còn token → giữ kết quả cũ đến khi check mới trả về. */
    refreshAdmin: function () {
      var token = this.getToken();
      if (!token) {
        _tokenRetries = 0;
        _isAdmin = false; notify();
      }
      checkAdmin();
    },
    /** Kiểm tra im lặng (quay lại tab) — không xá trạng thái, lỗi mạng giữ trạng thái cũ. */
    recheck: function () {
      _netRetries = 0;
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