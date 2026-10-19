import { NextRequest, NextResponse } from 'next/server';
import { getCachedResult } from '@/lib/audit/cache';
import { getSupabase } from '@/lib/supabase';
import { checkRate } from '@/lib/http/rate-limit';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // 0) Tránh_spam + id phải đúng định dạng sinh ra (12 hex sau 'audit_'):
    //    chặn đọc Supabase mù quáng với id rác (giảm IDOR surface + rẻ nhất)
    if (!/^audit_[0-9a-f]{8}-[0-9a-f]{4}$/.test(id)) {
      return NextResponse.json({ error: 'audit_id không hợp lệ' }, { status: 400 });
    }
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRate(`audit-${ip}`, 60, 60_000)) {
      return NextResponse.json({ error: 'Quá nhiều yêu cầu, thử lại sau' }, { status: 429 });
    }

    // 1) Cache in-memory (nhanh — instance vừa chạy audit)
    const data = getCachedResult(id);
    if (data) {
      return NextResponse.json(data);
    }

    // 2) Fallback Supabase — cache in-memory là per-instance trên Vercel
    //    serverless; instance khác / cold start phải đọc từ DB (fix review 2026-08-10)
    const { data: row, error } = await getSupabase()
      .from('audit_history')
      .select('payload')
      .eq('audit_id', id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Audit result fallback error:', error.message);
      return NextResponse.json({ error: 'Lỗi đọc kết quả audit' }, { status: 500 });
    }
    if (!row?.payload) {
      return NextResponse.json(
        { error: 'Không tìm thấy kết quả audit', audit_id: id },
        { status: 404 },
      );
    }

    // payload đã lưu đúng shape CachedResult — trả nguyên (không cần re-cache,
    // payload lớn ~ vài trăm KB; đọc trực tiếp từ DB luôn là bản mới nhất)
    return NextResponse.json(row.payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Audit result error:', msg);
    return NextResponse.json({ error: 'Lỗi đọc kết quả audit' }, { status: 500 });
  }
}