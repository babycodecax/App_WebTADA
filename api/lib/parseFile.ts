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

export const ALLOWED_EXTENSIONS = ['.docx', '.pdf', '.txt', '.md', '.png', '.jpg', '.jpeg', '.gif', '.webp'] as const;

/** MIME map cho ảnh — dùng khi upload Supabase Storage + gọi Gemini Vision. */
export const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

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
    const buf = Buffer.from(await file.arrayBuffer());
    let body = '';

    try {
      // Workaround bug pdf-parse 1.1.1: import trực tiếp lib thay vì index (tránh lỗi debug-path)
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
      const parsed = await pdfParse(buf);
      const numpages = parsed.numpages || 1;
      const charsPerPage = (parsed.text || '').length / numpages;

      // Detect PDF scan: text rỗng hoặc <50 chars/trang → fallback OCR
      if (parsed.text.trim() && charsPerPage >= 50) {
        return { title: fallbackTitle, body: parsed.text, isMarkdown: false };
      }
      console.log(`[parseFile] PDF scan (${numpages} trang, ${Math.round(charsPerPage)} chars/trang) → OCR Gemini Vision`);
    } catch (e) {
      // pdf-parse fail (PDF corrupt/scan) → fallback OCR
      console.log(`[parseFile] pdf-parse error: ${e instanceof Error ? e.message : e} → OCR Gemini Vision`);
    }

    body = await ocrPdf(file);
    return { title: fallbackTitle, body, isMarkdown: false };
  }

  // Ảnh (PNG/JPG/JPEG/GIF/WEBP) → OCR qua Gemini Vision
  if (ext in IMAGE_MIME) {
    const body = await ocrImage(file);
    return { title: fallbackTitle, body, isMarkdown: false };
  }

  // .txt / .md
  const body = await file.text();
  return { title: fallbackTitle, body, isMarkdown: ext === '.md' };
}

// ─── OCR: Gemini Vision API ───
const GEMINI_VISION_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OCR_PROMPT = 'Trích xuất toàn bộ văn bản trong ảnh này. Giữ nguyên cấu trúc, dòng, và định dạng. Nếu không có văn bản nào, trả về "Không tìm thấy văn bản".';
const OCR_PDF_PROMPT = 'Trích xuất toàn bộ văn bản từ PDF này. Đọc tất cả các trang, giữ nguyên cấu trúc, heading, dòng, và định dạng. Nếu PDF rỗng hoặc không có văn bản, trả về "Không tìm thấy nội dung".';

/**
 * OCR file ảnh (PNG/JPG/JPEG/GIF/WEBP) qua Gemini Vision API.
 * Dùng chung LLM_API_KEY (AIza...) từ env — không cần key riêng.
 * Trả về text trích được hoặc throw nếu lỗi.
 */
async function ocrImage(file: File): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || '';
  if (!apiKey) throw new Error('Missing LLM_API_KEY — cần cấu hình để OCR ảnh');

  // Giới hạn size ảnh OCR (2 MB) — Gemini Vision tốn bandwidth với ảnh lớn
  const MAX_OCR_SIZE = 2 * 1024 * 1024;
  if (file.size > MAX_OCR_SIZE) {
    throw new Error(`Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa 2 MB cho OCR.`);
  }

  const ext = extOf(file.name);
  const mime = IMAGE_MIME[ext] || 'image/png';

  // Chuyển file → base64
  const buf = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buf.toString('base64');

  // Lấy model đầu tiên từ danh sách (LLM_MODEL có thể phân tách phẩy)
  const model = (process.env.LLM_MODEL || 'gemini-2.0-flash').split(',')[0].trim().replace(/^gemini\//, '');
  const url = `${GEMINI_VISION_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Retry 3 lần cho lỗi transient (429/503/timeout)
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: OCR_PROMPT },
              { inlineData: { mimeType: mime, data: imageBase64 } },
            ],
          }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini Vision OCR ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = await res.json() as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      };
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text.trim()) return text.trim();

      // Response rỗng — log finishReason để debug
      const finish = json?.candidates?.[0]?.finishReason;
      console.warn(`[ocr] Gemini Vision trả rỗng, finishReason=${finish || 'unknown'}`);
      lastErr = new Error(`OCR trả về rỗng (finishReason: ${finish || 'unknown'})`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

// ─── OCR PDF scan: Gemini Vision API (hỗ trợ PDF trực tiếp) ───

const MAX_PDF_OCR_SIZE = 4 * 1024 * 1024; // 4 MB (giới hạn route upload)

/**
 * OCR PDF scan qua Gemini Vision API — gửi trực tiếp PDF buffer (application/pdf).
 * Gemini 2.0 Flash hỗ trợ PDF đến 50MB / 1000 trang.
 * Dùng chung LLM_API_KEY (AIza...) — không cần key riêng.
 * Trigger: pdf-parse trả rỗng hoặc <50 chars/trang (PDF scan/ảnh).
 */
async function ocrPdf(file: File): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || '';
  if (!apiKey) throw new Error('Missing LLM_API_KEY — cần cấu hình để OCR PDF scan');

  if (file.size > MAX_PDF_OCR_SIZE) {
    throw new Error(`PDF quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa 4 MB cho OCR.`);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buf.toString('base64');

  // Lấy model đầu tiên từ danh sách (LLM_MODEL có thể phân tách phẩy)
  const model = (process.env.LLM_MODEL || 'gemini-2.0-flash').split(',')[0].trim().replace(/^gemini\//, '');
  const url = `${GEMINI_VISION_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: OCR_PDF_PROMPT },
              { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            ],
          }],
          generationConfig: { maxOutputTokens: 16384, temperature: 0.1 },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini Vision PDF OCR ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = await res.json() as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      };
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text.trim()) return text.trim();

      const finish = json?.candidates?.[0]?.finishReason;
      console.warn(`[ocr-pdf] Gemini Vision trả rỗng, finishReason=${finish || 'unknown'}`);
      lastErr = new Error(`PDF OCR trả về rỗng (finishReason: ${finish || 'unknown'})`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

/**
 * extractHtml — chuyển file .docx sang HTML bằng mammoth.convertToHtml.
 * GIỮ NGUYÊN BẢNG BIỂU (khác extractRawText dùng cho search) — phục vụ
 * hiển thị toàn văn trong Thư viện (landing_legal_docs.file_html).
 * Trả '' nếu không phải .docx hoặc không đọc được.
 */
export async function extractHtml(file: File): Promise<string> {
  const name = file.name || '';
  if (!name.toLowerCase().endsWith('.docx')) return '';
  try {
    const mammoth = await import('mammoth');
    const buf = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    return value || '';
  } catch {
    return '';
  }
}
