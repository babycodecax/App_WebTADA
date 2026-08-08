/**
 * validate-titles.js — Kiểm tra logic sinh tiêu đề tiếng Việt trên dữ liệu
 * production thật, bằng cách dùng chính các hàm export từ lib/libraryData.ts
 * thông qua child node --experimental-strip-types (tránh xung đột module CJS/ESM).
 */
const { createClient } = require('@supabase/supabase-js');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const { data: srcs } = await sb
    .from('source_documents')
    .select('file_path,title')
    .eq('source_origin', 'vault')
    .in('doc_type', ['luat', 'nd', 'tt', 'nq', 'vbhn'])
    .limit(100);
  const fps = (srcs || []).map((r) => r.file_path);

  const { data: chunks } = await sb
    .from('knowledge_chunks')
    .select('file_path,content,heading,title')
    .in('file_path', fps);
  const byPath = {};
  for (const c of chunks || []) {
    (byPath[c.file_path] = byPath[c.file_path] || []).push(c);
  }

  // Gọi generateLegalTitle qua child process strip-types (file ESM riêng)
  const runner = path.join(__dirname, 'validate-titles-run.mts');
  const payload = JSON.stringify(
    (srcs || []).map((r) => ({ fp: r.file_path, stored: r.title || '', chunks: byPath[r.file_path] || [] }))
  );
  require('node:fs').writeFileSync(runner, `
import { generateLegalTitle } from '../lib/libraryData.ts';
const payload = ${payload};
let good = 0;
for (const p of payload) {
  const newTitle = generateLegalTitle(p.stored, p.chunks, p.fp);
  const raw = p.stored.replace(/\\.md$/, '') === p.fp.replace(/\\.md$/, '');
  if (raw && newTitle !== p.stored && newTitle !== p.fp) good++;
  console.log(p.fp + '\\n   old: ' + p.stored + '\\n   new: ' + newTitle);
}
console.log('=== docs with improved title: ' + good + '/' + payload.length + ' ===');
`);
  const out = execFileSync(process.execPath, ['--experimental-strip-types', runner], {
    encoding: 'utf8',
    cwd: __dirname,
  });
  process.stdout.write(out);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
