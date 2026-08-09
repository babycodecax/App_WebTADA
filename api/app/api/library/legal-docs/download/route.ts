import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'vault-sources';

/**
 * GET /api/library/legal-docs/download?file_name=...
 * Tải file .docx gốc của văn bản luật (public — người dùng thư viện tải về máy).
 *
 * - file_name = tên file gốc trong landing_legal_docs (vd '109_2025_QH15_665870.docx')
 * - File lưu trong Storage bucket vault-sources (key 'vault/<file_name>')
 * - Fallback: nếu 404 → thử normalize bỏ dấu tiếng Việt (vd 'Thông-tư' → 'Thong-tu')
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fileName = (url.searchParams.get('file_name') || '').trim();
  if (!fileName) {
    return new Response(JSON.stringify({ error: 'Thiếu file_name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Chỉ cho phép tải file .docx (chống path traversal / tải file khác)
  const clean = fileName.split('/').pop() || fileName;
  if (!/\.docx$/i.test(clean)) {
    return new Response(JSON.stringify({ error: 'Chỉ hỗ trợ tải file .docx' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sb = getSupabase();
  async function tryDownload(path: string) {
    return sb.storage.from(BUCKET).download(path);
  }

  let storagePath = 'vault/' + clean;
  let dl = await tryDownload(storagePath);
  if ((dl.error || !dl.data) && /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]/.test(storagePath)) {
    const normalized = storagePath.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    const dl2 = await tryDownload(normalized);
    if (!dl2.error && dl2.data) {
      dl = dl2;
      storagePath = normalized;
    }
  }
  if (dl.error || !dl.data) {
    return new Response(JSON.stringify({ error: 'Không tìm thấy file .docx gốc' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(dl.data, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(clean)}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}