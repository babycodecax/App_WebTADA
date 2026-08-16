/**
 * Unit tests — lib/queryExpansion.ts (mở rộng query ngắn + phân loại match).
 *
 * Module thuần: không import Supabase/OpenAI. Không gọi external API.
 *
 * Cách chạy (từ thư mục api/):
 *   node --import tsx --test tests/queryExpansion.test.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = pathToFileURL(path.join(__dirname, '..', 'lib', 'queryExpansion.ts')).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = await import(LIB);

const {
  STOPWORDS,
  TOPIC_KEYWORDS,
  tokenize,
  expandKeywords,
  expandShortQuery,
  hasRealMatch,
} = lib;

// ─── 1. tokenize ───
test('tokenize: tách từ, bỏ stopword tiếng Việt', () => {
  assert.deepEqual(tokenize('thuế suất của cá nhân là bao nhiêu'), ['thuế', 'suất', 'cá', 'nhân']);
});

test('tokenize: giữ token ngắn có chứa số (50.000 → 50+000, 15,5)', () => {
  // Dấu chấm/phẩy là separator — "50.000" tách thành "50","000" (hành vi gốc
  // từ route.ts, bảo toàn); điểm mấu chốt: token ngắn CHỨA SỐ vẫn được giữ
  assert.deepEqual(tokenize('mức 50.000 đồng và 2%'), ['mức', '50', '000', 'đồng', '2%']);
  assert.deepEqual(tokenize('15,5 triệu'), ['15', '5', 'triệu']);
});

test('tokenize: lọc token 1 ký tự không phải số', () => {
  assert.deepEqual(tokenize('a và b'), []);
});

test('tokenize: chuỗi rỗng/null → []', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(undefined), []);
});

test('STOPWORDS: chứa các từ nối thường gặp', () => {
  assert.ok(STOPWORDS.has('của'));
  assert.ok(STOPWORDS.has('bao'));
  assert.ok(STOPWORDS.has('nhiêu'));
});

// ─── 2. expandKeywords (hành vi cũ của _expandKeywords) ───
test('expandKeywords: tokenize query gốc + thêm domain từ keyword mapping', () => {
  const terms = expandKeywords('thuế tncn 2026');
  assert.ok(terms.includes('thuế'));
  assert.ok(terms.includes('tncn'));
  // 'thuế tncn' → 'thuế thu nhập cá nhân'
  assert.ok(terms.includes('thu'));
  assert.ok(terms.includes('nhập'));
  assert.ok(terms.includes('cá'));
  assert.ok(terms.includes('nhân'));
});

test('expandKeywords: không trùng lặp term', () => {
  const terms = expandKeywords('thuế thu nhập cá nhân');
  const unique = new Set(terms);
  assert.equal(terms.length, unique.size);
});

test('expandKeywords: query không khớp mapping → chỉ token query gốc', () => {
  assert.deepEqual(expandKeywords('nuôi cá cảnh'), ['nuôi', 'cá', 'cảnh']);
});

// ─── 3. TOPIC_KEYWORDS mapping ───
test('TOPIC_KEYWORDS: có các cặp synonym domain chính', () => {
  assert.ok(TOPIC_KEYWORDS['tncn']);
  assert.ok(TOPIC_KEYWORDS['thuế suất']);
  assert.ok(TOPIC_KEYWORDS['biểu thuế']);
  assert.ok(TOPIC_KEYWORDS['miễn thuế']);
  assert.ok(TOPIC_KEYWORDS['giảm trừ gia cảnh']);
});

// ─── 4. expandShortQuery ───
test('expandShortQuery: query 1 từ (tncn) → đủ term domain TNCN', () => {
  const terms = expandShortQuery('tncn');
  assert.ok(terms.includes('thuế'));
  assert.ok(terms.includes('thu'));
  assert.ok(terms.includes('nhập'));
  assert.ok(terms.includes('cá'));
  assert.ok(terms.includes('nhân'));
});

test('expandShortQuery: query 2 từ (thuế suất) → thêm synonym biểu thuế lũy tiến', () => {
  const terms = expandShortQuery('thuế suất');
  // Term gốc
  assert.ok(terms.includes('thuế'));
  assert.ok(terms.includes('suất'));
  // Synonym domain bổ sung ('thuế suất' → 'biểu thuế lũy tiến')
  assert.ok(terms.includes('biểu'));
  assert.ok(terms.includes('lũy'));
  assert.ok(terms.includes('tiến'));
});

test('expandShortQuery: query 2 từ (hộ kinh doanh) → đủ term HKD', () => {
  const terms = expandShortQuery('hộ kinh doanh');
  assert.ok(terms.includes('hộ'));
  assert.ok(terms.includes('kinh'));
  assert.ok(terms.includes('doanh'));
});

test('expandShortQuery: query 2 từ (nộp chậm) → thêm term quá hạn', () => {
  const terms = expandShortQuery('nộp chậm');
  assert.ok(terms.includes('quá'));
  assert.ok(terms.includes('hạn'));
});

test('expandShortQuery: query dài (>=3 term) không bị thay đổi', () => {
  const base = expandKeywords('thuế suất của hộ kinh doanh là bao nhiêu');
  const expanded = expandShortQuery('thuế suất của hộ kinh doanh là bao nhiêu');
  assert.deepEqual(expanded, base);
});

test('expandShortQuery: query rỗng → []', () => {
  assert.deepEqual(expandShortQuery(''), []);
});

// ─── 5. hasRealMatch ───
test('hasRealMatch: mọi chunk matchCount = 0 (kể cả score > 0 do boost) → false', () => {
  const scored = [{ score: 0, matchCount: 0 }, { score: 1.5, matchCount: 0 }, { score: 0 }];
  assert.equal(hasRealMatch(scored), false);
});

test('hasRealMatch: có >= 1 chunk matchCount > 0 → true', () => {
  const scored = [{ score: 0, matchCount: 0 }, { score: 3.2, matchCount: 1 }, { score: 0 }];
  assert.equal(hasRealMatch(scored), true);
});

test('hasRealMatch: mảng rỗng → false', () => {
  assert.equal(hasRealMatch([]), false);
});

test('hasRealMatch: chunk matchCount > 0 nhưng score 0 → vẫn true', () => {
  const scored = [{ score: 0, matchCount: 2 }];
  assert.equal(hasRealMatch(scored), true);
});
