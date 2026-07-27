/* Blog Admin — soạn bài, danh sách, CRUD */
(function () {
  'use strict';

  var API = window.LOCAL_API ? window.LOCAL_API : '';
  var SUPABASE_URL = '', SUPABASE_ANON_KEY = '';
  var supabase = null;
  var session = null;
  var editingId = null;

  /* ===== Init ===== */
  function init() {
    // Lấy config từ backend
    fetch(API + '/api/config')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        SUPABASE_URL = cfg.supabaseUrl;
        SUPABASE_ANON_KEY = cfg.supabaseAnonKey;
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
          showMsg('Lỗi cấu hình Supabase', 'error');
          return;
        }
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: 'pkce' } });
        supabase.auth.onAuthStateChange(function (ev, sess) {
          session = sess;
          updateAuthUI();
          if (ev === 'SIGNED_IN') loadPostList();
        });
        // Kiểm tra session hiện tại
        supabase.auth.getSession().then(function (res) {
          if (!res.error && res.data.session) {
            session = res.data.session;
            updateAuthUI();
            loadPostList();
          }
        });
      })
      .catch(function () { showMsg('Không lấy được cấu hình', 'error'); });

    // Bind events
    bindEvents();
  }

  function bindEvents() {
    // Login
    document.getElementById('admin-login')?.addEventListener('click', function () {
      if (!supabase) return;
      supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/admin' } });
    });

    // Logout
    document.getElementById('admin-logout')?.addEventListener('click', function () {
      if (!supabase) return;
      supabase.auth.signOut().then(function () {
        session = null;
        editingId = null;
        updateAuthUI();
        document.getElementById('post-list').innerHTML = '';
      });
    });

    // View switching
    document.querySelectorAll('.admin-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.admin-nav-btn').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.admin-view').forEach(function (v) { v.classList.remove('active'); });
        btn.classList.add('active');
        var view = document.getElementById('view-' + btn.dataset.view);
        if (view) view.classList.add('active');
        if (btn.dataset.view === 'list') loadPostList();
      });
    });

    // Submit form
    document.getElementById('post-form')?.addEventListener('submit', function (e) {
      e.preventDefault();
      savePost();
    });

    // Preview
    document.getElementById('btn-preview')?.addEventListener('click', function () {
      togglePreview();
    });
  }

  /* ===== Auth UI ===== */
  function updateAuthUI() {
    var loginBtn = document.getElementById('admin-login');
    var logoutBtn = document.getElementById('admin-logout');
    var emailSpan = document.getElementById('admin-email');
    var avatar = document.getElementById('admin-avatar');

    if (session) {
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'inline-block';
      emailSpan.textContent = session.user.email || '';
      if (session.user.user_metadata?.avatar_url) {
        avatar.src = session.user.user_metadata.avatar_url;
        avatar.style.display = 'inline';
      }
    } else {
      loginBtn.style.display = 'inline-block';
      logoutBtn.style.display = 'none';
      emailSpan.textContent = '';
      avatar.style.display = 'none';
    }
  }

  /* ===== Save post ===== */
  function savePost() {
    if (!session) {
      showMsg('Cần đăng nhập để đăng bài', 'error');
      return;
    }

    var title = document.getElementById('post-title').value.trim();
    var slug = document.getElementById('post-slug').value.trim();
    var summary = document.getElementById('post-summary').value.trim();
    var content = document.getElementById('post-content').value.trim();
    var status = document.getElementById('post-status').value;

    if (!title) { showMsg('Tiêu đề không được để trống', 'error'); return; }
    if (!content) { showMsg('Nội dung không được để trống', 'error'); return; }

    var token = session.access_token;
    console.log('session:', session);
    console.log('token:', token ? token.substring(0,20)+'...' : 'MISSING');
    if (!token) {
      showMsg('Token đăng nhập không hợp lệ. Thử đăng nhập lại.', 'error');
      document.getElementById('btn-save').disabled = false;
      return;
    }
    var url = API + '/api/blog';
    var method = 'POST';

    if (editingId) {
      url = API + '/api/blog/' + editingId;
      method = 'PUT';
    }

    var body = { title: title, slug: slug || null, summary: summary, content: content, status: status };

    showMsg('Đang lưu...', '');
    document.getElementById('btn-save').disabled = true;

    console.log('POST', url, 'token length:', token.length);
    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body)
    })
    .then(function (r) {
      return r.text().then(function (t) {
        console.log('POST response', r.status, t);
        if (!r.ok) throw new Error(t);
        return JSON.parse(t);
      });
    })
    .then(function () {
      showMsg(editingId ? 'Đã cập nhật bài viết!' : 'Đã đăng bài viết!', 'success');
      resetForm();
      loadPostList();
      document.querySelector('[data-view="list"]').click();
    })
    .catch(function (err) {
      var msg = err.message || String(err);
      // Cắt response body nếu quá dài
      if (msg.length > 300) msg = msg.substring(0, 300) + '...';
      showMsg('Lỗi: ' + msg, 'error');
    })
    .finally(function () {
      document.getElementById('btn-save').disabled = false;
    });
  }

  /* ===== Load post list ===== */
  function loadPostList() {
    var listEl = document.getElementById('post-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="blog-loading">Đang tải...</div>';

    fetch(API + '/api/blog?limit=50')
      .then(function (r) { return r.json(); })
      .then(function (posts) {
        if (!posts || !posts.length) {
          listEl.innerHTML = '<div class="blog-empty">Chưa có bài viết nào. Soạn bài mới để bắt đầu.</div>';
          return;
        }
        listEl.innerHTML = '';
        posts.forEach(function (p) {
          var item = document.createElement('div');
          item.className = 'post-list-item';
          var statusBadge = p.status === 'published' ? '✅ Đã xuất bản' : '📝 Nháp';
          item.innerHTML =
            '<div class="post-list-info">' +
              '<div class="post-list-title">' + escHtml(p.title) + '</div>' +
              '<div class="post-list-meta">' + statusBadge + ' — ' + (p.published_at ? formatDate(p.published_at) : 'Chưa đăng') + ' — /blog/' + escHtml(p.slug) + '</div>' +
            '</div>' +
            '<div class="post-list-actions">' +
              '<button class="edit-btn" data-id="' + p.id + '">Sửa</button>' +
              '<button class="delete-btn" data-id="' + p.id + '">Xoá</button>' +
            '</div>';
          listEl.appendChild(item);
        });

        // Bind edit/delete
        listEl.querySelectorAll('.edit-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = this.dataset.id;
            var post = posts.find(function (p) { return p.id === id; });
            if (post) editPost(post);
          });
        });
        listEl.querySelectorAll('.delete-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (confirm('Xoá bài viết này?')) deletePost(this.dataset.id);
          });
        });
      })
      .catch(function () {
        listEl.innerHTML = '<div class="blog-error">Không thể tải danh sách.</div>';
      });
  }

  function editPost(post) {
    editingId = post.id;
    document.getElementById('post-title').value = post.title || '';
    document.getElementById('post-slug').value = post.slug || '';
    document.getElementById('post-summary').value = post.summary || '';
    document.getElementById('post-content').value = post.content || '';
    document.getElementById('post-status').value = post.status || 'published';
    document.getElementById('btn-save').textContent = 'Cập nhật';
    document.querySelector('[data-view="editor"]').click();
  }

  function deletePost(id) {
    if (!session) { showMsg('Cần đăng nhập', 'error'); return; }

    // Refresh session để lấy token mới
    supabase.auth.refreshSession().then(function(refreshRes) {
      if (refreshRes.error) { showMsg('Phiên đăng nhập hết hạn, đăng nhập lại', 'error'); return; }
      session = refreshRes.data.session;
      var token = session.access_token;
      if (!token) { showMsg('Token không hợp lệ', 'error'); return; }

      showMsg('Đang xoá...', '');
      fetch(API + '/api/blog/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t); });
        loadPostList();
        showMsg('Đã xoá bài viết', 'success');
      })
      .catch(function (err) {
        var msg = err.message || String(err);
        if (msg.length > 200) msg = msg.substring(0,200) + '...';
        showMsg('Lỗi: ' + msg, 'error');
      });
    });
  }

  function resetForm() {
    editingId = null;
    document.getElementById('post-form').reset();
    document.getElementById('btn-save').textContent = 'Đăng bài';
    document.getElementById('preview-box').style.display = 'none';
  }

  function togglePreview() {
    var box = document.getElementById('preview-box');
    var content = document.getElementById('post-content').value;
    var preview = document.getElementById('preview-content');
    if (box.style.display === 'none') {
      if (typeof marked !== 'undefined') {
        preview.innerHTML = marked.parse(content || '*Chưa có nội dung*');
      } else {
        preview.textContent = content || '(chưa có nội dung)';
      }
      box.style.display = 'block';
    } else {
      box.style.display = 'none';
    }
  }

  /* ===== Helpers ===== */
  function showMsg(text, type) {
    var el = document.getElementById('form-msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'form-msg' + (type ? ' ' + type : '');
    if (!type) el.className += ' hidden';
  }

  function escHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { year:'numeric', month:'long', day:'numeric' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
