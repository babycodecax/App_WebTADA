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
 * Query hàng sentinel (group_name = __services_content__):
 *   - Ưu tiên is_active = true;
 *   - Nếu không tìm thấy (row null) → fallback query bỏ filter is_active
 *     (phòng trường hợp RLS/trigger làm is_active sai, nội dung vẫn hiển thị).
 *
 * Response: { "content": "🏠 Kế toán dịch vụ trọn gói\n..." }
 * Không cache dài — mỗi lần mở trang chủ là lấy nội dung mới nhất.
 */
export async function GET(_req: NextRequest) {
  try {
    const sb = getSupabase();

    const { data: row, error } = await sb
      .from('landing_services')
      .select('description')
      .eq('is_active', true)
      .eq('group_name', SERVICES_CONTENT_ROW)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[services] Lỗi query is_active=true: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    // Fallback: row null (không tìm thấy hàng active) → thử query không filter is_active
    if (!row) {
      const { data: fallbackRow, error: fallbackErr } = await sb
        .from('landing_services')
        .select('description, is_active')
        .eq('group_name', SERVICES_CONTENT_ROW)
        .limit(1)
        .maybeSingle();

      if (fallbackErr) {
        console.error(`[services] Lỗi query fallback: ${fallbackErr.message}`);
        return new Response(JSON.stringify({ error: fallbackErr.message }), { status: 500 });
      }
      if (fallbackRow) {
        console.warn(
          `[services] Hàng sentinel tồn tại nhưng is_active=${fallbackRow.is_active} — dùng fallback query`
        );
      }
      return new Response(JSON.stringify({ content: fallbackRow?.description || '' }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    return new Response(JSON.stringify({ content: row.description || '' }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    console.error(`[services] Lỗi không xác định: ${msg}`);
    return new Response(JSON.stringify({ error: `Lỗi lấy nội dung dịch vụ: ${msg}` }), { status: 500 });
  }
}