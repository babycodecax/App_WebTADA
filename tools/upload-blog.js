/**
 * upload-blog.js — Upload 19 bài SEO lên Supabase blog_posts
 *
 * Usage: node tools/upload-blog.js
 * Env: reads SUPABASE_URL + SUPABASE_KEY from backend/.env
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── Config ──
const BLOG_CONTENT_DIR = path.join(__dirname, 'blog-content');
const ENV_PATH = path.join(__dirname, '..', 'backend', '.env');

// ── Load env from backend/.env ──
function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val;
  }
  return env;
}

// ── Parse markdown frontmatter ──
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const metaBlock = match[1];
  const body = match[2].trim();
  const meta = {};

  for (const line of metaBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    // Remove quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }

  return { meta, body };
}

// ── Collect all .md files ──
function collectFiles(dir) {
  const files = [];
  const clusters = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory());
  for (const cluster of clusters) {
    const clusterDir = path.join(dir, cluster);
    const mdFiles = fs.readdirSync(clusterDir).filter(f => f.endsWith('.md'));
    for (const file of mdFiles) {
      files.push(path.join(clusterDir, file));
    }
  }
  return files;
}

// ── Insert via Supabase REST API ──
async function insertPost(supabaseUrl, serviceKey, row) {
  const url = `${supabaseUrl}/rest/v1/blog_posts`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(row),
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: text };
  }
  return { ok: true, data: JSON.parse(text) };
}

// ── Check if slug exists ──
async function slugExists(supabaseUrl, serviceKey, slug) {
  const url = `${supabaseUrl}/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}&select=id`;
  const res = await fetch(url, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
  });
  const data = await res.json();
  return data && data.length > 0;
}

// ── Main ──
async function main() {
  const env = loadEnv(ENV_PATH);
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in backend/.env');
    process.exit(1);
  }

  console.log(`🔗 Supabase: ${supabaseUrl}`);
  console.log(`📁 Content dir: ${BLOG_CONTENT_DIR}`);

  const files = collectFiles(BLOG_CONTENT_DIR);
  console.log(`📝 Found ${files.length} markdown files\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    const relPath = path.relative(BLOG_CONTENT_DIR, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { meta, body } = parseFrontmatter(content);

    const slug = meta.slug || path.basename(filePath, '.md');
    const title = meta.title || slug;
    const summary = meta.summary || '';
    const status = meta.status || 'draft';

    // Check duplicate
    const exists = await slugExists(supabaseUrl, serviceKey, slug);
    if (exists) {
      console.log(`⏭️  SKIP (duplicate): ${slug}`);
      skipped++;
      continue;
    }

    const row = {
      title,
      slug,
      summary,
      content: body,
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
      author_email: meta.author_email || meta.author || 'Dịch Vụ Thuế Kế Toán TADA',
    };

    const result = await insertPost(supabaseUrl, serviceKey, row);
    if (result.ok) {
      console.log(`✅ CREATED: ${slug} (${body.split(/\s+/).length} words)`);
      created++;
    } else {
      console.log(`❌ FAILED: ${slug} — ${result.error}`);
      failed++;
    }
  }

  console.log(`\n═══════════════════════════════════`);
  console.log(`📊 Results: ${created} created, ${skipped} skipped, ${failed} failed`);
  console.log(`═══════════════════════════════════`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
