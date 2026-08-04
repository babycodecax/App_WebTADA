import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'vault-sources';

/**
 * GET /api/admin/sources/download?file_path=...
 * Download file word gốc (.docx) binary từ Supabase Storage.
 * Frontend dùng để tải file về máy.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const filePath = (url.searchParams.get('file_path') || '').trim();
  if (!filePath) {
    return new Response(JSON.stringify({ error: 'Thiếu file_path' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 1. Lấy storage_path + title từ source_documents
  const { data: srcRows, error: srcErr } = await getSupabase()
    .from('source_documents')
    .select('storage_path,title')
    .eq('file_path', filePath)
    .limit(1);
  if (srcErr) {
    return new Response(JSON.stringify({ error: srcErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const src = (srcRows || [])[0] as { storage_path?: string; title?: string } | undefined;
  const storagePath = src?.storage_path || '';
  if (!storagePath) {
    return new Response(JSON.stringify({ error: 'Nguồn này chưa có file word gốc trong Storage' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  // 2. Download file binary từ Supabase Storage
  const { data: fileData, error: dlErr } = await getSupabase().storage
    .from(BUCKET)
    .download(storagePath);
  if (dlErr || !fileData) {
    return new Response(JSON.stringify({ error: `Không tải được file: ${dlErr?.message || 'not found'}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  // 3. Trả binary — suy mime từ extension (không hardcode .docx)
  const fileName = storagePath.split('/').pop() || 'source.docx';
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mimeMap: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
  };
  return new Response(fileData, {
    headers: {
      'Content-Type': mimeMap[ext] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}