/**
 * fix-blog-slugs.ts — Cập nhật slug cho tất cả blog posts hiện có.
 *
 * Chạy: cd api && npx tsx scripts/fix-blog-slugs.ts
 *
 * Logic: lấy title → slugify lại → update slug trong database.
 * Slug mới giữ dấu tiếng Việt (vd: "giải-pháp-thuế").
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Cần set SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY');
  console.error('URL:', SUPABASE_URL ? 'OK' : 'MISSING');
  console.error('KEY:', SUPABASE_KEY ? 'OK (' + SUPABASE_KEY.slice(0,10) + '...)' : 'MISSING');
  process.exit(1);
}

console.log(`Using: ${SUPABASE_URL.slice(0,30)}... | key: ${SUPABASE_KEY.slice(0,10)}...`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Slugify — giống hệt blog/route.ts
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log('Đang tải blog posts...');

  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('id, title, slug');

  if (error) {
    console.error('Lỗi query:', error.message);
    process.exit(1);
  }

  if (!posts || !posts.length) {
    console.log('Không có bài viết nào.');
    return;
  }

  console.log(`Tìm thấy ${posts.length} bài viết.\n`);

  let updated = 0;
  let skipped = 0;

  for (const post of posts) {
    const newSlug = slugify(post.title || '');
    if (!newSlug) {
      console.log(`  SKIP "${post.title}" → slug rỗng`);
      skipped++;
      continue;
    }

    if (post.slug === newSlug) {
      // Slug đã đúng, bỏ qua
      continue;
    }

    console.log(`  FIX "${post.title}"`);
    console.log(`    "${post.slug}" → "${newSlug}"`);

    const { error: updateErr } = await supabase
      .from('blog_posts')
      .update({ slug: newSlug })
      .eq('id', post.id);

    if (updateErr) {
      console.error(`    Lỗi update: ${updateErr.message}`);
    } else {
      updated++;
    }
  }

  console.log(`\nHoàn thành: ${updated} bài đã cập nhật slug, ${skipped} bỏ qua.`);
}

main().catch(console.error);
