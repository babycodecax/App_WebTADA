#!/usr/bin/env node
/**
 * Sync static files from root → api/public/ + backend/static/
 * Run BEFORE deploy: node scripts/sync-public.js
 *
 * Root/ is the single source of truth for frontend files.
 * Both api/public/ (Vercel) and backend/static/ (local Python server) must be in sync.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DESTINATIONS = [
  path.join(ROOT, 'api', 'public'),
  path.join(ROOT, 'backend', 'static'),
];

function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dst, item);
    if (fs.statSync(s).isDirectory()) {
      copyDirSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function countFiles(dir) {
  let n = 0;
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    n += fs.statSync(p).isDirectory() ? countFiles(p) : 1;
  }
  return n;
}

let total = 0;

for (const DEST of DESTINATIONS) {
  console.log(`\n--- Syncing to ${path.relative(ROOT, DEST)}/ ---`);

  // Sync css, js, img directories (recursive)
  for (const dir of ['css', 'js', 'img']) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) continue;
    copyDirSync(src, path.join(DEST, dir));
    const n = countFiles(path.join(DEST, dir));
    console.log(`  ${dir}/ → ${n} files`);
    total += countFiles(src);
  }

  // Sync root HTML files
  for (const f of ['index.html', 'blog.html', 'admin.html', 'privacy.html', 'terms.html']) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DEST, f));
      total++;
    }
  }

  // Sync SEO files (robots.txt, sitemap.xml)
  for (const f of ['robots.txt', 'sitemap.xml']) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DEST, f));
      total++;
    }
  }

  console.log(`  HTML → index.html, blog.html, admin.html, privacy.html, terms.html`);
  console.log(`  SEO → robots.txt, sitemap.xml`);
}

console.log(`\n✓ Synced ${total} files to both api/public/ and backend/static/`);
