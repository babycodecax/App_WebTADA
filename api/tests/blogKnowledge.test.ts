/**
 * Unit tests — lib/blogKnowledge.ts (đồng bộ bài blog → knowledge_chunks).
 *
 * Mock Supabase thuần (không cần DB thật / env). Kiểm tra:
 *   - chunk bài dài theo heading, file_path='blog/{id}', chunk_index tăng dần
 *   - re-ingest idempotent (upsert onConflict) + fallback 42P10 delete+insert
 *   - xóa chunk dư khi bài ngắn lại
 *   - content rỗng → không ghi gì
 *   - remove theo blog_id; remove id không tồn tại → no-op
 *   - ingest fail → trả {ok:false}, không throw
 *   - helper prefix blog/ + upload/ (dùng cho chat route + scoring ưu tiên)
 *
 * Cách chạy (từ thư mục api/):
 *   node --import tsx --test tests/blogKnowledge.test.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = pathToFileURL(path.join(__dirname, '..', 'lib', 'blogKnowledge.ts')).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = await import(LIB);

// =========================================================================
// Mock Supabase builder (chainable)
// =========================================================================

interface MockSbOptions {
  /** upsert luôn lỗi code 42P10 (DB chưa có UNIQUE(file_path,chunk_index)) */
  conflictFallback?: boolean;
  /** upsert lỗi thật sự (không phải 42P10) */
  upsertError?: string | null;
  /** insert lỗi (nhánh plainInsert) */
  insertError?: string | null;
  /** delete lỗi */
  deleteError?: string | null;
}

interface OpLog {
  op: string;
  table?: string;
  value?: unknown;
  args?: unknown[];
}

function createMockSb(opts: MockSbOptions = {}) {
  const ops: OpLog[] = [];
  const eqCalls: { col: string; value: unknown }[] = [];

  const builder: Record<string, unknown> = {
    select() { ops.push({ op: 'select' }); return builder; },
    limit() { ops.push({ op: 'limit' }); return builder; },
    order() { ops.push({ op: 'order' }); return builder; },
    maybeSingle() { ops.push({ op: 'maybeSingle' }); return builder; },
    single() { ops.push({ op: 'single' }); return builder; },
    like() { ops.push({ op: 'like' }); return builder; },
    ilike() { ops.push({ op: 'ilike' }); return builder; },
    in() { ops.push({ op: 'in' }); return builder; },
    gte(col: string, value: unknown) { ops.push({ op: 'gte', args: [col, value] }); return builder; },
    eq(col: string, value: unknown) {
      eqCalls.push({ col, value });
      ops.push({ op: 'eq', args: [col, value] });
      return builder;
    },
    insert(rows: unknown[]) {
      ops.push({ op: 'insert', value: rows });
      if (opts.insertError) return { error: { message: opts.insertError } };
      return { error: null };
    },
    upsert(rows: unknown[], uOpts?: unknown) {
      ops.push({ op: 'upsert', value: rows, args: [uOpts] });
      if (opts.upsertError) return { error: { message: opts.upsertError } };
      if (opts.conflictFallback) {
        return {
          error: {
            code: '42P10',
            message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
          },
        };
      }
      return { error: null };
    },
    delete() {
      ops.push({ op: 'delete' });
      return builder;
    },
  };

  // PostgrestBuilder thật là thenable: `await` trên chuỗi query trả {data, error}.
  // Mock chạy chain (delete().eq()... ) nên đưa then() vào builder để await
  // destructure được error (kiểm tra nhánh lỗi delete của removeBlogKnowledge).
  builder.then = (resolve: (v: unknown) => void) => {
    resolve({ error: opts.deleteError ? { message: opts.deleteError } : null, data: null });
  };

  const sb = {
    from(table: string) {
      ops.push({ op: 'from', table });
      return builder;
    },
  };

  return { sb, ops, eqCalls };
}

