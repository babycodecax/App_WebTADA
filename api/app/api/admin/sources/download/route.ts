import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'vault-sources';

/**
 * GET /api/admin/sources/download?file_path=... (file_path = file_name .docx thư viện)
 * Download file word gốc (.docx) binary từ Supabase Storage.
 * Frontend dùng để tải file về máy.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminGoogle(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const filePath = (url.searchParams.get('file_path') || '').trim();
  if (!filePath) {
    return new Response(JSON.stringify({ error: 'Thiếu file_path' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 1. Xác định storage_path — ưu tiên landing_legal_docs (vault/<file_name>),
  //    fallback source_documents.storage_path (nguồn cũ .md có file gốc).
  const fileName = filePath.split('/').pop() || filePath;
  const sb = getSupabase();

  const { data: legalRow } = await sb
    .from('landing_legal_docs')
    .select('file_name')
    .eq('file_name', fileName)
    .limit(1)
    .maybeSingle();

  let storagePath = '';
  if (legalRow?.file_name) {
    storagePath = 'vault/' + String(legalRow.file_name);
  } else {
    const { data: srcRows, error: srcErr } = await sb
      .from('source_documents')
      .select('storage_path')
      .eq('file_path', filePath)
      .limit(1);
    if (srcErr) {
      return new Response(JSON.stringify({ error: srcErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    storagePath = String((srcRows || [])[0]?.storage_path || '');
  }
  if (!storagePath) {
    return new Response(JSON.stringify({ error: 'Không tìm thấy file word gốc trong Storage' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  // 2. Download file binary từ Supabase Storage — thử storage_path chính,
  //    nếu 404 → thử normalize bỏ dấu tiếng Việt (vd 'Thông-tư' → 'Thong-tu')
  //    phòng file_name thư viện lệch tên file gốc trong bucket.
  async function tryDownload(path: string) {
    const res = await getSupabase().storage.from(BUCKET).download(path);
    return res;
  }
  let dl = await tryDownload(storagePath);
  if ((dl.error || !dl.data) && /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]/.test(storagePath)) {
    const normalized = storagePath.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    dl = await tryDownload(normalized);
    if (!dl.error && dl.data) storagePath = normalized;
  }
  if (dl.error || !dl.data) {
    return new Response(JSON.stringify({ error: `Không tải được file: ${dl.error?.message || 'not found'}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  const fileData = dl.data;

  // 3. Trả binary — suy mime từ extension (không hardcode .docx)
  const responseName = storagePath.split('/').pop() || 'source.docx';
  const ext = (responseName.split('.').pop() || '').toLowerCase();
  const mimeMap: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
  };
  return new Response(fileData, {
    headers: {
      'Content-Type': mimeMap[ext] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(responseName)}"`,
    },
  });
}