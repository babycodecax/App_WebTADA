/**
 * upload-single.js — Upload a single blog post to Supabase (INSERT or PATCH)
 * Usage: node tools/upload-single.js <filepath.md>
 */
const fs = require('fs');
const path = require('path');

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
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
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

async function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: node upload-single.js <filepath.md>'); process.exit(1); }

  const env = loadEnv(ENV_PATH);
  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_KEY = env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_KEY'); process.exit(1); }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { meta, body } = parseFrontmatter(content);
  const slug = meta.slug || path.basename(filePath, '.md');
  const title = (meta.title || slug).replace(/\\"/g, '"').replace(/\\\\/g, '');

  console.log('Slug:', slug);
  console.log('Title:', title);
  console.log('Words:', body.split(/\s+/).length);

  // Check if exists
  const checkRes = await fetch(SUPABASE_URL + '/rest/v1/blog_posts?slug=eq.' + encodeURIComponent(slug) + '&select=id', {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  });
  const existing = await checkRes.json();

  if (existing.length > 0) {
    console.log('Already exists (id=' + existing[0].id + '), PATCHing...');
    const res = await fetch(SUPABASE_URL + '/rest/v1/blog_posts?slug=eq.' + encodeURIComponent(slug), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ title, content: body, summary: meta.summary || '' })
    });
    const text = await res.text();
    if (!res.ok) { console.error('PATCH failed:', res.status, text); process.exit(1); }
    console.log('PATCH OK');
  } else {
    console.log('New post, INSERTing...');
    const res = await fetch(SUPABASE_URL + '/rest/v1/blog_posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        slug, title, content: body,
        summary: meta.summary || '',
        status: meta.status || 'published',
        published_at: meta.published_at || new Date().toISOString().slice(0, 10),
        author_email: meta.author_email || ''
      })
    });
    const text = await res.text();
    if (!res.ok) { console.error('INSERT failed:', res.status, text); process.exit(1); }
    const inserted = JSON.parse(text);
    console.log('INSERT OK, id=' + (inserted[0] && inserted[0].id));
  }

  // Verify
  const verifyRes = await fetch(SUPABASE_URL + '/rest/v1/blog_posts?slug=eq.' + encodeURIComponent(slug) + '&select=title,summary,status', {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  });
  const verified = await verifyRes.json();
  console.log('\nVerification:', JSON.stringify(verified[0], null, 2));
  console.log('\nDone!');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