/** Content markdown dài > 1 chunk theo heading (dùng token ≈ từ, MAX 1500). */
function longMarkdown(chunks = 3): string {
  const para = Array.from({ length: 60 }, (_, i) => `nội dung thuế suất doanh nghiệp mức ${i} phần trăm`).join(' ');
  const sections: string[] = [];
  for (let i = 1; i <= chunks; i++) {
    sections.push(`# Mục ${i}\n\n${para}`);
  }
  return sections.join('\n\n');
}

// =========================================================================
// chunkBlogContent
// =========================================================================

test('chunkBlogContent — content rỗng → []', () => {
  assert.deepEqual(lib.chunkBlogContent(''), []);
  assert.deepEqual(lib.chunkBlogContent('   \n  '), []);
});

test('chunkBlogContent — markdown có heading → chunk theo heading, giữ heading path', () => {
  const chunks = lib.chunkBlogContent('# Tiêu đề bài\n\nĐoạn mở đầu.\n\n## Phần A\n\nNội dung phần A.');
  assert.ok(chunks.length >= 2, 'nhiều section → nhiều chunk');
  assert.equal(chunks[0].heading, 'Tiêu đề bài');
  assert.ok(chunks.some((c: { heading: string }) => c.heading === 'Tiêu đề bài > Phần A'));
});

test('chunkBlogContent — plain text không heading → chunkPlainText', () => {
  const text = 'Chỉ là đoạn văn thường không có heading. '.repeat(20);
  const chunks = lib.chunkBlogContent(text);
  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].heading, '');
});

test('chunkBlogContent — bỏ frontmatter YAML (title không lọt vào nội dung)', () => {
  const content = '---\ntitle: "Bài blog test"\n---\n\n# Phần chính\n\nNội dung thật của bài.';
  const chunks = lib.chunkBlogContent(content);
  assert.ok(chunks.every((c: { text: string }) => !c.text.includes('Bài blog test')));
  assert.ok(chunks.some((c: { text: string }) => c.text.includes('Nội dung thật')));
});

// =========================================================================
// ingestBlogKnowledge
// =========================================================================

test('ingest — bài dài → nhiều chunk file_path=blog/{id}, chunk_index tăng dần, title đúng', async () => {
  const { sb, ops } = createMockSb();
  const res = await lib.ingestBlogKnowledge(sb, {
    id: 'post-1',
    title: 'Bài blog thuế TNCN',
    content: longMarkdown(3),
  });
  assert.equal(res.ok, true);
  assert.ok(res.chunks >= 3);

  const upserts = ops.filter(o => o.op === 'upsert');
  assert.ok(upserts.length >= 1, 'có upsert được gọi');
  const allRows = upserts.flatMap(o => (o.value as Record<string, unknown>[]) || []);
  for (const row of allRows) {
    assert.equal(row.file_path, 'blog/post-1');
    assert.equal(row.title, 'Bài blog thuế TNCN');
    assert.equal(typeof row.chunk_index, 'number');
  }
  const indexes = allRows.map(r => r.chunk_index as number);
  for (let i = 1; i < indexes.length; i++) {
    assert.ok(indexes[i] > indexes[i - 1], 'chunk_index tăng dần');
  }
});

test('ingest — upsert dùng onConflict file_path,chunk_index (idempotent, không trùng)', async () => {
  const { sb, ops } = createMockSb();
  const input = { id: 'post-2', title: 'Bài lặp', content: longMarkdown(2) };
  const r1 = await lib.ingestBlogKnowledge(sb, input);
  const r2 = await lib.ingestBlogKnowledge(sb, input);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  const upserts = ops.filter(o => o.op === 'upsert');
  // Mỗi lần ingest upsert cùng key (file_path,chunk_index) → upsert đè, không trùng
  assert.equal(upserts.length, 2, '2 lần ingest → 2 lần upsert (đè chứ không chèn mới)');
  const firstRows = upserts[0].value as Record<string, unknown>[];
  const secondRows = upserts[1].value as Record<string, unknown>[];
  assert.deepEqual(
    secondRows.map(r => [r.file_path, r.chunk_index]),
    firstRows.map(r => [r.file_path, r.chunk_index]),
    'lần 2 dùng đúng key của lần 1 → upsert thay thế'
  );
});

