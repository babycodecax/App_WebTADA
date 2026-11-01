import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { marked } from 'marked';
import { getSupabase } from '@/lib/supabase';
import { SITE, esc, escJson, sanitizeSsrHtml } from '@/lib/ssrHtml';
import { rewriteLegalLinks } from '@/lib/legalLinkRewrite';
import { getDocIndex } from '@/lib/docIndexCache';

export const runtime = 'nodejs';
// force-dynamic — trả blog.html + SSR meta tags theo slug (SEO)
export const dynamic = 'force-dynamic';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/**
 * Redirect map: old slug (thiếu nguyên âm do bug slugify cũ) → new slug (đúng).
 * Được tạo từ dữ liệu Google Search Console (20 trang chưa indexed).
 * Khi thêm bài viết mới với slug thay đổi, cập nhật map này.
 */
const OLD_SLUG_REDIRECTS: Record<string, string> = {
  'gii-php-g-ri-khi-b-bhxh-truy-thu-bo-him-hng-dn-vin':
    'giai-phap-go-roi-khi-bi-bhxh-truy-thu-bao-hiem-huong-dan-vien',
  'h-kinh-doanh-di-1-t-khai-thu-2026-th-no-cho-chun':
    'ho-kinh-doanh-duoi-1-ty-khai-thue-2026-the-nao-cho-chuan',
  'ho-kinh-doanh-duoi-ty-dong-cach-xu-ly-thue-dung-quy-dinh-2026':
    'ho-kinh-doanh-duoi-mot-ty-dong-cach-xu-ly-thue-dung-quy-dinh-2026',
  'hoa-don-bank-neo-cai-khon-loi-bien-thanh-cai-dai':
    'hoa-don-mot-dang-bank-mot-neo-khi-cai-khon-loi-bien-thanh-cai-dai',
  'huong-dan-chi-tiet-quy-trinh-ky-su-dung-hoa-don-dien-tu-ho-kinh-doanh-nam-2026':
    'huong-dan-chi-tiet-quy-trinh-dang-ky-su-dung-hoa-don-dien-tu-cho-ho-kinh-doanh-nam-2026',
  'k-hoch-xut-ha-n-in-t-ng-quy-nh-nm-2026-v-l-trnh-g-b-ni-lo-x-pht':
    'ke-hoach-xuat-hoa-don-dien-tu-dung-quy-dinh-nam-2026-va-lo-trinh-go-bo-noi-lo-xu-phat',
  'kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-dung-chuan-2026':
    'kinh-doanh-san-thuong-mai-dien-tu-xuat-hoa-don-sao-cho-dung-chuan-2026',
  'lm-affiliate-2026-doanh-thu-bao-nhiu-mi-phi-np-thu':
    'lam-affiliate-2026-doanh-thu-bao-nhieu-moi-phai-nop-thue',
  'lo-trinh-xu-ly-rui-ro-hoa-don-n06-giai-toa-ap-luc-thue-nam-2026':
    'lo-trinh-xu-ly-rui-ro-hoa-don-n06-va-giai-toa-ap-luc-thue-nam-2026',
  'quan-ly-hoa-don-dau-vao-ho-kinh-doanh-doanh-duoi-1-ty-dong':
    'quan-ly-hoa-don-dau-vao-cho-ho-kinh-doanh-doanh-thu-duoi-1-ty-dong',
  'shopee-no-don-2-ty-cai-quen-dat-gia-duong-nao-ho-kinh-doanh':
    'shopee-no-don-2-ty-va-cai-quen-dat-gia-duong-nao-cho-ho-kinh-doanh',
  'thue-goi-ten-giam-doc-chay-no-ke-toan-o-lai-chiu-tran-hay-rut-lui-em-dep':
    'thue-goi-ten-giam-doc-chay-no-ke-toan-nen-o-lai-chiu-tran-hay-rut-lui-em-dep',
  'tien-an-xang-xe-chi-co-dinh-coi-chung-mat-tien-thue-oan-vi-ngai-tinh-ngay-cong':
    'tien-an-xang-xe-chi-co-dinh-coi-chung-mat-tien-thue-oan-vi-ngai-tinh-theo-ngay-cong',
  'tm-tt-cc-im-mi-quan-trng-nht-lin-quan-n-thu-thu-nhp-c-nhn-tncn-v-h-kinh-doanh-hkd-t-03-ngh-nh-252-253-254-p-dng-cho-giai-on-2026':
    'tom-tat-cac-diem-moi-quan-trong-nhat-lien-quan-den-thue-thu-nhap-ca-nhan-tncn-va-ho-kinh-doanh-hkd-tu-03-nghi-dinh-252-253-254-ap-dung-cho-giai-doan-2026',
  'tng-hp-cc-trng-hp-b-tm-hon-xut-cnh-do-n-thu-t-2026':
    'tong-hop-cac-truong-hop-bi-tam-hoan-xuat-canh-do-no-thue-tu-2026',
  'xu-ly-sai-lech-doanh-toi-uu-nghia-vu-phat-kiem-tra-thue-nam-2025':
    'xu-ly-sai-lech-doanh-thu-va-toi-uu-nghia-vu-phat-khi-kiem-tra-thue-nam-2025',
  // Bo sung 2026-09-17 tu GSC Pages (4 URL 404): old slug -> new slug da verify 200 + trung chu de.
  'huong-dan-nop-noi-quy-lao-dong-doanh-nghiep-moi-nhat-nam-2026':
    'huong-dan-nop-noi-quy-lao-dong-cho-doanh-nghiep-moi-nhat-nam-2026',
  'ke-khai-von-dieu-le-5-ty-thuc-gop-2-ty-cach-xu-ly-an-toan-dung-luat-nam-2026':
    'ke-khai-von-dieu-le-5-ty-nhung-thuc-gop-2-ty-cach-xu-ly-an-toan-va-dung-luat-nam-2026',
  'cch-g-lnh-tm-hon-xut-cnh-do-n-thu-doanh-nghip-nm-2026':
    'cach-go-lenh-tam-hoan-xuat-canh-do-no-thue-doanh-nghiep-nam-2026',
  'huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-tra-luong-nguoi-than-quyet-toan-thue':
    'huong-dan-ho-so-hop-thuc-hoa-chi-phi-tien-luong-khi-tra-luong-cho-nguoi-than-khi-quyet-toan-thue',
};

