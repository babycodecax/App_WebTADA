#!/usr/bin/env node
/* eslint-disable */
/**
 * test-vercel.js — Gửi 100 câu đến Vercel endpoint, so sánh với đáp án mẫu.
 *
 * Usage: node scripts/test-vercel.js
 * Cần file test_questions.json ở cùng thư mục hoặc copy từ backend/
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env.local') });

const API_URL = process.env.TEST_API_URL || 'https://api-gdhxq9lc3-dag5.vercel.app/api/chat';

const fs = require('fs');
const path = require('path');

// Tìm test_questions.json
let qf = path.join(__dirname, 'test_questions.json');
if (!fs.existsSync(qf)) qf = path.join(__dirname, '..', 'backend', 'test_questions.json');
if (!fs.existsSync(qf)) { console.error('Không tìm thấy test_questions.json'); process.exit(1); }

const qs = JSON.parse(fs.readFileSync(qf, 'utf-8'));
const RF = path.join(__dirname, '..', 'test_results_vercel.json');

// Load existing
const done = {};
if (fs.existsSync(RF)) {
  for (const r of JSON.parse(fs.readFileSync(RF, 'utf-8'))) done[r.i] = r;
}

const TIMES = [];

async function ask(question, topK = 8) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, top_k: topK }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullAnswer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();
    for (const part of parts) {
      const m = part.match(/^data:\s*(.*)$/m);
      if (!m) continue;
      try {
        const p = JSON.parse(m[1]);
        if (p.type === 'token') fullAnswer += p.data;
        else if (p.type === 'error') throw new Error(p.data);
      } catch (e) { /* skip parse errors */ }
    }
  }
  return fullAnswer.trim();
}

