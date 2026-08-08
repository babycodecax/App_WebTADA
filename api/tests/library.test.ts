/**
 * Library unit tests — logic thuần trong lib/libraryData.ts.
 *
 * Cách chạy (từ thư mục api/):
 *   node --import tsx --test tests/library.test.ts
 *
 * Không cần .env — mock hoàn toàn Supabase client giả (giống culture
 * pytest của backend: test luôn mock external, không gọi API thật).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = pathToFileURL(path.join(__dirname, '..', 'lib', 'libraryData.ts')).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = await import(LIB);

/** Build query-builder giả: chuỗi method trả về chính nó; thenable như
 *  PostgrestFilterBuilder thật (await q → {data, error}). */
function mockQueryBuilder(resolve: () => { data: unknown[]; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const name of ['from', 'select', 'eq', 'in', 'order', 'limit', 'lt', 'maybeSingle']) {
    q[name] = () => q;
  }
  q['_resolve'] = resolve;
  q.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled);
  return q;
}

test('fetchLibrary — trả {forms, legal_documents} từ 2 bảng, không lỗi', async () => {
  const sb = {
    from: (table: string) => {
      const q = mockQueryBuilder(() =>
        table === 'landing_forms'
          ? {
              data: [
                { id: 'f1', name: 'Mẫu A', description: 'd', file_name: 'a.pdf', file_url: 'https://x/a.pdf', file_type: 'application/pdf', file_size: 100 },
              ],
              error: null,
            }
          : {
              data: [{ id: 'l1', title: 'Luật TNCN', doc_type: 'luat', effective_date: '01/01/2026', file_path: 'luat-109-2025-tncn.md', storage_path: '' }],
              error: null,
            }
      );
      return q;
    },
  };
  const result = await lib.fetchLibrary(sb);
  assert.equal(result.error, null);
  assert.equal(result.forms.length, 1);
  assert.equal(result.forms[0].name, 'Mẫu A');
  assert.equal(result.forms[0].file_size, 100);
  assert.equal(result.legal_documents.length, 1);
  assert.equal(result.legal_documents[0].title, 'Luật TNCN');
});

test('fetchLibrary — 2 query song song đúng bảng + filter', async () => {
  const tables: string[] = [];
  const filters: string[] = [];
  const sb = {
    from: (table: string) => {
      tables.push(table);
      const q = mockQueryBuilder(() => ({ data: [], error: null }));
      q.eq = (col: string, val: unknown) => { filters.push(`eq:${col}=${val}`); return q; };
      q.in = (col: string, vals: unknown[]) => { filters.push(`in:${col}=[${vals.join(',')}]`); return q; };
      return q;
    },
  };
  await lib.fetchLibrary(sb);
  assert.deepEqual(tables, ['landing_forms', 'source_documents']);
  // landing_forms: is_active=true
  assert.ok(filters.some((f) => f === 'eq:is_active=true'));
  // source_documents: vault + ready + doc_type IN 5 loại luật
  assert.ok(filters.some((f) => f === 'eq:source_origin=vault'));
  assert.ok(filters.some((f) => f === 'eq:status=ready'));
  assert.ok(filters.some((f) => f.includes('luat,nd,tt,nq,vbhn')));
});

test('fetchLibrary — lỗi query forms → trả error, không throw', async () => {
  const sb = {
    from: (table: string) =>
      mockQueryBuilder(() =>
        table === 'landing_forms'
          ? { data: [], error: { message: 'bang khong ton tai' } }
          : { data: [], error: null }
      ),
  };
  const result = await lib.fetchLibrary(sb);
  assert.equal(result.error, 'bang khong ton tai');
  assert.deepEqual(result.forms, []);
});

test('validateFormInput — hợp lệ', () => {
  const v = lib.validateFormInput({
    name: 'Mẫu đơn xin hoàn thuế',
    description: 'Dùng cho cá nhân',
    file_name: 'mau-don.pdf',
    file_url: 'https://supabase.example/forms/mau-don.pdf',
    file_type: 'application/pdf',
    file_size: 2048,
    sort_order: 2,
  });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.data.name, 'Mẫu đơn xin hoàn thuế');
    assert.equal(v.data.file_size, 2048);
    assert.equal(v.data.sort_order, 2);
    assert.equal(v.data.is_active, true);
  }
});

test('validateFormInput — thiếu name hoặc file_url → lỗi tiếng Việt', () => {
  assert.equal(lib.validateFormInput({ file_url: 'x' }).ok, false);
  assert.equal(lib.validateFormInput({ name: 'A' }).ok, false);
  assert.equal(lib.validateFormInput(null).ok, false);
});

