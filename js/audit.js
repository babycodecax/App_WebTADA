/**
 * audit.js — Frontend logic Kiểm toán BCTC (gọn nhẹ)
 *
 * Chọn file → upload → hiện kết quả + nút xuất PDF/Word
 */

(function () {
  'use strict';

  var API_BASE = window.OB_CONFIG && window.OB_CONFIG.apiUrl ? window.OB_CONFIG.apiUrl.replace(/\/+$/, '') : '';

  var fileInput = document.getElementById('audit-file-input');
  var fileNameEl = document.getElementById('audit-file-name');
  var progressEl = document.getElementById('audit-progress');
  var resultEl = document.getElementById('audit-result');
  var badgeEl = document.getElementById('audit-badge');
  var summaryEl = document.getElementById('audit-summary');
  var errorEl = document.getElementById('audit-error');
  var exportBtn = document.getElementById('audit-export-btn');
  var downloadWordBtn = document.getElementById('audit-download-word-btn');
  var uploadLabel = document.getElementById('audit-upload-label');

  var lastResult = null;

  /* Lấy session trực tiếp từ auth module (window.TADA_AUTH) — đáng tin hơn event */
  function getSession() {
    if (window.TADA_AUTH && window.TADA_AUTH.getSession) return window.TADA_AUTH.getSession();
    return null;
  }

  /** Format VND */
  function fmtVND(n) {
    if (n == null) return '—';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
  }

  /** Hiển thị kết quả */
  function showResult(data) {
    lastResult = data;
    var total = data.total_violations || 0;
    var sev = data.by_severity || {};

    // Badge
    badgeEl.className = 'audit-badge';
    if (total === 0) {
      badgeEl.classList.add('ok');
      badgeEl.textContent = '✅';
    } else if (sev.critical > 0) {
      badgeEl.classList.add('err');
      badgeEl.textContent = '🔴';
    } else if (sev.high > 0) {
      badgeEl.classList.add('err');
      badgeEl.textContent = '🟠';
    } else {
      badgeEl.classList.add('warn');
      badgeEl.textContent = '🟡';
    }

    // Summary
    var parts = [];
    var sevLabels = { critical: 'nghiêm trọng', high: 'cao', medium: 'trung bình', low: 'thấp' };
    for (var k in sevLabels) {
      if (sev[k]) parts.push(sev[k] + ' ' + sevLabels[k]);
    }
    summaryEl.textContent = total > 0 ? total + ' vấn đề: ' + parts.join(', ') : 'Không phát hiện vấn đề';

    // Show export buttons
    if (data.html_report) exportBtn.style.display = 'inline-flex';
    if (data.word_report) downloadWordBtn.style.display = 'inline-flex';

    progressEl.style.display = 'none';
    resultEl.style.display = 'flex';
  }

  /** Upload file — auth check hoàn toàn ở server, client gửi token nếu có */
  function runAudit(file) {
    if (!file) return;

    if (fileNameEl) fileNameEl.textContent = '📄 ' + file.name;
    progressEl.style.display = 'flex';
    resultEl.style.display = 'none';
    errorEl.style.display = 'none';
    exportBtn.style.display = 'none';
    downloadWordBtn.style.display = 'none';

    var formData = new FormData();
    formData.append('file', file);

    var currentSession = getSession();
    var headers = {};
    if (currentSession && currentSession.access_token) {
      headers['Authorization'] = 'Bearer ' + currentSession.access_token;
    }

    fetch((API_BASE + '/api/audit/upload'), {
      method: 'POST',
      headers: headers,
      body: formData,
    })
      .then(function (res) {
        if (res.status === 401) {
          // Chưa đăng nhập hoặc hết hạn → hiện popup
          if (window.TADA_AUTH && window.TADA_AUTH.logout) window.TADA_AUTH.logout();
          var overlay = document.getElementById('chat-auth-overlay');
          if (overlay) overlay.classList.add('active');
          throw new Error('Vui lòng đăng nhập để sử dụng Rà soát BCTC');
        }
        if (!res.ok) return res.json().then(function (e) { throw new Error(e.detail?.error || e.error || 'Lỗi ' + res.status); });
        return res.json();
      })
      .then(function (data) {
        if (data.success === false) throw new Error(data.error || 'Audit thất bại');
        showResult(data);
      })
      .catch(function (err) {
        progressEl.style.display = 'none';
        errorEl.textContent = '❌ ' + (err.message || 'Lỗi kết nối');
        errorEl.style.display = 'block';
      });
  }

  /** Xuất HTML → in/PDF (mở tab để in) */
  function exportPDF() {
    if (!lastResult || !lastResult.html_report) return;
    var win = window.open('', '_blank');
    if (!win) { alert('Vui lòng cho phép pop-up để xuất báo cáo'); return; }
    win.document.title = lastResult.file_name || 'BaoCao_SoatXet_BCTC.pdf';
    // Sanitize chống XSS — html_report sinh từ dữ liệu file upload (fix review 2026-08-10)
    var html = lastResult.html_report;
    if (window.DOMPurify && window.DOMPurify.sanitize) html = window.DOMPurify.sanitize(html);
    win.document.write(html);
    win.document.close();
  }

  /** Tải Word về máy (.docx thật — Word mở 100%) */
  function downloadWord() {
    if (!lastResult || !lastResult.word_report) return;
    var isDocx = lastResult.word_format === 'docx';
    // Base64 → Blob
    var bin = atob(lastResult.word_report);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (lastResult.file_name || 'BaoCao_SoatXet_BCTC').replace(/\.pdf$/i, '') + (isDocx ? '.docx' : '.doc');
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ─── Events ───
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (file) runAudit(file);
    });
  }

  // Không can thiệp click — để <label> tự trigger file input theo behavior mặc định
  // (label wraps input → click label → browser tự mở file picker)

  // Export buttons
  if (exportBtn) exportBtn.addEventListener('click', exportPDF);
  if (downloadWordBtn) downloadWordBtn.addEventListener('click', downloadWord);

})();
