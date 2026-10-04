// Chay trong `npm run build` tren Vercel: duc 5 bai moi nhat vao
// api/public/index.html truoc khi Next build, de Google thay link ngay.
// Thieu env thi bo qua em (khong lam hong build).
import { readFileSync, writeFileSync } from 'fs';

const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!base || !key) {
  console.warn('[prebuild] thieu SUPABASE env, bo qua inject-home-posts');
  process.exit(0);
}

const MONTHS = { 1: 'tháng 1', 2: 'tháng 2', 3: 'tháng 3', 4: 'tháng 4', 5: 'tháng 5', 6: 'tháng 6', 7: 'tháng 7', 8: 'tháng 8', 9: 'tháng 9', 10: 'tháng 10', 11: 'tháng 11', 12: 'tháng 12' };
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `ngày ${d.getDate()} ${MONTHS[d.getMonth() + 1]} năm ${d.getFullYear()}`;
};

const url = `${base}/rest/v1/blog_posts?select=slug,title,published_at&status=eq.published&order=published_at.desc&limit=5`;
const res = await fetch(url, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
if (!res.ok) {
  console.warn('[prebuild] khong lay duoc bai viet, bo qua:', res.status);
  process.exit(0);
}
const posts = await res.json();
const cards = posts.map((p, i) =>
  `<a class="blog-mini-card" href="/blog/${p.slug}" style="--i: ${i};"><span class="blog-mini-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>` +
  `<span class="blog-mini-text"><h3>${esc(p.title)}</h3><div class="date">${fmt(p.published_at)}</div></span></a>`
).join('');

const FILE = 'public/index.html';
let t = readFileSync(FILE, 'utf-8');
const marker = '<div class="blog-loading">Đang tải bài viết...</div>';
if (!t.includes(marker)) {
  console.warn('[prebuild] khong thay placeholder, bo qua');
  process.exit(0);
}
t = t.replace(marker, cards);
writeFileSync(FILE, t);
console.log('[prebuild] injected', posts.length, 'posts ->', FILE);
