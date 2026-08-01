/**
 * chunker.ts — Cắt tài liệu thành chunks theo heading (port từ scripts/ingest-vault.js).
 *
 * Chunking giữ metadata `heading` (đường dẫn heading, vd "Chương 1 > Mục 2")
 * để chatbox có thể ghép ngữ cảnh khi truy xuất (pattern giống ingestion.py backend).
 */

export interface Chunk {
  text: string;
  heading: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/m;
const PARA_SPLIT_RE = /\n\s*\n/;
export const MAX_CHUNK_TOKENS = 1500;

function countTokens(text: string): number {
  // Đếm từ (whitespace-split) — nhất quán với ingestion.py
  return text.split(/\s+/).length;
}

/**
 * Tách frontmatter YAML (--- ... ---) khỏi nội dung markdown.
 * Trả về title từ dòng `title:` nếu có.
 */
export function parseFrontmatter(content: string): { frontmatter: string; body: string; title: string } {
  const m = /^---\n(.*?)\n---\n?/s.exec(content);
  if (!m) return { frontmatter: '', body: content, title: '' };
  const frontmatter = m[1];
  const body = content.slice(m[0].length);
  const tMatch = /^title:\s*(.+)$/m.exec(frontmatter);
  const title = tMatch ? tMatch[1].trim().replace(/^["']|["']$/g, '') : '';
  return { frontmatter, body, title };
}

/**
 * Cắt markdown body thành chunks theo cấu trúc heading H1-H6 (heading stack).
 * Section quá dài → cắt theo đoạn (para) → theo từ (MAX_CHUNK_TOKENS).
 */
export function chunkByHeading(body: string): Chunk[] {
  const lines = body.split('\n');
  const sections: { heading: string; text: string }[] = [];
  let headingStack: string[] = [];
  let currentLines: string[] = [];

  function flush() {
    if (currentLines.length) {
      const text = currentLines.join('\n').trim();
      if (text) sections.push({ heading: headingStack.join(' > '), text });
      currentLines = [];
    }
  }

  for (const line of lines) {
    const m = HEADING_RE.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      const hText = m[2].trim();
      headingStack = headingStack.slice(0, level - 1);
      headingStack.push(hText);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  // Split oversized
  const chunks: Chunk[] = [];
  for (const { heading, text } of sections) {
    if (countTokens(text) <= MAX_CHUNK_TOKENS) {
      chunks.push({ heading, text });
    } else {
      const paras = text.split(PARA_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
      let buf: string[] = [];
      let bufTokens = 0;
      for (const para of paras) {
        const pt = countTokens(para);
        if (buf.length && bufTokens + pt > MAX_CHUNK_TOKENS) {
          chunks.push({ heading, text: buf.join('\n\n') });
          buf = [];
          bufTokens = 0;
        }
        if (pt > MAX_CHUNK_TOKENS) {
          const words = para.split(/\s+/);
          for (let i = 0; i < words.length; i += MAX_CHUNK_TOKENS) {
            chunks.push({ heading, text: words.slice(i, i + MAX_CHUNK_TOKENS).join(' ') });
          }
        } else {
          buf.push(para);
          bufTokens += pt;
        }
      }
      if (buf.length) chunks.push({ heading, text: buf.join('\n\n') });
    }
  }
  return chunks;
}

/**
 * Chunk fallback cho văn bản không có heading (docx/pdf/txt):
 * ≤ MAX_CHUNK_TOKENS từ giữ 1 chunk heading='', quá thì cắt theo từ.
 */
export function chunkPlainText(text: string): Chunk[] {
  const clean = text.trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  if (words.length <= MAX_CHUNK_TOKENS) return [{ text: clean, heading: '' }];
  const chunks: Chunk[] = [];
  for (let i = 0; i < words.length; i += MAX_CHUNK_TOKENS) {
    chunks.push({ heading: '', text: words.slice(i, i + MAX_CHUNK_TOKENS).join(' ') });
  }
  return chunks;
}
