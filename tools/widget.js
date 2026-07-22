/* ==========================================================================
   OBSIDIAN RAG CHATBOX WIDGET
   Tu tao DOM (FAB + panel), goi API SSE cua FastAPI backend.
   Nhung vao bat ky trang nao: <script src="widget.js"></script>
   Cau hinh: window.OB_CONFIG = { apiUrl: 'http://localhost:8000', title: '...' }
   ========================================================================== */
(function () {
  "use strict";

  var CONFIG = Object.assign(
    { apiUrl: "http://localhost:8000", title: "Trợ lý Thuế & Kế toán", subtitle: "Hỏi đáp từ kho tri thức Obsidian" },
    window.OB_CONFIG || {}
  );

  var SUGGESTIONS = [
    "Ai phải nộp thuế thu nhập cá nhân?",
    "Mức trần giá tính thuế ô tô hiện nay?",
    "Hóa đơn điện tử quy định thế nào?",
    "Miễn thuế TNCN với thu nhập bao nhiêu?"
  ];

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function cleanMd(text) {
    return (text || "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/^#+\s*/gm, "");
  }

  function buildWidget() {
    var fab = el("button", "ob-fab", "💬");
    fab.setAttribute("aria-label", "Mở trợ lý");

    var panel = el("div", "ob-panel");
    panel.innerHTML =
      '<div class="ob-header">' +
        '<div class="ob-avatar">TA</div>' +
        '<div><h1>' + CONFIG.title + '</h1><p>' + CONFIG.subtitle + '</p></div>' +
        '<button class="ob-close" aria-label="Đóng">×</button>' +
      '</div>' +
      '<div class="ob-messages"></div>' +
      '<div class="ob-input">' +
        '<textarea rows="1" placeholder="Nhập câu hỏi về thuế, kế toán..."></textarea>' +
        '<button class="ob-send" aria-label="Gửi">➤</button>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var messagesEl = panel.querySelector(".ob-messages");
    var inputEl = panel.querySelector("textarea");
    var sendEl = panel.querySelector(".ob-send");

    var busy = false;

    function addMsg(text, who) {
      var div = el("div", "ob-msg " + who, "");
      div.textContent = text;
      messagesEl.appendChild(div);
      scroll();
      return div;
    }

    function setTyping(on) {
      var old = messagesEl.querySelector(".ob-typing");
      if (on && !old) {
        var t = el("div", "ob-msg bot ob-typing", "<span></span><span></span><span></span>");
        messagesEl.appendChild(t);
        scroll();
      } else if (!on && old) {
        old.remove();
      }
    }

    function scroll() { messagesEl.scrollTop = messagesEl.scrollHeight; }

    function showSources(sources) {
      if (!sources || !sources.length) return;
      var box = el("div", "ob-sources");
      sources.forEach(function (s) {
        var heading = [s.title, s.heading].filter(Boolean).join(" › ");
        var item = el("div", "ob-source");
        var label = el("b", null, "📚 Nguồn: ");
        item.appendChild(label);
        item.appendChild(document.createTextNode(cleanMd(heading)));
        box.appendChild(item);
      });
      messagesEl.appendChild(box);
      scroll();
    }

    function autoGrow() {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
    }

    function open() { panel.classList.add("open"); fab.classList.add("hidden"); inputEl.focus(); }
    function close() { panel.classList.remove("open"); fab.classList.remove("hidden"); }

    fab.addEventListener("click", open);
    panel.querySelector(".ob-close").addEventListener("click", close);

    function send(text) {
      text = (text || "").trim();
      if (!text || busy) return;
      busy = true; sendEl.disabled = true;
      addMsg(text, "user");
      inputEl.value = ""; autoGrow();
      setTyping(true);
      var botEl = null, acc = "";

      var body = JSON.stringify({ question: text, top_k: 3 });
      fetch(CONFIG.apiUrl.replace(/\/+$/, "") + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body
      })
        .then(function (res) {
          if (!res.ok || !res.body) throw new Error("API " + res.status);
          var reader = res.body.getReader();
          var decoder = new TextDecoder("utf-8");
          var buffer = "";

          function pump() {
            return reader.read().then(function (chunk) {
              if (chunk.done) return;
              buffer += decoder.decode(chunk.value, { stream: true });
              var parts = buffer.split("\n\n");
              buffer = parts.pop();
              for (var i = 0; i < parts.length; i++) handleEvent(parts[i]);
              return pump();
            });
          }
          return pump();
        })
        .catch(function (e) {
          setTyping(false);
          addMsg("Xin lỗi, tôi tạm thời không thể trả lời. Vui lòng thử lại sau.", "bot");
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
        if (payload.type === "sources") {
          showSources(payload.data);
        } else if (payload.type === "token") {
          if (!botEl) { setTyping(false); botEl = addMsg("", "bot"); }
          acc += payload.data;
          botEl.textContent = cleanMd(acc);
          scroll();
        } else if (payload.type === "error") {
          setTyping(false);
          addMsg("Lỗi: " + payload.data, "bot");
        }
      }
    }

    sendEl.addEventListener("click", function () { send(inputEl.value); });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(inputEl.value); }
    });
    inputEl.addEventListener("input", autoGrow);

    addMsg("Xin chào! Tôi là trợ lý thuế & kế toán. Bạn cần giải đáp thắc mắc gì?", "bot");
    var sug = el("div", "ob-sources");
    SUGGESTIONS.forEach(function (q) {
      var b = el("button", "ob-source");
      b.style.cursor = "pointer"; b.style.textAlign = "left";
      b.textContent = "💡 " + q;
      b.addEventListener("click", function () { send(q); });
      sug.appendChild(b);
    });
    messagesEl.appendChild(sug);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