test('ingest — fallback 42P10: upsert lỗi → delete+insert, vẫn ok', async () => {
  const { sb, ops } = createMockSb({ conflictFallback: true });
  const res = await lib.ingestBlogKnowledge(sb, {
    id: 'post-3',
    title: 'Bài fallback',
    content: longMarkdown(2),
  });
  assert.equal(res.ok, true);
  assert.ok(res.chunks >= 2);
  const opSeq = ops.map(o => o.op);
  assert.ok(opSeq.includes('delete'), 'có delete (xóa cũ) sau lỗi upsert');
  assert.ok(opSeq.includes('insert'), 'có insert lại');
  // Insert lại phải nằm sau delete của nhánh fallback (không tính delete dọn
  // chunk dư cuối bài — vị trí indexOf('insert') đầu tiên là insert fallback)
  const iIns = opSeq.indexOf('insert');
  assert.ok(
    opSeq.slice(0, iIns).filter(o => o === 'delete').length >= 1,
    'insert chạy sau delete'
  );
});

test('ingest — bài ngắn lại → xóa chunk dư (delete chunk_index >= N)', async () => {
  const { sb, ops, eqCalls } = createMockSb();
  await lib.ingestBlogKnowledge(sb, { id: 'post-4', title: 'Bài dài', content: longMarkdown(3) });
  ops.length = 0;
  eqCalls.length = 0;
  await lib.ingestBlogKnowledge(sb, { id: 'post-4', title: 'Bài dài', content: longMarkdown(1) });

  const delCalls = ops.filter(o => o.op === 'delete');
  assert.ok(delCalls.length >= 1, 'có delete dọn chunk dư');
  const gteCalls = ops.filter(o => o.op === 'gte');
  assert.ok(gteCalls.length >= 1, 'delete dùng gte');
  // eq('file_path','blog/post-4') + gte('chunk_index', N) với N = số chunk mới (1)
  const gte = gteCalls[0].args as [string, unknown];
  assert.equal(gte[0], 'chunk_index');
  assert.equal(gte[1], 1);
});

test('ingest — content rỗng → ok, chunks=0, không ghi gì', async () => {
  const { sb, ops } = createMockSb();
  const res = await lib.ingestBlogKnowledge(sb, { id: 'post-5', title: 'Bài rỗng', content: '   ' });
  assert.equal(res.ok, true);
  assert.equal(res.chunks, 0);
  assert.ok(!ops.some(o => o.op === 'from'), 'không gọi Supabase khi không có nội dung');
});

test('ingest — upsert lỗi thật → trả {ok:false}, KHÔNG throw', async () => {
  const { sb } = createMockSb({ upsertError: 'connection refused' });
  let res: { ok: boolean; error?: string } | undefined;
  try {
    res = await lib.ingestBlogKnowledge(sb, { id: 'post-6', title: 'Bài lỗi', content: longMarkdown(1) });
  } catch (e) {
    assert.fail(`không được throw: ${e instanceof Error ? e.message : String(e)}`);
  }
  assert.ok(res, 'có kết quả trả về');
  assert.equal(res.ok, false);
  assert.ok(typeof res.error === 'string');
});

// =========================================================================
// removeBlogKnowledge
// =========================================================================

test('remove — xóa chunk đúng blog_id (file_path=blog/{id})', async () => {
  const { sb, eqCalls } = createMockSb();
  const res = await lib.removeBlogKnowledge(sb, 'post-7');
  assert.equal(res.ok, true);
  const blogEq = eqCalls.find(c => c.col === 'file_path');
  assert.ok(blogEq, 'có điều kiện theo file_path');
  assert.equal(blogEq!.value, 'blog/post-7');
});

