/**
 * update-blog.js — UPDATE existing blog posts in Supabase with fixed content
 */

const fs = require('fs');
const path = require('path');

const BLOG_CONTENT_DIR = path.join(__dirname, 'blog-content');
const ENV_PATH = path.join(__dirname, '..', 'backend', '.env');

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[line.slice(0, i).trim()] = v;
  }
  return { meta, body: match[2].trim() };
}

function collectFiles(dir) {
  const files = [];
  for (const cluster of fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory())) {
    for (const file of fs.readdirSync(path.join(dir, cluster)).filter(f => f.endsWith('.md'))) {
      files.push(path.join(dir, cluster, file));
    }
  }
  return files;
}

async function updatePost(supabaseUrl, serviceKey, slug, row) {
  const url = `${supabaseUrl}/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, error: text };
  return { ok: true, data: JSON.parse(text) };
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_KEY;
  if (!supabaseUrl || !serviceKey) { console.error('❌ Missing env'); process.exit(1); }

  console.log(`🔗 Supabase: ${supabaseUrl}`);
  const files = collectFiles(BLOG_CONTENT_DIR);
  console.log(`📝 Found ${files.length} files\n`);

  let updated = 0, failed = 0;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { meta, body } = parseFrontmatter(content);
    const slug = meta.slug || path.basename(filePath, '.md');

    const row = {
      content: body,
      summary: meta.summary || '',
    };

    const result = await updatePost(supabaseUrl, serviceKey, slug, row);
    if (result.ok) {
      console.log(`✅ UPDATED: ${slug} (${body.split(/\s+/).length} words)`);
      updated++;
    } else {
      console.log(`❌ FAILED: ${slug} — ${result.error}`);
      failed++;
    }
  }

  console.log(`\n═══════════════════════════════════`);
  console.log(`📊 Results: ${updated} updated, ${failed} failed`);
  console.log(`═══════════════════════════════════`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
