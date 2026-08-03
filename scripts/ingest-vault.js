#!/usr/bin/env node
/**
 * ingest-vault.js — Chạy 1 lần: đọc vault .md, chunk, embed Gemini, upload Supabase.
 *
 * Usage: node scripts/ingest-vault.js
 * Env cần: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const VAULT_DIR = process.env.VAULT_DIR || 'D:\\CodeApp\\Projects\\App_WebTADA\\vault\\thue-ke-toan';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Chunking (giống ingestion.py) ───
const HEADING_RE = /^(#{1,6})\s+(.*)$/m;
const PARA_SPLIT_RE = /\n\s*\n/;
const MAX_CHUNK_TOKENS = 1500;

function countTokens(text) { return text.split(/\s+/).length; }

function chunkByHeading(body) {
  const lines = body.split('\n');
  const sections = [];
  let headingStack = [];
  let currentLines = [];

  function flush() {
    if (currentLines.length) {
      const text = currentLines.join('\n').trim();
      if (text) sections.push({ heading: headingStack.join(' > '), text });
      currentLines = [];
    }
  }

  for (const line of lines) {
    const m = HEADING_RE.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      const hText = m[2].trim();
      headingStack = headingStack.slice(0, level - 1);
      headingStack.push(hText);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  // Split oversized
  const chunks = [];
  for (const { heading, text } of sections) {
    if (countTokens(text) <= MAX_CHUNK_TOKENS) {
      chunks.push({ heading, text });
    } else {
      const paras = text.split(PARA_SPLIT_RE).map(p => p.trim()).filter(Boolean);
      let buf = [], bufTokens = 0;
      for (const para of paras) {
        const pt = countTokens(para);
        if (buf.length && bufTokens + pt > MAX_CHUNK_TOKENS) {
          chunks.push({ heading, text: buf.join('\n\n') });
          buf = []; bufTokens = 0;
        }
        if (pt > MAX_CHUNK_TOKENS) {
          const words = para.split(/\s+/);
          for (let i = 0; i < words.length; i += MAX_CHUNK_TOKENS) {
            chunks.push({ heading, text: words.slice(i, i + MAX_CHUNK_TOKENS).join(' ') });
          }
        } else {
          buf.push(para);
          bufTokens += pt;
        }
      }
      if (buf.length) chunks.push({ heading, text: buf.join('\n\n') });
    }
  }
  return chunks;
}

function parseFrontmatter(content) {
  const m = /^---\n(.*?)\n---\n?/s.exec(content);
  if (!m) return { frontmatter: '', body: content, title: '' };
  const frontmatter = m[1];
  const body = content.slice(m[0].length);
  const tMatch = /^title:\s*(.+)$/m.exec(frontmatter);
  const title = tMatch ? tMatch[1].trim().replace(/^["']|["']$/g, '') : '';
  return { frontmatter, body, title };
}

async function embedText(text) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] } }),
      });
      if (!res.ok) {
        const b = await res.text();
        throw new Error(`Gemini ${res.status}: ${b.slice(0, 200)}`);
      }
      const data = await res.json();
      return data.embedding.values;
    } catch (e) {
      if (attempt >= 6) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

async function main() {
  // 1. Scan vault
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
    }
  }
  walk(VAULT_DIR);
  console.log(`Found ${files.length} .md files`);

  // 1b. Nguồn đã bị xóa qua admin (status='deleted') — KHÔNG re-ingest
  //     (soft-delete trong source_documents — chống kiến thức cũ tái sử dụng)
  const { data: deletedSources, error: delSrcErr } = await supabase
    .from('source_documents')
    .select('file_path')
    .eq('status', 'deleted');
  if (delSrcErr) console.warn('Load deleted sources warn:', delSrcErr.message);
  const deletedPaths = new Set((deletedSources || []).map(r => r.file_path));
  // So khớp theo BASENAME (file_path của source_documents vault được ghi bằng
  // basename) — bắt cả file trong thư mục con (chung/, sources/...) như
  // ingestion.py dùng endswith.
  const filesFiltered = files.filter(f => {
    const rel = path.relative(VAULT_DIR, f).replace(/\\/g, '/');
    const base = path.basename(f);
    return !deletedPaths.has(rel) && !deletedPaths.has(base);
  });
  if (deletedPaths.size) console.log(`Skipping ${deletedPaths.size} deleted source(s): ${[...deletedPaths].join(', ')}`);
  console.log(`Will ingest ${filesFiltered.length} files (bỏ ${files.length - filesFiltered.length} nguồn deleted)`);

  // 2. Delete old chunks
  const { error: delErr } = await supabase.from('knowledge_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) console.warn('Delete old chunks warn:', delErr.message);

  // 3. Process each file (insert without embedding)
  let total = 0, errors = 0;
  for (let fi = 0; fi < filesFiltered.length; fi++) {
    const fpath = filesFiltered[fi];
    try {
      const content = fs.readFileSync(fpath, 'utf-8');
      const { title, body } = parseFrontmatter(content);
      const fileTitle = title || path.basename(fpath, '.md');
      const chunks = chunkByHeading(body);
      const relativePath = path.relative(VAULT_DIR, fpath);

      // Insert in batches of 10
      for (let ci = 0; ci < chunks.length; ci += 10) {
        const batch = chunks.slice(ci, ci + 10);
        const records = batch.map((chunk, idx) => ({
          content: chunk.text,
          title: fileTitle,
          heading: chunk.heading,
          file_path: relativePath,
          chunk_index: ci + idx,
        }));
        const { error: insErr } = await supabase.from('knowledge_chunks').insert(records);
        if (insErr) {
          console.error(`  Insert error for ${fpath}: ${insErr.message}`);
          errors++;
        } else {
          total += records.length;
        }
      }
      if ((fi + 1) % 20 === 0) console.log(`  ${fi + 1}/${filesFiltered.length} files, ${total} chunks`);
    } catch (e) {
      console.error(`Error processing ${fpath}: ${e.message}`);
      errors++;
    }
  }

  // 4. Parse cheatsheet → structured knowledge
  console.log('\n--- Parsing structured knowledge ---');
  const cheatsheetPath = path.join(VAULT_DIR, '_cheatsheet-thue-2026.md');
  if (fs.existsSync(cheatsheetPath)) {
    const csContent = fs.readFileSync(cheatsheetPath, 'utf-8');
    const { body } = parseFrontmatter(csContent);
    // Extract key-value pairs from heading + text
    const lines = body.split('\n');
    let currentKey = '', currentVal = '';
    const entries = [];
    for (const line of lines) {
      const hMatch = /^#{1,3}\s+(.+)$/.exec(line);
      if (hMatch) {
        if (currentKey && currentVal) entries.push({ key: currentKey, value: currentVal.trim() });
        currentKey = hMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 100);
        currentVal = '';
      } else {
        currentVal += line + '\n';
      }
    }
    if (currentKey && currentVal) entries.push({ key: currentKey, value: currentVal.trim() });

    // Upsert to knowledge_structured
    if (entries.length) {
      const { error: ksErr } = await supabase.from('knowledge_structured').upsert(
        entries.map(e => ({ ...e, category: 'cheatsheet' })),
        { onConflict: 'key' }
      );
      if (ksErr) console.error('Structured knowledge error:', ksErr.message);
      else console.log(`  Inserted ${entries.length} structured entries`);
    }
  }

  console.log(`\nDone! ${total} chunks ingested, ${errors} errors`);
}

main().catch(console.error);