test('validateFormInput — trim + giới hạn độ dài', () => {
  const v = lib.validateFormInput({ name: '  Mẫu A  ', file_url: 'https://x/a.pdf' });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.data.name, 'Mẫu A');
  assert.equal(lib.validateFormInput({ name: 'x'.repeat(301), file_url: 'u' }).ok, false);
});

test('validateFormUpdate — patch từng phần', () => {
  const v = lib.validateFormUpdate({ id: 'abc', name: 'Mẫu mới', is_active: false });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.data.id, 'abc');
    assert.equal(v.data.patch.name, 'Mẫu mới');
    assert.equal(v.data.patch.is_active, false);
    assert.equal(v.data.patch.description, undefined); // không đụng trường không gửi
  }
});

test('validateFormUpdate — thiếu id / is_active sai kiểu → lỗi', () => {
  assert.equal(lib.validateFormUpdate({ name: 'x' }).ok, false);
  assert.equal(lib.validateFormUpdate({ id: 'x', is_active: 'yes' }).ok, false);
});

// =========================================================================
// fetchLegalContent — nội dung văn bản luật public (từ knowledge_chunks)
// =========================================================================

/** Mock Supabase trả chunks theo file_path, ghi log query vào calls[]. */
function mockSbForChunks(rows: Record<string, unknown>[]) {
  const calls: string[] = [];
  const sb = {
    from: (table: string) => {
      calls.push(`from:${table}`);
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (col: string, val: unknown) => { calls.push(`eq:${col}=${val}`); return q; };
      q.order = (col: string, opts: unknown) => { calls.push(`order:${col}:${JSON.stringify(opts)}`); return q; };
      q.limit = (n: number) => { calls.push(`limit:${n}`); return q; };
      q.maybeSingle = () => q;
      q.then = (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(rows.length ? { data: rows, error: null } : { data: [], error: null }).then(onFulfilled);
      return q;
    },
  };
  return { sb, calls };
}

test('fetchLegalContent — ghép chunks đúng thứ tự chunk_index, giữ bảng markdown nguyên vẹn', async () => {
  const { sb } = mockSbForChunks([
    { title: 'Luật Thuế TNCN', heading: 'Điều 22. Biểu thuế lũy tiến', content: '| Bậc | Thu nhập | Thuế suất |\n|---|---|---|\n| 1 | Đến 5 triệu | 5% |', chunk_index: 0 },
    { title: 'Luật Thuế TNCN', heading: '', content: 'Hết biểu thuế.', chunk_index: 1 },
  ]);
  const result = await lib.fetchLegalContent(sb, 'luat-109-2025-tncn.md');
  assert.equal(result.error, null);
  assert.equal(result.file_path, 'luat-109-2025-tncn.md');
  assert.equal(result.title, 'Luật Thuế TNCN');
  assert.equal(result.chunk_count, 2);
  assert.ok(result.content.includes('## Điều 22. Biểu thuế lũy tiến'));
  assert.ok(result.content.includes('| Bậc | Thu nhập | Thuế suất |')); // bảng markdown giữ nguyên
  assert.ok(result.content.indexOf('| Bậc |') < result.content.indexOf('Hết biểu thuế.'));
});

test('fetchLegalContent — heading trống → chỉ ghép content, title từ chunk.title', async () => {
  const { sb } = mockSbForChunks([
    { title: 'VBHN Luật Doanh nghiệp 2025', heading: '', content: 'Nội dung điều 1.', chunk_index: 0 },
  ]);
  const result = await lib.fetchLegalContent(sb, 'vbhn-luat-doanh-nghiep-2025.md');
  assert.equal(result.error, null);
  assert.equal(result.title, 'VBHN Luật Doanh nghiệp 2025');
  assert.equal(result.content, 'Nội dung điều 1.');
  assert.ok(!result.content.includes('## '));
});

test('fetchLegalContent — không có chunks → content rỗng, không lỗi', async () => {
  const { sb } = mockSbForChunks([]);
  const result = await lib.fetchLegalContent(sb, 'khong-co.md');
  assert.equal(result.error, null);
  assert.equal(result.chunk_count, 0);
  assert.equal(result.content, '');
  assert.equal(result.title, 'khong-co.md'); // fallback title = file_path
});

test('fetchLegalContent — query đúng bảng knowledge_chunks + filter file_path + order chunk_index + limit 2000', async () => {
  const { sb, calls } = mockSbForChunks([]);
  await lib.fetchLegalContent(sb, 'luat-109-2025-tncn.md');
  assert.ok(calls.some((c) => c === 'from:knowledge_chunks'));
  assert.ok(calls.some((c) => c === 'eq:file_path=luat-109-2025-tncn.md'));
  assert.ok(calls.some((c) => c.includes('order:chunk_index')));
  assert.ok(calls.some((c) => c === 'limit:2000'));
});

test('fetchLegalContent — lỗi Supabase → trả error, không throw', async () => {
  const sb = {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.then = (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { message: 'bang khong ton tai' } }).then(onFulfilled);
      return q;
    },
  };
  const result = await lib.fetchLegalContent(sb, 'x.md');
  assert.equal(result.error, 'bang khong ton tai');
  assert.equal(result.content, '');
});

