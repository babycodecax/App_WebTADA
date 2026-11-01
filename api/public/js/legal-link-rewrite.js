/* legal-link-rewrite.js — Client version của api/lib/legalLinkRewrite.ts.
   Chuyển số hiệu văn bản luật thành link nội bộ /van-ban/<id> trên HTML
   đã render. Đồng bộ logic với bản .ts (SSR) — 2 bên phải sửa song song. */
(function () {
  'use strict';

  var DOC_TOKEN_RE =
    /\b\d{1,4}\/\d{4}\/[^\s<>()\[\]{}"'`]+(?:[ \n\t]+[^\s<>()\[\]{}"'`]+){0,2}/g;

  var PROTECTED_RE = /(<a[\s\S]*?<\/a>)|(<pre[\s\S]*?<\/pre>)|(<code[\s\S]*?<\/code>)/gi;

  function normalizeDocKey(docNumber) {
    var s = String(docNumber || '').toUpperCase().replace(/Đ/g, 'D').replace(/[^A-Z0-9]/g, '');
    s = s.replace(/^0+(?=\d)/, '');
    return s;
  }

  function attrEsc(v) {
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isInsideTag(text, index) {
    var lt = text.lastIndexOf('<', index - 1);
    if (lt === -1) return false;
    var gt = text.lastIndexOf('>', index - 1);
    return lt > gt;
  }

  function spanWords(span) {
    var res = [];
    var re = /[^\n\t ]+/g;
    var m;
    while ((m = re.exec(span)) !== null) {
      res.push({ word: m[0], end: m.index + m[0].length });
    }
    return res;
  }

  function matchCandidate(span, byKey) {
    var words = spanWords(span);
    for (var n = words.length; n >= 1; n--) {
      var raw = span.slice(0, words[n - 1].end);
      var candidate = raw.replace(/[.,;:)'\]]+$/, '');
      if (!candidate) continue;
      var doc = byKey[normalizeDocKey(candidate)];
      if (doc) return { doc: doc, matched: candidate };
    }
    return null;
  }

  function splitProtected(html) {
    var res = [];
    var last = 0;
    var m;
    PROTECTED_RE.lastIndex = 0;
    while ((m = PROTECTED_RE.exec(html)) !== null) {
      if (m.index > last) res.push({ text: html.slice(last, m.index), isProtected: false });
      res.push({ text: m[0], isProtected: true });
      last = m.index + m[0].length;
    }
    if (last < html.length) res.push({ text: html.slice(last), isProtected: false });
    return res;
  }

  function markFirstMention(text, byKey, firstMention) {
    if (!text) return;
    var m;
    DOC_TOKEN_RE.lastIndex = 0;
    while ((m = DOC_TOKEN_RE.exec(text)) !== null) {
      if (isInsideTag(text, m.index)) continue;
      var found = matchCandidate(m[0], byKey);
      if (found) firstMention[normalizeDocKey(found.doc.doc_number)] = true;
    }
  }

  function linkTokensInText(text, byKey, firstMention) {
    var result = '';
    var last = 0;
    var m;
    DOC_TOKEN_RE.lastIndex = 0;
    while ((m = DOC_TOKEN_RE.exec(text)) !== null) {
      if (isInsideTag(text, m.index)) continue;
      var span = m[0];
      var found = matchCandidate(span, byKey);
      if (!found || firstMention[normalizeDocKey(found.doc.doc_number)]) continue;
      firstMention[normalizeDocKey(found.doc.doc_number)] = true;
      result +=
        text.slice(last, m.index) +
        '<a href="/van-ban/' + attrEsc(found.doc.id) + '" title="Toàn văn số ' +
        attrEsc(found.doc.doc_number) + ' trên TADA">' + found.matched + '</a>' +
        span.slice(found.matched.length);
      last = m.index + span.length;
    }
    result += text.slice(last);
    return result;
  }

  /**
   * rewriteLegalLinks(html, docs) — docs: [{id, doc_number}]
   * Trả về HTML đã chèn anchor, chỉ đụng text ngoài anchor/pre/code.
   */
  window.rewriteLegalLinks = function (html, docs) {
    if (!html || !docs || !docs.length) return html || '';
    var byKey = {};
    for (var i = 0; i < docs.length; i++) {
      var k = normalizeDocKey((docs[i] && docs[i].doc_number) || '');
      if (k && !byKey[k]) byKey[k] = docs[i];
    }
    if (!Object.keys(byKey).length) return html;

    var segments = splitProtected(html);
    var out = [];
    var firstMention = {};
    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s];
      if (seg.isProtected) {
        markFirstMention(seg.text, byKey, firstMention);
        out.push(seg.text);
      } else {
        out.push(linkTokensInText(seg.text, byKey, firstMention));
      }
    }
    return out.join('');
  };
})();
