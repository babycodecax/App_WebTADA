import { NextResponse } from 'next/server';
import { listCachedResults } from '@/lib/audit/cache';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';

// force-dynamic — danh sách kết quả kiểm toán thay đổi liên tục khi chạy
// kiểm tra; static prerender tại build time làm lịch sử "đóng băng".
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Cache in-memory (per-instance trên Vercel) — chỉ có kết quả trên instance
    // vừa xử lý upload. Đọc Supabase trước (bản đầy đủ, mọi instance cùng thấy),
    // fallback gộp thêm cache phòng trường hợp bảng chưa có dữ liệu/migration.
    const { data: rows, error } = await getSupabase()
      .from('audit_history')
      .select('audit_id, company_name, total_violations, by_severity, ran_at')
      .order('ran_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Audit history DB error:', error.message);
      // Fallback: cache in-memory nếu DB lỗi (không làm mất trải nghiệm)
      const cached = listCachedResults();
      return NextResponse.json({ results: cached, count: cached.length });
    }

    // Gộp kết quả chưa kịp lưu DB (cache mới hơn) — dedup theo audit_id
    const map = new Map<string, Record<string, unknown>>();
    for (const r of rows || []) {
      map.set(String(r.audit_id), r);
    }
    for (const c of listCachedResults()) {
      map.set(c.audit_id, c);
    }
    const results = Array.from(map.values()).slice(0, 100);

    return NextResponse.json({ results, count: results.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Audit history error:', msg);
    return NextResponse.json({ error: 'Lỗi đọc lịch sử audit', results: [], count: 0 }, { status: 500 });
  }
}