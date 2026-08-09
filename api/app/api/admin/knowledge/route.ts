import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isAdminGoogle } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface UploadDoc {
  file_path: string;
  title: string;
  chunk_count: number;
  created_at: string;
}

/** GET /api/admin/knowledge — danh sách tài liệu đã upload (prefix upload/) + số chunks. */
export async function GET(req: NextRequest) {
  if (!(await isAdminGoogle(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    // 1) Danh sách file upload/ (distinct theo file_path)
    const { data: rows, error } = await getSupabase()
      .from('knowledge_chunks')
      .select('file_path, title, created_at')
      .like('file_path', 'upload/%')
      .limit(2000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 2) Count chunks theo từng file_path (truy vấn nhỏ — dữ liệu admin ít)
    const docs: UploadDoc[] = [];
    const seen = new Set<string>();
    for (const r of rows || []) {
      const fp = r.file_path as string;
      if (seen.has(fp)) continue;
      seen.add(fp);
      const { count } = await getSupabase()
        .from('knowledge_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('file_path', fp);
      docs.push({
        file_path: fp,
        title: (r.title as string) || fp,
        chunk_count: count ?? 0,
        created_at: (r.created_at as string) || '',
      });
    }

    // Mới nhất lên đầu
    docs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return NextResponse.json({ docs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Lỗi lấy danh sách: ${msg}` }, { status: 500 });
  }
}