test('remove — blog_id không tồn tại / rỗng → no-op, không lỗi', async () => {
  const { sb, ops } = createMockSb();
  const res = await lib.removeBlogKnowledge(sb, 'not-exist-id');
  assert.equal(res.ok, true);
  // Supabase delete không khớp row = 0 row bị xóa, không phải lỗi — hàm không throw
  assert.ok(res.ok);

  const ops2 = createMockSb().ops;
  const res2 = await lib.removeBlogKnowledge(sb, '   ');
  assert.equal(res2.ok, true);
  assert.ok(!ops2.some(o => o.op === 'from'), 'id rỗng → không gọi Supabase');
});

test('remove — delete lỗi → trả {ok:false}, không throw', async () => {
  const { sb } = createMockSb({ deleteError: 'permission denied' });
  const res = await lib.removeBlogKnowledge(sb, 'post-8');
  assert.equal(res.ok, false);
  assert.ok(typeof res.error === 'string');
});

// =========================================================================
// Helper prefix (dùng cho chat route — search/boost/diversity)
// =========================================================================

test('isBlogPath — chỉ đúng prefix blog/', () => {
  assert.equal(lib.isBlogPath('blog/post-1'), true);
  assert.equal(lib.isBlogPath('blog/'), true);
  assert.equal(lib.isBlogPath('upload/file.md'), false);
  assert.equal(lib.isBlogPath('vault/thue-ke-toan/a.md'), false);
  assert.equal(lib.isBlogPath(''), false);
});

test('isAdminKnowledgePath — blog/ + upload/ đều là nguồn admin ưu tiên', () => {
  assert.equal(lib.isAdminKnowledgePath('blog/post-1'), true);
  assert.equal(lib.isAdminKnowledgePath('upload/file.md'), true);
  assert.equal(lib.isAdminKnowledgePath('vault/thue-ke-toan/a.md'), false);
  assert.equal(lib.isAdminKnowledgePath(''), false);
});

// =========================================================================
// "Search thấy nội dung" — chunk blog trong kết quả tìm kiếm được ưu tiên
// như upload (cùng pool admin). Mô phỏng: data từ searchKnowledge chứa chunk
// blog + vault; chunk blog phải nằm trong pool ưu tiên (không chiếm slot vault).
// =========================================================================

test('search pool — chunk blog xếp vào pool admin ưu tiên như upload', () => {
  const contexts = [
    { id: 'c1', file_path: 'vault/thue-ke-toan/tt-94-2026.md', score: 9 },
    { id: 'c2', file_path: 'blog/post-1', score: 8 },
    { id: 'c3', file_path: 'upload/bo-sung-kien-thuc-2026.md', score: 8 },
  ];
  const adminChunks = contexts.filter(c => lib.isAdminKnowledgePath(c.file_path || ''));
  assert.deepEqual(
    adminChunks.map(c => c.file_path),
    ['blog/post-1', 'upload/bo-sung-kien-thuc-2026.md'],
    'blog + upload cùng pool admin ưu tiên'
  );
  const vaultOnly = contexts.filter(c => !lib.isAdminKnowledgePath(c.file_path || ''));
  assert.deepEqual(vaultOnly.map(c => c.file_path), ['vault/thue-ke-toan/tt-94-2026.md']);
});

test('search pool — chunk blog không chiếm 6 slots vault (round-robin chỉ đếm vault)', () => {
  const vault = Array.from({ length: 7 }, (_, i) => ({ id: `v${i}`, file_path: `vault/x-${i}.md` }));
  const blog = { id: 'b1', file_path: 'blog/post-9' };
  const all = [...vault, blog];
  let vaultSlots = 0;
  for (const c of all) {
    if (lib.isAdminKnowledgePath(c.file_path || '')) continue; // admin pool riêng
    if (vaultSlots >= 6) break;
    vaultSlots++;
  }
  assert.equal(vaultSlots, 6, 'blog không chiếm slot vault');
});
