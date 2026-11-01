/**
 * Unit tests — lib/legalLinkRewrite.ts (số hiệu văn bản → link /van-ban/<id>).
 *
 * Bối cảnh 2026-11-01: 112 bài blog chỉ có 23 anchor nội bộ, còn "căn cứ
 * pháp lý" toàn chữ trơn. lib này rewrite trên HTML ĐÃ render (SSR blog +
 * trang văn bản), chỉ link LẦN ĐẦU mỗi số hiệu.
 *
 * Cách chạy (từ thư mục api/):
 *   node --import tsx --test tests/legalLinkRewrite.test.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = pathToFileURL(path.join(__dirname, '..', 'lib', 'legalLinkRewrite.ts')).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = await import(LIB);

const { rewriteLegalLinks, normalizeDocKey } = lib;

const DOCS = [
  { id: 'ababcaab-5756-4735-af08-2243bc79f7fd', doc_number: '108/2025/QH15' },
  { id: '475e9929-36a1-499c-83af-f11d9fb61730', doc_number: '141/2026/NĐ-CP' },
  { id: '06dde11c-13d7-483c-902c-fdb9a4a9d6ba', doc_number: '09/2026/QH16' },
  { id: '850303c3-48e2-45a5-9c95-6c164a27cd24', doc_number: '109/2025/QH15' },
];

// =========================================================================
// normalizeDocKey — chuẩn hóa key so khớp
// =========================================================================
test('normalizeDocKey: bỏ số 0 đầu (0108 = 108, 09/2026 = 9/2026)', () => {
  assert.equal(normalizeDocKey('0108/2025/QH15'), '1082025QH15');
  assert.equal(normalizeDocKey('108/2025/QH15'), '1082025QH15');
  assert.equal(normalizeDocKey('09/2026/QH16'), '92026QH16');
  assert.equal(normalizeDocKey('9/2026/QH16'), '92026QH16');
});

test('normalizeDocKey: hợp nhất Đ→D + bỏ ký tự phân cách (NĐ-CP = ND-CP = N Đ-CP)', () => {
  assert.equal(normalizeDocKey('141/2026/NĐ-CP'), '1412026NDCP');
  assert.equal(normalizeDocKey('141/2026/ND-CP'), '1412026NDCP');
  assert.equal(normalizeDocKey('141/2026/N Đ-CP'), '1412026NDCP');
});

// =========================================================================
// rewriteLegalLinks — link cơ bản
// =========================================================================
test('số hiệu khớp DB → anchor /van-ban/<id>', () => {
  const out = rewriteLegalLinks(
    '<p>Theo Luật số 108/2025/QH15 quy định quản lý thuế.</p>',
    DOCS
  );
  assert.ok(out.includes('<a href="/van-ban/ababcaab-5756-4735-af08-2243bc79f7fd"'), out);
  assert.ok(out.includes('>108/2025/QH15</a>'), out);
});

test('zero-pad trong bài khớp doc không 0 đầu (0108/2025/QH15 → doc 108/2025/QH15)', () => {
  const out = rewriteLegalLinks('<p>Căn cứ Luật số 0108/2025/QH15;</p>', DOCS);
  assert.ok(out.includes('/van-ban/ababcaab-5756-4735-af08-2243bc79f7fd'), out);
  assert.ok(out.includes('>0108/2025/QH15</a>'), out); // hiển thị giữ nguyên văn
});

test('biến thể NĐ-CP khớp doc NĐ-CP', () => {
  const out = rewriteLegalLinks('<p>Nghị định 141/2026/NĐ-CP đã sửa đổi ...</p>', DOCS);
  assert.ok(out.includes('/van-ban/475e9929-36a1-499c-83af-f11d9fb61730'), out);
});

test('số hiệu bị ngắt dòng giữa chốt ("…/N\\nĐ-CP") vẫn khớp', () => {
  const out = rewriteLegalLinks(
    '<p>số 141/2026/N\nĐ-CP về chính sách thuế.</p>',
    DOCS
  );
  assert.ok(out.includes('/van-ban/475e9929-36a1-499c-83af-f11d9fb61730'), out);
});

test('dấu câu kết câu bám đuôi không vào anchor ("108/2025/QH15.")', () => {
  const out = rewriteLegalLinks('<p>Luật 109/2025/QH15.</p>', DOCS);
  assert.ok(
    out.includes('<a href="/van-ban/850303c3-48e2-45a5-9c95-6c164a27cd24" title="Toàn văn số 109/2025/QH15 trên TADA">109/2025/QH15</a>.'),
    out
  );
});

// =========================================================================
// firstMention — chỉ link lần đầu mỗi số hiệu
// =========================================================================
test('cùng số hiệu lặp nhiều lần chỉ link LẦN ĐẦU', () => {
  const p = '<p>108/2025/QH15 được nêu lại nhiều lần 108/2025/QH15 và tiếp 108/2025/QH15.</p>';
  const out = rewriteLegalLinks(p, DOCS);
  const count = (out.match(/\/van-ban\/ababcaab/g) || []).length;
  assert.equal(count, 1, out);
});

test('số hiệu khác nhau → mỗi cái link riêng lần đầu', () => {
  const out = rewriteLegalLinks(
    '<p>108/2025/QH15 và 141/2026/NĐ-CP cùng áp dụng. Nhắc lại 141/2026/NĐ-CP không link.</p>',
    DOCS
  );
  assert.ok(out.includes('/van-ban/ababcaab'), out);
  assert.ok(out.includes('/van-ban/475e9929'), out);
  const count = (out.match(/\/van-ban\/475e9929/g) || []).length;
  assert.equal(count, 1, out);
});

// =========================================================================
// vùng bảo vệ — anchor / pre / code giữ nguyên
// =========================================================================
test('KHÔNG đụng text trong anchor sẵn có', () => {
  const out = rewriteLegalLinks(
    '<p>Xem <a href="/van-ban/x">108/2025/QH15</a> chi tiết.</p>',
    DOCS
  );
  assert.equal(out.includes('href="/van-ban/ababcaab'), false, out);
});

test('KHÔNG đụng text trong <pre> và <code>; ngoài vùng vẫn link', () => {
  const html =
    '<pre>108/2025/QH15</pre>' +
    '<p>Điều 1 108/2025/QH15 quy định</p>' +
    '<code>141/2026/NĐ-CP</code>';
  const out = rewriteLegalLinks(html, DOCS);
  // pre + code giữ nguyên (nếu số hiệu re-link từ lần nhắc <p> trước thì được phép)
  assert.ok(out.includes('<pre>108/2025/QH15</pre>'), out);
  assert.ok(out.includes('<code>141/2026/NĐ-CP</code>'), out);
});

// =========================================================================
// edge cases
// =========================================================================
test('không có docs → trả nguyên văn', () => {
  const html = '<p>108/2025/QH15 giữ nguyên text.</p>';
  assert.equal(rewriteLegalLinks(html, []), html);
  assert.equal(rewriteLegalLinks(html, undefined), html);
});

test('html rỗng → trả rỗng', () => {
  assert.equal(rewriteLegalLinks('', DOCS), '');
});

test('số hiệu KHÔNG có trong DB giữ nguyên text', () => {
  const html = '<p>Luật 99/2029/QH99 không tồn tại trong thư viện.</p>';
  assert.equal(rewriteLegalLinks(html, DOCS), html);
});

test('cụm đuôi thừa sau số hiệu giữ nguyên text (108/2025/QH15 sửa đổi → chỉ "…QH15" là anchor)', () => {
  const out = rewriteLegalLinks('<p>Kèm 108/2025/QH15 sửa đổi điều 3.</p>', DOCS);
  assert.ok(
    out.includes('<a href="/van-ban/ababcaab-5756-4735-af08-2243bc79f7fd" title="Toàn văn số 108/2025/QH15 trên TADA">108/2025/QH15</a> sửa đổi điều 3.'),
    out
  );
});

test('markdown link md [x](url + số hiệu) không ăn URI', () => {
  // URL chứa pattern số-hiệu → không được tạo link rác trong href
  const out = rewriteLegalLinks(
    '<p><a href="https://example.com/108/2025/QH15">nguồn ngoài</a> giữ nguyên.</p>',
    DOCS
  );
  assert.ok(out.includes('https://example.com/108/2025/QH15'), out);
});

// =========================================================================
// Fix review 2026-11-01
// =========================================================================
test('MEDIUM-1: KHÔNG chèn anchor vào attribute tag khác (<img alt>)', () => {
  const html = '<p><img src="x" alt="Luật 108/2025/QH15"> kèm text thường 108/2025/QH15.</p>';
  const out = rewriteLegalLinks(html, DOCS);
  // alt giữ nguyên, không có anchor chèn trong attribute
  assert.ok(out.includes('alt="Luật 108/2025/QH15"'), out);
  // text thường sau img vẫn được link lần đầu
  assert.ok(out.includes('<a href="/van-ban/ababcaab'), out);
});

test('HIGH-1: id/doc_number chứa ngoặc kép không phá attribute (attrEsc)', () => {
  // id (doc_number đủ chuẩn để khớp key) mang vector injection
  const evil = { id: 'x" onmouseover="alert(1)', doc_number: '108/2025/QH15' };
  const out = rewriteLegalLinks('<p>108/2025/QH15 dưới đây.</p>', [evil]);
  // escape → không có attribute phá vỡ
  assert.equal(out.includes('onmouseover="alert'), false, out);
  assert.equal(out.includes('href="/van-ban/x"'), false, out);
  assert.ok(out.includes('&quot;'), out);
});

