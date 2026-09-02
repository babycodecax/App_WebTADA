/**
 * Unit tests — lib/parseFile.ts (OCR file ảnh + parse các định dạng).
 *
 * Mock fetch cho Gemini Vision API — KHÔNG gọi API thật.
 * Cách chạy (từ thư mục api/):
 *   node --import tsx --test tests/parseFile.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = pathToFileURL(path.join(__dirname, '..', 'lib', 'parseFile.ts')).href;

// Set LLM_API_KEY cho OCR tests (mock fetch, không gọi API thật)
process.env.LLM_API_KEY = 'AIzaSyTestFakeKeyForTests';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = await import(LIB);

const { ALLOWED_EXTENSIONS, IMAGE_MIME, extractText, sanitizeTitle } = lib;

// ─── Helpers ───

/** Tạo File ảnh giả */
function makeImageFile(name: string, sizeBytes: number = 100): File {
  const data = new Uint8Array(sizeBytes).fill(0x89);
  return new File([data], name, { type: IMAGE_MIME['.' + name.split('.').pop()] || 'image/png' });
}

/** Mock fetch — trả về Gemini Vision response thành công */
function mockFetchSuccess(text: string) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as Response);
  return () => { globalThis.fetch = originalFetch; };
}

/** Mock fetch — trả về lỗi HTTP */
function mockFetchError(status: number, body: string = 'error') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status,
    text: async () => body,
  } as Response);
  return () => { globalThis.fetch = originalFetch; };
}

/** Mock fetch — fail N lần rồi succeed */
function mockFetchRetryThenSuccess(failCount: number, successText: string) {
  let callCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    callCount++;
    if (callCount <= failCount) {
      return { ok: false, status: 429, text: async () => 'rate limited' } as Response;
    }
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: successText }] } }] }),
    } as Response;
  };
  return () => { globalThis.fetch = originalFetch; };
}

// ─── 1. ALLOWED_EXTENSIONS ───

test('ALLOWED_EXTENSIONS: chứa tất cả định dạng ảnh', () => {
  assert.ok(ALLOWED_EXTENSIONS.includes('.png'));
  assert.ok(ALLOWED_EXTENSIONS.includes('.jpg'));
  assert.ok(ALLOWED_EXTENSIONS.includes('.jpeg'));
  assert.ok(ALLOWED_EXTENSIONS.includes('.gif'));
  assert.ok(ALLOWED_EXTENSIONS.includes('.webp'));
});

test('ALLOWED_EXTENSIONS: vẫn giữ định dạng cũ', () => {
  assert.ok(ALLOWED_EXTENSIONS.includes('.docx'));
  assert.ok(ALLOWED_EXTENSIONS.includes('.pdf'));
  assert.ok(ALLOWED_EXTENSIONS.includes('.txt'));
  assert.ok(ALLOWED_EXTENSIONS.includes('.md'));
});

// ─── 2. IMAGE_MIME ───

test('IMAGE_MIME: map đúng MIME type', () => {
  assert.equal(IMAGE_MIME['.png'], 'image/png');
  assert.equal(IMAGE_MIME['.jpg'], 'image/jpeg');
  assert.equal(IMAGE_MIME['.jpeg'], 'image/jpeg');
  assert.equal(IMAGE_MIME['.gif'], 'image/gif');
  assert.equal(IMAGE_MIME['.webp'], 'image/webp');
});

// ─── 3. extractText — nhánh txt/md ───

test('extractText: .txt trả về plain text', async () => {
  const file = new File([new TextEncoder().encode('Hello world')], 'test.txt');
  const result = await extractText(file);
  assert.equal(result.body, 'Hello world');
  assert.equal(result.isMarkdown, false);
  assert.equal(result.title, 'test');
});

test('extractText: .md trả về markdown', async () => {
  const file = new File([new TextEncoder().encode('# Heading\nContent')], 'notes.md');
  const result = await extractText(file);
  assert.equal(result.body, '# Heading\nContent');
  assert.equal(result.isMarkdown, true);
  assert.equal(result.title, 'notes');
});

