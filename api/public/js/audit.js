/**
 * audit.js — Frontend logic cho Kiểm toán BCTC TADA.
 *
 * Tích hợp vào hero section, dưới chatbox.
 * Upload file Excel → gọi API backend audit → hiển thị kết quả.
 */

(function () {
  'use strict';

  var API_BASE = window.OB_CONFIG && window.OB_CONFIG.apiUrl ? window.OB_CONFIG.apiUrl.replace(/\/+$/, '') : '';

  var toggleBtn = document.getElementById('audit-toggle');
  var panel = document.getElementById('audit-panel');
  var closeBtn = document.getElementById('audit-panel-close');
  var fileInput = document.getElementById('audit-file-input');
  var fileNameLabel = document.getElementById('audit-file-name');

  var stateUpload = document.getElementById('audit-state-upload');
  var stateProcessing = document.getElementById('audit-state-processing');
  var stateResult = document.getElementById('audit-state-result');
  var stateError = document.getElementById('audit-state-error');

  var violationsList = document.getElementById('audit-violations-list');
  var resultCounts = document.getElementById('audit-result-counts');
  var resultIcon = document.getElementById('audit-result-icon');
  var errorText = document.getElementById('audit-error-text');
  var retryBtn = document.getElementById('audit-retry-btn');

  var lastFile = null;

  /** Hide all states */
  function hideAllStates() {
    [stateUpload, stateProcessing, stateResult, stateError].forEach(function (s) {
      s.classList.add('audit-state-hidden');
    });
  }

  /** Show one state */
  function showState(el) {
    hideAllStates();
    el.classList.remove('audit-state-hidden');
  }

  /** Toggle panel */
  function togglePanel() {
    panel.classList.toggle('audit-panel-open');
    if (panel.classList.contains('audit-panel-open')) {
      showState(stateUpload);
    }
  }

  /** Close panel */
  function closePanel() {
    panel.classList.remove('audit-panel-open');
  }

  /** Format số VND */
  function fmtVND(n) {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
  }

  /** Hiển thị kết quả audit */
  function showResult(data) {
    var violations = data.violations || [];
    var bySeverity = data.by_severity || {};
    var total = data.total_violations || 0;

    // Icon + counts
    if (total === 0) {
      resultIcon.textContent = '✅';
    } else if (bySeverity.critical > 0) {
      resultIcon.textContent = '🔴';
    } else if (bySeverity.high > 0) {
      resultIcon.textContent = '🟠';
    } else {
      resultIcon.textContent = '🟡';
    }

    var sevLabels = {
      critical: 'Nguy kịch',
      high: 'Cao',
      medium: 'Trung bình',
      low: 'Thấp',
    };
    var sevParts = [];
    for (var sev in sevLabels) {
      if (bySeverity[sev]) {
        sevParts.push(bySeverity[sev] + ' ' + sevLabels[sev]);
      }
    }
    resultCounts.textContent = (total > 0 ? total + ' vấn đề — ' : 'Không có vấn đề') + sevParts.join(', ');

    // Danh sách violations
    violationsList.innerHTML = '';
    if (violations.length === 0) {
      violationsList.innerHTML = '<div class="audit-no-violations">Không phát hiện vấn đề nào.</div>';
    } else {
      violations.forEach(function (v) {
        var card = document.createElement('div');
        card.className = 'audit-violation-card audit-severity-' + (v.severity || 'low');

        var header = document.createElement('div');
        header.className = 'audit-v-header';

        var badge = document.createElement('span');
        badge.className = 'audit-v-badge audit-badge-' + (v.severity || 'low');
        badge.textContent = (v.severity || '').toUpperCase();

        var code = document.createElement('span');
        code.className = 'audit-v-code';
        code.textContent = v.code || '';

        header.appendChild(badge);
        header.appendChild(code);
        card.appendChild(header);

        var desc = document.createElement('p');
        desc.className = 'audit-v-desc';
        desc.textContent = v.description || '';
        card.appendChild(desc);

        // Số liệu chi tiết
        if (v.expected !== null && v.actual !== null) {
          var details = document.createElement('div');
          details.className = 'audit-v-details';
          details.innerHTML =
            'Kỳ vọng: <strong>' + fmtVND(v.expected) + '</strong> | ' +
            'Thực tế: <strong>' + fmtVND(v.actual) + '</strong> | ' +
            'Chênh lệch: <strong>' + fmtVND(v.difference) + '</strong>';
          card.appendChild(details);
        }

        // TK liên quan
        if (v.affected_accounts && v.affected_accounts.length) {
          var accs = document.createElement('div');
          accs.className = 'audit-v-accounts';
          accs.textContent = 'TK: ' + v.affected_accounts.join(', ');
          card.appendChild(accs);
        }

        // Đề xuất
        if (v.recommendation) {
          var rec = document.createElement('div');
          rec.className = 'audit-v-rec';
          rec.textContent = '💡 ' + v.recommendation;
          card.appendChild(rec);
        }

        // Trích dẫn luật
        if (v.legal_citations && v.legal_citations.length) {
          var cite = document.createElement('div');
          cite.className = 'audit-v-cite';
          cite.textContent = '📜 Căn cứ: ' + v.legal_citations.join('; ');
          card.appendChild(cite);
        }

        violationsList.appendChild(card);
      });
    }

    showState(stateResult);
  }

  /** Upload file và chạy audit */
  function runAudit(file) {
    if (!file) return;
    lastFile = file;
    showState(stateProcessing);

    var formData = new FormData();
    formData.append('file', file);

    var url = (API_BASE + '/api/audit/upload');

    fetch(url, {
      method: 'POST',
      body: formData,
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error((err.detail && (err.detail.error || err.detail)) || 'Lỗi ' + res.status);
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (data.success === false) {
          throw new Error(data.error || 'Audit thất bại');
        }
        showResult(data);
      })
      .catch(function (err) {
        console.error('Audit error:', err);
        errorText.textContent = err.message || 'Không thể kết nối đến server. Vui lòng thử lại.';
        showState(stateError);
      });
  }

  // ─── Event listeners ───
  if (toggleBtn) toggleBtn.addEventListener('click', togglePanel);
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (fileNameLabel) fileNameLabel.textContent = '📄 ' + file.name;
      runAudit(file);
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      if (lastFile) runAudit(lastFile);
      else showState(stateUpload);
    });
  }

  // Nếu click vào audit-upload-label thì trigger file input
  document.addEventListener('click', function (e) {
    var label = e.target.closest('#audit-upload-label');
    if (label && fileInput) {
      fileInput.click();
    }
  });

})();
