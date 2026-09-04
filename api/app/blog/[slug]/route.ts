import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
// force-dynamic — trả blog.html + SSR meta tags theo slug (SEO)
export const dynamic = 'force-dynamic';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SITE = 'https://ketoanthuetada.com';

/** Escape HTML entities — tránh XSS từ dữ liệu Supabase */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape JSON string cho safe insertion vào <script> tag — tránh </script> injection */
function escJson(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

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
        const canonical = `${SITE}/blog/${encodeURIComponent(slug)}`;
        const ogImage = `${SITE}/static/img/logo.jpg`;
        const author = esc(post.author_email || 'Dịch Vụ Thuế Kế Toán TADA');
        const pubDate = post.published_at || '';
        const modDate = post.updated_at || '';

        // 3) Thay <title> trong HTML
        html = html.replace(
          /<title>[^<]*<\/title>/,
          `<title>${title} — TADA</title>`
        );

        // 3b) Thay thế default canonical/og:url/og:type từ template
        //     (tránh 2 bộ meta trùng nhau → Google confusion)
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

        // 4) Inject meta SEO tags ngay sau <title>
        const seoMeta = [
          `<meta name="description" content="${desc}">`,
          `<link rel="canonical" href="${canonical}">`,
          `<meta property="og:title" content="${title} — TADA">`,
          `<meta property="og:description" content="${desc}">`,
          `<meta property="og:url" content="${canonical}">`,
          `<meta property="og:type" content="article">`,
          `<meta property="og:image" content="${ogImage}">`,
          `<meta name="twitter:title" content="${title} — TADA">`,
          `<meta name="twitter:description" content="${desc}">`,
          `<meta name="twitter:image" content="${ogImage}">`,
        ].join('\n  ');

        html = html.replace(
          /<\/title>/i,
          `</title>\n  ${seoMeta}`
        );

        // 5) Inject JSON-LD BlogPosting schema (esc để tránh </script> injection)
        const jsonLd = escJson(JSON.stringify({
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
        }));

        html = html.replace(
          /<\/head>/i,
          `  <script type="application/ld+json">${jsonLd}</script>\n</head>`
        );
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
        'Cache-Control': 'public, s-maxage=3600, max-age=60',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}