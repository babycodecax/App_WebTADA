import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabase } from '@/lib/supabase';
import { SITE, esc, escJson, sanitizeSsrHtml } from '@/lib/ssrHtml';

export const runtime = 'nodejs';
// force-dynamic — SSR nội dung văn bản theo id (SEO: Googlebot đọc ngay)
export const dynamic = 'force-dynamic';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

const DOC_TYPE_LABEL: Record<string, string> = {
  luat: 'Luật',
  nd: 'Nghị định',
  tt: 'Thông tư',
  nq: 'Nghị quyết',
  qd: 'Quyết định',
  cv: 'Công văn',
  hd: 'Hướng dẫn',
  vbhn: 'VBHN',
  other: 'Văn bản',
};

/** Ghép block SSR — thay placeholder bằng hero + content văn bản. */
const SSR_PLACEHOLDER = '<!--VANBAN_SSR-->';

function fmtDateVi(iso: string): string {
  const d = new Date(iso);
  if (isNaN(+d)) return '';
  return `ngày ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/**
 * GET /van-ban/:id — trang toàn văn 1 văn bản luật (landing_legal_docs).
 *
 * SSR toàn văn vào template: bot không chạy JS (OAI-SearchBot...) đọc được
 * full text; người dùng bấm "Xem toàn văn" từ trang chủ/thư viện/bài viết
 * nhảy thẳng trang này thay vì bảng list.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const filePath = path.join(PUBLIC_DIR, 'van-ban.html');
  const template = await readFile(filePath, 'utf-8').catch(() => null);
  if (!template) return new NextResponse('Template lỗi', { status: 500 });

  // id phải thuần uuid-ish — chặn junk (query injection vào canonical)
  const cleanId = (id || '').trim().replace(/[^a-zA-Z0-9\-_]/g, '');
  if (!cleanId) {
    return new NextResponse('Not Found', { status: 404 });
  }

  try {
    const client = getSupabase();
    const { data: doc } = await client
      .from('landing_legal_docs')
      .select('id,title,doc_type,doc_number,file_html,file_name,created_at')
      .eq('id', cleanId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!doc) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const title = esc(doc.title || 'Văn bản luật');
    // docNumber giữ RAW để build desc (desc sẽ esc ĐÚNG 1 LẦN khi chèn —
    // esc 2 lần làm meta hiện &amp;amp;). Hero chèn esc riêng.
    const docNumberRaw = doc.doc_number || '';
    const docNumber = esc(docNumberRaw);
    const typeLabel = DOC_TYPE_LABEL[doc.doc_type] || 'Văn bản';
    const createdAt = doc.created_at || '';
    const canonical = `${SITE}/van-ban/${cleanId}`;
    const desc =
      `Toàn văn ${typeLabel.toLowerCase()} ${docNumberRaw || doc.title || 'văn bản luật'} — bảng biểu ` +
      `đầy đủ như bản Word gốc, cập nhật mới nhất trên TADA.`;

    let html = template;

    // ==== SSR meta (thay tags gốc của template TẠI CHỖ — tránh trùng) ====
    // Qué ý: replace với replacement-string dịch $&/$$ trong chuỗi thay —
    // title/file_html có thể chứa "$" → dùng FUNCTION replacement (MEDIUM-2).
    html = html.replace(/<title>[^<]*<\/title>/i, () => `<title>${title} — TADA</title>`);
    html = html.replace(
      /<meta name="description" content="[^"]*">/i,
      () => `<meta name="description" content="${esc(desc)}">`
    );
    html = html.replace(
      /<link rel="canonical" href="[^"]*">/i,
      () => `<link rel="canonical" href="${canonical}">`
    );
    html = html.replace(
      /<meta property="og:url" content="[^"]*">/i,
      () => `<meta property="og:url" content="${canonical}">`
    );
    html = html.replace(
      /<meta property="og:title" content="[^"]*">/i,
      () => `<meta property="og:title" content="${title} — TADA">`
    );
    html = html.replace(
      /<meta property="og:description" content="[^"]*">/i,
      () => `<meta property="og:description" content="${esc(desc)}">`
    );
    html = html.replace(
      /<meta name="twitter:title" content="[^"]*">/i,
      () => `<meta name="twitter:title" content="${title} — TADA">`
    );
    html = html.replace(
      /<meta name="twitter:description" content="[^"]*">/i,
      () => `<meta name="twitter:description" content="${esc(desc)}">`
    );

    // ==== SSR breadcrumb current + hero ====
    const heroParts: string[] = [`<span class="library-badge">${esc(typeLabel)}</span>`];
    if (createdAt)
      heroParts.push(
        `<span class="vanban-meta-item">Ngày đăng: ${esc(fmtDateVi(createdAt))}</span>`
      );
    if (docNumber)
      heroParts.push(`<span class="vanban-meta-item">Số hiệu: <strong>${docNumber}</strong></span>`);

    const downloadBtn = doc.file_name
      ? `<a class="btn btn-ghost vanban-download" href="/api/library/legal-docs/download?file_name=` +
        encodeURIComponent(doc.file_name) +
        `" target="_blank" rel="noopener nofollow">⬇ Tải file gốc (Word/PDF)</a>`
      : '';

    const ssrBlock =
      // meta hàng hero
      `<div class="vanban-head">` +
      `<div class="vanban-meta">${heroParts.join(' ')}</div>` +
      `<h1 class="vanban-title">${title}</h1>` +
      downloadBtn +
      `</div>` +
      `<div class="vanban-body legal-doc-html">` +
      (doc.file_html && doc.file_html.trim()
        ? sanitizeSsrHtml(doc.file_html)
        : `<p class="library-empty">Văn bản chưa có bản hiển thị — hãy dùng nút tải file gốc phía trên.</p>`) +
      `</div>`;

    html = html.replace(SSR_PLACEHOLDER, () => ssrBlock);
    // gỡ dòng loading tĩnh (SSR đã inject nội dung)
    html = html.replace(/<div class="vanban-loading"[^>]*>[\s\S]*?<\/div>/, '');
    html = html.replace(
      /<span id="vanban-crumb-current"[^>]*>[\s\S]*?<\/span>/,
      () => `<span id="vanban-crumb-current" aria-current="page">${title}</span>`
    );

    // ==== JSON-LD Article + Breadcrumb ====
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: doc.title || 'Văn bản luật',
      description: desc,
      url: canonical,
      mainEntityOfPage: canonical,
      datePublished: createdAt || undefined,
      author: { '@type': 'Organization', name: 'Dịch Vụ Thuế Kế Toán TADA' },
      publisher: {
        '@type': 'Organization',
        name: 'Dịch Vụ Thuế Kế Toán TADA',
        logo: { '@type': 'ImageObject', url: `${SITE}/static/img/logo.jpg` },
      },
    };
    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Thư viện văn bản', item: `${SITE}/thu-vien` },
        { '@type': 'ListItem', position: 3, name: doc.title || 'Văn bản luật' },
      ],
    };
    html = html.replace(
      /<\/head>/i,
      () =>
        `  <script type="application/ld+json">${escJson(JSON.stringify(schema))}</script>\n` +
        `  <script type="application/ld+json">${escJson(JSON.stringify(breadcrumb))}</script>\n</head>`
    );

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch (e) {
    console.error('[van-ban] SSR lỗi:', e instanceof Error ? e.message : e);
    return new NextResponse('Lỗi xử lý', { status: 500 });
  }
}