// =========================================================================
// generateLegalTitle — tiêu đề tiếng Việt từ nội dung văn bản
// =========================================================================

test('generateLegalTitle — title DB đã chuẩn → giữ nguyên', () => {
  const title = lib.generateLegalTitle('Luật 109/2025/QH15 - Thuế thu nhập cá nhân (TNCN)', [], 'luat-109-2025-tncn.md');
  assert.equal(title, 'Luật 109/2025/QH15 - Thuế thu nhập cá nhân (TNCN)');
});

test('generateLegalTitle — title DB thô (tên file) → sinh từ frontmatter source', () => {
  const chunks = [{ content: '---\ntitle: TT 94/2026 — Điều 1. Phạm vi điều chỉnh\ndomain: tax\nsource: Thông tư 94/2026/TT-BTC\nstatus: active\n---', heading: '' }];
  const title = lib.generateLegalTitle('tt-94-2026', chunks, 'tt-94-2026.md');
  assert.equal(title, 'Thông tư 94/2026/TT-BTC');
});

test('generateLegalTitle — không có frontmatter → sinh từ heading chunk đầu', () => {
  const chunks = [
    { content: '> Nâng ngưỡng doanh thu...', heading: 'NĐ 141/2026 — Sửa đổi thuế hộ KD, cá nhân KD và miễn thuế TNDN doanh nghiệp nhỏ > Tóm tắt' },
    { content: '- Nội dung chi tiết', heading: 'NĐ 141/2026 — Sửa đổi thuế hộ KD, cá nhân KD và miễn thuế TNDN doanh nghiệp nhỏ > Chi tiết' },
  ];
  const title = lib.generateLegalTitle('nd-141-2026-ho-kinh-doanh-tndn', chunks, 'nd-141-2026-ho-kinh-doanh-tndn.md');
  assert.equal(title, 'NĐ 141/2026 — Sửa đổi thuế hộ KD, cá nhân KD và miễn thuế TNDN doanh nghiệp nhỏ');
});

test('generateLegalTitle — frontmatter title chuẩn (có dấu tiếng Việt) → dùng nó', () => {
  const chunks = [
    { content: '---\ntitle: Luật Thuế TNCN 2025\nsource: 109/2025/QH15 (Quốc hội)\n---', heading: '' },
    { content: 'abc', heading: 'TT 87/2026 — Hướng dẫn > Tóm tắt' },
  ];
  const title = lib.generateLegalTitle('luat-thue-tncn-2025', chunks, 'luat-thue-tncn-2025.md');
  assert.equal(title, 'Luật Thuế TNCN 2025');
});

test('generateLegalTitle — không có gì → fallback file_path (basename)', () => {
  const title = lib.generateLegalTitle('tt-89-2026', [], 'tt-89-2026.md');
  assert.equal(title, 'tt-89-2026.md');
});

test('generateLegalTitle — source rỗng/heading rỗng → fallback file_path', () => {
  const chunks = [{ content: 'Nội dung không có frontmatter, không có heading', heading: '' }];
  const title = lib.generateLegalTitle('no-such-file', chunks, 'no-such-file.md');
  assert.equal(title, 'no-such-file.md');
});

test('isRawFilenameTitle — nhận diện tên file thô vs title chuẩn', () => {
  assert.equal(lib.isRawFilenameTitle('tt-94-2026'), true);
  assert.equal(lib.isRawFilenameTitle('nd-253-2026-tncn'), true);
  assert.equal(lib.isRawFilenameTitle('Thông tư 94/2026/TT-BTC'), false);
  assert.equal(lib.isRawFilenameTitle('Nghị định 253/2026/NĐ-CP'), false);
  assert.equal(lib.isRawFilenameTitle('Luật 109/2025/QH15 - Thuế TNCN'), false);
  assert.equal(lib.isRawFilenameTitle(''), true);
});

