import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Cột group_name của hàng sentinel chứa toàn bộ nội dung văn bản dịch vụ. */
const SERVICES_CONTENT_ROW = '__services_content__';

/**
 * GET /api/services — nội dung dịch vụ landing page (public, không cần auth).
 *
 * Trả về toàn bộ nội dung dịch vụ dưới dạng 1 văn bản thuần (mỗi dòng 1 dịch vụ,
 * admin tự viết, có thể kèm emoji). Trang chủ hiển thị đúng 1-1 theo nội dung này.
 *
 * Response: { "content": "🏠 Kế toán dịch vụ trọn gói\n..." }
 * Không cache dài — mỗi lần mở trang chủ là lấy nội dung mới nhất.
 */
export async function GET(_req: NextRequest) {
  try {
    const { data: row, error } = await getSupabase()
      .from('landing_services')
      .select('description')
      .eq('is_active', true)
      .eq('group_name', SERVICES_CONTENT_ROW)
      .limit(1)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ content: row?.description || '' }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return new Response(JSON.stringify({ error: `Lỗi lấy nội dung dịch vụ: ${msg}` }), { status: 500 });
  }
}