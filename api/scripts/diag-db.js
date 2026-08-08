/**
 * diag-db.js — Chẩn đoán nhanh DB production (đọc-only).
 * Kiểm tra: landing_services sentinel row, source_documents titles, chunk counts.
 * Chạy: node scripts/diag-db.js (từ thư mục api/)
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // 1. landing_services sentinel
  const { data: svc, error: svcErr } = await sb
    .from('landing_services')
    .select('id,group_name,is_active,description')
    .eq('group_name', '__services_content__')
    .limit(5);
  console.log('\n=== landing_services (sentinel) ===');
  if (svcErr) console.log('ERROR:', svcErr.message);
  else console.log(JSON.stringify(svc, null, 2));

  // 2. source_documents: title thô? count bao nhiêu legal?
  const { data: srcs, error: srcErr } = await sb
    .from('source_documents')
    .select('file_path,title,doc_type,source_origin,status')
    .eq('source_origin', 'vault')
    .limit(200);
  console.log('\n=== source_documents vault (first 15) ===');
  if (srcErr) console.log('ERROR:', srcErr.message);
  else {
    console.log(`Tổng vault rows: ${srcs.length}`);
    srcs.slice(0, 15).forEach((r) => console.log(`  ${r.file_path} | type=${r.doc_type} | status=${r.status} | title="${r.title}"`));
    const legal = srcs.filter((r) => ['luat', 'nd', 'tt', 'nq', 'vbhn'].includes(r.doc_type));
    console.log(`Legal docs (luat/nd/tt/nq/vbhn): ${legal.length}`);
  }

  // 3. knowledge_chunks: đếm chunks cho 1 số văn bản + title chunks
  const targets = ['tt-94-2026.md', 'luat-109-2025-tncn.md', 'nd-253-2026-tncn.md'];
  console.log('\n=== knowledge_chunks counts ===');
  for (const fp of targets) {
    const { count, error } = await sb.from('knowledge_chunks').select('id', { count: 'exact', head: true }).eq('file_path', fp);
    console.log(`  ${fp}: ${count ?? '?'} chunks${error ? ` ERROR: ${error.message}` : ''}`);
  }
  const { data: sample, error: sampErr } = await sb
    .from('knowledge_chunks')
    .select('title,chunk_index')
    .eq('file_path', 'tt-94-2026.md')
    .order('chunk_index', { ascending: true })
    .limit(3);
  console.log('  tt-94-2026.md chunks[0..2] titles:', sampErr ? sampErr.message : JSON.stringify(sample));

  // 4. documents table tồn tại? (backend cũ) — select 1 dòng
  const { data: docRow, error: docErr } = await sb.from('documents').select('file_path,title').limit(3);
  console.log('\n=== documents table ===');
  if (docErr) console.log('  (documents):', docErr.message);
  else console.log('  documents rows:', JSON.stringify(docRow));
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
