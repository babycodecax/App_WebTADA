/**
 * Unit tests — lib/conversationMemory.ts (bộ nhớ hội thoại chatbox).
 *
 * Module thuần: chỉ xử lý mảng message, không gọi external API.
 *
 * Cách chạy (từ thư mục api/):
 *   node --import tsx --test tests/conversationMemory.test.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = pathToFileURL(path.join(__dirname, '..', 'lib', 'conversationMemory.ts')).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = await import(LIB);

const {
  MAX_TURNS,
  MAX_CHARS,
  sanitizeHistory,
  limitHistory,
  extractContextTerms,
} = lib;

// ─── 1. sanitizeHistory ───
test('sanitizeHistory: mảng hợp lệ → giữ nguyên thứ tự role', () => {
  const input = [
    { role: 'user', content: 'thuế suất tncn là bao nhiêu' },
    { role: 'assistant', content: 'Theo biểu thuế lũy tiến...' },
    { role: 'user', content: 'còn hộ kinh doanh thì sao' },
  ];
  const out = sanitizeHistory(input);
  assert.deepEqual(out, input);
});

test('sanitizeHistory: input không phải mảng → []', () => {
  assert.deepEqual(sanitizeHistory(undefined), []);
  assert.deepEqual(sanitizeHistory(null), []);
  assert.deepEqual(sanitizeHistory('abc'), []);
  assert.deepEqual(sanitizeHistory({ role: 'user' }), []);
  assert.deepEqual(sanitizeHistory(42), []);
});

test('sanitizeHistory: phần tử rác bị loại, phần tử tốt được giữ', () => {
  const input = [
    { role: 'user', content: 'hỏi thật' },
    { role: 'admin', content: 'không hợp lệ' },
    { role: 'user', content: '' },
    { role: 'assistant', content: '' },
    'chuỗi thô',
    123,
    { role: 'assistant', content: 'trả lời thật' },
  ];
  const out = sanitizeHistory(input);
  assert.deepEqual(out, [
    { role: 'user', content: 'hỏi thật' },
    { role: 'assistant', content: 'trả lời thật' },
  ]);
});

test('sanitizeHistory: content không phải string → loại', () => {
  const input = [
    { role: 'user', content: 123 },
    { role: 'user', content: ['a'] },
    { role: 'user', content: 'ok' },
  ];
  const out = sanitizeHistory(input);
  assert.deepEqual(out, [{ role: 'user', content: 'ok' }]);
});

test('sanitizeHistory: role lạ (system/other) → loại', () => {
  const input = [
    { role: 'system', content: 'prompt' },
    { role: 'user', content: 'hi' },
  ];
  const out = sanitizeHistory(input);
  assert.deepEqual(out, [{ role: 'user', content: 'hi' }]);
});

// ─── 2. limitHistory ───
test('limitHistory: giữ tối đa MAX_TURNS lượt (2*MAX_TURNS message cuối)', () => {
  const msgs = [];
  for (let i = 0; i < 20; i++) {
    msgs.push({ role: 'user', content: `u${i}` });
    msgs.push({ role: 'assistant', content: `a${i}` });
  }
  const out = limitHistory(msgs);
  assert.equal(out.length, MAX_TURNS * 2);
  // 12 message cuối: bắt đầu từ index 14 (u14, a14, ..., u19, a19)
  assert.deepEqual(out[0], { role: 'user', content: 'u14' });
  assert.deepEqual(out[out.length - 1], { role: 'assistant', content: 'a19' });
});

test('limitHistory: số message ít hơn giới hạn → giữ nguyên', () => {
  const msgs = [
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1' },
  ];
  assert.deepEqual(limitHistory(msgs), msgs);
});

test('limitHistory: content > MAX_CHARS bị cắt còn MAX_CHARS', () => {
  const long = 'x'.repeat(MAX_CHARS + 100);
  const out = limitHistory([{ role: 'user', content: long }]);
  assert.equal(out[0].content.length, MAX_CHARS);
  assert.ok(out[0].content.endsWith('x'));
});

test('limitHistory: mảng rỗng → []', () => {
  assert.deepEqual(limitHistory([]), []);
});

// ─── 3. extractContextTerms ───
test('extractContextTerms: lấy term từ câu hỏi trước để bổ sung search', () => {
  const history = [
    { role: 'user', content: 'thuế tncn là gì' },
    { role: 'assistant', content: 'TNCN là thuế thu nhập cá nhân...' },
    { role: 'user', content: 'thuế suất bao nhiêu' },
  ];
  const terms = extractContextTerms(history, 'thuế suất bao nhiêu');
  // Term từ câu hỏi trước (không có trong câu hiện tại)
  assert.ok(terms.includes('tncn'));
  assert.ok(terms.includes('thu'));
  assert.ok(terms.includes('nhập'));
  assert.ok(terms.includes('cá'));
  assert.ok(terms.includes('nhân'));
  // KHÔNG lấy từ câu hỏi hiện tại (tránh lặp)
  assert.ok(!terms.includes('suất'));
});

test('extractContextTerms: lấy term từ câu hỏi HKD', () => {
  const history = [
    { role: 'user', content: 'hộ kinh doanh nộp thuế thế nào' },
    { role: 'assistant', content: 'Hộ kinh doanh...' },
    { role: 'user', content: 'còn giảm trừ thì sao' },
  ];
  const terms = extractContextTerms(history, 'còn giảm trừ thì sao');
  assert.ok(terms.includes('hộ'));
  assert.ok(terms.includes('kinh'));
  assert.ok(terms.includes('doanh'));
  assert.ok(terms.includes('thuế'));
});

test('extractContextTerms: câu hỏi không có trong history → []', () => {
  assert.deepEqual(extractContextTerms([], 'thuế suất'), []);
  const onlyAssistant = [{ role: 'assistant', content: 'xin chào' }];
  assert.deepEqual(extractContextTerms(onlyAssistant, 'thuế suất'), []);
});

test('extractContextTerms: chỉ dùng 3 câu hỏi user gần nhất', () => {
  const history = [
    { role: 'user', content: 'chủ đề cũ nhất' },
    { role: 'assistant', content: 'a' },
    { role: 'user', content: 'chủ đề hai' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'chủ đề ba' },
    { role: 'assistant', content: 'c' },
    { role: 'user', content: 'chủ đề bốn' },
    { role: 'assistant', content: 'd' },
    { role: 'user', content: 'câu hiện tại' },
  ];
  const terms = extractContextTerms(history, 'câu hiện tại');
  assert.ok(terms.includes('chủ')); // chủ đề bốn — câu hỏi thứ 3 từ cuối
  assert.ok(!terms.includes('nhất')); // 'chủ đề cũ nhất' bị loại (quá cũ)
});
