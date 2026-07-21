// Ingest script: scan vault MD files -> chunk -> embed -> upsert Supabase
// Run: node scripts/ingest-vault.js
// Resumable: skips chunks already ingested (dedupe by source_hash + chunk_index).
// Robust: retries transient network errors (ECONNRESET) with backoff.

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VAULT_DIR = process.env.VAULT_DIR || 'D:/CodeApp/Projects/App_WebTADA/vault/thue-ke-toan';
const EMBED_MODEL = process.env.EMBED_MODEL || 'openai/text-embedding-3-small';
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.md')) acc.push(p);
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

// Retry embedding up to 4 times on transient errors
async function embedWithRetry(input, attempt = 1) {
  try {
    const res = await openai.embeddings.create({ model: EMBED_MODEL, input });
    return res.data[0].embedding;
  } catch (e) {
    if (attempt >= 4) throw e;
    const wait = 1000 * attempt;
    console.error(`  embed retry ${attempt} after ${wait}ms:`, e.code || e.message);
    await new Promise(r => setTimeout(r, wait));
    return embedWithRetry(input, attempt + 1);
  }
}

async function main() {
  const files = walk(VAULT_DIR);
  console.log(`Found ${files.length} MD files`);
  let total = 0;
  let skipped = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const title = path.basename(file).replace(/\.md$/, '');
    const sourceHash = hash(content.slice(0, 500));
    const relPath = path.relative(VAULT_DIR, file);
    const chunks = chunkText(content);

    // Existing chunk indexes for this exact source (dedupe / resume).
    // Use (source, chunk_index) composite key, NOT source_hash (32-bit collisions skip files).
    const { data: existing } = await supabase
      .from('documents')
      .select('chunk_index')
      .eq('source', relPath);
    const done = new Set((existing || []).map(r => r.chunk_index));

    for (let i = 0; i < chunks.length; i++) {
      if (done.has(i)) { skipped++; continue; }
      const embedding = await embedWithRetry(chunks[i]);
      const { error } = await supabase.from('documents').insert({
        content: chunks[i], title, source: relPath, tag: 'tax', chunk_index: i, source_hash: sourceHash, embedding,
      });
      if (error) { console.error('  Insert error:', error.message); continue; }
      total++;
    }
    console.log(`  ${title}: ${chunks.length} chunks (new ${total > 0 ? '+' : ''}${chunks.length - (done.size || 0)})`);
  }
  console.log(`Done. New chunks this run: ${total}, skipped (already ingested): ${skipped}`);
}

main().catch(e => { console.error(e); process.exit(1); });
