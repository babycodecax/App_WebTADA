#!/usr/bin/env node
/**
 * Sync static files from root → api/public/
 * Run before deploy: node scripts/sync-public.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'api', 'public');

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

let count = 0;
function countFiles(dir) {
  let n = 0;
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    n += fs.statSync(p).isDirectory() ? countFiles(p) : 1;
  }
  return n;
}

// Sync css, js, img directories (recursive)
for (const dir of ['css', 'js', 'img']) {
  const src = path.join(ROOT, dir);
  if (!fs.existsSync(src)) continue;
  copyDirSync(src, path.join(DEST, dir));
  count += countFiles(path.join(DEST, dir));
}

// Sync root HTML files
for (const f of ['index.html', 'blog.html']) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DEST, f));
    count++;
  }
}

console.log(`✓ Synced ${count} files → api/public/`);
