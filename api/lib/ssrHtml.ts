/**
 * ssrHtml.ts — Helper SSR dùng chung cho các route trả HTML server-render
 * (blog/[slug], van-ban/[id]). Trước đây nằm inline trong blog route.
 */

export const SITE = 'https://ketoanthuetada.com';

/** Escape HTML entities — tránh XSS từ dữ liệu Supabase */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape JSON string cho safe insertion vào <script> tag — tránh </script> injection */
export function escJson(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

/** Sanitize tối thiểu HTML từ marked/file_html trước khi SSR (content từ DB,
 *  không tin blind). Fix MEDIUM-6 review: thêm style/form/object/embed/base
 *  (trang văn bản SSR render full-độ cho bot → cần chặn nhiều hơn). */
export function sanitizeSsrHtml(h: string): string {
  return h
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<form[\s\S]*?<\/form\s*>/gi, '')
    .replace(/<object[\s\S]*?<\/object\s*>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<base[\s\S]*?>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript\s*:/gi, '');
}
