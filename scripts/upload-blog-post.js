/**
 * Upload blog post to Supabase blog_posts table
 * Usage: node scripts/upload-blog-post.js <markdown-file>
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Supabase config from .env.local
const SUPABASE_URL = 'https://zpxfhxchvoqcfcskxcez.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpweGZoeGNodm9xY2Zjc2t4Y2V6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDM5NjY4NiwiZXhwIjoyMDk5OTcyNjg2fQ.sH2NOPql2PSmQ5Cv1R0wZlvOaEbY7KRODA-_ezsQovo';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const fm = match[1];
  const body = match[2].trim();
  const meta = {};

  fm.split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      // Remove quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      meta[key] = val;
    }
  });

  return { meta, body };
}

function supabaseRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(method === 'POST' ? { 'Prefer': 'return=representation' } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node upload-blog-post.js <markdown-file>');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(absPath, 'utf-8');
  const { meta, body } = parseFrontmatter(raw);

  if (!meta.title || !meta.slug) {
    console.error('Missing required frontmatter: title, slug');
    process.exit(1);
  }

  const row = {
    title: meta.title,
    slug: meta.slug,
    summary: meta.summary || '',
    content: body,
    status: meta.status || 'published',
    published_at: meta.published_at ? new Date(meta.published_at).toISOString() : new Date().toISOString(),
    author_email: 'dagcoj@gmail.com',
  };

  console.log(`Uploading: "${row.title}" (slug: ${row.slug})`);

  // Check if slug already exists
  const existing = await supabaseRequest('GET', `/rest/v1/blog_posts?slug=eq.${encodeURIComponent(row.slug)}&select=id`);
  if (existing.status === 200 && existing.data?.length > 0) {
    const existingId = existing.data[0].id;
    console.log(`Slug "${row.slug}" already exists (id: ${existingId}). Updating...`);
    // Use PATCH with specific id
    const updateUrl = `/rest/v1/blog_posts?id=eq.${existingId}`;
    const update = await supabaseRequest('PATCH', updateUrl, row);
    if (update.status >= 400) {
      console.error('Update failed:', update.data);
      process.exit(1);
    }
    console.log('Updated successfully!');
  } else {
    const insert = await supabaseRequest('POST', '/rest/v1/blog_posts', row);
    if (insert.status >= 400) {
      console.error('Insert failed:', insert.data);
      process.exit(1);
    }
    console.log('Created successfully!', insert.data?.[0]?.id ? `(id: ${insert.data[0].id})` : '');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
