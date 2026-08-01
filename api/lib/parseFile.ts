/**
 * parseFile.ts — Trích xuất văn bản từ file upload (docx/pdf/txt/md).
 *
 * Trả về { title, body, isMarkdown } để route admin upload chunk hóa:
 *   - .md   → body giữ nguyên (chunkByHeading giữ heading)
 *   - khác  → body là plain text (chunkPlainText, heading='')
 */

export interface ExtractedFile {
  title: string;
  body: string;
  isMarkdown: boolean;
}

export const ALLOWED_EXTENSIONS = ['.docx', '.pdf', '.txt', '.md'] as const;

// Ký tự không hợp lệ trong tên file/heading → thay bằng '-'
const SANITIZE_RE = /[\\/:*?"<>|\s]+/g;

/** Làm sạch title: thay ký tự đặc biệt + dấu cách → '-', giới hạn 100 ký tự. */
export function sanitizeTitle(title: string): string {
  const cleaned = title.replace(SANITIZE_RE, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned.slice(0, 100) || 'untitled';
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/**
 * Đọc nội dung file theo extension.
 * - .docx → mammoth (đã có dependency)
 * - .pdf  → pdf-parse (dùng đường dẫn lib để tránh bug debug-mode)
 * - .txt/.md → file.text()
 */
export async function extractText(file: File): Promise<ExtractedFile> {
  const name = file.name || 'file';
  const ext = extOf(name);
  const fallbackTitle = name.replace(/\.[^.]+$/, '').trim();

  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const buf = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { title: fallbackTitle, body: value || '', isMarkdown: false };
  }

  if (ext === '.pdf') {
    // Workaround bug pdf-parse 1.1.1: import trực tiếp lib thay vì index (tránh lỗi debug-path)
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buf);
    return { title: fallbackTitle, body: parsed.text || '', isMarkdown: false };
  }

  // .txt / .md
  const body = await file.text();
  return { title: fallbackTitle, body, isMarkdown: ext === '.md' };
}