/** Trích xuất description từ content markdown (fallback khi không có summary) */
function extractDescription(content: string, maxLen = 155): string {
  return content
    .replace(/[#*`\-\[\]()!>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen);
}

/**
 * GET /blog/:slug — blog detail URL clean path (SEO).
 *
 * Query Supabase theo slug → inject <title>, <meta description>,
 * <link canonical>, <meta og:*> và JSON-LD BlogPosting vào HTML
 * trước khi trả về. Googlebot thấy nội dung SEO ngay trong HTML,
 * không cần chờ JS render.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // 1) Đọc blog.html template
    const filePath = path.join(PUBLIC_DIR, 'blog.html');
    let html = await readFile(filePath, 'utf-8');

    // 2) Query Supabase lấy bài viết theo slug
    try {
      const client = getSupabase();
      const { data: post } = await client
        .from('blog_posts')
        .select('title, summary, content, slug, published_at, updated_at, author_email')
        .eq('slug', slug)
        .eq('status', 'published')
        .limit(1)
        .single();

      if (post) {
        const title = esc(post.title || '');
        const desc = esc(
          post.summary || extractDescription(post.content || '')
        );
        const canonical = `${SITE}/blog/${esc(slug)}`;
        const ogImage = `${SITE}/static/img/og-image.svg`;
        const author = esc(post.author_email || 'Dịch Vụ Thuế Kế Toán TADA');
        const pubDate = post.published_at || '';
        const modDate = post.updated_at || '';

        // 3) Thay <title> trong HTML
        html = html.replace(
          /<title>[^<]*<\/title>/,
          `<title>${title} — TADA</title>`
        );

        // 3b) Thay thế tags gốc trong template TẠI CHỖ (không inject thêm bộ
        //     thứ 2 → tránh duplicate description/canonical/og → Google confusion)
        html = html.replace(
          /<meta name="description" content="[^"]*">/i,
          `<meta name="description" content="${desc}">`
        );
        html = html.replace(
          /<link rel="canonical" href="[^"]*">/i,
          `<link rel="canonical" href="${canonical}">`
        );
        html = html.replace(
          /<meta property="og:url" content="[^"]*">/i,
          `<meta property="og:url" content="${canonical}">`
        );
        html = html.replace(
          /<meta property="og:type" content="[^"]*">/i,
          `<meta property="og:type" content="article">`
        );
        html = html.replace(
          /<meta property="og:title" content="[^"]*">/i,
          `<meta property="og:title" content="${title} — TADA">`
        );
        html = html.replace(
          /<meta property="og:description" content="[^"]*">/i,
          `<meta property="og:description" content="${desc}">`
        );
        html = html.replace(
          /<meta property="og:image" content="[^"]*">/i,
          `<meta property="og:image" content="${ogImage}">`
        );
        html = html.replace(
          /<meta name="twitter:title" content="[^"]*">/i,
          `<meta name="twitter:title" content="${title} — TADA">`
        );
        html = html.replace(
          /<meta name="twitter:description" content="[^"]*">/i,
          `<meta name="twitter:description" content="${desc}">`
        );
        html = html.replace(
          /<meta name="twitter:image" content="[^"]*">/i,
          `<meta name="twitter:image" content="${ogImage}">`
        );

        // 4) Chỉ inject tags template CHƯA có (article time + og dims)
        const seoMeta = [
          `<meta property="og:image:width" content="1200">`,
          `<meta property="og:image:height" content="630">`,
          pubDate ? `<meta property="article:published_time" content="${esc(pubDate)}">` : '',
          modDate ? `<meta property="article:modified_time" content="${esc(modDate)}">` : '',
        ].filter(Boolean).join('\n  ');

        html = html.replace(
          /<\/title>/i,
          `</title>\n  ${seoMeta}`
        );

        // 5) Inject JSON-LD BlogPosting + BreadcrumbList schema (esc để tránh </script> injection)
        const blogPostingSchema = {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.summary || desc,
          url: canonical,
          datePublished: pubDate,
          dateModified: modDate || pubDate,
          author: { '@type': 'Organization', name: author },
          publisher: {
            '@type': 'Organization',
            name: 'Dịch Vụ Thuế Kế Toán TADA',
            logo: { '@type': 'ImageObject', url: ogImage },
          },
        };

        const breadcrumbSchema = {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
            { '@type': 'ListItem', position: 3, name: post.title },
          ],
        };

        const jsonLd = escJson(JSON.stringify(blogPostingSchema));
        const jsonLdBreadcrumb = escJson(JSON.stringify(breadcrumbSchema));

        html = html.replace(
          /<\/head>/i,
          `  <script type="application/ld+json">${jsonLd}</script>\n  <script type="application/ld+json">${jsonLdBreadcrumb}</script>\n</head>`
        );

        // 7) SSR toàn bộ nội dung bài viết vào #blog-grid (thay placeholder
        //    "Đang tải...") để bot KHÔNG chạy JS (OAI-SearchBot, PerplexityBot,
        //    CCBot) vẫn đọc được full text → điều kiện cần để AI dẫn nguồn.
        //    Client blog.js renderDetail ghi đè grid bằng JS nên người dùng
        //    không thấy trùng. Giữ cấu trúc giống client (article+h1+meta).
        try {
          // Demo shell heading "Bài viết & Hướng dẫn" xuống h2 — bài viết title
          // là h1 duy nhất của trang con (chuẩn SEO, tránh 2 h1)
          html = html.replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/, '<h2$1>$2</h2>');
          const md = (post.content || '').replace(/^\s*#[^\n]*\n/, '');
          const raw = String(
            await marked.parse(md, { breaks: true, gfm: true })
          );
          const rawHtml = sanitizeSsrHtml(raw);
          // Rewrite link pháp lý: số hiệu văn bản trong bài → /van-ban/<id>
          // (best-effort — index lỗi/không khớp cứ giữ text nguyên)
          let bodyHtml = rawHtml;
          try {
            bodyHtml = rewriteLegalLinks(rawHtml, await getDocIndex(getSupabase()));
          } catch {
            // giữ nguyên rawHtml
          }
          const fmtDate = (iso: string) => {
            if (!iso) return '';
            const dd = new Date(iso);
            if (isNaN(+dd)) return '';
            return `ngày ${dd.getDate()}/${dd.getMonth() + 1}/${dd.getFullYear()}`;
          };
          const article =
            `<article class="blog-detail" id="ssr-article">` +
            `<a href="/blog" class="blog-detail-back">← Quay lại danh sách</a>` +
            `<h1>${title}</h1>` +
            `<div class="meta">Đăng ${esc(fmtDate(pubDate))} bởi ${author}</div>` +
            `<div class="content">${bodyHtml}</div></article>`;
          const next = html.replace(
            /<div class="blog-loading">[\s\S]*?<\/div>/,
            article
          );
          if (next !== html) html = next;
          else console.error('[SSR-blog] placeholder mismatch:', slug);
        } catch {
          // Markdown lỗi → giữ placeholder, client render bù bằng JS
        }
      } else {
        // Slug không tìm thấy trong DB → thử redirect 301 về slug mới
        // (xử lý old slug URLs đã bị thay đổi khi fix-blog-slugs)
        const newSlug = OLD_SLUG_REDIRECTS[slug];

        if (newSlug) {
          return NextResponse.redirect(`${SITE}/blog/${newSlug}`, {
            status: 301,
            headers: { 'Cache-Control': 'public, s-maxage=86400, max-age=3600' },
          });
        }

        return new NextResponse('Not Found', { status: 404 });
      }
    } catch {
      // Supabase lỗi → trả HTML gốc (blog.js vẫn render được bằng JS)
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=600, max-age=60, stale-while-revalidate=600',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}