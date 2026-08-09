import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';
import { extractHtml } from '@/lib/parseFile';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'vault-sources';

/**
 * GET /api/admin/sources/docx?file_path=...
 * Trả về nội dung file word gốc (.docx) từ Supabase Storage dạng HTML
 * (mammoth.convertToHtml — GIỮ bảng biểu, định dạng như bản Word gốc,
 * giống file_html của thư viện /library). Frontend render HTML trực tiếp.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const url = new URL(req.url);
  const filePath = (url.searchParams.get('file_path') || '').trim();
  if (!filePath) {
    return NextResponse.json({ error: 'Thiếu file_path' }, { status: 400 });
  }

  // 1. Lấy storage_path từ source_documents
  const { data: srcRows, error: srcErr } = await getSupabase()
    .from('source_documents')
    .select('storage_path,title')
    .eq('file_path', filePath)
    .limit(1);
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });

  const src = (srcRows || [])[0] as { storage_path?: string; title?: string } | undefined;
  const storagePath = src?.storage_path || '';
  if (!storagePath) {
    return NextResponse.json({
      file_path: filePath,
      title: src?.title || filePath,
      content: null,
      note: 'Nguồn này chưa có file word gốc trong Storage. Tải file .docx gốc từ vault/thue-ke-toan/sources/ và upload qua admin để xem/tải.',
    });
  }

  // 2. Download file từ Supabase Storage
  const { data: fileData, error: dlErr } = await getSupabase().storage
    .from(BUCKET)
    .download(storagePath);
  if (dlErr || !fileData) {
    return NextResponse.json({ error: `Không tải được file: ${dlErr?.message || 'file not found'}` }, { status: 404 });
  }

  // 3. Extract HTML — mammoth.convertToHtml giữ bảng biểu như bản Word gốc
  try {
    const fileName = storagePath.split('/').pop() || 'file.docx';
    const fileAsFile = new File([fileData], fileName, { type: fileData.type || 'application/octet-stream' });
    const html = await extractHtml(fileAsFile);
    return NextResponse.json({
      file_path: filePath,
      title: src?.title || filePath,
      html,
      storage_path: storagePath,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lỗi extract';
    return NextResponse.json({ error: `Lỗi đọc file: ${msg}` }, { status: 500 });
  }
}