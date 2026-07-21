// Ingest script tong hop: quet vault MD + text goc (.tmp_extract) + docx goc (sources).
// Chay: node scripts/ingest-all.js
// Resumable: bo qua chunk da ingest (dedupe bang composite source + chunk_index).
// Robust: retry loi mang tam thoi (ECONNRESET) voi backoff.
//
// Luu y: cac file test (Test1-5, *_check.txt) KHONG duoc nap vao knowledge base.

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const mammoth = require('mammoth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ROOT = process.env.AI_ROOT || 'D:/CodeApp/Projects/App_WebTADA';
const VAULT_DIR = path.join(ROOT, 'vault', 'thue-ke-toan');
const TMP_EXTRACT_DIRS = [
  path.join(ROOT, '.tmp_extract'),
  path.join(VAULT_DIR, '.tmp_extract'),
];
const SOURCES_DIR = path.join(VAULT_DIR, 'sources');
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-004';
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

// Ten file chua duoc phep nap (de thi / file kiem tra).
function isTestFile(name) {
  const n = name.toLowerCase();
  return n.includes('test') || n.includes('check') || n.startsWith('_test');
}

function walk(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, acc);
    else if (exts.some(x => e.name.endsWith(x)) && !isTestFile(e.name)) acc.push(p);
  }
  return acc;
}

function chunkText(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= CHUNK_SIZE) return [clean];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(16);
}

async function embedWithRetry(input, attempt = 1) {
  try {
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text: input }] } }),
    });
    if (res.status === 429) {
      throw new Error('GEMINI_429: Vuot quota mien phi. Doi vai phut roi chay lai (script se tu bo qua chunk da nap).');
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini embed ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.embedding.values;
  } catch (e) {
    if (e && /GEMINI_429|Missing GEMINI/.test(e.message || '')) throw e;
    if (attempt >= 4) throw e;
    const wait = 1000 * attempt;
    console.error(`  embed retry ${attempt} after ${wait}ms:`, e.code || e.message);
    await new Promise(r => setTimeout(r, wait));
    return embedWithRetry(input, attempt + 1);
  }
}

// Nap 1 file text (da co content) vao Supabase, dedupe theo (source, chunk_index).
async function ingestText(relSource, title, content, tag) {
  if (!content || !content.trim()) return 0;
  const sourceHash = hash(content);
  const chunks = chunkText(content);

  const { data: existing } = await supabase
    .from('documents')
    .select('chunk_index, source_hash')
    .eq('source', relSource);
  const done = new Set((existing || []).map(r => r.chunk_index));
  const oldHash = existing && existing.length ? existing[0].source_hash : null;

  // Phat hien noi dung moi -> xoa chunk cu roi nap lai toan bo.
  if (oldHash && oldHash !== sourceHash) {
    const { error: delErr } = await supabase.from('documents').delete().eq('source', relSource);
    if (delErr) { console.error('  Delete old error:', delErr.message); return 0; }
    console.log(`  ${title}: phat hien noi dung moi -> xoa ${done.size} chunk cu`);
    done.clear();
  }

  let added = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (done.has(i)) continue;
    const embedding = await embedWithRetry(chunks[i]);
    const { error } = await supabase.from('documents').insert({
      content: chunks[i], title, source: relSource, tag, chunk_index: i, source_hash: sourceHash, embedding,
    });
    if (error) { console.error('  Insert error:', error.message); continue; }
    added++;
  }
  console.log(`  ${title}: ${chunks.length} chunks (+${added} moi)`);
  return added;
}

async function extractDocx(file) {
  const buf = fs.readFileSync(file);
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value || '';
}

async function main() {
  let total = 0;

  // 1) Vault MD (nhu cu)
  const mdFiles = walk(VAULT_DIR, ['.md']).filter(f => !f.includes('.tmp_extract'));
  console.log(`[1/3] ${mdFiles.length} MD files`);
  for (const file of mdFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const title = path.basename(file).replace(/\.md$/, '');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    total += await ingestText(rel, title, content, 'tax');
  }

  // 2) Text goc .tmp_extract (bo file test)
  const txtBases = new Set();
  let txtCount = 0;
  for (const dir of TMP_EXTRACT_DIRS) {
    const txtFiles = walk(dir, ['.txt']);
    for (const file of txtFiles) {
      const base = path.basename(file).replace(/\.docx\.txt$/, '').replace(/\.txt$/, '');
      txtBases.add(base);
      const content = fs.readFileSync(file, 'utf8');
      const title = base;
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      total += await ingestText(rel, title, content, 'tax');
      txtCount++;
    }
  }
  console.log(`[2/3] ${txtCount} TXT files (da loai file test)`);

  // 3) Docx goc sources — chi nhung chua co txt cung base
  const docxFiles = walk(SOURCES_DIR, ['.docx']);
  let docxIngested = 0;
  for (const file of docxFiles) {
    const base = path.basename(file).replace(/\.docx$/, '');
    if (txtBases.has(base)) continue; // da co txt tuong ung -> bo qua
    const content = await extractDocx(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    total += await ingestText(rel, base, content, 'tax');
    docxIngested++;
  }
  console.log(`[3/3] ${docxIngested} DOCX files (moi, chua co txt)`);

  console.log(`Done. Tong chunks moi nap: ${total}`);
}

main().catch(e => { console.error(e); process.exit(1); });
