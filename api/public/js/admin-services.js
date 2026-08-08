/* Admin Quản lý dịch vụ landing page — xem/thêm/sửa/xóa (ADMIN_PASSWORD, dùng chung token với tab Upload) */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';
  var TOKEN_KEY = 'tada_admin_token';
  var el = { list: null, msg: null, toolbar: null };
  var allServices = [];
  var editingId = null;

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

  function escHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function escAttr(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
        loadServices();
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
    if (el.toolbar) el.toolbar.style.display = connected ? 'flex' : 'none';
  }

  function showServicesMsg(text, type) {
    showMsg(document.getElementById('sv-form-msg'), text, type);
  }

  /* ===== Tải danh sách dịch vụ ===== */
  function loadServices() {
    if (!el.list) return;
    el.list.innerHTML = '<div class="blog-empty">Đang tải dịch vụ...</div>';

    fetch(API + '/api/admin/services', { headers: { 'Authorization': 'Bearer ' + getToken() } })
      .then(function (r) {
        if (r.status === 401) throw new Error('hết hạn');
        return r.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        if (!Array.isArray(data.services)) throw new Error('Dữ liệu không hợp lệ');
        allServices = data.services;
        renderServices(allServices);
        renderConnected(true);
      })
      .catch(function (err) {
        if (/hết hạn/i.test(err.message || '')) {
          renderConnected(false);
          el.list.innerHTML = '<div class="blog-error">Phiên quản trị hết hạn — kết nối lại ở mục trên.</div>';
          return;
        }
        el.list.innerHTML = '<div class="blog-error">Không thể tải danh sách dịch vụ: ' + escHtml(err.message || 'lỗi') + '</div>';
      });
  }

  /* ===== Render bảng dịch vụ ===== */
  function renderServices() {
    if (!el.list) return;
    if (!allServices.length) {
      el.list.innerHTML = '<div class="blog-empty">Chưa có dịch vụ nào — bấm "＋ Thêm dịch vụ mới".</div>';
      return;
    }

    var html = '<table class="sources-table"><thead><tr>' +
      '<th>STT</th><th>Nhóm</th><th>Dịch vụ</th><th>Thứ tự</th><th>Trạng thái</th><th>Thao tác</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < allServices.length; i++) {
      var s = allServices[i];
      var statusLabel = s.is_active === false
        ? '<span class="src-status src-deleted">Ẩn</span>'
        : '<span class="src-status src-ready">Hiển thị</span>';

      html += '<tr>' +
        '<td class="src-stt">' + (i + 1) + '</td>' +
        '<td><div class="src-title">' + escHtml((s.group_emoji ? s.group_emoji + ' ' : '') + s.group_name) + '</div>' +
          '<div class="src-path">' + escHtml(s.name || '') + '</div></td>' +
        '<td><div class="src-title">' + escHtml(s.name || '') + '</div>' +
          '<div class="src-path">' + escHtml((s.description || '').substring(0, 80) + ((s.description || '').length > 80 ? '…' : '')) + '</div></td>' +
        '<td>' + escHtml(String(s.sort_order || 0)) + '</td>' +
        '<td>' + statusLabel + '</td>' +
        '<td class="src-actions">' +
          '<button type="button" class="src-btn" data-act="edit" data-id="' + escAttr(s.id) + '">Sửa</button>' +
          '<button type="button" class="src-btn src-btn-del" data-act="del" data-id="' + escAttr(s.id) + '">Xóa</button>' +
        '</td></tr>';
    }
    html += '</tbody></table>';
    el.list.innerHTML = '<div class="sources-table-wrap">' + html + '</div>';

    el.list.querySelectorAll('button[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.dataset.act;
        var id = btn.dataset.id;
        if (act === 'edit') openEdit(findService(id));
        else if (act === 'del') deleteService(id);
      });
    });
  }

  function findService(id) {
    for (var i = 0; i < allServices.length; i++) {
      if (allServices[i].id === id) return allServices[i];
    }
    return null;
  }

  /* ===== Modal thêm/sửa ===== */
  function openForm(service) {
    editingId = service ? service.id : null;
    document.getElementById('service-edit-title').textContent = service ? 'Sửa dịch vụ' : 'Thêm dịch vụ mới';
    document.getElementById('sv-group-name').value = service ? service.group_name : '';
    document.getElementById('sv-group-emoji').value = service ? service.group_emoji : '';
    document.getElementById('sv-name').value = service ? service.name : '';
    document.getElementById('sv-description').value = service ? service.description : '';
    document.getElementById('sv-features').value = service && Array.isArray(service.features)
      ? service.features.join('\n') : '';
    document.getElementById('sv-sort-order').value = service ? String(service.sort_order || 0) : '0';
    document.getElementById('sv-active').checked = service ? (service.is_active !== false) : true;
    showServicesMsg('', '');
    document.getElementById('service-edit-overlay').style.display = 'flex';
    document.getElementById('sv-group-name').focus();
  }

  function closeForm() {
    document.getElementById('service-edit-overlay').style.display = 'none';
    editingId = null;
  }

  function readForm() {
    return {
      id: editingId || undefined,
      group_name: document.getElementById('sv-group-name').value.trim(),
      group_emoji: document.getElementById('sv-group-emoji').value.trim(),
      name: document.getElementById('sv-name').value.trim(),
      description: document.getElementById('sv-description').value.trim(),
      features: document.getElementById('sv-features').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean),
      sort_order: parseInt(document.getElementById('sv-sort-order').value || '0', 10) || 0,
      is_active: document.getElementById('sv-active').checked
    };
  }

  function saveService() {
    var data = readForm();
    if (!data.group_name || !data.name) {
      showServicesMsg('Cần điền ít nhất tên nhóm và tên dịch vụ', 'error');
      return;
    }
    document.getElementById('sv-save-btn').disabled = true;

    fetch(API + '/api/admin/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify(data)
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('hết hạn');
        return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Lưu thất bại'); return d; });
      })
      .then(function () {
        closeForm();
        loadServices();
      })
      .catch(function (err) {
        if (/hết hạn/i.test(err.message || '')) {
          showServicesMsg('Phiên hết hạn — kết nối lại', 'error');
          renderConnected(false);
        } else {
          showServicesMsg('Lưu thất bại: ' + (err.message || 'lỗi'), 'error');
        }
        document.getElementById('sv-save-btn').disabled = false;
      });
  }

  function deleteService(id) {
    var svc = findService(id);
    if (!svc) return;
    if (!confirm('Xóa dịch vụ "' + svc.name + '"?')) return;
    fetch(API + '/api/admin/services?id=' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('hết hạn');
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'Xóa thất bại');
        loadServices();
      })
      .catch(function (err) {
        if (!/hết hạn/i.test(err.message || '')) alert('Xóa thất bại: ' + (err.message || 'lỗi'));
      });
  }

  /* ===== Khởi tạo ===== */
  function bind() {
    el.list = document.getElementById('services-list');
    el.msg = document.getElementById('services-msg');
    el.toolbar = document.getElementById('services-toolbar');

    var connectBtn = document.getElementById('services-connect-btn');
    var logoutBtn = document.getElementById('services-logout-btn');
    var pwInput = document.getElementById('services-password');
    var addBtn = document.getElementById('services-add-btn');
    var closeBtn = document.getElementById('service-edit-close');
    var cancelBtn = document.getElementById('sv-cancel-btn');
    var overlay = document.getElementById('service-edit-overlay');

    connectBtn?.addEventListener('click', connect);
    logoutBtn?.addEventListener('click', logout);
    pwInput?.addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
    addBtn?.addEventListener('click', function () { openForm(null); });
    closeBtn?.addEventListener('click', closeForm);
    cancelBtn?.addEventListener('click', closeForm);
    overlay?.addEventListener('click', function (e) { if (e.target === overlay) closeForm(); });

    var form = document.getElementById('service-edit-form');
    form?.addEventListener('submit', function (e) { e.preventDefault(); saveService(); });

    // Hiển thị trạng thái kết nối ban đầu + auto load nếu đã có token
    var hasToken = !!getToken();
    renderConnected(hasToken);
    if (hasToken) loadServices();

    document.querySelectorAll('.admin-nav-btn[data-view="services"]').forEach(function (btn) {
      btn.addEventListener('click', function () { setTimeout(loadServicesIfToken, 50); });
    });
  }

  function loadServicesIfToken() {
    if (getToken()) loadServices();
  }

  function init() {
    bind();
    var active = document.querySelector('.admin-nav-btn.active');
    if (active && active.dataset.view === 'services') loadServicesIfToken();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();