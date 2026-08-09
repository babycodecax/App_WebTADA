import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/admin/sources/restore — khôi phục nguồn đã bị xóa (soft-delete).
 *
 * Body: { file_path }
 * Hành vi: set status='ready'. Kiến thức (chunks/compliance) của nguồn phải được
 * tái tạo bằng cách chạy lại ingest (backend local) — source gốc vẫn còn.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminGoogle(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const filePath = ((body || {}).file_path || '').trim();
  if (!filePath) {
    return NextResponse.json({ error: 'Thiếu file_path' }, { status: 400 });
  }

  try {
    // Chỉ khôi phục nguồn TỒN TẠI và đang ở trạng thái deleted
    const { data: existing } = await getSupabase()
      .from('source_documents')
      .select('status,source_origin')
      .eq('file_path', filePath)
      .limit(1);
    const row = (existing || [])[0];
    if (!row) {
      return NextResponse.json({ error: `Nguồn không tồn tại: ${filePath}` }, { status: 404 });
    }
    const cur = row.status || '';
    if (cur === 'ready') {
      return NextResponse.json({ ok: true, status: 'ready', note: 'Đã ở trạng thái ready' });
    }
    if (cur !== 'deleted') {
      // Nguồn error/processing — không phải xóa mềm → không nên khôi phục
      return NextResponse.json(
        { ok: false, status: cur, error: `Không khôi phục được nguồn đang ở trạng thái '${cur}' (chỉ nguồn đã xóa)` },
        { status: 400 }
      );
    }

    const { error } = await getSupabase()
      .from('source_documents')
      .update({ status: 'ready' })
      .eq('file_path', filePath);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // upload hard-delete row không còn → không khôi phục được (dù cur='deleted' hiếm)
    const restoredOrigin = row.source_origin || '';
    return NextResponse.json({ ok: true, file_path: filePath, status: 'ready', source_origin: restoredOrigin });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi khôi phục nguồn: ${msg}` }, { status: 500 });
  }
}