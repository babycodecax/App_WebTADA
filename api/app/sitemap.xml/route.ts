import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE = 'https://api-nu-drab.vercel.app';

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Sitemap động — chuẩn Google SEO Starter Guide.
 *  Xuất đủ home + /blog + toàn bộ bài viết published (escape XML).
 *  Tự cập nhật mỗi lần đăng bài, không cần sửa tay file tĩnh.
 */
export async function GET(_req: NextRequest) {
  const urls: string[] = [
    `  <url><loc>${SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>${SITE}/thu-vien</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    `  <url><loc>${SITE}/blog</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
    `  <url><loc>${SITE}/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`,
    `  <url><loc>${SITE}/terms</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`,
  ];

  try {
    const client = getSupabase();
    const { data } = await client
      .from('blog_posts')
      .select('slug, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    for (const post of data || []) {
      // Clean path /blog/:slug (SEO) — thay ?slug= (fix review 2026-08-10)
      const loc = `${SITE}/blog/${escapeXml(post.slug)}`;
      const lastmod = post.updated_at
        ? `<lastmod>${escapeXml(post.updated_at)}</lastmod>`
        : '';
      urls.push(
        `  <url><loc>${loc}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.8</priority></url>`
      );
    }
  } catch (e) {
    console.error('[sitemap] Lỗi đọc blog_posts:', e);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}