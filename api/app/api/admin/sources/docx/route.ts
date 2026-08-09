import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/admin/sources/docx?file_path=... (file_path = file_name .docx thư viện)
 *
 * Xem nội dung văn bản .docx của Thư viện: trả về `file_html` đã parse sẵn
 * (mammoth convertToHtml — GIỮ bảng biểu, đúng như /library xem toàn văn).
 * Không cần re-extract lại file — nhanh và khớp 100% với bản public.
 *
 * Response: { file_path, title, html, storage_path }
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminGoogle(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const url = new URL(req.url);
  const filePath = (url.searchParams.get('file_path') || '').trim();
  if (!filePath) {
    return NextResponse.json({ error: 'Thiếu file_path' }, { status: 400 });
  }

  // file_path từ admin list = file_name (vd '109_2025_QH15_665870.docx')
  const fileName = filePath.split('/').pop() || filePath;

  try {
    const sb = getSupabase();
    const { data: row, error } = await sb
      .from('landing_legal_docs')
      .select('id,title,doc_type,file_html,file_name,created_at')
      .eq('file_name', fileName)
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row || !row.file_html) {
      return NextResponse.json({
        file_path: filePath,
        title: fileName,
        html: null,
        note: 'Không tìm thấy văn bản .docx trong thư viện (landing_legal_docs).',
      });
    }

    return NextResponse.json({
      file_path: filePath,
      title: String(row.title || fileName),
      html: String(row.file_html || ''),
      storage_path: 'vault/' + fileName,
      doc_type: String(row.doc_type || 'other'),
      created_at: String(row.created_at || ''),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi đọc văn bản: ${msg}` }, { status: 500 });
  }
}