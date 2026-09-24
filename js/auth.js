    /* ====================================
       AUTH — Supabase Google OAuth
       ==================================== */
    (function () {
      var SUPABASE_URL = '', SUPABASE_ANON_KEY = '';
      var MAX_FREE = 3;
      var FREE_KEY = 'tada_free_count';
      var supabase = null;
      var session = null;

      /* Placeholder — đảm bảo TADA_AUTH luôn tồn tại từ lúc script chạy,
         trước khi fetch config hoàn thành.
         audit.js sẽ gọi isLoggedIn() → false → hiện overlay.
         Sau khi config load xong + checkSession → isLoggedIn() trả true. */
      window.TADA_AUTH = { isLoggedIn: function(){ return false; }, canAsk: function(){ return false; }, log: function(){}, getSession: function(){ return null; } };

      /* Lazy-load Supabase SDK — inject script tag on demand */
      function loadSupabaseSdk() {
        return new Promise(function (resolve) {
          if (window.supabase) { resolve(); return; }
          var s = document.createElement('script');
          s.src = 'https://unpkg.com/@supabase/supabase-js@2';
          s.defer = true;
          s.onload = resolve;
          s.onerror = resolve;
          document.head.appendChild(s);
        });
      }

      /* Lấy config từ backend */
      fetch('/api/config')
        .then(function (r) { return r.json(); })
        .then(function (cfg) {
          SUPABASE_URL = cfg.supabaseUrl;
          SUPABASE_ANON_KEY = cfg.supabaseAnonKey;
          if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
          return loadSupabaseSdk();
        })
        .then(function () {
          if (!window.supabase) return;
          supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          // Lang nghe auth state change (can dat SAU khi supabase duoc tao)
          supabase.auth.onAuthStateChange(function (event, sess) {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
              session = sess;
              updateUI();
            } else if (event === 'SIGNED_OUT') {
              session = null;
              updateUI();
            }
          });
          checkSession();
        })
        .catch(function () { console.warn('Không lấy được config.'); });

      function checkSession() {
        if (!supabase) return;
        supabase.auth.getSession().then(function (res) {
          if (res.error) return;
          session = res.data.session;
          updateUI();
        });
      }

      function updateUI() {
        var loginBtn = document.getElementById('btn-login');
        var avatar = document.getElementById('user-avatar');
        var chatbox = document.getElementById('chatbox');
        if (!loginBtn || !avatar) return;

        if (session) {
          loginBtn.style.display = 'none';
          avatar.style.display = 'flex';
          var img = document.getElementById('avatar-img');
          if (img) {
            var avatarUrl = session.user.user_metadata.avatar_url || '';
            // Chống XSS: chỉ chấp nhận URL https:// (chặn javascript:/data:/vbscript:)
            img.src = /^https:\/\//i.test(avatarUrl) ? avatarUrl : '';
          }
          var name = document.getElementById('user-name');
          if (name) name.textContent = session.user.user_metadata.full_name || session.user.email || 'User';
          var email = document.getElementById('user-email');
          if (email) email.textContent = session.user.email || '';

          // Hiện nút "Viết bài" nếu là ADMIN — kiểm tra SERVER (/api/admin/check),
          // không lộ danh sách ADMIN_EMAILS ra client (fix review 2026-08-10)
          var writeBtn = document.getElementById('btn-write-post');
          if (writeBtn) {
            var token = session.access_token;
            if (!token) { writeBtn.style.display = 'none'; }
            else {
              fetch('/api/admin/check', { headers: { 'Authorization': 'Bearer ' + token } })
                .then(function (r) { writeBtn.style.display = r.ok ? 'block' : 'none'; })
                .catch(function () { writeBtn.style.display = 'none'; });
            }
          }

          if (chatbox) chatbox.dataset.loggedIn = 'true';
          localStorage.removeItem(FREE_KEY);
        } else {
          loginBtn.style.display = 'inline-flex';
          avatar.style.display = 'none';
          if (chatbox) {
            chatbox.dataset.loggedIn = 'false';
            chatbox.dataset.freeCount = localStorage.getItem(FREE_KEY) || '0';
          }
        }
        publishSession();
      }

      /* Login - Google OAuth */
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('#btn-login') || e.target.closest('#btn-auth-google');
        if (!btn) return;
        function doLogin() { supabase.auth.signInWithOAuth({ provider: 'google' }); }
        if (supabase) { doLogin(); } else { loadSupabaseSdk().then(doLogin); }
        // Dong dropdown neu dang mo
        document.getElementById('user-avatar')?.classList.remove('active');
      });

      /* Toggle dropdown khi click avatar */
      document.addEventListener('click', function (e) {
        var avatar = document.getElementById('user-avatar');
        if (!avatar) return;
        if (e.target.closest('#user-avatar')) {
          avatar.classList.toggle('active');
        } else {
          avatar.classList.remove('active');
        }
      });

      /* Logout */
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('#btn-logout');
        if (!btn) return;
        function doLogout() {
          supabase.auth.signOut().then(function () {
            session = null;
            updateUI();
            localStorage.removeItem(FREE_KEY);
          }).catch(function (e) { console.error(e); });
        }
        if (supabase) { doLogout(); } else { loadSupabaseSdk().then(doLogout); }
      });

      /* Lắng nghe auth state change (đã chuyển xuống sau createClient) */

      /* Thông báo session cho các module khác (audit.js...) */
      function publishSession() {
        document.dispatchEvent(new CustomEvent('tada:auth', { detail: { session: session } }));
      }

      /* Hàm public: kiểm tra còn câu hỏi không */
      window.TADA_AUTH = {
        canAsk: function () {
          if (session) return true;
          var count = parseInt(localStorage.getItem(FREE_KEY) || '0', 10);
          return count < MAX_FREE;
        },
        useQuestion: function () {
          if (session) return;
          var count = parseInt(localStorage.getItem(FREE_KEY) || '0', 10);
          localStorage.setItem(FREE_KEY, String(count + 1));
          var chatbox = document.getElementById('chatbox');
          if (chatbox) chatbox.dataset.freeCount = String(count + 1);
        },
        isLoggedIn: function () {
          return !!session;
        },
        getSession: function () {
          return session;
        },
        logout: function () {
          if (!supabase) return;
          supabase.auth.signOut().then(function () {
            session = null;
            updateUI();
            localStorage.removeItem(FREE_KEY);
          }).catch(function () {});
        },
        remainingFree: function () {
          if (session) return Infinity;
          return MAX_FREE - (parseInt(localStorage.getItem(FREE_KEY) || '0', 10));
        },
        log: function (action, detail, qCount) {
          if (!session) return;
          var token = session.access_token;
          if (!token) return;
          var name = session.user.user_metadata?.full_name || '';
          fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({
              user_name: name,
              action: action,
              detail: detail || '',
              question_count: qCount || 0
            })
          }).catch(function () {});
        }
      };
    })();