test('extractDocTitleFromHeading — lấy phần trước " > " đầu tiên', () => {
  assert.equal(
    lib.extractDocTitleFromHeading('NĐ 141/2026 — Sửa đổi thuế hộ KD > Tóm tắt'),
    'NĐ 141/2026 — Sửa đổi thuế hộ KD'
  );
  assert.equal(lib.extractDocTitleFromHeading(''), '');
  assert.equal(lib.extractDocTitleFromHeading('không có separator'), 'không có separator');
});

// =========================================================================
// fetchLegalContent — sinh title tiếng Việt từ stored title + chunks
// =========================================================================

/** Mock Supabase hỗ trợ cả source_documents lẫn knowledge_chunks. */
function mockSbForContent(rows: Record<string, unknown>[], storedTitle: string) {
  const calls: string[] = [];
  const sb = {
    from: (table: string) => {
      calls.push(`from:${table}`);
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (col: string, val: unknown) => { calls.push(`eq:${col}=${val}`); return q; };
      q.order = (col: string, opts: unknown) => { calls.push(`order:${col}:${JSON.stringify(opts)}`); return q; };
      q.limit = (n: number) => { calls.push(`limit:${n}`); return q; };
      q.maybeSingle = () => q;
      q.then = (onFulfilled: (v: unknown) => unknown) => {
        const resolved = table === 'source_documents'
          ? { data: storedTitle ? { title: storedTitle } : null, error: null }
          : { data: rows, error: null };
        return Promise.resolve(resolved).then(onFulfilled);
      };
      return q;
    },
  };
  return { sb, calls };
}

test('fetchLegalContent — title từ stored source_documents khi chuẩn', async () => {
  const { sb } = mockSbForContent(
    [{ title: 'tt-94-2026', heading: '', content: 'Nội dung điều 1.', chunk_index: 0 }],
    'Luật 109/2025/QH15 - Thuế thu nhập cá nhân (TNCN)'
  );
  const result = await lib.fetchLegalContent(sb, 'luat-109-2025-tncn.md');
  assert.equal(result.error, null);
  assert.equal(result.title, 'Luật 109/2025/QH15 - Thuế thu nhập cá nhân (TNCN)');
  assert.equal(result.content, 'Nội dung điều 1.');
});

test('fetchLegalContent — title DB thô → sinh từ chunks (frontmatter source)', async () => {
  const { sb } = mockSbForContent(
    [
      { title: 'tt-94-2026-dieu-1', heading: '', content: '---\ntitle: TT 94/2026\ndomain: tax\nsource: Thông tư 94/2026/TT-BTC\n---', chunk_index: 0 },
      { title: 'tt-94-2026-dieu-1', heading: 'TT 94/2026 — Điều 1. Phạm vi điều chỉnh > Tóm tắt', content: 'Thông tư này quy định về...', chunk_index: 1 },
    ],
    'tt-94-2026'
  );
  const result = await lib.fetchLegalContent(sb, 'tt-94-2026.md');
  assert.equal(result.error, null);
  assert.equal(result.title, 'Thông tư 94/2026/TT-BTC');
  assert.equal(result.chunk_count, 2);
  assert.ok(result.content.includes('## TT 94/2026 — Điều 1. Phạm vi điều chỉnh > Tóm tắt'));
});

test('fetchLegalContent — title DB thô + không frontmatter → sinh từ heading', async () => {
  const { sb } = mockSbForContent(
    [{ title: 'nd-141', heading: 'NĐ 141/2026 — Sửa đổi thuế hộ KD > Tóm tắt', content: 'Nội dung.', chunk_index: 0 }],
    'nd-141-2026-ho-kinh-doanh-tndn'
  );
  const result = await lib.fetchLegalContent(sb, 'nd-141-2026-ho-kinh-doanh-tndn.md');
  assert.equal(result.error, null);
  assert.equal(result.title, 'NĐ 141/2026 — Sửa đổi thuế hộ KD');
});

test('fetchLegalContent — query source_documents title trước khi chunks', async () => {
  const { sb, calls } = mockSbForContent([], 'tt-89-2026');
  await lib.fetchLegalContent(sb, 'tt-89-2026.md');
  const firstFrom = calls.findIndex((c) => c === 'from:source_documents');
  const secondFrom = calls.findIndex((c) => c === 'from:knowledge_chunks');
  assert.ok(firstFrom >= 0 && secondFrom > firstFrom, 'phải query source_documents trước knowledge_chunks');
});