// ─── 4. extractText — nhánh ảnh (OCR) ───

test('extractText: .png gọi OCR và trả về text', async () => {
  const restore = mockFetchSuccess('Nội dung OCR từ ảnh');
  try {
    const result = await extractText(makeImageFile('scan.png'));
    assert.equal(result.body, 'Nội dung OCR từ ảnh');
    assert.equal(result.isMarkdown, false);
    assert.equal(result.title, 'scan');
  } finally { restore(); }
});

test('extractText: .jpg gọi OCR và trả về text', async () => {
  const restore = mockFetchSuccess('Text from JPG');
  try {
    const result = await extractText(makeImageFile('photo.jpg'));
    assert.equal(result.body, 'Text from JPG');
  } finally { restore(); }
});

test('extractText: .jpeg gọi OCR và trả về text', async () => {
  const restore = mockFetchSuccess('JPEG OCR result');
  try {
    const result = await extractText(makeImageFile('image.jpeg'));
    assert.equal(result.body, 'JPEG OCR result');
  } finally { restore(); }
});

test('extractText: .webp gọi OCR và trả về text', async () => {
  const restore = mockFetchSuccess('WebP OCR');
  try {
    const result = await extractText(makeImageFile('modern.webp'));
    assert.equal(result.body, 'WebP OCR');
  } finally { restore(); }
});

// ─── 5. OCR — retry logic ───

test('ocrImage: retry thành công sau 2 lần 429', async () => {
  const restore = mockFetchRetryThenSuccess(2, 'Sau retry thành công');
  try {
    const result = await extractText(makeImageFile('retry.png'));
    assert.equal(result.body, 'Sau retry thành công');
  } finally { restore(); }
});

test('ocrImage: fail 3 lần liên tiếp → throw', async () => {
  const restore = mockFetchError(500, 'server error');
  try {
    await assert.rejects(() => extractText(makeImageFile('fail.png')));
  } finally { restore(); }
});

// ─── 6. OCR — empty response ───

test('ocrImage: Gemini trả rỗng → throw', async () => {
  const restore = mockFetchSuccess('');
  try {
    await assert.rejects(() => extractText(makeImageFile('empty.png')));
  } finally { restore(); }
});

// ─── 7. OCR — missing API key ───

test('ocrImage: thiếu LLM_API_KEY → throw', async () => {
  const saved = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    await assert.rejects(
      () => extractText(makeImageFile('nokey.png')),
      (err: Error) => {
        assert.ok(err.message.includes('Missing LLM_API_KEY'));
        return true;
      }
    );
  } finally {
    if (saved) process.env.LLM_API_KEY = saved;
  }
});

// ─── 8. OCR — ảnh quá lớn ───

test('ocrImage: ảnh > 2MB → throw', async () => {
  await assert.rejects(
    () => extractText(makeImageFile('huge.png', 3 * 1024 * 1024)),
    (err: Error) => {
      assert.ok(err.message.includes('quá lớn'));
      return true;
    }
  );
});

// ─── 9. sanitizeTitle ───

test('sanitizeTitle: loại ký tự đặc biệt, giữ Unicode', () => {
  // Regex SANITIZE_RE chỉ loại \\ / : * ? " < > | và khoảng trắng
  // → chữ Việt có dấu vẫn giữ nguyên
  assert.equal(sanitizeTitle('Thuế TNCN 2026'), 'Thuế-TNCN-2026');
  assert.equal(sanitizeTitle('  spaces  '), 'spaces');
  assert.equal(sanitizeTitle('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j');
});

test('sanitizeTitle: giới hạn 100 ký tự', () => {
  assert.equal(sanitizeTitle('a'.repeat(150)).length, 100);
});

test('sanitizeTitle: rỗng → untitled', () => {
  assert.equal(sanitizeTitle(''), 'untitled');
});
