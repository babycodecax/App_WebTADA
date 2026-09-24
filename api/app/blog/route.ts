import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
// force-dynamic — SSR danh sách bài viết cho /blog (SEO: bot thấy links không cần JS)
export const dynamic = 'force-dynamic';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SITE = 'https://ketoanthuetada.com';

/** Escape HTML entities — tránh XSS từ dữ liệu Supabase */
function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape JSON string cho safe insertion vào <script> tag */
function escJson(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

/**
 * GET /blog — trang danh sách bài viết với SSR.
 *
 * Query Supabase lấy bài published → render sẵn rows đánh số vào #blog-grid
 * (đúng class .blog-mini-card mà blog.js dùng) + JSON-LD ItemList.
 * Googlebot thấy toàn bộ links ngay trong HTML. Client blog.js thấy
 * data-ssr="1" thì bỏ qua fetch để không nhấp nháy render lại.
 */
export async function GET() {
  try {
    const filePath = path.join(PUBLIC_DIR, 'blog.html');
    let html = await readFile(filePath, 'utf-8');

    try {
      const client = getSupabase();
      const { data: posts } = await client
        .from('blog_posts')
        .select('slug, title, summary, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(100);

      if (posts && posts.length > 0) {
        const cards = posts
          .filter((p) => p.slug)
          .map(
            (p, i) =>
              `<a class="blog-mini-card" href="/blog/${encodeURIComponent(p.slug)}">` +
              `<span class="blog-mini-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>` +
              `<span class="blog-mini-text">` +
              `<span class="blog-mini-title">${esc(p.title || '')}</span>` +
              `<span class="blog-mini-date">${esc(fmtDate(p.published_at))}</span>` +
              `</span>` +
              `<span class="services-arrow" aria-hidden="true">→</span>` +
              `</a>`
          )
          .join('');

        html = html.replace(
          '<div class="blog-grid" id="blog-grid">',
          '<div class="blog-grid" id="blog-grid" data-ssr="1">'
        );
        html = html.replace(
          /<div class="blog-loading">.*?<\/div>/,
          cards
        );

        const itemListSchema = {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Bài viết & Hướng dẫn Thuế Kế Toán — TADA',
          itemListElement: posts
            .filter((p) => p.slug)
            .slice(0, 100)
            .map((p, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: p.title,
              url: `${SITE}/blog/${encodeURIComponent(p.slug)}`,
            })),
        };
        html = html.replace(
          /<\/head>/i,
          `  <script type="application/ld+json">${escJson(JSON.stringify(itemListSchema))}</script>\n</head>`
        );
      }
    } catch {
      // Supabase lỗi → trả HTML gốc (blog.js render bù bằng JS)
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, max-age=60',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
