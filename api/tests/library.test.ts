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
  for (const name of ['from', 'select', 'eq', 'in', 'order', 'limit']) {
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
