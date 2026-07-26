/* ==========================================================================
   CHATBOX LOGIC - DICH VU THUE KE TOAN TADA
   Tích hợp Obsidian RAG backend (SSE stream): http://localhost:8000
   ========================================================================== */

// Mặc định: empty = same-origin (Next.js proxy). Dev: set trong index.html  OB_CONFIG.apiUrl.
var RAG_API_URL = window.OB_CONFIG && window.OB_CONFIG.apiUrl ? window.OB_CONFIG.apiUrl : '';

document.addEventListener('DOMContentLoaded', function () {
  var messagesEl = document.getElementById('chat-messages');
  var inputEl = document.getElementById('chat-input');
  var sendEl = document.getElementById('chat-send');
  var resetEl = document.getElementById('chat-reset');
  var suggestEl = document.getElementById('chat-suggest');

  if (!messagesEl || !inputEl) return;

  var busy = false;

  function cleanMd(text) {
    var cleaned = (text || '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^#+\s*/gm, '')

    // Strip moi dong lien quan den nguon tham khao
    var lines = cleaned.split(/\r?\n/);
    var result = [];
    var inSources = false;
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();

      // Bo dong gioi thieu danh sach nguon — ke ca sai chinh ta "nguồi"
      if (/(?:nguồ|Nguồ|tài liệu|Tài liệu).*(?:tham khảo|đã dùng|sử dụng)/i.test(s) ||
          /^Danh\s+sách/i.test(s)) {
        inSources = true;
        continue;
      }
      if (inSources) {
        if (!s || s.startsWith('-') || s.startsWith('•') || s.startsWith('*')) continue;
        inSources = false;
      }

      // Bo dong bat bang "-" co chua "Nguồn" hoac "Cheatsheet"
      if (/^-\s*(?:Nguồn|Cheatsheet|glossary|Single Source of Truth|📌|📚)/i.test(s)) continue;

      // Bo inline [Nguon X, ...] bat ky dang nao - quet rong
      s = s.replace(/\[Nguồn\s*\d+[^\]]*\]/gi, '')
           .replace(/\s{2,}/g, ' ')
           .trim();
      if (s) result.push(s);
    }
    return result.join('\n').trim();
  }

  function addMsg(text, who) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + who;
    div.textContent = cleanMd(text);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function setTyping(on) {
    var old = messagesEl.querySelector('.chat-msg.typing');
    if (on && !old) {
      var t = document.createElement('div');
      t.className = 'chat-msg bot typing';
      t.innerHTML = '<span></span><span></span><span></span>';
      messagesEl.appendChild(t);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (!on && old) {
      old.remove();
    }
  }

  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  }

  function showAuthOverlay() {
    var overlay = document.getElementById('chat-auth-overlay');
    if (overlay) overlay.classList.add('active');
  }

  function hideAuthOverlay() {
    var overlay = document.getElementById('chat-auth-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  function checkFreeLimit() {
    if (window.TADA_AUTH && !window.TADA_AUTH.canAsk()) {
      showAuthOverlay();
      return true; // bi chan
    }
    hideAuthOverlay();
    return false;
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;

    // Kiem tra free limit
    if (checkFreeLimit()) return;

    busy = true;
    sendEl.disabled = true;
    addMsg(text, 'user');
    inputEl.value = '';
    autoGrow();
    setTyping(true);

    var botEl = null, acc = '';

    // Dem cau hoi free (chi khi chua login)
    if (window.TADA_AUTH) window.TADA_AUTH.useQuestion();

    // Ghi log cau hoi (neu da login)
    if (window.TADA_AUTH && window.TADA_AUTH.isLoggedIn()) {
      window.TADA_AUTH.log('question', text, 0);
    }

    var body = JSON.stringify({ question: text, top_k: 3 });
    var url = (RAG_API_URL.replace(/\/+$/, '')) + '/api/chat';

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    })
      .then(function (res) {
        if (!res.ok || !res.body) throw new Error('API ' + res.status);
        var reader = res.body.getReader();
        var decoder = new TextDecoder('utf-8');
        var buffer = '';

        function pump() {
          return reader.read().then(function (chunk) {
            if (chunk.done) return;
            buffer += decoder.decode(chunk.value, { stream: true });
            var parts = buffer.split('\n\n');
            buffer = parts.pop();
            for (var i = 0; i < parts.length; i++) handleEvent(parts[i]);
            return pump();
          });
        }
        return pump();
      })
      .catch(function (e) {
        setTyping(false);
        addMsg('Xin lỗi, tôi tạm thời không thể trả lời. Vui lòng thử lại hoặc liên hệ Zalo 0986.4242.86.', 'bot');
        console.error(e);
      })
      .then(function () {
        setTyping(false);
        busy = false; sendEl.disabled = false; inputEl.focus();
        // Kiem tra lai limit sau khi tra loi
        checkFreeLimit();
      });

    function handleEvent(block) {
      var m = block.match(/^data:\s*(.*)$/);
      if (!m) return;
      var payload;
      try { payload = JSON.parse(m[1]); } catch (e) { return; }
      if (payload.type === 'sources') {
        // Bỏ qua — nguồn đã được liệt kê ở cuối câu trả lời
      } else if (payload.type === 'token') {
        if (!botEl) { setTyping(false); botEl = addMsg('', 'bot'); }
        acc += payload.data;
        botEl.textContent = cleanMd(acc);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (payload.type === 'error') {
        setTyping(false);
        addMsg('Lỗi: ' + payload.data, 'bot');
      }
    }
  }

  function reset() {
    messagesEl.innerHTML = '';
    setTyping(false);
    busy = false; sendEl.disabled = false;
    addMsg('Xin chào! Tôi là trợ lý ảo của TADA. Bạn cần giải đáp thắc mắc gì về thuế, kế toán, BHXH hay thủ tục doanh nghiệp?', 'bot');
  }

  sendEl.addEventListener('click', function () { send(inputEl.value); });
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(inputEl.value); }
  });
  inputEl.addEventListener('input', autoGrow);
  if (resetEl) resetEl.addEventListener('click', reset);
  if (suggestEl) {
    suggestEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (btn) send(btn.textContent);
    });
  }
  autoGrow();
});
