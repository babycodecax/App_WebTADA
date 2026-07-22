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
    return (text || '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^#+\s*/gm, '')
      .replace(/\[Nguồn\s*\d+\]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
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

  function showSources(sources) {
    if (!sources || !sources.length) return;
    var box = document.createElement('div');
    box.className = 'chat-sources';
    sources.forEach(function (s) {
      var heading = [s.title, s.heading].filter(Boolean).join(' › ');
      var item = document.createElement('div');
      item.className = 'chat-source';
      var label = document.createElement('b');
      label.textContent = '📚 Nguồn: ';
      item.appendChild(label);
      item.appendChild(document.createTextNode(cleanMd(heading)));
      box.appendChild(item);
    });
    messagesEl.appendChild(box);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;

    busy = true;
    sendEl.disabled = true;
    addMsg(text, 'user');
    inputEl.value = '';
    autoGrow();
    setTyping(true);

    var botEl = null, acc = '';

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