async function main() {
  console.log(`API: ${API_URL}`);
  console.log(`Questions: ${qs.length}`);

  for (let idx = 0; idx < qs.length; idx++) {
    const i = idx + 1;
    if (done[i]) { TIMES.push(done[i].time || 0); continue; }

    const item = qs[idx];
    const t0 = Date.now();
    let ans = '', err = true;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        ans = await ask(item.q, 8);
        if (ans && ans.length > 5) { err = false; break; }
      } catch (e) {
        console.error(`  Attempt ${attempt + 1} error: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }

    const elapsed = (Date.now() - t0) / 1000;
    const r = { i, ans: ans || '', err, time: Math.round(elapsed * 100) / 100 };
    done[i] = r;
    TIMES.push(elapsed);

    // Ghi ngay
    const all = Object.values(done).sort((a, b) => a.i - b.i);
    fs.writeFileSync(RF, JSON.stringify(all, null, 2), 'utf-8');

    console.log(`${i}/${qs.length} time=${elapsed.toFixed(1)}s err=${err} ans=${(ans || '').slice(0, 80)}`);

    await new Promise(r => setTimeout(r, 500));
  }

  // So sánh (copy từ compare_test.py)
  console.log('\n===== SO SANH VOI DAP AN MAU =====');
  const all = Object.values(done).sort((a, b) => a.i - b.i);

  function _clean(text) {
    let t = (text || '').toLowerCase().trim();
    t = t.replace(/<think>.*?<\/think>/gs, '');
    t = t.replace(/<[^>]+>/g, '');
    for (const ch of ['$\\times$', '[', ']', '*', '**', '..', '…', ' ']) t = t.replace(ch, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  const _UNIT_MULT = { 'tỷ': 1e9, 'triệu': 1e6, 'tr': 1e6, 'nghìn': 1000, 'ng': 1000, 'đồng': 1, 'vnđ': 1, '': 1 };

  function _normNum(s) {
    s = s.trim().replace(/ /g, '').replace(/ /g, '');
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.includes(',')) {
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length <= 2) s = s.replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.includes('.') && s.split('.').length > 2) { s = s.replace(/\./g, ''); }
    return parseFloat(s);
  }

  function _extractValues(text) {
    const results = [];
    const t = text.toLowerCase();
    for (const m of t.matchAll(/(\d{1,3}(?:[.,]\d+)*)\s*(tỷ|triệu|tr|nghìn|ng|%|đồng|vnđ)/g)) {
      try {
        const val = _normNum(m[1]);
        const unit = m[2];
        if (unit === '%') results.push([val, '%']);
        else results.push([val * (_UNIT_MULT[unit] || 1), unit]);
      } catch (e) { /* skip */ }
    }
    for (const m of t.matchAll(/\b(\d+)\b/g)) {
      const raw = parseInt(m[1]);
      if (!results.some(r => Math.abs(raw - r[0]) < 0.01 * Math.max(raw, r[0]))) results.push([raw, '']);
    }
    return results;
  }

  function _normalizeValue(val, unit) {
    if (unit === '%') return val * 100;
    return val * (_UNIT_MULT[unit] || 1);
  }

  function _valuesMatch(expVals, ansVals) {
    if (!expVals.length) return false;
    for (const [ev, eu] of expVals) {
      const evn = _normalizeValue(ev, eu);
      if (!ansVals.some(([av, au]) => Math.abs(evn - _normalizeValue(av, au)) < Math.max(0.5, 0.01 * Math.max(evn, _normalizeValue(av, au))))) return false;
    }
    return true;
  }

  function _isYesNo(e) {
    e = e.toLowerCase().trim();
    return e.startsWith('không') || e.startsWith('có') || e.startsWith('được');
  }

  let correct = 0, wrong = [], noAns = [];

  for (const r of all) {
    const i = r.i;
    const exp = qs[i - 1].a;
    const ans = r.ans;
    if (r.err || !ans) { noAns.push(i); continue; }

    const expNorm = _clean(exp);
    const ansNorm = _clean(ans).replace(/^(?:bước.*?:\s*)?(?:tra.*?:\s*)?(?:tính.*?:\s*)?(?:đáp.*?:\s*)?/i, '').trim();
    const expClean = expNorm.replace(/\[.*?\]/g, '').trim();

    // Exact
    if (expClean === ansNorm) { correct++; continue; }
    if (expClean.replace(/\.$/, '') === ansNorm.replace(/\.$/, '')) { correct++; continue; }

    // Substring
    if (expClean.length > 3 && ansNorm.includes(expClean)) { correct++; continue; }

    // Numeric
    const expVals = _extractValues(expClean);
    const ansVals = _extractValues(ansNorm);
    if (expVals.length && ansVals.length && _valuesMatch(expVals, ansVals)) { correct++; continue; }

    // Yes/No
    if (_isYesNo(exp)) {
      const eYes = !expNorm.startsWith('không');
      const aYes = !ansNorm.startsWith('không') && !ansNorm.startsWith('chưa') && !ansNorm.startsWith('ko');
      if (eYes === aYes || (!aYes && (ansNorm.includes('không') || ansNorm.includes('miễn')))) { correct++; continue; }
    }

    wrong.push({ i, ans: ans.slice(0, 150), exp: exp.slice(0, 150) });
  }

  const avgTime = TIMES.length ? TIMES.reduce((a, b) => a + b, 0) / TIMES.length : 0;
  const correctReal = correct;

  console.log(`Tong: ${all.length}`);
  console.log(`DUNG: ${correctReal}`);
  console.log(`SAI: ${wrong.length}`);
  console.log(`Khong tra loi: ${noAns.length}`);
  console.log(`Ti le dung: ${(correctReal / all.length * 100).toFixed(1)}%`);
  console.log(`Thoi gian TB: ${avgTime.toFixed(1)}s`);

  if (wrong.length) {
    console.log('\n=== CAC CAU TRA LOI SAI ===');
    for (const w of wrong) {
      console.log(`  #${w.i}`);
      console.log(`  LLM: ${w.ans}`);
      console.log(`  DAP AN: ${w.exp}`);
      console.log();
    }
  }
  if (noAns.length) {
    console.log('=== CAC CAU KHONG TRA LOI ===');
    console.log(`  #${noAns.join(', #')}`);
  }
}

main().catch(console.error);
